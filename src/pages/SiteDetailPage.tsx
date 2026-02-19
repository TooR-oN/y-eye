import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import type { Site, Person, OsintEntry, PersonSiteRelation, TimelineEvent, DomainHistory, MarkdownExportResult } from '@/shared/types'
import { OSINT_CATEGORIES, SITE_TYPES, PERSON_ROLES, CONFIDENCE_LEVELS } from '@/shared/types'
import MarkdownPreviewModal from '@/components/MarkdownPreviewModal'

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
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<MarkdownExportResult | null>(null)

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

  async function handleExportMarkdown() {
    if (!id) return
    setExporting(true)
    try {
      const result = await window.electronAPI.obsidian.exportSite(id)
      setExportResult(result)
    } catch (err) {
      console.error('Failed to export markdown:', err)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return <div className="p-8"><div className="animate-pulse h-8 w-64 bg-dark-800 rounded" /></div>
  }
  if (!site) {
    return <div className="p-8"><p className="text-dark-500">사이트를 찾을 수 없습니다.</p></div>
  }

  const tabs = [
    { key: 'osint', label: '인프라 정보', count: osintEntries.length },
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
                <button
                  onClick={handleExportMarkdown}
                  disabled={exporting}
                  className="btn-secondary btn-sm flex items-center gap-1"
                  title="Obsidian 마크다운으로 내보내기"
                >
                  {exporting ? '⏳' : '📝'} 내보내기
                </button>
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
            <h3 className="text-sm font-medium text-dark-300">인프라 정보 항목</h3>
            <button onClick={() => setShowAddOsint(true)} className="btn-primary btn-sm">＋ 정보 추가</button>
          </div>
          {osintEntries.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-sm">아직 수집된 인프라 정보가 없습니다</p>
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
            <div className="space-y-4">
              {relatedPersons.map(rel => (
                <PersonDetailCard key={rel.id} relation={rel} navigate={navigate} />
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
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-dark-300">도메인 변경 이력</h3>
            {domainHistory.length >= 2 && (
              <button
                onClick={async () => {
                  const sorted = [...domainHistory].sort((a, b) => (a.detected_at || a.created_at).localeCompare(b.detected_at || b.created_at))
                  const oldDomain = sorted[0].domain
                  const newDomain = sorted[sorted.length - 1].domain
                  try {
                    const result = await window.electronAPI.obsidian.exportDomainChange(id!, oldDomain, newDomain)
                    setExportResult(result)
                  } catch (err) {
                    console.error('Failed to export domain change:', err)
                  }
                }}
                className="btn-secondary btn-sm flex items-center gap-1 text-xs"
                title="도메인 변경 노트 내보내기"
              >
                📝 변경 노트 내보내기
              </button>
            )}
          </div>
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

      {/* Markdown Preview Modal */}
      {exportResult && (
        <MarkdownPreviewModal result={exportResult} onClose={() => setExportResult(null)} />
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
// Person Detail Card (연관 인물 탭 - 상세 정보 표시)
// ============================================

const RISK_COLORS: Record<string, string> = {
  critical: 'priority-critical', high: 'priority-high', medium: 'priority-medium', low: 'priority-low',
}
const RISK_LABELS: Record<string, string> = { critical: '긴급', high: '높음', medium: '보통', low: '낮음' }
const STATUS_LABELS: Record<string, string> = { active: '활동 중', identified: '신원 확인', arrested: '체포됨', unknown: '미확인' }

function PersonDetailCard({ relation, navigate }: { relation: PersonSiteRelation; navigate: (path: string) => void }) {
  const [person, setPerson] = useState<Person | null>(null)
  const [personOsint, setPersonOsint] = useState<OsintEntry[]>([])
  const [personSites, setPersonSites] = useState<PersonSiteRelation[]>([])
  const [expanded, setExpanded] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPersonData()
  }, [relation.person_id])

  async function loadPersonData() {
    try {
      const [personData, osintData, sitesData] = await Promise.all([
        window.electronAPI.persons.get(relation.person_id),
        window.electronAPI.osint.list({ entity_type: 'person', entity_id: relation.person_id }),
        window.electronAPI.personSiteRelations.list({ person_id: relation.person_id }),
      ])
      setPerson(personData)
      setPersonOsint(osintData)
      setPersonSites(sitesData)
    } catch (err) {
      console.error('Failed to load person data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="card animate-pulse h-20" />
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Person Header — 항상 표시 */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-dark-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center text-lg flex-shrink-0">
            👤
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-dark-50">
                {person?.alias || person?.real_name || '미확인'}
              </p>
              {person?.real_name && person?.alias && (
                <span className="text-xs text-dark-500">({person.real_name})</span>
              )}
              <span className={`badge ${RISK_COLORS[person?.risk_level || 'medium']} text-[10px]`}>
                {RISK_LABELS[person?.risk_level || 'medium']}
              </span>
              <span className="text-[10px] text-dark-500 bg-dark-800 px-1.5 py-0.5 rounded">
                {STATUS_LABELS[person?.status || 'unknown']}
              </span>
            </div>
            <p className="text-xs text-dark-400 mt-0.5">
              이 사이트에서의 역할: <span className="text-dark-200">{PERSON_ROLES.find(r => r.value === relation.role)?.label || relation.role || '미지정'}</span>
              {' · '}신뢰도: <span className={CONFIDENCE_LEVELS.find(c => c.value === relation.confidence)?.color || 'text-dark-400'}>
                {CONFIDENCE_LEVELS.find(c => c.value === relation.confidence)?.label || relation.confidence}
              </span>
              {relation.evidence && (
                <> · <span className="text-dark-500">근거: {relation.evidence}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost btn-sm text-xs"
            onClick={(e) => { e.stopPropagation(); navigate(`/persons/${relation.person_id}`) }}
          >
            상세 →
          </button>
          <span className={`text-dark-500 text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-dark-700/40 px-5 py-4 space-y-4 bg-dark-900/30">
          {/* Description */}
          {person?.description && (
            <div>
              <p className="text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-1">설명</p>
              <p className="text-sm text-dark-300">{person.description}</p>
            </div>
          )}

          {/* 이 인물이 연관된 다른 사이트들 */}
          {personSites.length > 1 && (
            <div>
              <p className="text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-2">
                연관 사이트 ({personSites.length}개)
              </p>
              <div className="flex flex-wrap gap-2">
                {personSites.map(ps => (
                  <button
                    key={ps.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-dark-800/60 border border-dark-700/40 rounded-lg text-xs hover:bg-dark-800 hover:border-dark-600/50 transition-all"
                    onClick={() => navigate(`/sites/${ps.site_id}`)}
                  >
                    <span className="text-dark-300">{ps.domain || '알 수 없음'}</span>
                    <span className="text-[9px] text-dark-500">
                      ({PERSON_ROLES.find(r => r.value === ps.role)?.label || ps.role || '역할 미지정'})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* OSINT 정보 */}
          {personOsint.length > 0 ? (
            <div>
              <p className="text-[10px] font-medium text-dark-500 uppercase tracking-wider mb-2">
                수집된 정보 ({personOsint.length}건)
              </p>
              <div className="space-y-2">
                {personOsint.map(entry => {
                  const cat = OSINT_CATEGORIES.find(c => c.value === entry.category)
                  return (
                    <div key={entry.id} className="bg-dark-800/40 border border-dark-700/30 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cat?.icon || '📝'}</span>
                        <h5 className="text-xs font-medium text-dark-100">{entry.title}</h5>
                        <span className="text-[9px] text-dark-500 bg-dark-900/60 px-1.5 py-0.5 rounded">
                          {cat?.label || entry.category || '기타'}
                        </span>
                        {entry.is_key_evidence ? (
                          <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">핵심 증거</span>
                        ) : null}
                      </div>
                      {entry.content && (
                        <p className="text-xs text-dark-400 mt-1.5 whitespace-pre-wrap leading-relaxed">{entry.content}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-[9px] text-dark-600">
                        {entry.source && <span>출처: {entry.source}</span>}
                        <span>신뢰도: {CONFIDENCE_LEVELS.find(c => c.value === entry.confidence)?.label || entry.confidence}</span>
                        <span>{new Date(entry.created_at).toLocaleDateString('ko-KR')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-dark-600 italic">이 인물에 대해 수집된 정보가 아직 없습니다.</p>
          )}
        </div>
      )}
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
