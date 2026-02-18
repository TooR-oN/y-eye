import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [appInfo, setAppInfo] = useState<{ version: string; name: string; platform: string; userData: string } | null>(null)
  const [obsidianVaultPath, setObsidianVaultPath] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      // Electron 환경에서만 appInfo 로드
      if (window.electronAPI?.app) {
        const info = await window.electronAPI.app.info()
        setAppInfo(info)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  function handleSave() {
    // Phase 5에서 실제 저장 로직 구현 예정
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="titlebar-drag pt-2">
        <div className="titlebar-no-drag">
          <h1 className="page-title">설정</h1>
          <p className="page-subtitle">Y-EYE 앱 환경설정</p>
        </div>
      </div>

      {/* App Info */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200">앱 정보</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-dark-500">앱 이름</p>
            <p className="text-sm text-dark-200 mt-0.5">{appInfo?.name || 'Y-EYE'}</p>
          </div>
          <div>
            <p className="text-xs text-dark-500">버전</p>
            <p className="text-sm text-dark-200 mt-0.5">{appInfo?.version || '0.1.0'}</p>
          </div>
          <div>
            <p className="text-xs text-dark-500">플랫폼</p>
            <p className="text-sm text-dark-200 mt-0.5">{appInfo?.platform || 'web (preview)'}</p>
          </div>
          <div>
            <p className="text-xs text-dark-500">데이터 경로</p>
            <p className="text-sm text-dark-200 mt-0.5 truncate">{appInfo?.userData || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Obsidian Vault */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200">Obsidian Vault 설정</h2>
        <p className="text-xs text-dark-500">
          Obsidian Vault 폴더 경로를 설정하면, Y-EYE가 자동으로 마크다운 노트를 생성하고 관리합니다.
        </p>
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1.5">Vault 경로</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={obsidianVaultPath}
              onChange={e => setObsidianVaultPath(e.target.value)}
              className="input flex-1"
              placeholder="/Users/username/Google Drive/OSINT-Vault"
            />
            <button className="btn-secondary btn-sm" disabled title="Phase 5에서 구현 예정">
              찾아보기
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-dark-500">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-400 rounded">
            Phase 5에서 구현 예정
          </span>
        </div>
      </div>

      {/* Jobdori DB Connection */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200">Jobdori DB 연결</h2>
        <p className="text-xs text-dark-500">
          Jobdori의 Neon PostgreSQL 데이터베이스에 읽기 전용으로 연결합니다.
        </p>
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1.5">DATABASE_URL</label>
          <input
            type="password"
            className="input"
            placeholder="postgresql://user:password@host/database"
            disabled
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-dark-500">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-400 rounded">
            Phase 2에서 구현 예정
          </span>
        </div>
      </div>

      {/* AI Settings */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200">AI 설정 (Claude)</h2>
        <p className="text-xs text-dark-500">
          Claude API를 사용하여 OSINT 데이터를 자동 분류하고, 관련성 분석을 수행합니다.
        </p>
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1.5">Claude API Key</label>
          <input
            type="password"
            className="input"
            placeholder="sk-ant-..."
            disabled
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-dark-500">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-400 rounded">
            Phase 4에서 구현 예정
          </span>
        </div>
      </div>

      {/* Database Management */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200">데이터 관리</h2>
        <div className="flex gap-3">
          <button className="btn-secondary btn-sm" disabled>
            데이터 내보내기 (JSON)
          </button>
          <button className="btn-secondary btn-sm" disabled>
            데이터 가져오기
          </button>
          <button className="btn-danger btn-sm" disabled>
            전체 데이터 초기화
          </button>
        </div>
        <p className="text-[10px] text-dark-600">Phase 6에서 구현 예정</p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button onClick={handleSave} className="btn-primary">
          {saved ? '저장됨 ✓' : '설정 저장'}
        </button>
      </div>
    </div>
  )
}
