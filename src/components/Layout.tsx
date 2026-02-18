import { Outlet, NavLink, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/', label: '대시보드', icon: '📊' },
  { path: '/sites', label: '사이트', icon: '🌐' },
  { path: '/persons', label: '인물', icon: '👤' },
  { path: '/network', label: '관계도', icon: '🔗', disabled: true },
  { path: '/timeline', label: '타임라인', icon: '📅', disabled: true },
  { path: '/ai-insights', label: 'AI 인사이트', icon: '🤖', disabled: true },
  { path: '/jobdori', label: 'Jobdori 동기화', icon: '🔄', disabled: true },
]

const BOTTOM_ITEMS = [
  { path: '/settings', label: '설정', icon: '⚙️' },
]

export default function Layout() {
  const location = useLocation()

  return (
    <div className="flex h-screen bg-dark-950 text-dark-100 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex flex-col border-r border-dark-800/50 bg-dark-900/50">
        {/* Title bar drag area + Logo */}
        <div className="titlebar-drag pt-8 pb-4 px-4">
          <div className="titlebar-no-drag flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yeye-500 to-yeye-700 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-yeye-500/20">
              Y
            </div>
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
            <p className="text-[10px] text-dark-600">v0.1.0 — Phase 1</p>
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
