import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AiInsight, Site, Person } from '@/shared/types'

type EntityType = 'site' | 'person'

const INSIGHT_TYPE_META: Record<string, { icon: string; label: string; color: string }> = {
  connection: { icon: '🔗', label: '연결 관계', color: 'text-blue-400' },
  pattern: { icon: '🔍', label: '패턴 분석', color: 'text-purple-400' },
  anomaly: { icon: '⚠️', label: '이상 감지', color: 'text-amber-400' },
  recommendation: { icon: '💡', label: '추가 조사 권고', color: 'text-emerald-400' },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: '새로운', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  reviewed: { label: '검토됨', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  confirmed: { label: '확인됨', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  dismissed: { label: '무시됨', color: 'text-dark-500', bg: 'bg-dark-700/50 border-dark-600/30' },
}

export default function AiInsightsPage() {
  const navigate = useNavigate()

  // State - entity selection
  const [entityType, setEntityType] = useState<EntityType | ''>('')
  const [entityId, setEntityId] = useState('')
  const [sites, setSites] = useState<Site[]>([])
  const [persons, setPersons] = useState<Person[]>([])

  // State - analysis
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<AiInsight[]>([])

  // State - history
  const [allInsights, setAllInsights] = useState<AiInsight[]>([])
  const [historyFilter, setHistoryFilter] = useState<'all' | 'new' | 'reviewed' | 'confirmed' | 'dismissed'>('all')
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    Promise.all([
      window.electronAPI.sites.list(),
      window.electronAPI.persons.list(),
    ]).then(([s, p]) => {
      setSites(s)
      setPersons(p)
    })
  }, [])

  const loadInsights = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const filters: any = {}
      if (historyFilter !== 'all') filters.status = historyFilter
      const results = await window.electronAPI.aiInsights.list(filters)
      setAllInsights(results)
    } catch (err) {
      console.error('Failed to load insights:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [historyFilter])

  useEffect(() => { loadInsights() }, [loadInsights])
  useEffect(() => { setEntityId('') }, [entityType])

  async function handleAnalyze() {
    if (!entityType || !entityId) return
    setAnalyzing(true)
    setAnalysisResults([])
    try {
      const results = await window.electronAPI.aiInsights.analyze(entityType, entityId)
      setAnalysisResults(results)
      await loadInsights()
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleUpdateStatus(id: string, status: 'confirmed' | 'dismissed' | 'reviewed') {
    try {
      await window.electronAPI.aiInsights.updateStatus(id, status)
      setAnalysisResults(prev => prev.map(i => i.id === id ? { ...i, status, reviewed_at: new Date().toISOString() } : i))
      setAllInsights(prev => prev.map(i => i.id === id ? { ...i, status, reviewed_at: new Date().toISOString() } : i))
    } catch (err) {
      console.error('Failed to update insight status:', err)
    }
  }

  function getEntityName(type: string, id: string): string {
    if (type === 'site') {
      const site = sites.find(s => s.id === id)
      return site?.display_name || site?.domain || id
    }
    const person = persons.find(p => p.id === id)
    return person?.alias || person?.real_name || id
  }

  const selectedEntityName = entityId ? getEntityName(entityType, entityId) : ''

  function parseRelatedEntities(json: string | null): Array<{ type: string; id: string; name: string }> {
    if (!json) return []
    try { return JSON.parse(json) } catch { return [] }
  }

  function ConfidenceBar({ value }: { value: number | null }) {
    if (value === null || value === undefined) return <span className="text-dark-500 text-xs">N/A</span>
    const pct = Math.round(value * 100)
    const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-dark-800 rounded-full overflow-hidden max-w-[100px]">
          <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-dark-400 font-mono">{pct}%</span>
      </div>
    )
  }

  // Stats summary
  const insightStats = {
    total: allInsights.length,
    new: allInsights.filter(i => i.status === 'new').length,
    confirmed: allInsights.filter(i => i.status === 'confirmed').length,
    reviewed: allInsights.filter(i => i.status === 'reviewed').length,
    dismissed: allInsights.filter(i => i.status === 'dismissed').length,
  }

  function InsightCard({ insight, compact = false }: { insight: AiInsight; compact?: boolean }) {
    const meta = INSIGHT_TYPE_META[insight.insight_type] || { icon: '📋', label: insight.insight_type, color: 'text-dark-400' }
    const statusMeta = STATUS_META[insight.status] || STATUS_META.new
    const relatedEntities = parseRelatedEntities(insight.related_entities)

    return (
      <div className={`border rounded-lg p-3 transition-all hover:border-dark-600 ${
        insight.status === 'dismissed' ? 'opacity-50 bg-dark-900/30 border-dark-800/30' : 'bg-dark-800/40 border-dark-700/50'
      }`}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`${compact ? 'text-sm' : 'text-base'} flex-shrink-0`}>{meta.icon}</span>
            <div className="min-w-0">
              <h4 className={`font-medium text-dark-100 ${compact ? 'text-xs' : 'text-sm'} line-clamp-1`}>{insight.title}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] ${meta.color}`}>{meta.label}</span>
                <span className="text-dark-700">·</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusMeta.bg} ${statusMeta.color}`}>{statusMeta.label}</span>
              </div>
            </div>
          </div>
          <ConfidenceBar value={insight.confidence} />
        </div>

        <p className={`text-dark-300 leading-relaxed mb-2 ${compact ? 'text-[11px] line-clamp-2' : 'text-xs line-clamp-3'}`}>{insight.description}</p>

        {relatedEntities.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {relatedEntities.map((entity, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); navigate(`/${entity.type === 'site' ? 'sites' : 'persons'}/${entity.id}`) }}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-dark-700/50 border border-dark-600/50 text-dark-300 hover:text-dark-100 hover:border-dark-500 transition-colors"
              >
                <span>{entity.type === 'site' ? '🌐' : '👤'}</span>
                <span>{entity.name || entity.id}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2 text-dark-500">
            <span>{new Date(insight.analyzed_at).toLocaleString('ko-KR')}</span>
            {insight.ai_model && <span className="text-dark-600">· {insight.ai_model}</span>}
          </div>
          {insight.status !== 'dismissed' && insight.status !== 'confirmed' && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleUpdateStatus(insight.id, 'confirmed')}
                className="px-1.5 py-0.5 rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                title="확인됨으로 표시"
              >
                ✓
              </button>
              <button
                onClick={() => handleUpdateStatus(insight.id, 'reviewed')}
                className="px-1.5 py-0.5 rounded text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                title="검토됨으로 표시"
              >
                👁
              </button>
              <button
                onClick={() => handleUpdateStatus(insight.id, 'dismissed')}
                className="px-1.5 py-0.5 rounded text-dark-500 hover:bg-dark-700/50 transition-colors"
                title="무시"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      {/* Page header + Stats - compact row */}
      <div className="flex-shrink-0 mb-4">
        <div className="titlebar-drag pt-2 mb-3">
          <div className="titlebar-no-drag flex items-start justify-between">
            <div>
              <h1 className="page-title">🤖 AI 인사이트</h1>
              <p className="page-subtitle">
                사이트 또는 인물을 선택하여 AI 분석을 실행하고, 수집된 OSINT 데이터를 기반으로 인사이트를 도출합니다.
              </p>
            </div>
            {/* Inline stats */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800/40 border border-dark-700/50 rounded-lg">
                <span className="text-sm font-bold text-dark-100">{insightStats.total}</span>
                <span className="text-[10px] text-dark-500">전체</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <span className="text-sm font-bold text-blue-400">{insightStats.new}</span>
                <span className="text-[10px] text-blue-400/60">새로운</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                <span className="text-sm font-bold text-yellow-400">{insightStats.reviewed}</span>
                <span className="text-[10px] text-yellow-400/60">검토</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <span className="text-sm font-bold text-emerald-400">{insightStats.confirmed}</span>
                <span className="text-[10px] text-emerald-400/60">확인</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800/30 border border-dark-700/30 rounded-lg">
                <span className="text-sm font-bold text-dark-500">{insightStats.dismissed}</span>
                <span className="text-[10px] text-dark-600">무시</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area - fills remaining height */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Left: Analysis Control + Results */}
        <div className="lg:col-span-1 flex flex-col min-h-0 gap-3">
          {/* Analysis Control Panel */}
          <div className="bg-dark-800/40 border border-dark-700/50 rounded-lg p-4 flex-shrink-0">
            <h3 className="text-sm font-semibold text-dark-200 mb-3 flex items-center gap-2">
              <span>🎯</span> 분석 대상 선택
            </h3>

            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-dark-500 mb-1 uppercase tracking-wider">대상 유형</label>
                  <select
                    value={entityType}
                    onChange={e => setEntityType(e.target.value as EntityType | '')}
                    className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2.5 py-1.5 text-xs text-dark-100 focus:outline-none focus:border-yeye-500/50"
                  >
                    <option value="">선택하세요</option>
                    <option value="site">🌐 사이트 ({sites.length})</option>
                    <option value="person">👤 인물 ({persons.length})</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-dark-500 mb-1 uppercase tracking-wider">
                    {entityType === 'site' ? '사이트' : entityType === 'person' ? '인물' : '대상'} 선택
                  </label>
                  <select
                    value={entityId}
                    onChange={e => setEntityId(e.target.value)}
                    disabled={!entityType}
                    className="w-full bg-dark-900 border border-dark-700 rounded-lg px-2.5 py-1.5 text-xs text-dark-100 focus:outline-none focus:border-yeye-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {!entityType ? '유형 먼저 선택' : '선택하세요'}
                    </option>
                    {entityType === 'site' && sites.map(s => (
                      <option key={s.id} value={s.id}>{s.display_name || s.domain}</option>
                    ))}
                    {entityType === 'person' && persons.map(p => (
                      <option key={p.id} value={p.id}>{p.alias || p.real_name || '미확인'}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!entityType || !entityId || analyzing}
                className="w-full px-4 py-2 rounded-lg bg-yeye-600 text-white text-xs font-medium hover:bg-yeye-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {analyzing ? (
                  <><span className="animate-spin">⏳</span> 분석 중...</>
                ) : (
                  <><span>🔬</span> 분석 실행</>
                )}
              </button>
            </div>

            {entityId && (
              <div className="mt-2 px-2.5 py-1.5 bg-dark-900/50 rounded border border-dark-700/30">
                <p className="text-[11px] text-dark-400">
                  선택: <span className="text-dark-200 font-medium">{selectedEntityName}</span>
                  <span className="text-dark-600 ml-1">({entityType === 'site' ? '사이트' : '인물'})</span>
                </p>
              </div>
            )}
          </div>

          {/* Analysis Results / Info panel - scrollable */}
          <div className="flex-1 min-h-0 flex flex-col">
            {(analysisResults.length > 0 || analyzing) ? (
              <div className="flex flex-col flex-1 min-h-0">
                <h3 className="text-xs font-semibold text-dark-200 flex items-center gap-2 mb-2 flex-shrink-0">
                  <span>📋</span> 분석 결과
                  {analysisResults.length > 0 && (
                    <span className="text-[10px] text-dark-500 font-normal">{analysisResults.length}건</span>
                  )}
                </h3>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {analyzing && (
                    <div className="bg-dark-800/40 border border-dark-700/50 rounded-lg p-5 text-center">
                      <div className="text-xl mb-2 animate-pulse">🤖</div>
                      <p className="text-xs text-dark-300">AI가 데이터를 분석하고 있습니다...</p>
                      <div className="mt-2 flex justify-center">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-yeye-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-yeye-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-yeye-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {!analyzing && analysisResults.map(insight => (
                    <InsightCard key={insight.id} insight={insight} compact />
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-dark-800/20 border border-dark-700/30 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <span className="text-sm">ℹ️</span>
                  <div>
                    <p className="text-[11px] text-dark-400 leading-relaxed">
                      <span className="text-dark-300 font-medium">현재 Mock 분석 모드</span>로 동작합니다.
                      설정에서 Claude API, OpenAI API, 또는 로컬 LLM(Ollama)을 연동할 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Insight History (wider) - fills remaining height */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
              <span>📜</span> 인사이트 히스토리
              <span className="text-[10px] text-dark-500 font-normal">({allInsights.length}건)</span>
            </h3>

            <div className="flex items-center gap-1">
              {(['all', 'new', 'reviewed', 'confirmed', 'dismissed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    historyFilter === f
                      ? 'bg-yeye-600/20 text-yeye-400 border border-yeye-500/30'
                      : 'text-dark-500 hover:text-dark-300 border border-transparent'
                  }`}
                >
                  {f === 'all' ? '전체' : STATUS_META[f]?.label || f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loadingHistory ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-dark-800/40 border border-dark-700/50 rounded-lg p-3">
                    <div className="h-3.5 w-2/3 bg-dark-700 rounded mb-2" />
                    <div className="h-3 w-full bg-dark-800 rounded mb-1" />
                    <div className="h-3 w-4/5 bg-dark-800 rounded" />
                  </div>
                ))}
              </div>
            ) : allInsights.length === 0 ? (
              <div className="bg-dark-800/20 border border-dark-700/30 rounded-lg p-10 text-center h-full flex flex-col items-center justify-center">
                <div className="text-4xl mb-3 opacity-50">🤖</div>
                <p className="text-sm text-dark-400">
                  {historyFilter === 'all'
                    ? '아직 분석 결과가 없습니다.'
                    : `'${STATUS_META[historyFilter]?.label || historyFilter}' 상태의 인사이트가 없습니다.`}
                </p>
                <p className="text-xs text-dark-600 mt-1">왼쪽 패널에서 대상을 선택하고 분석을 실행하세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {allInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
