import { useState, useEffect, useCallback, useMemo } from 'react'
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

type SortKey = 'alias' | 'real_name' | 'risk_level' | 'status' | 'description' | 'updated_at'
type SortOrder = 'asc' | 'desc'

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const PERSON_STATUS_ORDER: Record<string, number> = { active: 0, identified: 1, arrested: 2, unknown: 3 }

export default function PersonsPage() {
  const [persons, setPersons] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
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

  const sortedPersons = useMemo(() => {
    return [...persons].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'alias':
          cmp = (a.alias || '').localeCompare(b.alias || '')
          break
        case 'real_name':
          cmp = (a.real_name || '').localeCompare(b.real_name || '')
          break
        case 'risk_level':
          cmp = (RISK_ORDER[a.risk_level] ?? 9) - (RISK_ORDER[b.risk_level] ?? 9)
          break
        case 'status':
          cmp = (PERSON_STATUS_ORDER[a.status] ?? 9) - (PERSON_STATUS_ORDER[b.status] ?? 9)
          break
        case 'description':
          cmp = (a.description || '').localeCompare(b.description || '')
          break
        case 'updated_at':
          cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
          break
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [persons, sortKey, sortOrder])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortOrder('asc')
    }
  }

  function SortIcon({ columnKey }: { columnKey: SortKey }) {
    if (sortKey !== columnKey) return <span className="text-dark-600 ml-1 text-[10px]">&#8693;</span>
    return <span className="text-yeye-400 ml-1 text-[10px]">{sortOrder === 'asc' ? '\u2191' : '\u2193'}</span>
  }

  return (
    <div className="p-8 space-y-4">
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

      {/* Search bar (full width) */}
      <div>
        <input
          type="text"
          placeholder="별칭, 실명, 설명 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input w-full"
        />
      </div>

      {/* Filters (below search) */}
      <div className="flex gap-3 items-center">
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} className="select w-32">
          <option value="">전체 위험도</option>
          <option value="critical">긴급</option>
          <option value="high">높음</option>
          <option value="medium">보통</option>
          <option value="low">낮음</option>
        </select>
        {riskFilter && (
          <button onClick={() => setRiskFilter('')} className="text-xs text-dark-500 hover:text-dark-300">
            필터 초기화
          </button>
        )}
      </div>

      {/* Persons Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-dark-800/50 rounded-lg animate-pulse" />)}
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
        <div className="card p-0 overflow-hidden">
          {/* Caption */}
          <div className="px-4 py-2 border-b border-dark-700/30">
            <span className="text-xs text-dark-500">{sortedPersons.length}명</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                <th className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-dark-200 transition-colors" onClick={() => handleSort('alias')}>
                  별칭<SortIcon columnKey="alias" />
                </th>
                <th className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-dark-200 transition-colors" onClick={() => handleSort('real_name')}>
                  실명<SortIcon columnKey="real_name" />
                </th>
                <th className="table-header px-4 py-3 text-center cursor-pointer select-none hover:text-dark-200 transition-colors" onClick={() => handleSort('risk_level')}>
                  위험도<SortIcon columnKey="risk_level" />
                </th>
                <th className="table-header px-4 py-3 text-center cursor-pointer select-none hover:text-dark-200 transition-colors" onClick={() => handleSort('status')}>
                  상태<SortIcon columnKey="status" />
                </th>
                <th className="table-header px-4 py-3 text-left cursor-pointer select-none hover:text-dark-200 transition-colors" onClick={() => handleSort('description')}>
                  설명<SortIcon columnKey="description" />
                </th>
                <th className="table-header px-4 py-3 text-right cursor-pointer select-none hover:text-dark-200 transition-colors" onClick={() => handleSort('updated_at')}>
                  업데이트<SortIcon columnKey="updated_at" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPersons.map(person => (
                <tr
                  key={person.id}
                  className="table-row cursor-pointer"
                  onClick={() => navigate(`/persons/${person.id}`)}
                >
                  <td className="table-cell font-medium text-dark-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-dark-700 flex items-center justify-center text-sm flex-shrink-0">
                        👤
                      </div>
                      <span>{person.alias || '별칭 미지정'}</span>
                    </div>
                  </td>
                  <td className="table-cell text-dark-300 text-sm">
                    {person.real_name || '-'}
                  </td>
                  <td className="table-cell text-center">
                    <span className={`badge ${RISK_COLORS[person.risk_level]}`}>
                      {RISK_LABELS[person.risk_level]}
                    </span>
                  </td>
                  <td className="table-cell text-center">
                    <span className="text-xs text-dark-400">
                      {STATUS_LABELS[person.status] || person.status}
                    </span>
                  </td>
                  <td className="table-cell text-xs text-dark-400 max-w-[250px] truncate">
                    {person.description || '-'}
                  </td>
                  <td className="table-cell text-right text-xs text-dark-500">
                    {new Date(person.updated_at).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
