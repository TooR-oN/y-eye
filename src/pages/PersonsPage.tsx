import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import type { Person } from '@/shared/types'

const RISK_COLORS: Record<string, string> = {
  critical: 'priority-critical',
  high: 'priority-high',
  medium: 'priority-medium',
  low: 'priority-low',
}
const RISK_LABELS: Record<string, string> = {
  critical: '긴급', high: '높음', medium: '보통', low: '낮음',
}
const STATUS_LABELS: Record<string, string> = {
  active: '활동 중', identified: '신원 확인', arrested: '체포됨', unknown: '미확인',
}

export default function PersonsPage() {
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const navigate = useNavigate()

  const loadPersons = useCallback(async () => {
    try {
      const filters: any = {}
      if (search) filters.search = search
      if (riskFilter) filters.risk_level = riskFilter
      const data = await window.electronAPI.persons.list(filters)
      setPersons(data)
    } catch (err) {
      console.error('Failed to load persons:', err)
    } finally {
      setLoading(false)
    }
  }, [search, riskFilter])

  useEffect(() => { loadPersons() }, [loadPersons])

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="titlebar-drag pt-2 flex items-start justify-between">
        <div className="titlebar-no-drag">
          <h1 className="page-title">인물 관리</h1>
          <p className="page-subtitle">운영자 및 관련 인물 프로파일</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary titlebar-no-drag">
          ＋ 인물 추가
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input type="text" placeholder="별칭, 실명, 설명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="input flex-1 max-w-xs" />
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} className="select w-32">
          <option value="">전체 위험도</option>
          <option value="critical">긴급</option>
          <option value="high">높음</option>
          <option value="medium">보통</option>
          <option value="low">낮음</option>
        </select>
        <div className="flex-1" />
        <span className="text-sm text-dark-500 self-center">{persons.length}명</span>
      </div>

      {/* Persons Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 bg-dark-800/50 rounded-xl animate-pulse" />)}
        </div>
      ) : persons.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">👤</p>
          <p className="text-dark-300 font-medium">아직 등록된 인물이 없습니다</p>
          <p className="text-dark-500 text-sm mt-1">운영자를 파악하면 인물 프로파일을 추가하세요</p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary mt-4">
            ＋ 첫 번째 인물 추가
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {persons.map(person => (
            <div key={person.id} className="card-hover" onClick={() => navigate(`/persons/${person.id}`)}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center text-lg">
                    👤
                  </div>
                  <div>
                    <p className="text-sm font-medium text-dark-100">{person.alias || '별칭 미지정'}</p>
                    {person.real_name && <p className="text-xs text-dark-400">{person.real_name}</p>}
                  </div>
                </div>
                <span className={`badge ${RISK_COLORS[person.risk_level]}`}>
                  {RISK_LABELS[person.risk_level]}
                </span>
              </div>
              {person.description && (
                <p className="text-xs text-dark-500 mt-3 line-clamp-2">{person.description}</p>
              )}
              <div className="flex items-center justify-between mt-3 text-[10px] text-dark-500">
                <span>{STATUS_LABELS[person.status] || person.status}</span>
                <span>{new Date(person.updated_at).toLocaleDateString('ko-KR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Person Modal */}
      {showAddModal && (
        <AddPersonModal onClose={() => setShowAddModal(false)} onCreated={() => { setShowAddModal(false); loadPersons() }} />
      )}
    </div>
  )
}

function AddPersonModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [alias, setAlias] = useState('')
  const [realName, setRealName] = useState('')
  const [description, setDescription] = useState('')
  const [riskLevel, setRiskLevel] = useState('medium')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!alias.trim() && !realName.trim()) return

    setSaving(true)
    try {
      await window.electronAPI.persons.create({
        id: uuidv4(),
        alias: alias.trim() || null,
        real_name: realName.trim() || null,
        description: description.trim() || null,
        risk_level: riskLevel as any,
      } as any)
      onCreated()
    } catch (err) {
      console.error('Failed to create person:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-900 border border-dark-700/50 rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-dark-50 mb-4">인물 추가</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">별칭 (닉네임) *</label>
            <input type="text" value={alias} onChange={e => setAlias(e.target.value)} className="input" placeholder="온라인에서 사용하는 닉네임" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">실명 (파악된 경우)</label>
            <input type="text" value={realName} onChange={e => setRealName(e.target.value)} className="input" placeholder="실명" />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">위험도</label>
            <select value={riskLevel} onChange={e => setRiskLevel(e.target.value)} className="select">
              <option value="critical">긴급</option>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">설명</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="textarea" rows={3} placeholder="인물에 대한 간단한 설명..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">취소</button>
            <button type="submit" disabled={(!alias.trim() && !realName.trim()) || saving} className="btn-primary flex-1">
              {saving ? '추가 중...' : '추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
