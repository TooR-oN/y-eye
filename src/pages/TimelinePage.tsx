import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TimelineEvent, Site, Person } from '@/shared/types'

const IMPORTANCE_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  critical: { dot: 'bg-red-500', bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400' },
  high: { dot: 'bg-orange-500', bg: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-400' },
  normal: { dot: 'bg-blue-500', bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
  low: { dot: 'bg-dark-500', bg: 'bg-dark-800/50 border-dark-700/30', text: 'text-dark-400' },
}

const IMPORTANCE_LABELS: Record<string, string> = {
  critical: '긴급', high: '높음', normal: '보통', low: '낮음',
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  domain_change: '🔄',
  osint_discovery: '🔍',
  investigation_start: '📋',
  investigation_complete: '✅',
  status_change: '📊',
  person_linked: '🔗',
  evidence_added: '📎',
  sync: '⚡',
  note: '📝',
}

export default function TimelinePage() {
  const navigate = useNavigate()
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filterImportance, setFilterImportance] = useState('')
  const [filterEntityType, setFilterEntityType] = useState('')
  const [filterEntityId, setFilterEntityId] = useState('')
  const [filterEventType, setFilterEventType] = useState('')

  // Entity lists for filter dropdowns
  const [sites, setSites] = useState<Site[]>([])
  const [persons, setPersons] = useState<Person[]>([])

  // Entity name cache
  const [entityNames, setEntityNames] = useState<Map<string, { name: string; type: string }>>(new Map())

  const loadData = useCallback(async () => {
    try {
      // Load all timeline events from all entities
      const [sites, persons] = await Promise.all([
        window.electronAPI.sites.list(),
        window.electronAPI.persons.list(),
      ])

      // Cache entity names + store lists for filter
      const names = new Map<string, { name: string; type: string }>()
      sites.forEach((s: Site) => names.set(s.id, { name: s.display_name || s.domain, type: 'site' }))
      persons.forEach((p: Person) => names.set(p.id, { name: p.alias || p.real_name || '미확인', type: 'person' }))
      setEntityNames(names)
      setSites(sites)
      setPersons(persons)

      // Load all events
      const allEvents: TimelineEvent[] = []
      for (const site of sites) {
        const siteEvents = await window.electronAPI.timeline.list({
          entity_type: 'site',
          entity_id: site.id,
          limit: 50,
        })
        allEvents.push(...siteEvents)
      }
      for (const person of persons) {
        const personEvents = await window.electronAPI.timeline.list({
          entity_type: 'person',
          entity_id: person.id,
          limit: 50,
        })
        allEvents.push(...personEvents)
      }

      // Deduplicate by id and sort by date (newest first)
      const uniqueEvents = Array.from(new Map(allEvents.map(e => [e.id, e])).values())
      uniqueEvents.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
      setEvents(uniqueEvents)
    } catch (err) {
      console.error('Failed to load timeline:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Filter events
  const filteredEvents = events.filter(e => {
    if (filterImportance && e.importance !== filterImportance) return false
    if (filterEntityType && e.entity_type !== filterEntityType) return false
    if (filterEntityId && e.entity_id !== filterEntityId) return false
    if (filterEventType && e.event_type !== filterEventType) return false
    return true
  })

  // Group events by date
  const groupedEvents: { date: string; events: TimelineEvent[] }[] = []
  const dateMap = new Map<string, TimelineEvent[]>()
  filteredEvents.forEach(e => {
    const date = new Date(e.event_date).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    if (!dateMap.has(date)) dateMap.set(date, [])
    dateMap.get(date)!.push(e)
  })
  dateMap.forEach((events, date) => groupedEvents.push({ date, events }))

  // Unique event types for filter
  const eventTypes = Array.from(new Set(events.map(e => e.event_type)))

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="titlebar-drag pt-2">
          <div className="titlebar-no-drag">
            <h1 className="page-title">타임라인</h1>
            <p className="page-subtitle">조사 이벤트 시간순 기록</p>
          </div>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-dark-800/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="titlebar-drag pt-2">
        <div className="titlebar-no-drag flex items-start justify-between">
          <div>
            <h1 className="page-title">타임라인</h1>
            <p className="page-subtitle">조사 이벤트 시간순 기록 · 전체 {events.length}개 이벤트</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filterImportance}
          onChange={e => setFilterImportance(e.target.value)}
          className="select w-32"
        >
          <option value="">전체 중요도</option>
          <option value="critical">긴급</option>
          <option value="high">높음</option>
          <option value="normal">보통</option>
          <option value="low">낮음</option>
        </select>

        <select
          value={filterEntityType}
          onChange={e => { setFilterEntityType(e.target.value); setFilterEntityId('') }}
          className="select w-32"
        >
          <option value="">전체 대상</option>
          <option value="site">사이트</option>
          <option value="person">인물</option>
        </select>

        {/* 특정 사이트/인물 선택 드롭다운 */}
        {filterEntityType === 'site' && (
          <select
            value={filterEntityId}
            onChange={e => setFilterEntityId(e.target.value)}
            className="select w-48"
          >
            <option value="">전체 사이트</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.display_name || s.domain}</option>
            ))}
          </select>
        )}
        {filterEntityType === 'person' && (
          <select
            value={filterEntityId}
            onChange={e => setFilterEntityId(e.target.value)}
            className="select w-48"
          >
            <option value="">전체 인물</option>
            {persons.map(p => (
              <option key={p.id} value={p.id}>{p.alias || p.real_name || '미확인'}</option>
            ))}
          </select>
        )}

        <select
          value={filterEventType}
          onChange={e => setFilterEventType(e.target.value)}
          className="select w-40"
        >
          <option value="">전체 유형</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{EVENT_TYPE_ICONS[t] || '📌'} {t}</option>
          ))}
        </select>

        {(filterImportance || filterEntityType || filterEntityId || filterEventType) && (
          <button
            onClick={() => { setFilterImportance(''); setFilterEntityType(''); setFilterEntityId(''); setFilterEventType('') }}
            className="text-xs text-dark-500 hover:text-dark-300"
          >
            필터 초기화
          </button>
        )}

        <span className="ml-auto text-xs text-dark-500">
          {filteredEvents.length}개 표시 중
        </span>
      </div>

      {/* Timeline */}
      {filteredEvents.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-sm text-dark-500">타임라인 이벤트가 없습니다</p>
          <p className="text-xs text-dark-600 mt-1">사이트 조사를 시작하면 이벤트가 자동으로 기록됩니다</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[23px] top-0 bottom-0 w-px bg-dark-700/40" />

          <div className="space-y-8">
            {groupedEvents.map(group => (
              <div key={group.date}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-[47px] flex justify-center">
                    <div className="w-3 h-3 rounded-full bg-dark-700 border-2 border-dark-600 z-10" />
                  </div>
                  <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider">{group.date}</h3>
                </div>

                {/* Events for this date */}
                <div className="space-y-3 pl-[47px]">
                  {group.events.map(event => {
                    const colors = IMPORTANCE_COLORS[event.importance] || IMPORTANCE_COLORS.normal
                    const entity = entityNames.get(event.entity_id)
                    const icon = EVENT_TYPE_ICONS[event.event_type] || '📌'

                    return (
                      <div
                        key={event.id}
                        className={`relative card border ${colors.bg} transition-all hover:scale-[1.01]`}
                      >
                        {/* Timeline dot */}
                        <div className={`absolute -left-[31px] top-4 w-2.5 h-2.5 rounded-full ${colors.dot} ring-2 ring-dark-900 z-10`} />

                        <div className="flex items-start gap-3">
                          {/* Icon */}
                          <span className="text-lg flex-shrink-0">{icon}</span>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-medium text-dark-100">{event.title}</h4>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border`}>
                                {IMPORTANCE_LABELS[event.importance] || event.importance}
                              </span>
                            </div>

                            {event.description && (
                              <p className="text-xs text-dark-400 mt-1 leading-relaxed">{event.description}</p>
                            )}

                            <div className="flex items-center gap-3 mt-2 text-[10px] text-dark-500">
                              {entity && (
                                <button
                                  onClick={() => navigate(
                                    entity.type === 'site' ? `/sites/${event.entity_id}` : `/persons/${event.entity_id}`
                                  )}
                                  className="flex items-center gap-1 hover:text-dark-300 transition-colors"
                                >
                                  {entity.type === 'site' ? '🌐' : '👤'}
                                  <span>{entity.name}</span>
                                </button>
                              )}
                              {event.source && <span>출처: {event.source}</span>}
                              <span>{new Date(event.event_date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
