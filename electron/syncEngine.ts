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
function mapRecommendationToPriority(rec: string | null): string {
  if (!rec) return 'low'
  const lower = rec.toLowerCase()
  if (lower.includes('최상위') || lower.includes('top target')) return 'critical'
  if (lower.includes('osint') || lower.includes('조사 필요')) return 'high'
  if (lower.includes('모니터링') || lower.includes('monitoring')) return 'medium'
  return 'low'
}

// site_type 매핑 (Jobdori → Y-EYE)
function mapSiteType(jobdoriType: string | null): string | null {
  if (!jobdoriType) return null
  const lower = jobdoriType.toLowerCase()
  if (lower.includes('aggregator')) return 'aggregator'
  if (lower.includes('scanlation')) return 'scanlation'
  if (lower.includes('clone')) return 'clone'
  if (lower.includes('blog')) return 'blog'
  return 'other'
}

// site_status 매핑 (Jobdori → Y-EYE)
function mapSiteStatus(jobdoriStatus: string | null): string {
  if (!jobdoriStatus) return 'unknown'
  const lower = jobdoriStatus.toLowerCase()
  if (lower === 'active' || lower === '운영중') return 'active'
  if (lower === 'closed' || lower === '폐쇄') return 'closed'
  if (lower === 'redirected' || lower.includes('변경') || lower.includes('redirect')) return 'redirected'
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

    // 2. 기존 Y-EYE 사이트 목록 가져오기 (도메인 기준 매핑)
    const existingSites = db.prepare('SELECT * FROM sites').all() as any[]
    const existingByDomain = new Map(existingSites.map((s: any) => [s.domain, s]))
    const existingByJobdoriId = new Map(
      existingSites.filter((s: any) => s.jobdori_site_id).map((s: any) => [s.jobdori_site_id, s])
    )

    // 3. 분석 결과에서 사이트 동기화
    for (const analysisResult of syncData.analysisResults) {
      const domain = analysisResult.domain
      const recommendation = analysisResult.recommendation || ''
      const isTopTarget = recommendation.toLowerCase().includes('최상위') || recommendation.toLowerCase().includes('top target')
      const isOsintNeeded = recommendation.toLowerCase().includes('osint') || recommendation.toLowerCase().includes('조사 필요')

      // 자동 추가 대상 판별
      const shouldAutoAdd = (
        (opts.autoAddTopTargets && isTopTarget) ||
        (opts.autoAddOsintNeeded && isOsintNeeded) ||
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

    // 4. Jobdori sites 테이블에서 상태 변경 감지
    for (const jobdoriSite of syncData.illegalSites) {
      const existing = existingByDomain.get(jobdoriSite.domain)
      if (!existing) continue

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

    // 5. 동기화 로그 기록
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
  console.log(`🔄 동기화 완료: +${result.sitesAdded} 사이트, ~${result.sitesUpdated} 업데이트, ${result.domainChangesDetected} 변경감지 (${result.duration}ms)`)

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
