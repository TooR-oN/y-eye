import { useState, useEffect } from 'react'
import type { SyncLog, SyncResult } from '@/shared/types'

export default function JobdoriSyncPage() {
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

  useEffect(() => {
    checkStatus()
    loadSyncHistory()
    loadEnvPath()
  }, [])

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
      if (result.success) setDatabaseUrl('')
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

      {/* Tip: Jobdori 사이트 개별 추가 안내 */}
      <div className="card bg-dark-800/30 border-dark-700/30">
        <div className="flex items-start gap-3">
          <span className="text-lg">💡</span>
          <div>
            <p className="text-sm text-dark-300 font-medium">개별 사이트 추가</p>
            <p className="text-xs text-dark-500 mt-1">
              Jobdori에서 특정 사이트를 검색해서 추가하려면, <strong className="text-dark-400">사이트 관리</strong> 화면의 
              <strong className="text-dark-400"> ＋ 사이트 추가</strong> 버튼을 이용해주세요. 
              Jobdori 검색과 수동 추가 모두 지원합니다.
            </p>
          </div>
        </div>
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
