import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DashboardStats, TimelineEvent } from '@/shared/types'

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    try {
      const data = await window.electronAPI.dashboard.stats()
      setStats(data)
    } catch (err) {
      console.error('Failed to load dashboard stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-dark-800 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-dark-800 rounded-xl" />)}
          </div>
        </div>
      </div>
    )
  }

  const statCards = [
    { label: '전체 사이트', value: stats?.totalSites ?? 0, icon: '🌐', color: 'from-blue-500/20 to-blue-600/5', onClick: () => navigate('/sites') },
    { label: '운영 중', value: stats?.activeSites ?? 0, icon: '✅', color: 'from-emerald-500/20 to-emerald-600/5' },
    { label: '폐쇄', value: stats?.closedSites ?? 0, icon: '🚫', color: 'from-red-500/20 to-red-600/5' },
    { label: '인물', value: stats?.totalPersons ?? 0, icon: '👤', color: 'from-purple-500/20 to-purple-600/5', onClick: () => navigate('/persons') },
  ]

  const investigationCards = [
    { label: '조사 대기', value: stats?.pendingInvestigations ?? 0, color: 'text-yellow-400' },
    { label: '조사 진행 중', value: stats?.inProgressInvestigations ?? 0, color: 'text-blue-400' },
    { label: 'OSINT 항목', value: stats?.totalOsintEntries ?? 0, color: 'text-emerald-400' },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Page Header */}
      <div className="titlebar-drag pt-2">
        <h1 className="page-title titlebar-no-drag">대시보드</h1>
        <p className="page-subtitle titlebar-no-drag">OSINT 수사 현황 요약</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map(card => (
          <div
            key={card.label}
            className={`card bg-gradient-to-br ${card.color} border-dark-700/30 ${card.onClick ? 'cursor-pointer hover:border-dark-600/50 transition-all' : ''}`}
            onClick={card.onClick}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-dark-400 font-medium">{card.label}</p>
                <p className="text-3xl font-bold text-dark-50 mt-1">{card.value}</p>
              </div>
              <span className="text-2xl">{card.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Investigation Stats */}
      <div className="grid grid-cols-3 gap-4">
        {investigationCards.map(card => (
          <div key={card.label} className="card">
            <p className="text-xs text-dark-400 font-medium">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Timeline */}
      <div className="card">
        <h2 className="text-sm font-semibold text-dark-200 mb-4">최근 활동</h2>
        {stats?.recentEvents && stats.recentEvents.length > 0 ? (
          <div className="space-y-3">
            {stats.recentEvents.map(event => (
              <div key={event.id} className="flex items-start gap-3 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-yeye-500 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-dark-200">{event.title}</p>
                  {event.description && (
                    <p className="text-dark-500 text-xs mt-0.5 truncate">{event.description}</p>
                  )}
                </div>
                <time className="text-xs text-dark-500 flex-shrink-0">
                  {new Date(event.event_date).toLocaleDateString('ko-KR')}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-dark-500 text-sm">아직 활동이 없습니다.</p>
            <p className="text-dark-600 text-xs mt-1">사이트를 추가하고 OSINT 조사를 시작해보세요.</p>
          </div>
        )}
      </div>
    </div>
  )
}
