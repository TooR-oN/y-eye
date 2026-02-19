import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import type { Site } from '@/shared/types'
import { SITE_TYPES } from '@/shared/types'

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const navigate = useNavigate()

  const loadSites = useCallback(async () => {
    try {
      const filters: any = {}
      if (search) filters.search = search
      if (statusFilter) filters.status = statusFilter
      if (priorityFilter) filters.priority = priorityFilter
      const data = await window.electronAPI.sites.list(filters)
      setSites(data)
    } catch (err) {
      console.error('Failed to load sites:', err)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, priorityFilter])

  useEffect(() => { loadSites() }, [loadSites])

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="titlebar-drag pt-2 flex items-start justify-between">
        <div className="titlebar-no-drag">
          <h1 className="page-title">사이트 관리</h1>
          <p className="page-subtitle">조사 대상 불법 웹툰 사이트 목록</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary titlebar-no-drag">
          ＋ 사이트 추가
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="도메인 또는 메모 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input flex-1 max-w-xs"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select w-32">
          <option value="">전체 상태</option>
          <option value="active">운영 중</option>
          <option value="closed">폐쇄</option>
          <option value="redirected">리다이렉트</option>
          <option value="unknown">미확인</option>
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="select w-32">
          <option value="">전체 우선순위</option>
          <option value="critical">긴급</option>
          <option value="high">높음</option>
          <option value="medium">보통</option>
          <option value="low">낮음</option>
        </select>
        <div className="flex-1" />
        <span className="text-sm text-dark-500 self-center">{sites.length}개 사이트</span>
      </div>

      {/* Sites Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-dark-800/50 rounded-lg animate-pulse" />)}
        </div>
      ) : sites.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">🌐</p>
          <p className="text-dark-300 font-medium">아직 등록된 사이트가 없습니다</p>
          <p className="text-dark-500 text-sm mt-1">사이트를 추가하여 OSINT 조사를 시작하세요</p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">
            ＋ 첫 번째 사이트 추가
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                <th className="table-header px-4 py-3 text-left">도메인</th>
                <th className="table-header px-4 py-3 text-left">유형</th>
                <th className="table-header px-4 py-3 text-center">상태</th>
                <th className="table-header px-4 py-3 text-center">우선순위</th>
                <th className="table-header px-4 py-3 text-center">조사 상태</th>
                <th className="table-header px-4 py-3 text-left">권고사항</th>
                <th className="table-header px-4 py-3 text-right">업데이트</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(site => (
                <tr
                  key={site.id}
                  className="table-row cursor-pointer"
                  onClick={() => navigate(`/sites/${site.id}`)}
                >
                  <td className="table-cell font-medium text-dark-100">
                    {site.domain}
                    {site.display_name && site.display_name !== site.domain && (
                      <span className="text-dark-500 text-xs ml-2">({site.display_name})</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <span className={`text-xs ${SITE_TYPES.find(t => t.value === site.site_type)?.color || 'text-dark-500'}`}>
                      {SITE_TYPES.find(t => t.value === site.site_type)?.label || site.site_type || '-'}
                    </span>
                  </td>
                  <td className="table-cell text-center">
                    <span className={`badge badge-${site.status}`}>
                      {site.status === 'active' ? '운영 중' : site.status === 'closed' ? '폐쇄' : site.status === 'redirected' ? '리다이렉트' : '미확인'}
                    </span>
                  </td>
                  <td className="table-cell text-center">
                    <span className={`badge priority-${site.priority}`}>
                      {site.priority === 'critical' ? '긴급' : site.priority === 'high' ? '높음' : site.priority === 'medium' ? '보통' : '낮음'}
                    </span>
                  </td>
                  <td className="table-cell text-center">
                    <span className={`badge inv-${site.investigation_status}`}>
                      {site.investigation_status === 'pending' ? '대기' : site.investigation_status === 'in_progress' ? '진행중' : site.investigation_status === 'completed' ? '완료' : '보류'}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-dark-400 max-w-[200px] truncate">
                    {site.recommendation || '-'}
                  </td>
                  <td className="table-cell text-right text-xs text-dark-500">
                    {new Date(site.updated_at).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Site Modal */}
      {showAddModal && (
        <AddSiteModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => { setShowAddModal(false); loadSites() }}
        />
      )}
    </div>
  )
}

// ============================================
// Add Site Modal (Jobdori 검색 탭 + 수동 추가 탭)
// ============================================

function AddSiteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [activeTab, setActiveTab] = useState<'jobdori' | 'manual'>('jobdori')

  // === 수동 추가 탭 ===
  const [domain, setDomain] = useState('')
  const [siteType, setSiteType] = useState('')
  const [priority, setPriority] = useState('medium')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // === Jobdori 검색 탭 ===
  const [searchTerm, setSearchTerm] = useState('')
  const [recommendation, setRecommendation] = useState('')
  const [jobdoriSites, setJobdoriSites] = useState<any[]>([])
  const [loadingSites, setLoadingSites] = useState(false)
  const [existingDomains, setExistingDomains] = useState<Set<string>>(new Set())
  const [addingDomain, setAddingDomain] = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)

  // 모달 열릴 때 Jobdori 사이트 + 기존 사이트 로드
  useEffect(() => {
    loadJobdoriSites()
    loadExistingDomains()
  }, [])

  async function loadExistingDomains() {
    try {
      const sites = await window.electronAPI.sites.list()
      setExistingDomains(new Set(sites.map((s: Site) => s.domain.toLowerCase())))
    } catch (err) {
      console.error('Failed to load existing sites:', err)
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

  async function handleJobdoriSearch() {
    if (!searchTerm.trim()) { loadJobdoriSites(recommendation); return }
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

  async function handleAddFromJobdori(site: any) {
    if (!site.domain) return
    setAddingDomain(site.domain)
    try {
      const priorityMap = site.recommendation?.includes('최상위') ? 'critical'
        : site.recommendation?.includes('OSINT') ? 'high'
        : site.recommendation?.includes('모니터링') ? 'medium' : 'medium'

      await window.electronAPI.sites.create({
        id: uuidv4(),
        domain: site.domain,
        display_name: site.domain,
        site_type: (site.site_type || 'other').toLowerCase(),
        status: 'active',
        priority: priorityMap,
        recommendation: site.recommendation || null,
        traffic_monthly: site.total_visits ? site.total_visits.toLocaleString() : null,
        traffic_rank: site.global_rank ? site.global_rank.toLocaleString() : null,
        unique_visitors: site.unique_visitors ? site.unique_visitors.toLocaleString() : null,
        investigation_status: 'pending',
        notes: `Jobdori에서 추가 — 위협점수: ${site.threat_score ?? '-'}, 권고: ${site.recommendation ?? '-'}`,
      } as any)

      // 추가 후 기존 도메인 목록 갱신
      setExistingDomains(prev => new Set([...prev, site.domain.toLowerCase()]))
      setAddedCount(prev => prev + 1)
    } catch (err) {
      console.error('Failed to add site from Jobdori:', err)
    } finally {
      setAddingDomain(null)
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!domain.trim()) return

    setSaving(true)
    try {
      await window.electronAPI.sites.create({
        id: uuidv4(),
        domain: domain.trim().toLowerCase(),
        site_type: siteType || null,
        priority,
        notes: notes || null,
        investigation_status: 'pending',
      } as any)
      onCreated()
    } catch (err) {
      console.error('Failed to create site:', err)
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (addedCount > 0) {
      onCreated() // Jobdori에서 추가한 게 있으면 목록 새로고침
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={handleClose}>
      <div className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 모달 헤더 + 탭 */}
        <div className="px-6 pt-6 pb-0">
          <h2 className="text-lg font-bold text-dark-50 mb-4">사이트 추가</h2>
          <div className="flex gap-1 border-b border-dark-800/50">
            <button
              onClick={() => setActiveTab('jobdori')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'jobdori'
                  ? 'border-yeye-500 text-yeye-400'
                  : 'border-transparent text-dark-500 hover:text-dark-300'
              }`}
            >
              🔄 Jobdori에서 추가
              {addedCount > 0 && (
                <span className="ml-1.5 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">+{addedCount}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'manual'
                  ? 'border-yeye-500 text-yeye-400'
                  : 'border-transparent text-dark-500 hover:text-dark-300'
              }`}
            >
              ✏️ 수동 추가
            </button>
          </div>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {/* ===== Jobdori 검색 탭 ===== */}
          {activeTab === 'jobdori' && (
            <div className="space-y-4">
              {/* 검색 + 필터 */}
              <div className="flex gap-2">
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJobdoriSearch()}
                    className="input flex-1"
                    placeholder="도메인 검색..."
                    autoFocus
                  />
                  <button onClick={handleJobdoriSearch} className="btn-secondary btn-sm">검색</button>
                </div>
                <select
                  value={recommendation}
                  onChange={e => { setRecommendation(e.target.value); setSearchTerm(''); loadJobdoriSites(e.target.value) }}
                  className="select w-44"
                >
                  <option value="">전체 권고사항</option>
                  <option value="최상위 타겟">최상위 타겟</option>
                  <option value="OSINT 조사 필요">OSINT 조사 필요</option>
                  <option value="모니터링 권고">모니터링 권고</option>
                </select>
              </div>

              {/* 결과 테이블 */}
              {loadingSites ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-11 bg-dark-800/50 rounded-lg animate-pulse" />)}
                </div>
              ) : jobdoriSites.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-dark-500 text-sm">조건에 맞는 사이트가 없습니다</p>
                  <p className="text-dark-600 text-xs mt-1">Jobdori DB 연결 상태를 확인하거나, 검색어를 변경해보세요</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-dark-700/30">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-dark-800/30 border-b border-dark-700/30">
                        <th className="table-header px-3 py-2 text-left text-xs">도메인</th>
                        <th className="table-header px-3 py-2 text-center text-xs">유형</th>
                        <th className="table-header px-3 py-2 text-center text-xs">위협</th>
                        <th className="table-header px-3 py-2 text-right text-xs">월간 방문</th>
                        <th className="table-header px-3 py-2 text-left text-xs">권고사항</th>
                        <th className="table-header px-3 py-2 text-center text-xs w-24">추가</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobdoriSites.map((site, idx) => {
                        const isExisting = existingDomains.has(site.domain?.toLowerCase())
                        return (
                          <tr key={idx} className="table-row">
                            <td className="px-3 py-2 text-sm font-medium text-dark-100">{site.domain}</td>
                            <td className="px-3 py-2 text-center text-xs text-dark-400">{site.site_type || '-'}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-xs font-medium ${
                                (site.threat_score || 0) >= 80 ? 'text-red-400' :
                                (site.threat_score || 0) >= 60 ? 'text-amber-400' : 'text-dark-400'
                              }`}>
                                {site.threat_score ?? '-'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-dark-400">
                              {site.total_visits ? site.total_visits.toLocaleString() : '-'}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded ${
                                site.recommendation?.includes('최상위') ? 'bg-red-500/15 text-red-400' :
                                site.recommendation?.includes('OSINT') ? 'bg-orange-500/15 text-orange-400' :
                                'bg-dark-700/50 text-dark-400'
                              }`}>
                                {site.recommendation || '-'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {isExisting ? (
                                <span className="text-[10px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  ✓ 등록됨
                                </span>
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
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ===== 수동 추가 탭 ===== */}
          {activeTab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">도메인 *</label>
                <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" className="input" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1.5">사이트 유형</label>
                  <select value={siteType} onChange={e => setSiteType(e.target.value)} className="select">
                    <option value="">선택</option>
                    {SITE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-dark-400 mb-1.5">우선순위</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className="select">
                    <option value="critical">긴급</option>
                    <option value="high">높음</option>
                    <option value="medium">보통</option>
                    <option value="low">낮음</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">메모</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="textarea" rows={3} placeholder="초기 메모..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleClose} className="btn-secondary flex-1">취소</button>
                <button type="submit" disabled={!domain.trim() || saving} className="btn-primary flex-1">
                  {saving ? '추가 중...' : '추가'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Jobdori 탭일 때 하단 닫기 버튼 */}
        {activeTab === 'jobdori' && (
          <div className="px-6 py-4 border-t border-dark-800/50 flex justify-end">
            <button onClick={handleClose} className="btn-secondary">
              {addedCount > 0 ? `닫기 (${addedCount}개 추가됨)` : '닫기'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
