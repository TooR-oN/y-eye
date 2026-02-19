import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import SitesPage from './pages/SitesPage'
import SiteDetailPage from './pages/SiteDetailPage'
import PersonsPage from './pages/PersonsPage'
import PersonDetailPage from './pages/PersonDetailPage'
import SettingsPage from './pages/SettingsPage'
import JobdoriSyncPage from './pages/JobdoriSyncPage'
import NetworkPage from './pages/NetworkPage'
import TimelinePage from './pages/TimelinePage'
import AiInsightsPage from './pages/AiInsightsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sites" element={<SitesPage />} />
        <Route path="sites/:id" element={<SiteDetailPage />} />
        <Route path="persons" element={<PersonsPage />} />
        <Route path="persons/:id" element={<PersonDetailPage />} />
        <Route path="network" element={<NetworkPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="ai-insights" element={<AiInsightsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="jobdori" element={<JobdoriSyncPage />} />
      </Route>
    </Routes>
  )
}
