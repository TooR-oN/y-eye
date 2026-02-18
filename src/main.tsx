import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'

// Electron 환경이 아닌 경우 Mock API 주입
async function initApp() {
  if (!window.electronAPI) {
    console.log('[Y-EYE] Web preview mode — loading mock API')
    const { mockElectronAPI, seedMockData } = await import('./lib/mockElectronAPI')
    window.electronAPI = mockElectronAPI
    seedMockData()
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  )
}

initApp()
