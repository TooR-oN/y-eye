import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import type { Site, OsintEntry, PersonSiteRelation, TimelineEvent, DomainHistory } from '@/shared/types'
import { OSINT_CATEGORIES, SITE_TYPES, PERSON_ROLES, CONFIDENCE_LEVELS } from '@/shared/types'

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [site, setSite] = useState<Site | null>(null)
  const [osintEntries, setOsintEntries] = useState<OsintEntry[]>([])
  const [relatedPersons, setRelatedPersons] = useState<PersonSiteRelation[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [domainHistory, setDomainHistory] = useState<DomainHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'osint' | 'persons' | 'timeline' | 'history'>('osint')
  const [showAddOsint, setShowAddOsint] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Site>>({})

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      const [siteData, osintData, personsData, timelineData, historyData] = await Promise.all([
        window.electronAPI.sites.get(id),
        window.electronAPI.osint.list({ entity_type: 'site', entity_id: id }),
        window.electronAPI.personSiteRelations.list({ site_id: id }),
        window.electronAPI.timeline.list({ entity_type: 'site', entity_id: id, limit: 20 }),
        window.electronAPI.domainHistory.list(id),
      ])
      setSite(siteData)
      setOsintEntries(osintData)
      setRelatedPersons(personsData)
      setTimeline(timelineData)
      setDomainHistory(historyData)
      if (siteData) setEditForm(siteData)
    } catch (err) {
      console.error('Failed to load site:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    if (!id || !editForm) return
    try {
      const { id: _, created_at, updated_at, synced_at, ...updates } = editForm as any
      await window.electronAPI.sites.update(id, updates)
      setEditing(false)
      loadData()
    } catch (err) {
      console.error('Failed to update site:', err)
    }
  }

  async function handleDelete() {
    if (!id || !confirm('이 사이트를 삭제하시겠습니까? 관련된 모든 OSINT 정보도 삭제됩니다.')) return
    try {
      await window.electronAPI.sites.delete(id)
      navigate('/sites')
    } catch (err) {
      console.error('Failed to delete site:', err)
    }
  }

  if (loading) {
    return <div className="p-8"><div className="animate-pulse h-8 w-64 bg-dark-800 rounded" /></div>
  }
  if (!site) {
    return <div className="p-8"><p className="text-dark-500">사이트를 찾을 수 없습니다.</p></div>
  }

  const tabs = [
    { key: 'osint', label: 'OSINT 정보', count: osintEntries.length },
    { key: 'persons', label: '연관 인물', count: relatedPersons.length },
    { key: 'timeline', label: '타임라인', count: timeline.length },
    { key: 'history', label: '도메인 이력', count: domainHistory.length },
  ] as const

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="titlebar-drag pt-2">
        <div className="titlebar-no-drag flex items-start justify-between">
          <div>
            <button onClick={() => navigate('/sites')} className="text-xs text-dark-500 hover:text-dark-300 mb-2 flex items-center gap-1">
              ← 사이트 목록
            </button>
            <h1 className="page-title flex items-center gap-3">
              {site.domain}
              <span className={`badge badge-${site.status} text-xs`}>
                {site.status === 'active' ? '운영 중' : site.status === 'closed' ? '폐쇄' : site.status}
              </span>
              <span className={`badge priority-${site.priority} text-xs`}>
                {site.priority === 'critical' ? '긴급' : site.priority === 'high' ? '높음' : site.priority === 'medium' ? '보통' : '낮음'}
              </span>
            </h1>
            <p className="page-subtitle">
              {SITE_TYPES.find(t => t.value === site.site_type)?.label || site.site_type || '미분류'} · 
              {site.investigation_status === 'pending' ? ' 조사 대기' : site.investigation_status === 'in_progress' ? ' 조사 진행중' : site.investigation_status === 'completed' ? ' 조사 완료' : ' 보류'}
            </p>
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="btn-secondary btn-sm">취소</button>
                <button onClick={handleSave} className="btn-primary btn-sm">저장</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="btn-secondary btn-sm">편집</button>
                <button onClick={handleDelete} className="btn-danger btn-sm">삭제</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Form / Info Cards */}
      {editing ? (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">도메인</label>
              <input type="text" value={editForm.domain || ''} onChange={e => setEditForm({...editForm, domain: e.target.value})} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">표시 이름</label>
              <input type="text" value={editForm.display_name || ''} onChange={e => setEditForm({...editForm, display_name: e.target.value})} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">사이트 유형</label>
              <select value={editForm.site_type || ''} onChange={e => setEditForm({...editForm, site_type: e.target.value})} className="select">
                <option value="">선택</option>
                {SITE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">상태</label>
              <select value={editForm.status || ''} onChange={e => setEditForm({...editForm, status: e.target.value as any})} className="select">
                <option value="active">운영 중</option>
                <option value="closed">폐쇄</option>
                <option value="redirected">리다이렉트</option>
                <option value="unknown">미확인</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">우선순위</label>
              <select value={editForm.priority || ''} onChange={e => setEditForm({...editForm, priority: e.target.value as any})} className="select">
                <option value="critical">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">조사 상태</label>
              <select value={editForm.investigation_status || ''} onChange={e => setEditForm({...editForm, investigation_status: e.target.value as any})} className="select">
                <option value="pending">대기</option>
                <option value="in_progress">진행중</option>
                <option value="completed">완료</option>
                <option value="on_hold">보류</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">메모</label>
            <textarea value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="textarea" rows={3} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          <InfoCard label="월간 트래픽" value={site.traffic_monthly || '-'} />
          <InfoCard label="글로벌 순위" value={site.traffic_rank || '-'} />
          <InfoCard label="순 방문자" value={site.unique_visitors || '-'} />
          <InfoCard label="권고사항" value={site.recommendation || '-'} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dark-800/50">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-yeye-500 text-yeye-400'
                : 'border-transparent text-dark-500 hover:text-dark-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && <span className="ml-1.5 text-xs bg-dark-800 px-1.5 py-0.5 rounded-full">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'osint' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-dark-300">OSINT 정보 항목</h3>
            <button onClick={() => setShowAddOsint(true)} className="btn-primary btn-sm">＋ 정보 추가</button>
          </div>
          {osintEntries.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-sm">아직 수집된 OSINT 정보가 없습니다</p>
              <button onClick={() => setShowAddOsint(true)} className="btn-primary btn-sm mt-3">＋ 첫 정보 추가</button>
            </div>
          ) : (
            <div className="space-y-3">
              {osintEntries.map(entry => (
                <OsintEntryCard key={entry.id} entry={entry} onDelete={async () => {
                  await window.electronAPI.osint.delete(entry.id)
                  loadData()
                }} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'persons' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-dark-300">연관 인물</h3>
          {relatedPersons.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-sm">연결된 인물이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {relatedPersons.map(rel => (
                <div key={rel.id} className="card-hover flex items-center justify-between" onClick={() => navigate(`/persons/${rel.person_id}`)}>
                  <div>
                    <p className="text-sm font-medium text-dark-100">{rel.alias || rel.real_name || '미확인'}</p>
                    <p className="text-xs text-dark-500">
                      {PERSON_ROLES.find(r => r.value === rel.role)?.label || rel.role || '역할 미지정'} · 
                      신뢰도: {CONFIDENCE_LEVELS.find(c => c.value === rel.confidence)?.label || rel.confidence}
                    </p>
                  </div>
                  <span className="text-dark-600">→</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-dark-300">타임라인</h3>
          {timeline.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-sm">아직 이벤트가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timeline.map(event => (
                <div key={event.id} className="card flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-yeye-500 mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-dark-200">{event.title}</p>
                    {event.description && <p className="text-xs text-dark-500 mt-0.5">{event.description}</p>}
                  </div>
                  <time className="text-xs text-dark-500">{new Date(event.event_date).toLocaleDateString('ko-KR')}</time>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-dark-300">도메인 변경 이력</h3>
          {domainHistory.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-sm">도메인 변경 이력이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {domainHistory.map(h => (
                <div key={h.id} className="card">
                  <p className="text-sm text-dark-200 font-medium">{h.domain}</p>
                  <p className="text-xs text-dark-500">
                    {h.detected_at ? new Date(h.detected_at).toLocaleDateString('ko-KR') : '-'} · {h.source || '-'}
                  </p>
                  {h.notes && <p className="text-xs text-dark-400 mt-1">{h.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add OSINT Modal */}
      {showAddOsint && id && (
        <AddOsintModal entityType="site" entityId={id} onClose={() => setShowAddOsint(false)} onCreated={() => { setShowAddOsint(false); loadData() }} />
      )}
    </div>
  )
}

// ============================================
// Sub-components
// ============================================

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-dark-500 font-medium">{label}</p>
      <p className="text-sm text-dark-200 mt-1 truncate">{value}</p>
    </div>
  )
}

function OsintEntryCard({ entry, onDelete }: { entry: OsintEntry; onDelete: () => void }) {
  const cat = OSINT_CATEGORIES.find(c => c.value === entry.category)
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">{cat?.icon || '📝'}</span>
          <h4 className="text-sm font-medium text-dark-100">{entry.title}</h4>
          <span className="text-[10px] text-dark-500 bg-dark-800 px-1.5 py-0.5 rounded">{cat?.label || entry.category || '기타'}</span>
          {entry.is_key_evidence ? <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">핵심 증거</span> : null}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-dark-600 hover:text-red-400 text-xs">삭제</button>
      </div>
      {entry.content && <p className="text-sm text-dark-300 mt-2 whitespace-pre-wrap">{entry.content}</p>}
      <div className="flex items-center gap-3 mt-2 text-[10px] text-dark-500">
        {entry.source && <span>출처: {entry.source}</span>}
        <span>신뢰도: {CONFIDENCE_LEVELS.find(c => c.value === entry.confidence)?.label || entry.confidence}</span>
        <span>{new Date(entry.created_at).toLocaleDateString('ko-KR')}</span>
      </div>
    </div>
  )
}

// ============================================
// Add OSINT Modal (공유 컴포넌트)
// ============================================

export function AddOsintModal({ entityType, entityId, onClose, onCreated }: {
  entityType: 'site' | 'person'; entityId: string; onClose: () => void; onCreated: () => void
}) {
  const [category, setCategory] = useState('custom')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [source, setSource] = useState('')
  const [confidence, setConfidence] = useState('medium')
  const [isKeyEvidence, setIsKeyEvidence] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    setSaving(true)
    try {
      await window.electronAPI.osint.create({
        id: uuidv4(),
        entity_type: entityType,
        entity_id: entityId,
        category,
        title: title.trim(),
        content: content.trim() || null,
        raw_input: content.trim() || null,
        source: source.trim() || null,
        confidence,
        is_key_evidence: isKeyEvidence ? 1 : 0,
      })
      onCreated()
    } catch (err) {
      console.error('Failed to create OSINT entry:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-dark-50 mb-4">OSINT 정보 추가</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">카테고리</label>
            <div className="grid grid-cols-4 gap-1.5">
              {OSINT_CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`px-2 py-1.5 rounded-lg text-xs text-center transition-all ${
                    category === cat.value ? 'bg-yeye-600/20 text-yeye-400 border border-yeye-500/30' : 'bg-dark-800/50 text-dark-400 border border-dark-700/30 hover:bg-dark-800'
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">제목 *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="예: 등록자 이메일 주소" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">내용</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} className="textarea" rows={5} placeholder="수집한 정보를 자유롭게 입력하세요..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">정보 출처</label>
              <input type="text" value={source} onChange={e => setSource(e.target.value)} className="input" placeholder="예: WHOIS 조회" />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">신뢰도</label>
              <select value={confidence} onChange={e => setConfidence(e.target.value)} className="select">
                {CONFIDENCE_LEVELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isKeyEvidence} onChange={e => setIsKeyEvidence(e.target.checked)} className="rounded border-dark-600 bg-dark-800" />
            <span className="text-sm text-dark-300">핵심 증거로 표시</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">취소</button>
            <button type="submit" disabled={!title.trim() || saving} className="btn-primary flex-1">
              {saving ? '추가 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
