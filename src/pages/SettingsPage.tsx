import { useState, useEffect } from 'react'
import type { ObsidianConfig } from '@/shared/types'

export default function SettingsPage() {
  const [appInfo, setAppInfo] = useState<{ version: string; name: string; platform: string; userData: string } | null>(null)
  const [obsidianConfig, setObsidianConfig] = useState<ObsidianConfig>({
    vaultPath: '',
    sitesFolder: 'Sites',
    personsFolder: 'Persons',
    reportsFolder: 'Reports',
    domainChangesFolder: 'Domain Changes',
    autoExport: false,
    includeTimeline: true,
    includeDomainHistory: true,
    includeRelatedEntities: true,
  })
  const [configLoaded, setConfigLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [vaultValid, setVaultValid] = useState<boolean | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      if (window.electronAPI?.app) {
        const info = await window.electronAPI.app.info()
        setAppInfo(info)
      }
      const config = await window.electronAPI.obsidian.getConfig()
      setObsidianConfig(config)
      if (config.vaultPath) setVaultValid(true) // assume valid if set
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setConfigLoaded(true)
    }
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      await window.electronAPI.obsidian.saveConfig(obsidianConfig)
      setSaved(true)
      if (obsidianConfig.vaultPath) setVaultValid(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }

  function handleVaultPathChange(path: string) {
    setObsidianConfig(prev => ({ ...prev, vaultPath: path }))
    setVaultValid(null) // reset validation
  }

  function handleTestVault() {
    if (!obsidianConfig.vaultPath) {
      setVaultValid(false)
      return
    }
    // In web preview mode, we just validate the format
    const isValidFormat = obsidianConfig.vaultPath.startsWith('/') || obsidianConfig.vaultPath.match(/^[A-Z]:\\/)
    setVaultValid(isValidFormat || false)
  }

  // Preview folder structure
  const vaultPreview = obsidianConfig.vaultPath ? [
    { path: obsidianConfig.vaultPath, type: 'root' as const },
    { path: `${obsidianConfig.sitesFolder}/`, type: 'folder' as const },
    { path: `${obsidianConfig.personsFolder}/`, type: 'folder' as const },
    { path: `${obsidianConfig.reportsFolder}/`, type: 'folder' as const },
    { path: `${obsidianConfig.domainChangesFolder}/`, type: 'folder' as const },
  ] : []

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="titlebar-drag pt-2">
        <div className="titlebar-no-drag">
          <h1 className="page-title">⚙️ 설정</h1>
          <p className="page-subtitle">Y-EYE 앱 환경설정</p>
        </div>
      </div>

      {/* App Info */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
          <span>📱</span> 앱 정보
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-dark-500">앱 이름</p>
            <p className="text-sm text-dark-200 mt-0.5">{appInfo?.name || 'Y-EYE'}</p>
          </div>
          <div>
            <p className="text-xs text-dark-500">버전</p>
            <p className="text-sm text-dark-200 mt-0.5">{appInfo?.version || '0.3.0'}</p>
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

      {/* Obsidian Vault Configuration */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
            <span>📓</span> Obsidian Vault 설정
          </h2>
          {obsidianConfig.vaultPath && vaultValid && (
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              ✓ 설정됨
            </span>
          )}
        </div>
        <p className="text-xs text-dark-500">
          Obsidian Vault 폴더 경로를 설정하면, Y-EYE가 자동으로 마크다운 노트를 생성하고 관리합니다.
          Google Drive 폴더를 Vault로 지정하면 자동 백업이 됩니다.
        </p>

        {/* Vault Path */}
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1.5">Vault 경로</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={obsidianConfig.vaultPath}
              onChange={e => handleVaultPathChange(e.target.value)}
              className="input flex-1"
              placeholder="예: /Users/username/Google Drive/Y-EYE-Vault"
            />
            <button
              onClick={handleTestVault}
              className="btn-secondary btn-sm whitespace-nowrap"
            >
              검증
            </button>
          </div>
          {vaultValid === true && (
            <p className="text-[10px] text-emerald-400 mt-1.5">✓ 유효한 경로 형식입니다. (Electron 앱에서 실제 폴더 확인)</p>
          )}
          {vaultValid === false && (
            <p className="text-[10px] text-red-400 mt-1.5">✕ 유효하지 않은 경로입니다. 절대 경로를 입력하세요.</p>
          )}
          <p className="text-[10px] text-dark-600 mt-1">
            macOS: /Users/이름/Google Drive/Y-EYE-Vault · Windows: G:\내 드라이브\Y-EYE-Vault
          </p>
        </div>

        {/* Subfolder Names */}
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-2">하위 폴더 구조</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-dark-500 mb-1">사이트 노트 폴더</label>
              <input
                type="text"
                value={obsidianConfig.sitesFolder}
                onChange={e => setObsidianConfig(prev => ({ ...prev, sitesFolder: e.target.value }))}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] text-dark-500 mb-1">인물 노트 폴더</label>
              <input
                type="text"
                value={obsidianConfig.personsFolder}
                onChange={e => setObsidianConfig(prev => ({ ...prev, personsFolder: e.target.value }))}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] text-dark-500 mb-1">리포트 폴더</label>
              <input
                type="text"
                value={obsidianConfig.reportsFolder}
                onChange={e => setObsidianConfig(prev => ({ ...prev, reportsFolder: e.target.value }))}
                className="input text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] text-dark-500 mb-1">도메인 변경 폴더</label>
              <input
                type="text"
                value={obsidianConfig.domainChangesFolder}
                onChange={e => setObsidianConfig(prev => ({ ...prev, domainChangesFolder: e.target.value }))}
                className="input text-xs"
              />
            </div>
          </div>
        </div>

        {/* Folder Preview */}
        {obsidianConfig.vaultPath && (
          <div>
            <label className="block text-[10px] text-dark-500 mb-1.5 uppercase tracking-wider">폴더 구조 미리보기</label>
            <div className="bg-dark-900/50 border border-dark-700/30 rounded-lg p-3 font-mono text-xs text-dark-400">
              {vaultPreview.map((item, i) => (
                <div key={i} className={item.type === 'root' ? 'text-dark-300 font-medium' : 'pl-4'}>
                  {item.type === 'root' ? '📁 ' : '├── 📂 '}
                  {item.path}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Export Options */}
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-2">내보내기 옵션</label>
          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={obsidianConfig.autoExport}
                onChange={e => setObsidianConfig(prev => ({ ...prev, autoExport: e.target.checked }))}
                className="rounded border-dark-600 bg-dark-800 text-yeye-500"
              />
              <div>
                <span className="text-sm text-dark-300 group-hover:text-dark-200 transition-colors">자동 내보내기</span>
                <p className="text-[10px] text-dark-600">사이트/인물 정보 변경 시 자동으로 마크다운 업데이트</p>
              </div>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={obsidianConfig.includeTimeline}
                onChange={e => setObsidianConfig(prev => ({ ...prev, includeTimeline: e.target.checked }))}
                className="rounded border-dark-600 bg-dark-800 text-yeye-500"
              />
              <div>
                <span className="text-sm text-dark-300 group-hover:text-dark-200 transition-colors">타임라인 포함</span>
                <p className="text-[10px] text-dark-600">노트에 타임라인 이벤트 섹션 포함</p>
              </div>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={obsidianConfig.includeDomainHistory}
                onChange={e => setObsidianConfig(prev => ({ ...prev, includeDomainHistory: e.target.checked }))}
                className="rounded border-dark-600 bg-dark-800 text-yeye-500"
              />
              <div>
                <span className="text-sm text-dark-300 group-hover:text-dark-200 transition-colors">도메인 이력 포함</span>
                <p className="text-[10px] text-dark-600">사이트 노트에 도메인 변경 이력 포함</p>
              </div>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={obsidianConfig.includeRelatedEntities}
                onChange={e => setObsidianConfig(prev => ({ ...prev, includeRelatedEntities: e.target.checked }))}
                className="rounded border-dark-600 bg-dark-800 text-yeye-500"
              />
              <div>
                <span className="text-sm text-dark-300 group-hover:text-dark-200 transition-colors">관련 엔티티 링크 포함</span>
                <p className="text-[10px] text-dark-600">Obsidian 내부 링크([[]])로 관련 사이트/인물 연결</p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Jobdori DB Connection */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
          <span>🔄</span> Jobdori DB 연결
        </h2>
        <p className="text-xs text-dark-500">
          Jobdori의 Neon PostgreSQL 데이터베이스에 읽기 전용으로 연결합니다.
          Jobdori 동기화 페이지에서 직접 관리할 수 있습니다.
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
        <p className="text-[10px] text-dark-500">
          💡 Jobdori 동기화 페이지에서 DATABASE_URL을 설정하세요.
        </p>
      </div>

      {/* AI Settings */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
          <span>🤖</span> AI 설정
        </h2>
        <p className="text-xs text-dark-500">
          AI 모델을 설정하여 OSINT 데이터 분석을 자동화합니다.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">AI 엔진</label>
            <select className="select" disabled>
              <option>Mock (내장)</option>
              <option>Claude API</option>
              <option>OpenAI API</option>
              <option>Ollama (로컬)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">API Key</label>
            <input type="password" className="input" placeholder="sk-..." disabled />
          </div>
        </div>
        <p className="text-[10px] text-dark-500">
          💡 현재 Mock 분석 모드로 동작합니다. 실제 AI API 연동은 추후 개발 예정입니다.
        </p>
      </div>

      {/* Database Management */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
          <span>💾</span> 데이터 관리
        </h2>
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
      <div className="flex justify-end gap-3 pb-8">
        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="btn-primary px-6"
        >
          {saving ? '저장 중...' : saved ? '저장됨 ✓' : '설정 저장'}
        </button>
      </div>
    </div>
  )
}
