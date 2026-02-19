import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import type { SyncLog, SyncResult, Site } from '@/shared/types'

export default function JobdoriSyncPage() {
  const navigate = useNavigate()
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [tables, setTables] = useState<string[]>([])
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [envPath, setEnvPath] = useState('')

  const [syncing, setSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const [syncHistory, setSyncHistory] = useState<SyncLog[]>([])

  // 동기화 옵션
  const [autoAddTopTargets, setAutoAddTopTargets] = useState(true)
  const [autoAddOsintNeeded, setAutoAddOsintNeeded] = useState(true)
  const [syncAllIllegal, setSyncAllIllegal] = useState(false)

  // Jobdori 사이트 조회
  const [recommendation, setRecommendation] = useState('')
  const [jobdoriSites, setJobdoriSites] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loadingSites, setLoadingSites] = useState(false)

  // Y-EYE에 이미 등록된 사이트 도메인 목록
  const [existingSiteDomains, setExistingSiteDomains] = useState<Set<string>>(new Set())
  const [addingDomain, setAddingDomain] = useState<string | null>(null)

  useEffect(() => {
    checkStatus()
    loadSyncHistory()
    loadEnvPath()
    loadExistingSites()
  }, [])

  async function loadExistingSites() {
    try {
      const sites = await window.electronAPI.sites.list()
      setExistingSiteDomains(new Set(sites.map((s: Site) => s.domain.toLowerCase())))
    } catch (err) {
      console.error('Failed to load existing sites:', err)
    }
  }

  async function checkStatus() {
    try {
      const status = await window.electronAPI.jobdori.status()
      setConnected(status.connected)
    } catch (err) {
      console.error('Failed to check Jobdori status:', err)
    }
  }

  async function loadEnvPath() {
    try {
      const path = await window.electronAPI.jobdori.envPath()
      setEnvPath(path)
    } catch (err) {
      console.error('Failed to get env path:', err)
    }
  }

  async function loadSyncHistory() {
    try {
      const history = await window.electronAPI.jobdori.syncHistory(10)
      setSyncHistory(history)
    } catch (err) {
      console.error('Failed to load sync history:', err)
    }
  }

  async function handleConnect() {
    setConnecting(true)
    setConnectionMessage('')
    try {
      const result = await window.electronAPI.jobdori.connect(databaseUrl || undefined)
      setConnected(result.success)
      setConnectionMessage(result.message)
      if (result.tables) setTables(result.tables)
      if (result.success) {
        setDatabaseUrl('')
        loadJobdoriSites()
      }
    } catch (err: any) {
      setConnectionMessage(`오류: ${err.message}`)
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    try {
      await window.electronAPI.jobdori.disconnect()
      setConnected(false)
      setConnectionMessage('연결 해제됨')
      setTables([])
      setJobdoriSites([])
    } catch (err: any) {
      setConnectionMessage(`오류: ${err.message}`)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setLastSyncResult(null)
    try {
      const result = await window.electronAPI.jobdori.sync({
        autoAddTopTargets,
        autoAddOsintNeeded,
        syncAllIllegal,
      })
      setLastSyncResult(result)
      loadSyncHistory()
      loadExistingSites() // 동기화 후 추가됨 표시 갱신
    } catch (err: any) {
      setLastSyncResult({
        success: false,
        sitesAdded: 0,
        sitesUpdated: 0,
        notesImported: 0,
        domainChangesDetected: 0,
        errors: [err.message],
        duration: 0,
        timestamp: new Date().toISOString(),
      })
    } finally {
      setSyncing(false)
    }
  }

  async function loadJobdoriSites(rec?: string) {
    setLoadingSites(true)
    try {
      const result = await window.electronAPI.jobdori.sitesByRecommendation(rec || undefined)
      if (result.success) setJobdoriSites(result.results)
    } catch (err) {
      console.error('Failed to load Jobdori sites:', err)
    } finally {
      setLoadingSites(false)
    }
  }

  // Jobdori 사이트를 Y-EYE에 추가
  async function handleAddFromJobdori(jobdoriSite: any) {
    const domain = jobdoriSite.domain
    if (!domain) return

    setAddingDomain(domain)
    try {
      // 우선순위 매핑
      const priority = jobdoriSite.recommendation?.includes('최상위') ? 'critical'
        : jobdoriSite.recommendation?.includes('OSINT') ? 'high'
        : jobdoriSite.recommendation?.includes('모니터링') ? 'medium'
        : 'medium'

      // 사이트 유형 매핑
      const siteType = jobdoriSite.site_type?.toLowerCase() || 'other'

      await window.electronAPI.sites.create({
        id: uuidv4(),
        domain: domain,
        display_name: domain,
        site_type: siteType,
        status: 'active',
        priority,
        recommendation: jobdoriSite.recommendation || null,
        traffic_monthly: jobdoriSite.total_visits ? jobdoriSite.total_visits.toLocaleString() : null,
        traffic_rank: jobdoriSite.global_rank ? jobdoriSite.global_rank.toLocaleString() : null,
        unique_visitors: jobdoriSite.unique_visitors ? jobdoriSite.unique_visitors.toLocaleString() : null,
        investigation_status: 'pending',
        notes: `Jobdori에서 추가됨 — 위협점수: ${jobdoriSite.threat_score ?? '-'}, 권고: ${jobdoriSite.recommendation ?? '-'}`,
      })

      // 타임라인 이벤트 생성
      // (선택 사항: 추가 시 자동 기록)

      // 기존 사이트 목록 갱신
      await loadExistingSites()
    } catch (err) {
      console.error('Failed to add site from Jobdori:', err)
    } finally {
      setAddingDomain(null)
    }
  }

  async function handleSearch() {
    if (!searchTerm.trim()) return
    setLoadingSites(true)
    try {
      const result = await window.electronAPI.jobdori.search(searchTerm.trim())
      if (result.success) setJobdoriSites(result.results)
    } catch (err) {
      console.error('Failed to search:', err)
    } finally {
      setLoadingSites(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="titlebar-drag pt-2">
        <div className="titlebar-no-drag">
          <h1 className="page-title">Jobdori 동기화</h1>
          <p className="page-subtitle">Jobdori 모니터링 데이터 연동 및 동기화</p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-dark-200">Neon DB 연결 상태</h2>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-xs text-dark-400">{connected ? '연결됨' : '연결 안됨'}</span>
          </div>
        </div>

        {!connected ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">DATABASE_URL</label>
              <input
                type="password"
                value={databaseUrl}
                onChange={e => setDatabaseUrl(e.target.value)}
                className="input"
                placeholder="postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
              />
              <p className="text-[10px] text-dark-600 mt-1">
                입력하지 않으면 <code className="text-dark-500">{envPath || '~/.env'}</code>에서 읽어옵니다.
              </p>
            </div>
            <button onClick={handleConnect} disabled={connecting} className="btn-primary btn-sm">
              {connecting ? '연결 중...' : '연결'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tables.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tables.map(t => (
                  <span key={t} className="text-[10px] text-dark-400 bg-dark-800 px-2 py-1 rounded">{t}</span>
                ))}
              </div>
            )}
            <button onClick={handleDisconnect} className="btn-secondary btn-sm">연결 해제</button>
          </div>
        )}

        {connectionMessage && (
          <p className={`text-xs ${connectionMessage.includes('성공') || connectionMessage.includes('Success') ? 'text-emerald-400' : 'text-amber-400'}`}>
            {connectionMessage}
          </p>
        )}
      </div>

      {/* Sync Controls */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200">동기화 실행</h2>
        <p className="text-xs text-dark-500">
          Jobdori에서 불법 사이트 데이터를 가져와 Y-EYE에 반영합니다.
        </p>

        {/* Sync Options */}
        <div className="space-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAddTopTargets}
              onChange={e => setAutoAddTopTargets(e.target.checked)}
              className="rounded border-dark-600 bg-dark-800"
            />
            <div>
              <span className="text-sm text-dark-200">최상위 타겟 자동 추가</span>
              <p className="text-[10px] text-dark-500">권고사항이 '최상위 타겟'인 사이트를 자동 등록</p>
            </div>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAddOsintNeeded}
              onChange={e => setAutoAddOsintNeeded(e.target.checked)}
              className="rounded border-dark-600 bg-dark-800"
            />
            <div>
              <span className="text-sm text-dark-200">OSINT 조사 필요 자동 추가</span>
              <p className="text-[10px] text-dark-500">'OSINT 조사 필요' 권고 사이트를 자동 등록</p>
            </div>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={syncAllIllegal}
              onChange={e => setSyncAllIllegal(e.target.checked)}
              className="rounded border-dark-600 bg-dark-800"
            />
            <div>
              <span className="text-sm text-dark-200">전체 불법 사이트 동기화</span>
              <p className="text-[10px] text-dark-500">모든 불법 판정 사이트를 등록 (많은 양의 데이터)</p>
            </div>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSync} disabled={syncing} className="btn-primary">
            {syncing ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                동기화 중...
              </span>
            ) : '동기화 실행'}
          </button>
          {lastSyncResult && (
            <span className={`text-xs ${lastSyncResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
              {lastSyncResult.success ? '완료' : '실패'} ({lastSyncResult.duration}ms)
            </span>
          )}
        </div>

        {/* Sync Result */}
        {lastSyncResult && (
          <div className={`rounded-lg px-4 py-3 ${lastSyncResult.success ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-dark-500">추가된 사이트</p>
                <p className="text-lg font-bold text-emerald-400">+{lastSyncResult.sitesAdded}</p>
              </div>
              <div>
                <p className="text-[10px] text-dark-500">업데이트</p>
                <p className="text-lg font-bold text-blue-400">~{lastSyncResult.sitesUpdated}</p>
              </div>
              <div>
                <p className="text-[10px] text-dark-500">변경 감지</p>
                <p className="text-lg font-bold text-amber-400">{lastSyncResult.domainChangesDetected}</p>
              </div>
              <div>
                <p className="text-[10px] text-dark-500">소요 시간</p>
                <p className="text-lg font-bold text-dark-300">{(lastSyncResult.duration / 1000).toFixed(1)}s</p>
              </div>
            </div>
            {lastSyncResult.errors.length > 0 && (
              <div className="mt-2 text-xs text-red-400">
                {lastSyncResult.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Jobdori Sites Browser */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-dark-200">Jobdori 사이트 조회</h2>
          <span className="text-xs text-dark-500">{jobdoriSites.length}개</span>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3">
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="input flex-1"
              placeholder="도메인 검색..."
            />
            <button onClick={handleSearch} className="btn-secondary btn-sm">검색</button>
          </div>
          <select
            value={recommendation}
            onChange={e => { setRecommendation(e.target.value); loadJobdoriSites(e.target.value) }}
            className="select w-48"
          >
            <option value="">전체 권고사항</option>
            <option value="최상위 타겟">최상위 타겟</option>
            <option value="OSINT 조사 필요">OSINT 조사 필요</option>
            <option value="모니터링 권고">모니터링 권고</option>
          </select>
        </div>

        {/* Sites Table */}
        {loadingSites ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-dark-800/50 rounded-lg animate-pulse" />)}
          </div>
        ) : jobdoriSites.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-dark-500 text-sm">{connected ? '조건에 맞는 사이트가 없습니다' : 'DB 연결 후 사이트를 조회할 수 있습니다'}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-dark-700/30">
            <table className="w-full">
              <thead>
                <tr className="bg-dark-800/30 border-b border-dark-700/30">
                  <th className="table-header px-4 py-2.5 text-left">도메인</th>
                  <th className="table-header px-4 py-2.5 text-center">유형</th>
                  <th className="table-header px-4 py-2.5 text-center">위협 점수</th>
                  <th className="table-header px-4 py-2.5 text-right">월간 방문</th>
                  <th className="table-header px-4 py-2.5 text-left">권고사항</th>
                  <th className="table-header px-4 py-2.5 text-center w-28">추가</th>
                </tr>
              </thead>
              <tbody>
                {jobdoriSites.map((site, idx) => (
                  <tr key={idx} className="table-row">
                    <td className="table-cell font-medium text-dark-100 text-sm">{site.domain}</td>
                    <td className="table-cell text-center text-xs text-dark-400">{site.site_type || '-'}</td>
                    <td className="table-cell text-center">
                      <span className={`text-xs font-medium ${
                        (site.threat_score || 0) >= 80 ? 'text-red-400' :
                        (site.threat_score || 0) >= 60 ? 'text-amber-400' : 'text-dark-400'
                      }`}>
                        {site.threat_score ?? '-'}
                      </span>
                    </td>
                    <td className="table-cell text-right text-xs text-dark-400">
                      {site.total_visits ? site.total_visits.toLocaleString() : '-'}
                    </td>
                    <td className="table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        site.recommendation?.includes('최상위') ? 'bg-red-500/15 text-red-400' :
                        site.recommendation?.includes('OSINT') ? 'bg-orange-500/15 text-orange-400' :
                        'bg-dark-700/50 text-dark-400'
                      }`}>
                        {site.recommendation || '-'}
                      </span>
                    </td>
                    <td className="table-cell text-center">
                      {existingSiteDomains.has(site.domain?.toLowerCase()) ? (
                        <button
                          onClick={() => {
                            // 이미 추가된 사이트 → 해당 사이트 상세 페이지로 이동
                            window.electronAPI.sites.list({ search: site.domain }).then(results => {
                              const found = results.find((s: Site) => s.domain.toLowerCase() === site.domain.toLowerCase())
                              if (found) navigate(`/sites/${found.id}`)
                            })
                          }}
                          className="text-[10px] px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                        >
                          ✓ 등록됨
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddFromJobdori(site)}
                          disabled={addingDomain === site.domain}
                          className="text-[10px] px-2.5 py-1 rounded bg-yeye-600/20 text-yeye-400 border border-yeye-500/30 hover:bg-yeye-600/30 transition-colors disabled:opacity-50"
                        >
                          {addingDomain === site.domain ? '추가 중...' : '＋ 추가'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sync History */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200">동기화 이력</h2>
        {syncHistory.length === 0 ? (
          <p className="text-xs text-dark-500">동기화 이력이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {syncHistory.map(log => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-dark-800/30 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${log.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <div>
                    <p className="text-xs text-dark-200">
                      {log.status === 'success' ? '성공' : '실패'} — +{log.sites_added} 추가, ~{log.sites_updated} 업데이트
                    </p>
                    {log.error_message && <p className="text-[10px] text-red-400">{log.error_message}</p>}
                  </div>
                </div>
                <time className="text-[10px] text-dark-500">
                  {log.completed_at ? new Date(log.completed_at).toLocaleString('ko-KR') : '-'}
                </time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
