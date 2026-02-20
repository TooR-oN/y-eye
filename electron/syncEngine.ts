/**
 * Jobdori → Y-EYE 동기화 엔진
 * 
 * Jobdori Neon DB에서 데이터를 읽어와 Y-EYE 로컬 SQLite에 반영합니다.
 * - 최상위 타겟 / OSINT 조사 필요 사이트 자동 추가
 * - 사이트 상태 변경 감지 (폐쇄, 도메인 변경 등)
 * - 사이트 노트 가져오기
 */
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from './database'
import {
  fetchSyncData,
  type JobdoriSyncData,
  type JobdoriSite,
  type JobdoriDomainAnalysisResult,
  type JobdoriSiteNote,
} from './jobdoriDB'

// 동기화 결과 인터페이스
export interface SyncResult {
  success: boolean
  sitesAdded: number
  sitesUpdated: number
  notesImported: number
  domainChangesDetected: number
  errors: string[]
  duration: number
  timestamp: string
}

// 권고사항 → priority 매핑
// Jobdori 실제 라벨 (Section 8.2): 최상위 타겟 지정, OSINT 조사 필요, DMCA 집중 강화,
// 신규 위협 주시, 모니터링 유지, 데이터 수집 필요
// 영문: Urgent Block, Priority Block, Block, Monitor, Low Priority, No Data
function mapRecommendationToPriority(rec: string | null): string {
  if (!rec) return 'low'
  const lower = rec.toLowerCase()
  // 최상위 (critical)
  if (lower.includes('최상위') || lower.includes('타겟') || lower.includes('urgent block') || lower.includes('urgent')) return 'critical'
  // 고위험 (high)
  if (lower.includes('osint') || lower.includes('조사') || lower.includes('priority block') || lower.includes('dmca') || lower.includes('집중')) return 'high'
  // 중간 (medium)
  if (lower.includes('신규') || lower.includes('주시') || lower.includes('긴급') || lower.includes('격상') || lower.includes('block')) return 'medium'
  // 모니터링/낮음 (low)
  if (lower.includes('모니터링') || lower.includes('monitor') || lower.includes('조치 효과') || lower.includes('확인')) return 'low'
  // Low Priority / No Data / 데이터 수집 필요
  if (lower.includes('low priority') || lower.includes('no data') || lower.includes('데이터 수집')) return 'low'
  // 그 외 비어있지 않으면 medium
  if (rec.trim().length > 0) return 'medium'
  return 'low'
}

// site_type 매핑 (Jobdori → Y-EYE)
// Jobdori 값: scanlation_group, aggregator, clone, blog, unclassified
function mapSiteType(jobdoriType: string | null): string | null {
  if (!jobdoriType || jobdoriType === 'unclassified') return null
  const lower = jobdoriType.toLowerCase()
  if (lower.includes('aggregator')) return 'aggregator'
  if (lower.includes('scanlation')) return 'scanlation'
  if (lower.includes('clone')) return 'clone'
  if (lower.includes('blog')) return 'blog'
  return 'other'
}

// site_status 매핑 (Jobdori → Y-EYE)
// Jobdori 값: active, closed, changed
function mapSiteStatus(jobdoriStatus: string | null): string {
  if (!jobdoriStatus) return 'unknown'
  const lower = jobdoriStatus.toLowerCase()
  if (lower === 'active' || lower === '운영중') return 'active'
  if (lower === 'closed' || lower === '폐쇄') return 'closed'
  if (lower === 'changed' || lower === 'redirected' || lower.includes('변경') || lower.includes('redirect')) return 'redirected'
  return 'unknown'
}

/**
 * 전체 동기화 실행
 */
export async function runSync(options?: {
  autoAddTopTargets?: boolean
  autoAddOsintNeeded?: boolean
  syncAllIllegal?: boolean
}): Promise<SyncResult> {
  const startTime = Date.now()
  const result: SyncResult = {
    success: false,
    sitesAdded: 0,
    sitesUpdated: 0,
    notesImported: 0,
    domainChangesDetected: 0,
    errors: [],
    duration: 0,
    timestamp: new Date().toISOString(),
  }

  const db = getDatabase()
  const opts = {
    autoAddTopTargets: true,
    autoAddOsintNeeded: true,
    syncAllIllegal: false,
    ...options,
  }

  try {
    // 1. Jobdori에서 데이터 가져오기
    const syncData: JobdoriSyncData = await fetchSyncData()

    console.log(`📊 Jobdori 데이터: 불법사이트 ${syncData.illegalSites.length}개, 분석결과 ${syncData.analysisResults.length}개, 최신리포트 ${syncData.latestReport ? syncData.latestReport.id : 'null'}, 노트 ${syncData.siteNotes.length}개`)

    // 2. 기존 Y-EYE 사이트 목록 가져오기 (도메인 기준 매핑)
    const existingSites = db.prepare('SELECT * FROM sites').all() as any[]
    const existingByDomain = new Map(existingSites.map((s: any) => [s.domain, s]))
    const existingByJobdoriId = new Map(
      existingSites.filter((s: any) => s.jobdori_site_id).map((s: any) => [s.jobdori_site_id, s])
    )

    console.log(`📋 기존 Y-EYE 사이트: ${existingSites.length}개`)

    // === Phase A: 분석 결과(analysisResults)에서 사이트 동기화 ===
    if (syncData.analysisResults.length > 0) {
      // 디버그: recommendation 값 샘플 출력
      const recSample = syncData.analysisResults.slice(0, 5).map(r => `${r.domain}: "${r.recommendation}"`)
      console.log(`📝 분석결과 recommendation 샘플:`, recSample)
    }

    for (const analysisResult of syncData.analysisResults) {
      const domain = analysisResult.domain
      const recommendation = analysisResult.recommendation || ''
      const recLower = recommendation.toLowerCase()

      // Jobdori Handover 문서 Section 8.2 기반 키워드 매칭
      // 실제 라벨: 최상위 타겟 지정, OSINT 조사 필요, DMCA 집중 강화,
      //           신규 위협 주시, 모니터링 유지, 데이터 수집 필요
      // 영문: Urgent Block, Priority Block, Block, Monitor, Low Priority, No Data

      // 우선순위 1: 최상위 타겟 / Urgent Block
      const isTopTarget = (
        recLower.includes('최상위') ||
        recLower.includes('타겟') ||
        recLower.includes('urgent block') ||
        recLower.includes('urgent')
      )
      // 우선순위 2: OSINT 조사 필요 / Priority Block
      const isOsintNeeded = (
        recLower.includes('osint') ||
        recLower.includes('조사') ||
        recLower.includes('priority block')
      )
      // 우선순위 3: DMCA 집중 강화 / Block
      const isBlockTarget = (
        recLower.includes('dmca') ||
        recLower.includes('집중') ||
        recLower.includes('block')
      )
      // 우선순위 4: 신규 위협 주시 / 긴급 / 격상
      const isNewThreat = (
        recLower.includes('신규') ||
        recLower.includes('주시') ||
        recLower.includes('긴급') ||
        recLower.includes('격상')
      )
      // 우선순위 5: 모니터링 유지 / Monitor / 조치 효과
      const isMonitorTarget = (
        recLower.includes('모니터링') ||
        recLower.includes('monitor') ||
        recLower.includes('조치 효과') ||
        recLower.includes('확인')
      )
      // Low Priority / No Data / 데이터 수집 필요
      const isLowOrNoData = (
        recLower.includes('low priority') ||
        recLower.includes('no data') ||
        recLower.includes('데이터 수집')
      )

      // recommendation이 있으면(Low Priority/No Data 제외) 의미있는 데이터
      const hasRecommendation = recommendation.trim().length > 0

      // 자동 추가 대상 판별
      // 최상위/OSINT/DMCA/신규위협/모니터링 — Low Priority/No Data/데이터 수집 필요 제외
      const shouldAutoAdd = (
        (opts.autoAddTopTargets && (isTopTarget || isOsintNeeded)) ||
        (opts.autoAddOsintNeeded && (isBlockTarget || isNewThreat || isMonitorTarget)) ||
        (hasRecommendation && !isLowOrNoData) ||  // 유의미한 권고사항이 있으면 추가
        opts.syncAllIllegal
      )

      const existing = existingByDomain.get(domain)

      if (existing) {
        // 기존 사이트 업데이트 (트래픽, 순위 등)
        const updates: any = {}
        let changed = false

        if (analysisResult.total_visits != null) {
          const trafficStr = analysisResult.total_visits.toLocaleString()
          if (existing.traffic_monthly !== trafficStr) {
            updates.traffic_monthly = trafficStr
            changed = true
          }
        }
        if (analysisResult.global_rank != null) {
          const rankStr = analysisResult.global_rank.toLocaleString()
          if (existing.traffic_rank !== rankStr) {
            updates.traffic_rank = rankStr
            changed = true
          }
        }
        if (analysisResult.unique_visitors != null) {
          const uvStr = analysisResult.unique_visitors.toLocaleString()
          if (existing.unique_visitors !== uvStr) {
            updates.unique_visitors = uvStr
            changed = true
          }
        }
        if (analysisResult.recommendation && existing.recommendation !== analysisResult.recommendation) {
          // 권고사항 변경 시 타임라인에 기록
          if (existing.recommendation && existing.recommendation !== analysisResult.recommendation) {
            db.prepare(`
              INSERT INTO timeline_events (id, entity_type, entity_id, event_type, title, description, event_date, source, importance)
              VALUES (?, 'site', ?, 'recommendation_change', ?, ?, datetime('now'), 'Jobdori 동기화', ?)
            `).run(
              uuidv4(),
              existing.id,
              `권고사항 변경: ${existing.recommendation} → ${analysisResult.recommendation}`,
              `${domain}의 Jobdori 권고사항이 변경되었습니다.`,
              isTopTarget ? 'critical' : isOsintNeeded ? 'high' : 'normal',
            )
          }
          updates.recommendation = analysisResult.recommendation
          updates.priority = mapRecommendationToPriority(analysisResult.recommendation)
          changed = true
        }
        if (analysisResult.site_type) {
          const mapped = mapSiteType(analysisResult.site_type)
          if (mapped && existing.site_type !== mapped) {
            updates.site_type = mapped
            changed = true
          }
        }

        if (changed) {
          updates.synced_at = new Date().toISOString()
          const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ')
          const values = Object.values(updates)
          db.prepare(`UPDATE sites SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, existing.id)
          result.sitesUpdated++
        }
      } else if (shouldAutoAdd) {
        // 새 사이트 추가
        const newSiteId = uuidv4()
        db.prepare(`
          INSERT INTO sites (id, domain, display_name, site_type, status, priority, recommendation,
            jobdori_site_id, traffic_monthly, traffic_rank, unique_visitors,
            investigation_status, notes, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          newSiteId,
          domain,
          domain,
          mapSiteType(analysisResult.site_type),
          'active',
          mapRecommendationToPriority(analysisResult.recommendation),
          analysisResult.recommendation,
          `analysis-${analysisResult.id}`,
          analysisResult.total_visits?.toLocaleString() || null,
          analysisResult.global_rank?.toLocaleString() || null,
          analysisResult.unique_visitors?.toLocaleString() || null,
          'pending',
          `Jobdori 자동 추가 (${recommendation})`,
        )

        existingByDomain.set(domain, { id: newSiteId, domain })

        // 타임라인 이벤트 추가
        db.prepare(`
          INSERT INTO timeline_events (id, entity_type, entity_id, event_type, title, description, event_date, source, importance)
          VALUES (?, 'site', ?, 'sync_add', ?, ?, datetime('now'), 'Jobdori 동기화', ?)
        `).run(
          uuidv4(),
          newSiteId,
          `Jobdori에서 자동 추가: ${domain}`,
          `권고사항: ${recommendation}`,
          isTopTarget ? 'high' : 'normal',
        )

        result.sitesAdded++
      }
    }

    // 4. Jobdori sites 테이블에서 상태 변경 감지 + 미등록 불법사이트 추가
    console.log(`🔍 불법사이트 상태 확인: ${syncData.illegalSites.length}개`)

    for (const jobdoriSite of syncData.illegalSites) {
      const existing = existingByDomain.get(jobdoriSite.domain)

      if (!existing) {
        // syncAllIllegal이면 미등록 불법사이트도 추가
        if (opts.syncAllIllegal) {
          const newSiteId = uuidv4()
          db.prepare(`
            INSERT INTO sites (id, domain, display_name, site_type, status, priority, 
              investigation_status, notes, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(
            newSiteId,
            jobdoriSite.domain,
            jobdoriSite.domain,
            mapSiteType(jobdoriSite.site_type),
            mapSiteStatus(jobdoriSite.site_status),
            'medium',
            'pending',
            `Jobdori 불법사이트 동기화 (${jobdoriSite.site_type || '유형 미확인'})`,
          )
          existingByDomain.set(jobdoriSite.domain, { id: newSiteId, domain: jobdoriSite.domain })

          db.prepare(`
            INSERT INTO timeline_events (id, entity_type, entity_id, event_type, title, description, event_date, source, importance)
            VALUES (?, 'site', ?, 'sync_add', ?, ?, datetime('now'), 'Jobdori 동기화', 'normal')
          `).run(
            uuidv4(),
            newSiteId,
            `Jobdori 불법사이트 추가: ${jobdoriSite.domain}`,
            `유형: ${jobdoriSite.site_type || '미확인'}, 상태: ${jobdoriSite.site_status || '미확인'}`,
          )
          result.sitesAdded++
        }
        continue
      }

      // site_status 변경 감지
      const newStatus = mapSiteStatus(jobdoriSite.site_status)
      if (newStatus !== 'unknown' && existing.status !== newStatus) {
        // 도메인 이력 추가
        db.prepare(`
          INSERT INTO domain_history (id, site_id, domain, status, detected_at, source, notes)
          VALUES (?, ?, ?, ?, datetime('now'), 'Jobdori 동기화', ?)
        `).run(
          uuidv4(),
          existing.id,
          jobdoriSite.domain,
          newStatus,
          `상태 변경: ${existing.status} → ${newStatus}`,
        )

        // 타임라인 이벤트
        db.prepare(`
          INSERT INTO timeline_events (id, entity_type, entity_id, event_type, title, description, event_date, source, importance)
          VALUES (?, 'site', ?, 'status_change', ?, ?, datetime('now'), 'Jobdori 동기화', 'high')
        `).run(
          uuidv4(),
          existing.id,
          `상태 변경: ${existing.status} → ${newStatus}`,
          `${jobdoriSite.domain}의 상태가 변경되었습니다.`,
        )

        // 사이트 상태 업데이트
        db.prepare("UPDATE sites SET status = ?, synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
          .run(newStatus, existing.id)

        result.domainChangesDetected++
      }

      // new_url 감지 (도메인 변경)
      if (jobdoriSite.new_url && jobdoriSite.new_url !== jobdoriSite.domain) {
        const newDomain = jobdoriSite.new_url.replace(/^https?:\/\//, '').replace(/\/$/, '')
        const alreadyTracked = existingByDomain.has(newDomain)

        if (!alreadyTracked) {
          // 도메인 이력에 기록
          db.prepare(`
            INSERT INTO domain_history (id, site_id, domain, status, detected_at, source, notes)
            VALUES (?, ?, ?, 'active', datetime('now'), 'Jobdori 동기화', ?)
          `).run(
            uuidv4(),
            existing.id,
            newDomain,
            `도메인 변경 감지: ${jobdoriSite.domain} → ${newDomain}`,
          )

          // 타임라인 이벤트
          db.prepare(`
            INSERT INTO timeline_events (id, entity_type, entity_id, event_type, title, description, event_date, source, importance)
            VALUES (?, 'site', ?, 'domain_change', ?, ?, datetime('now'), 'Jobdori 동기화', 'critical')
          `).run(
            uuidv4(),
            existing.id,
            `도메인 변경: ${jobdoriSite.domain} → ${newDomain}`,
            `새 도메인으로 리다이렉트 감지됨.`,
          )

          result.domainChangesDetected++
        }
      }
    }

    // 5. 사이트 노트 동기화
    console.log(`📝 사이트 노트 동기화: ${syncData.siteNotes.length}개`)
    for (const note of syncData.siteNotes) {
      const existing = existingByDomain.get(note.domain)
      if (!existing) continue

      // 노트를 OSINT 항목으로 추가 (중복 방지: 같은 content가 이미 있으면 skip)
      const existingNote = db.prepare(
        "SELECT id FROM osint_entries WHERE entity_type = 'site' AND entity_id = ? AND raw_input = ?"
      ).get(existing.id, note.content)

      if (!existingNote) {
        db.prepare(`
          INSERT INTO osint_entries (id, entity_type, entity_id, category, title, content, raw_input, source, confidence, is_key_evidence, created_at)
          VALUES (?, 'site', ?, 'notes', ?, ?, ?, 'Jobdori', 0.7, 0, ?)
        `).run(
          uuidv4(),
          existing.id,
          `Jobdori 노트: ${note.note_type || '일반'}`,
          note.content,
          note.content,
          note.created_at || new Date().toISOString(),
        )
        result.notesImported++
      }
    }

    // 6. 동기화 로그 기록
    db.prepare(`
      INSERT INTO sync_logs (id, sync_type, status, sites_added, sites_updated, started_at, completed_at)
      VALUES (?, 'full', 'success', ?, ?, ?, datetime('now'))
    `).run(
      uuidv4(),
      result.sitesAdded,
      result.sitesUpdated,
      result.timestamp,
    )

    result.success = true

  } catch (err: any) {
    result.errors.push(err.message)

    // 실패 로그 기록
    try {
      db.prepare(`
        INSERT INTO sync_logs (id, sync_type, status, error_message, started_at, completed_at)
        VALUES (?, 'full', 'failed', ?, ?, datetime('now'))
      `).run(uuidv4(), err.message, result.timestamp)
    } catch (_) { /* ignore logging errors */ }
  }

  result.duration = Date.now() - startTime
  console.log(`🔄 동기화 완료: +${result.sitesAdded} 사이트, ~${result.sitesUpdated} 업데이트, ${result.domainChangesDetected} 변경감지, ${result.notesImported} 노트 (${result.duration}ms)`)

  return result
}

/**
 * 사이트 검색: Jobdori 분석 데이터에서 도메인 검색
 * (사용자가 '권고사항' 이외의 사이트도 수동으로 추가할 수 있도록)
 */
export async function searchJobdoriSites(searchTerm: string): Promise<JobdoriDomainAnalysisResult[]> {
  const syncData = await fetchSyncData()
  const term = searchTerm.toLowerCase()
  return syncData.analysisResults.filter(r =>
    r.domain.toLowerCase().includes(term)
  )
}

/**
 * 동기화 이력 조회
 */
export function getSyncHistory(limit: number = 20): any[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM sync_logs ORDER BY completed_at DESC LIMIT ?').all(limit)
}
