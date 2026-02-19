import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Person, OsintEntry, PersonSiteRelation, PersonRelation, MarkdownExportResult, EvidenceFile } from '@/shared/types'
import { OSINT_CATEGORIES, PERSON_ROLES, CONFIDENCE_LEVELS } from '@/shared/types'
import { AddOsintModal } from './SiteDetailPage'
import MarkdownPreviewModal from '@/components/MarkdownPreviewModal'
import { useAutoSync } from '@/hooks/useAutoSync'
import EvidenceUploadSection from '@/components/EvidenceUploadSection'

const RISK_LABELS: Record<string, string> = { critical: '긴급', high: '높음', medium: '보통', low: '낮음' }
const STATUS_LABELS: Record<string, string> = { active: '활동 중', identified: '신원 확인', arrested: '체포됨', unknown: '미확인' }
const RELATION_LABELS: Record<string, string> = { partner: '동업', associate: '연관', same_person: '동일인물', employer: '고용주', suspected: '추정' }

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { updatePersonAndSync, deletePersonAndSync } = useAutoSync()
  const [person, setPerson] = useState<Person | null>(null)
  const [osintEntries, setOsintEntries] = useState<OsintEntry[]>([])
  const [relatedSites, setRelatedSites] = useState<PersonSiteRelation[]>([])
  const [personRelations, setPersonRelations] = useState<PersonRelation[]>([])
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'osint' | 'evidence' | 'sites' | 'relations'>('osint')
  const [showAddOsint, setShowAddOsint] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Person>>({})
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<MarkdownExportResult | null>(null)

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      const [personData, osintData, sitesData, relationsData, evidenceData] = await Promise.all([
        window.electronAPI.persons.get(id),
        window.electronAPI.osint.list({ entity_type: 'person', entity_id: id }),
        window.electronAPI.personSiteRelations.list({ person_id: id }),
        window.electronAPI.personRelations.list(id),
        window.electronAPI.evidence.list({ entity_type: 'person', entity_id: id }),
      ])
      setPerson(personData)
      setOsintEntries(osintData)
      setRelatedSites(sitesData)
      setPersonRelations(relationsData)
      setEvidenceFiles(evidenceData)
      if (personData) setEditForm(personData)
    } catch (err) {
      console.error('Failed to load person:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    if (!id) return
    try {
      const { id: _, created_at, updated_at, ...updates } = editForm as any
      await updatePersonAndSync(id, updates)
      setEditing(false)
      loadData()
    } catch (err) {
      console.error('Failed to update person:', err)
    }
  }

  async function handleDelete() {
    if (!id || !confirm('이 인물을 삭제하시겠습니까?')) return
    try {
      await deletePersonAndSync(id)
      navigate('/persons')
    } catch (err) {
      console.error('Failed to delete person:', err)
    }
  }

  async function handleExportMarkdown() {
    if (!id) return
    setExporting(true)
    try {
      const result = await window.electronAPI.obsidian.exportPerson(id)
      setExportResult(result)
    } catch (err) {
      console.error('Failed to export markdown:', err)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="p-8"><div className="animate-pulse h-8 w-64 bg-dark-800 rounded" /></div>
  if (!person) return <div className="p-8"><p className="text-dark-500">인물을 찾을 수 없습니다.</p></div>

  const tabs = [
    { key: 'osint', label: '인프라 정보', count: osintEntries.length },
    { key: 'evidence', label: '증거 파일', count: evidenceFiles.length },
    { key: 'sites', label: '관련 사이트', count: relatedSites.length },
    { key: 'relations', label: '인물 관계', count: personRelations.length },
  ] as const

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="titlebar-drag pt-2">
        <div className="titlebar-no-drag flex items-start justify-between">
          <div>
            <button onClick={() => navigate('/persons')} className="text-xs text-dark-500 hover:text-dark-300 mb-2 flex items-center gap-1">
              ← 인물 목록
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center text-xl">👤</div>
              <div>
                <h1 className="page-title flex items-center gap-3">
                  {person.alias || person.real_name || '미확인'}
                  <span className={`badge priority-${person.risk_level} text-xs`}>{RISK_LABELS[person.risk_level]}</span>
                </h1>
                <p className="page-subtitle">
                  {person.real_name && person.alias ? `실명: ${person.real_name} · ` : ''}
                  {STATUS_LABELS[person.status] || person.status}
                </p>
              </div>
            </div>
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

      {/* Edit Form */}
      {editing && (
        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">별칭</label>
              <input type="text" value={editForm.alias || ''} onChange={e => setEditForm({...editForm, alias: e.target.value})} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">실명</label>
              <input type="text" value={editForm.real_name || ''} onChange={e => setEditForm({...editForm, real_name: e.target.value})} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">위험도</label>
              <select value={editForm.risk_level || ''} onChange={e => setEditForm({...editForm, risk_level: e.target.value as any})} className="select">
                <option value="critical">긴급</option>
                <option value="high">높음</option>
                <option value="medium">보통</option>
                <option value="low">낮음</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">상태</label>
              <select value={editForm.status || ''} onChange={e => setEditForm({...editForm, status: e.target.value as any})} className="select">
                <option value="active">활동 중</option>
                <option value="identified">신원 확인</option>
                <option value="arrested">체포됨</option>
                <option value="unknown">미확인</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">설명</label>
            <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="textarea" rows={3} />
          </div>
        </div>
      )}

      {/* Description */}
      {!editing && person.description && (
        <div className="card">
          <p className="text-sm text-dark-300">{person.description}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dark-800/50">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-yeye-500 text-yeye-400' : 'border-transparent text-dark-500 hover:text-dark-300'
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
            <h3 className="text-sm font-medium text-dark-300">인프라 정보</h3>
            <button onClick={() => setShowAddOsint(true)} className="btn-primary btn-sm">＋ 정보 추가</button>
          </div>
          {osintEntries.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-sm">아직 수집된 정보가 없습니다</p>
              <button onClick={() => setShowAddOsint(true)} className="btn-primary btn-sm mt-3">＋ 첫 정보 추가</button>
            </div>
          ) : (
            <div className="space-y-3">
              {osintEntries.map(entry => {
                const cat = OSINT_CATEGORIES.find(c => c.value === entry.category)
                return (
                  <div key={entry.id} className="card">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cat?.icon || '📝'}</span>
                        <h4 className="text-sm font-medium text-dark-100">{entry.title}</h4>
                        <span className="text-[10px] text-dark-500 bg-dark-800 px-1.5 py-0.5 rounded">{cat?.label || '기타'}</span>
                      </div>
                      <button onClick={async () => { await window.electronAPI.osint.delete(entry.id); loadData() }} className="text-dark-600 hover:text-red-400 text-xs">삭제</button>
                    </div>
                    {entry.content && <p className="text-sm text-dark-300 mt-2 whitespace-pre-wrap">{entry.content}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-dark-300">증거 파일</h3>
          <EvidenceUploadSection
            entityType="person"
            entityId={id!}
            evidenceFiles={evidenceFiles}
            onUpdated={loadData}
          />
        </div>
      )}

      {activeTab === 'sites' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-dark-300">관련 사이트</h3>
          {relatedSites.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-sm">연결된 사이트가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {relatedSites.map(rel => (
                <div key={rel.id} className="card-hover flex items-center justify-between" onClick={() => navigate(`/sites/${rel.site_id}`)}>
                  <div>
                    <p className="text-sm font-medium text-dark-100">{rel.domain || '알 수 없음'}</p>
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

      {activeTab === 'relations' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-dark-300">인물 관계</h3>
          {personRelations.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-dark-500 text-sm">연결된 인물 관계가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {personRelations.map(rel => {
                const isA = rel.person_a_id === id
                const otherAlias = isA ? rel.person_b_alias : rel.person_a_alias
                const otherId = isA ? rel.person_b_id : rel.person_a_id
                return (
                  <div key={rel.id} className="card-hover flex items-center justify-between" onClick={() => navigate(`/persons/${otherId}`)}>
                    <div>
                      <p className="text-sm font-medium text-dark-100">{otherAlias || '미확인'}</p>
                      <p className="text-xs text-dark-500">{RELATION_LABELS[rel.relation_type || ''] || rel.relation_type || '관계 미지정'}</p>
                    </div>
                    <span className="text-dark-600">→</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Add OSINT Modal */}
      {showAddOsint && id && (
        <AddOsintModal entityType="person" entityId={id} onClose={() => setShowAddOsint(false)} onCreated={() => { setShowAddOsint(false); loadData() }} />
      )}

      {/* Markdown Preview Modal */}
      {exportResult && (
        <MarkdownPreviewModal result={exportResult} onClose={() => setExportResult(null)} />
      )}
    </div>
  )
}
