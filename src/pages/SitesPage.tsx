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
// Add Site Modal
// ============================================

function AddSiteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [domain, setDomain] = useState('')
  const [siteType, setSiteType] = useState('')
  const [priority, setPriority] = useState('medium')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-dark-50 mb-4">사이트 추가</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <button type="button" onClick={onClose} className="btn-secondary flex-1">취소</button>
            <button type="submit" disabled={!domain.trim() || saving} className="btn-primary flex-1">
              {saving ? '추가 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
