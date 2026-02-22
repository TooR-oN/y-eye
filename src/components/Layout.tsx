import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import logoImg from '@/assets/logo.png'

const NAV_ITEMS = [
  { path: '/', label: '대시보드', icon: '📊' },
  { path: '/sites', label: '사이트', icon: '🌐' },
  { path: '/persons', label: '인물', icon: '👤' },
  { path: '/network', label: '관계도', icon: '🔗' },
  { path: '/timeline', label: '타임라인', icon: '📅' },
  { path: '/ai-insights', label: 'AI 인사이트', icon: '🤖' },
  { path: '/jobdori', label: 'Jobdori 동기화', icon: '🔄' },
]

const BOTTOM_ITEMS = [
  { path: '/settings', label: '설정', icon: '⚙️' },
]

export default function Layout() {
  const location = useLocation()
  const [dbAlert, setDbAlert] = useState<string | null>(null)

  useEffect(() => {
    // Listen for Jobdori DB auto-reconnect failure
    if (window.electronAPI?.jobdori?.onAutoConnectFailed) {
      window.electronAPI.jobdori.onAutoConnectFailed((message: string) => {
        setDbAlert(message)
      })
    }
    return () => {
      if (window.electronAPI?.jobdori?.removeAutoConnectListener) {
        window.electronAPI.jobdori.removeAutoConnectListener()
      }
    }
  }, [])

  return (
    <div className="flex h-screen bg-dark-950 text-dark-100 overflow-hidden">
      {/* Jobdori DB reconnect failure alert */}
      {dbAlert && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between shadow-lg shadow-red-900/30">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="text-sm font-medium text-white">Jobdori DB 자동 연결 실패</p>
              <p className="text-xs text-red-100/80">{dbAlert}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { window.location.hash = '/jobdori'; setDbAlert(null) }}
              className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-white transition-colors"
            >
              동기화 페이지로 이동
            </button>
            <button onClick={() => setDbAlert(null)} className="text-white/70 hover:text-white transition-colors px-2 py-1">
              ✕
            </button>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <aside className="w-60 flex flex-col border-r border-dark-800/50 bg-dark-900/50">
        {/* Title bar drag area + Logo */}
        <div className="titlebar-drag pt-8 pb-4 px-4">
          <div className="titlebar-no-drag flex items-center gap-3">
            <img src={logoImg} alt="Y-EYE" className="w-9 h-9 rounded-xl shadow-lg shadow-yeye-500/20 object-cover" />
            <div>
              <h1 className="text-sm font-bold text-dark-50 tracking-tight">Y-EYE</h1>
              <p className="text-[10px] text-dark-500">OSINT Intelligence</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            item.disabled ? (
              <div key={item.path} className="sidebar-item opacity-40 cursor-not-allowed" title="Phase 3+">
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span>{item.label}</span>
                <span className="ml-auto text-[9px] text-dark-600 bg-dark-800 px-1.5 py-0.5 rounded">Soon</span>
              </div>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="px-3 pb-4 space-y-0.5 border-t border-dark-800/50 pt-3">
          {BOTTOM_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          <div className="px-3 pt-2">
            <p className="text-[10px] text-dark-600">v0.7.0</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
