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

  // State - entity selection (cascading dropdowns)
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

  // Load sites and persons for dropdowns
  useEffect(() => {
    Promise.all([
      window.electronAPI.sites.list(),
      window.electronAPI.persons.list(),
    ]).then(([s, p]) => {
      setSites(s)
      setPersons(p)
    })
  }, [])

  // Load all insights history
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

  useEffect(() => {
    loadInsights()
  }, [loadInsights])

  // Reset entityId when entityType changes
  useEffect(() => {
    setEntityId('')
  }, [entityType])

  // Run analysis
  async function handleAnalyze() {
    if (!entityType || !entityId) return
    setAnalyzing(true)
    setAnalysisResults([])
    try {
      const results = await window.electronAPI.aiInsights.analyze(entityType, entityId)
      setAnalysisResults(results)
      // Refresh history
      await loadInsights()
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  // Update insight status
  async function handleUpdateStatus(id: string, status: 'confirmed' | 'dismissed' | 'reviewed') {
    try {
      await window.electronAPI.aiInsights.updateStatus(id, status)
      // Update local state
      setAnalysisResults(prev => prev.map(i => i.id === id ? { ...i, status, reviewed_at: new Date().toISOString() } : i))
      setAllInsights(prev => prev.map(i => i.id === id ? { ...i, status, reviewed_at: new Date().toISOString() } : i))
    } catch (err) {
      console.error('Failed to update insight status:', err)
    }
  }

  // Get entity name for display
  function getEntityName(type: string, id: string): string {
    if (type === 'site') {
      const site = sites.find(s => s.id === id)
      return site?.display_name || site?.domain || id
    }
    const person = persons.find(p => p.id === id)
    return person?.alias || person?.real_name || id
  }

  // Selected entity name
  const selectedEntityName = entityId ? getEntityName(entityType, entityId) : ''

  // Parse related entities from JSON string
  function parseRelatedEntities(json: string | null): Array<{ type: string; id: string; name: string }> {
    if (!json) return []
    try {
      return JSON.parse(json)
    } catch {
      return []
    }
  }

  // Render confidence bar
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

  // Render an insight card
  function InsightCard({ insight, showActions = true }: { insight: AiInsight; showActions?: boolean }) {
    const meta = INSIGHT_TYPE_META[insight.insight_type] || { icon: '📋', label: insight.insight_type, color: 'text-dark-400' }
    const statusMeta = STATUS_META[insight.status] || STATUS_META.new
    const relatedEntities = parseRelatedEntities(insight.related_entities)

    return (
      <div className={`border rounded-lg p-4 transition-all hover:border-dark-600 ${
        insight.status === 'dismissed' ? 'opacity-50 bg-dark-900/30 border-dark-800/30' : 'bg-dark-800/40 border-dark-700/50'
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">{meta.icon}</span>
            <div className="min-w-0">
              <h4 className="text-sm font-medium text-dark-100 truncate">{insight.title}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] ${meta.color}`}>{meta.label}</span>
                <span className="text-dark-700">·</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusMeta.bg} ${statusMeta.color}`}>{statusMeta.label}</span>
              </div>
            </div>
          </div>
          <ConfidenceBar value={insight.confidence} />
        </div>

        {/* Description */}
        <p className="text-xs text-dark-300 leading-relaxed mb-3">{insight.description}</p>

        {/* Related entities */}
        {relatedEntities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {relatedEntities.map((entity, idx) => (
              <button
                key={idx}
                onClick={() => navigate(`/${entity.type === 'site' ? 'sites' : 'persons'}/${entity.id}`)}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-dark-700/50 border border-dark-600/50 text-dark-300 hover:text-dark-100 hover:border-dark-500 transition-colors"
              >
                <span>{entity.type === 'site' ? '🌐' : '👤'}</span>
                <span>{entity.name || entity.id}</span>
              </button>
            ))}
          </div>
        )}

        {/* Footer: timestamp + actions */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2 text-dark-500">
            <span>🕐 {new Date(insight.analyzed_at).toLocaleString('ko-KR')}</span>
            {insight.ai_model && <span className="text-dark-600">· {insight.ai_model}</span>}
          </div>
          {showActions && insight.status !== 'dismissed' && insight.status !== 'confirmed' && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleUpdateStatus(insight.id, 'confirmed')}
                className="px-2 py-0.5 rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                title="확인됨으로 표시"
              >
                ✓ 확인
              </button>
              <button
                onClick={() => handleUpdateStatus(insight.id, 'reviewed')}
                className="px-2 py-0.5 rounded text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                title="검토됨으로 표시"
              >
                👁 검토
              </button>
              <button
                onClick={() => handleUpdateStatus(insight.id, 'dismissed')}
                className="px-2 py-0.5 rounded text-dark-500 hover:bg-dark-700/50 transition-colors"
                title="무시"
              >
                ✕ 무시
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-dark-50 flex items-center gap-2">
          🤖 AI 인사이트
        </h2>
        <p className="text-xs text-dark-500 mt-1">
          사이트 또는 인물을 선택하여 AI 분석을 실행하고, 수집된 OSINT 데이터를 기반으로 인사이트를 도출합니다.
        </p>
      </div>

      {/* Analysis Control Panel */}
      <div className="bg-dark-800/40 border border-dark-700/50 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-dark-200 mb-4 flex items-center gap-2">
          <span>🎯</span> 분석 대상 선택
        </h3>

        <div className="flex items-end gap-3">
          {/* Step 1: Entity Type */}
          <div className="flex-1 max-w-[180px]">
            <label className="block text-[10px] text-dark-500 mb-1.5 uppercase tracking-wider">대상 유형</label>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value as EntityType | '')}
              className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-100 focus:outline-none focus:border-yeye-500/50"
            >
              <option value="">선택하세요</option>
              <option value="site">🌐 사이트</option>
              <option value="person">👤 인물</option>
            </select>
          </div>

          {/* Step 2: Entity Selection */}
          <div className="flex-1">
            <label className="block text-[10px] text-dark-500 mb-1.5 uppercase tracking-wider">
              {entityType === 'site' ? '사이트 선택' : entityType === 'person' ? '인물 선택' : '대상 선택'}
            </label>
            <select
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
              disabled={!entityType}
              className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-100 focus:outline-none focus:border-yeye-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <option value="">
                {!entityType ? '유형을 먼저 선택하세요' : `${entityType === 'site' ? '사이트' : '인물'}를 선택하세요`}
              </option>
              {entityType === 'site' && sites.map(s => (
                <option key={s.id} value={s.id}>
                  {s.display_name || s.domain} ({s.domain})
                </option>
              ))}
              {entityType === 'person' && persons.map(p => (
                <option key={p.id} value={p.id}>
                  {p.alias || p.real_name || '미확인'} {p.real_name && p.alias ? `(${p.real_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={!entityType || !entityId || analyzing}
            className="px-5 py-2 rounded-lg bg-yeye-600 text-white text-sm font-medium hover:bg-yeye-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {analyzing ? (
              <>
                <span className="animate-spin">⏳</span>
                분석 중...
              </>
            ) : (
              <>
                <span>🔬</span>
                분석 실행
              </>
            )}
          </button>
        </div>

        {/* Selected entity info */}
        {entityId && (
          <div className="mt-3 px-3 py-2 bg-dark-900/50 rounded border border-dark-700/30">
            <p className="text-xs text-dark-400">
              선택된 대상: <span className="text-dark-200 font-medium">{selectedEntityName}</span>
              <span className="text-dark-600 ml-2">
                ({entityType === 'site' ? '사이트' : '인물'})
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Analysis Results */}
      {(analysisResults.length > 0 || analyzing) && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
            <span>📋</span> 분석 결과
            {analysisResults.length > 0 && (
              <span className="text-[10px] text-dark-500 font-normal">
                {analysisResults.length}건의 인사이트 도출
              </span>
            )}
          </h3>

          {analyzing && (
            <div className="bg-dark-800/40 border border-dark-700/50 rounded-lg p-8 text-center">
              <div className="text-3xl mb-3 animate-pulse">🤖</div>
              <p className="text-sm text-dark-300">AI가 수집된 데이터를 분석하고 있습니다...</p>
              <p className="text-[10px] text-dark-500 mt-1">OSINT 데이터, 관계 정보, 타임라인을 종합 분석 중</p>
              <div className="mt-4 flex justify-center">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-yeye-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-yeye-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-yeye-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {!analyzing && analysisResults.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      {/* Insight History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
            <span>📜</span> 인사이트 히스토리
            <span className="text-[10px] text-dark-500 font-normal">
              ({allInsights.length}건)
            </span>
          </h3>

          {/* History filter */}
          <div className="flex items-center gap-1">
            {(['all', 'new', 'reviewed', 'confirmed', 'dismissed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setHistoryFilter(f)}
                className={`px-2.5 py-1 rounded text-[10px] transition-colors ${
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

        {loadingHistory ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse bg-dark-800/40 border border-dark-700/50 rounded-lg p-4">
                <div className="h-4 w-2/3 bg-dark-700 rounded mb-2" />
                <div className="h-3 w-full bg-dark-800 rounded mb-1" />
                <div className="h-3 w-4/5 bg-dark-800 rounded" />
              </div>
            ))}
          </div>
        ) : allInsights.length === 0 ? (
          <div className="bg-dark-800/20 border border-dark-700/30 rounded-lg p-8 text-center">
            <div className="text-3xl mb-2 opacity-50">🤖</div>
            <p className="text-sm text-dark-400">
              {historyFilter === 'all'
                ? '아직 분석 결과가 없습니다. 위에서 대상을 선택하고 분석을 실행하세요.'
                : `'${STATUS_META[historyFilter]?.label || historyFilter}' 상태의 인사이트가 없습니다.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {allInsights.map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-dark-800/20 border border-dark-700/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg">ℹ️</span>
          <div>
            <p className="text-xs text-dark-400 leading-relaxed">
              <span className="text-dark-300 font-medium">현재 Mock 분석 모드</span>로 동작합니다.
              실제 AI API 연동은 추후 진행 예정이며, 현재는 수집된 OSINT 데이터와 관계 정보를 기반으로 시뮬레이션된 결과가 표시됩니다.
            </p>
            <p className="text-[10px] text-dark-500 mt-1">
              지원 예정 AI 모델: Claude API, OpenAI API, 로컬 LLM (Ollama)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
