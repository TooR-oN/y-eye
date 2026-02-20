import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ObsidianConfig } from '@/shared/types'

export default function SettingsPage() {
  const navigate = useNavigate()
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
  const importFileRef = useRef<HTMLInputElement>(null)

  // AI Settings
  const [aiEngine, setAiEngine] = useState('mock')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiModel, setAiModel] = useState('')

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

      // Load AI settings
      if (window.electronAPI?.settings) {
        const aiSettings = await window.electronAPI.settings.get('ai_config')
        if (aiSettings) {
          const parsed = JSON.parse(aiSettings)
          setAiEngine(parsed.engine || 'mock')
          setAiApiKey(parsed.apiKey || '')
          setAiModel(parsed.model || '')
        }
      }
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

      // Save AI settings
      if (window.electronAPI?.settings) {
        await window.electronAPI.settings.set('ai_config', JSON.stringify({
          engine: aiEngine,
          apiKey: aiApiKey,
          model: aiModel,
        }))
      }

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

      {/* Jobdori DB Connection — Link to Sync Page */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
          <span>🔄</span> Jobdori DB 연결
        </h2>
        <p className="text-xs text-dark-500">
          Jobdori의 Neon PostgreSQL 데이터베이스 연결 및 동기화는 전용 페이지에서 관리합니다.
        </p>
        <button
          onClick={() => navigate('/jobdori')}
          className="btn-secondary btn-sm"
        >
          Jobdori 동기화 페이지로 이동 →
        </button>
      </div>

      {/* AI Settings */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
          <span>🤖</span> AI 설정
        </h2>
        <p className="text-xs text-dark-500">
          AI 모델을 설정하여 OSINT 데이터 분석을 자동화합니다.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1.5">AI 엔진</label>
            <select
              className="select"
              value={aiEngine}
              onChange={e => {
                setAiEngine(e.target.value)
                setAiModel('') // reset model when engine changes
              }}
            >
              <option value="mock">Mock (내장 분석)</option>
              <option value="claude">Claude API</option>
              <option value="openai">OpenAI API</option>
              <option value="ollama">Ollama (로컬)</option>
            </select>
          </div>
          {aiEngine !== 'mock' && aiEngine !== 'ollama' && (
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">API Key</label>
              <input
                type="password"
                className="input"
                value={aiApiKey}
                onChange={e => setAiApiKey(e.target.value)}
                placeholder={aiEngine === 'claude' ? 'sk-ant-...' : 'sk-...'}
              />
            </div>
          )}
          {aiEngine !== 'mock' && (
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">모델</label>
              <select
                className="select"
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
              >
                {aiEngine === 'claude' && (
                  <>
                    <option value="">모델 선택...</option>
                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                  </>
                )}
                {aiEngine === 'openai' && (
                  <>
                    <option value="">모델 선택...</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                  </>
                )}
                {aiEngine === 'ollama' && (
                  <>
                    <option value="">모델 선택...</option>
                    <option value="llama3.1">Llama 3.1</option>
                    <option value="mistral">Mistral</option>
                    <option value="gemma2">Gemma 2</option>
                  </>
                )}
              </select>
            </div>
          )}
          {aiEngine === 'ollama' && (
            <p className="text-[10px] text-dark-500">
              💡 Ollama가 로컬에서 실행 중이어야 합니다. (기본: http://localhost:11434)
            </p>
          )}
          {aiEngine === 'mock' && (
            <p className="text-[10px] text-dark-500">
              💡 Mock 모드: 관계 분석 및 패턴 기반의 기본 인사이트를 제공합니다.
            </p>
          )}
        </div>
      </div>

      {/* Database Management */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-dark-200 flex items-center gap-2">
          <span>💾</span> 데이터 관리
        </h2>
        <div className="space-y-3">
          {/* Export */}
          <div className="flex items-center justify-between bg-dark-800/30 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm text-dark-200">데이터 내보내기 (JSON)</p>
              <p className="text-[10px] text-dark-500">모든 사이트, 인물, OSINT, 타임라인 데이터를 JSON 파일로 저장</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI.data.exportAll()
                  if (result.success) {
                    const blob = new Blob([result.json], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = result.fileName
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }
                } catch (err) {
                  console.error('Export failed:', err)
                }
              }}
              className="btn-secondary btn-sm whitespace-nowrap"
            >
              📥 내보내기
            </button>
          </div>

          {/* Import */}
          <div className="flex items-center justify-between bg-dark-800/30 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm text-dark-200">데이터 가져오기</p>
              <p className="text-[10px] text-dark-500">이전에 내보낸 JSON 파일에서 데이터를 복원 (기존 데이터에 병합)</p>
            </div>
            <div>
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const json = await file.text()
                    const result = await window.electronAPI.data.importAll(json)
                    if (result.success) {
                      alert(`가져오기 완료!\n\n사이트: ${result.counts.sites}건\n인물: ${result.counts.persons}건\nOSINT: ${result.counts.osint}건\n타임라인: ${result.counts.timeline}건`)
                    }
                  } catch (err) {
                    console.error('Import failed:', err)
                    alert('가져오기 실패: 올바른 JSON 파일인지 확인하세요.')
                  }
                  if (importFileRef.current) importFileRef.current.value = ''
                }}
              />
              <button
                onClick={() => importFileRef.current?.click()}
                className="btn-secondary btn-sm whitespace-nowrap"
              >
                📤 가져오기
              </button>
            </div>
          </div>

          {/* Reset */}
          <div className="flex items-center justify-between bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm text-red-400">전체 데이터 초기화</p>
              <p className="text-[10px] text-dark-500">모든 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다.</p>
            </div>
            <button
              onClick={async () => {
                const confirm1 = confirm('정말로 모든 데이터를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.')
                if (!confirm1) return
                const confirm2 = confirm('마지막 확인: 사이트, 인물, OSINT, 타임라인 등 모든 데이터가 삭제됩니다.\n\n계속하시겠습니까?')
                if (!confirm2) return
                try {
                  await window.electronAPI.data.resetAll()
                  alert('모든 데이터가 초기화되었습니다.')
                  window.location.reload()
                } catch (err) {
                  console.error('Reset failed:', err)
                }
              }}
              className="btn-danger btn-sm whitespace-nowrap"
            >
              ⚠️ 초기화
            </button>
          </div>
        </div>
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
