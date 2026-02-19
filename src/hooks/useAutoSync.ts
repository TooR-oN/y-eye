/**
 * useAutoSync — 자동 Vault 동기화 훅
 * 
 * CRUD 작업 후 자동으로 Obsidian Vault의 마크다운 파일을 업데이트합니다.
 * 설정에서 autoExport가 활성화되어 있을 때만 동작합니다.
 * 
 * 웹 프리뷰 모드에서는 콘솔 로그만 출력합니다.
 * Electron 앱에서는 실제 파일 시스템에 .md 파일을 생성/업데이트합니다.
 */

import { useCallback, useRef, useEffect } from 'react'
import type { ObsidianConfig } from '@/shared/types'

// Debounce: 같은 엔티티에 대한 연속 업데이트를 모아서 처리
const SYNC_DEBOUNCE_MS = 1000

interface PendingSync {
  entityType: 'site' | 'person'
  entityId: string
  timer: ReturnType<typeof setTimeout>
}

export function useAutoSync() {
  const configRef = useRef<ObsidianConfig | null>(null)
  const pendingSyncsRef = useRef<Map<string, PendingSync>>(new Map())

  // 설정 로드 (최초 1회 + 캐시)
  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const config = await window.electronAPI.obsidian.getConfig()
      configRef.current = config
    } catch (err) {
      console.error('[AutoSync] Failed to load config:', err)
    }
  }

  // 내부: 실제 동기화 실행
  const executeSync = useCallback(async (entityType: 'site' | 'person', entityId: string) => {
    const config = configRef.current
    if (!config?.autoExport || !config.vaultPath) return

    try {
      if (entityType === 'site') {
        const result = await window.electronAPI.obsidian.exportSite(entityId)
        if (result.success) {
          console.log(`[AutoSync] Site synced: ${result.fileName}`)
        }
      } else {
        const result = await window.electronAPI.obsidian.exportPerson(entityId)
        if (result.success) {
          console.log(`[AutoSync] Person synced: ${result.fileName}`)
        }
      }
    } catch (err) {
      console.error(`[AutoSync] Failed to sync ${entityType}/${entityId}:`, err)
    }
  }, [])

  // 디바운스된 동기화 요청
  const requestSync = useCallback((entityType: 'site' | 'person', entityId: string) => {
    const key = `${entityType}:${entityId}`
    const existing = pendingSyncsRef.current.get(key)

    // 기존 타이머 취소
    if (existing) {
      clearTimeout(existing.timer)
    }

    // 새 타이머 등록
    const timer = setTimeout(() => {
      pendingSyncsRef.current.delete(key)
      executeSync(entityType, entityId)
    }, SYNC_DEBOUNCE_MS)

    pendingSyncsRef.current.set(key, { entityType, entityId, timer })
  }, [executeSync])

  // ============================
  // 래퍼 함수들: 기존 API 호출 후 자동 동기화
  // ============================

  // 사이트 생성 후 동기화
  const createSiteAndSync = useCallback(async (data: any) => {
    const result = await window.electronAPI.sites.create(data)
    requestSync('site', result.id)
    return result
  }, [requestSync])

  // 사이트 수정 후 동기화
  const updateSiteAndSync = useCallback(async (id: string, updates: any) => {
    const result = await window.electronAPI.sites.update(id, updates)
    requestSync('site', id)
    return result
  }, [requestSync])

  // 사이트 삭제 (동기화 불필요 — Electron에서 파일 삭제 처리)
  const deleteSiteAndSync = useCallback(async (id: string) => {
    const result = await window.electronAPI.sites.delete(id)
    console.log(`[AutoSync] Site deleted: ${id} — Vault file removal handled by Electron`)
    return result
  }, [])

  // 인물 생성 후 동기화
  const createPersonAndSync = useCallback(async (data: any) => {
    const result = await window.electronAPI.persons.create(data)
    requestSync('person', result.id)
    return result
  }, [requestSync])

  // 인물 수정 후 동기화
  const updatePersonAndSync = useCallback(async (id: string, updates: any) => {
    const result = await window.electronAPI.persons.update(id, updates)
    requestSync('person', id)
    return result
  }, [requestSync])

  // 인물 삭제
  const deletePersonAndSync = useCallback(async (id: string) => {
    const result = await window.electronAPI.persons.delete(id)
    console.log(`[AutoSync] Person deleted: ${id} — Vault file removal handled by Electron`)
    return result
  }, [])

  // OSINT 추가 후 → 부모 엔티티 동기화
  const createOsintAndSync = useCallback(async (data: any) => {
    const result = await window.electronAPI.osint.create(data)
    if (data.entity_type && data.entity_id) {
      requestSync(data.entity_type, data.entity_id)
    }
    return result
  }, [requestSync])

  // OSINT 수정 후 → 부모 엔티티 동기화
  const updateOsintAndSync = useCallback(async (id: string, updates: any, entityType?: 'site' | 'person', entityId?: string) => {
    const result = await window.electronAPI.osint.update(id, updates)
    if (entityType && entityId) {
      requestSync(entityType, entityId)
    }
    return result
  }, [requestSync])

  // OSINT 삭제 후 → 부모 엔티티 동기화
  const deleteOsintAndSync = useCallback(async (id: string, entityType?: 'site' | 'person', entityId?: string) => {
    const result = await window.electronAPI.osint.delete(id)
    if (entityType && entityId) {
      requestSync(entityType, entityId)
    }
    return result
  }, [requestSync])

  // 증거 파일 추가 후 → 부모 엔티티 동기화
  const createEvidenceAndSync = useCallback(async (data: any) => {
    const result = await window.electronAPI.evidence.create(data)
    if (data.entity_type && data.entity_id) {
      requestSync(data.entity_type as 'site' | 'person', data.entity_id)
    }
    return result
  }, [requestSync])

  // 설정 재로드 (외부에서 호출 가능)
  const refreshConfig = useCallback(() => {
    loadConfig()
  }, [])

  return {
    // 사이트
    createSiteAndSync,
    updateSiteAndSync,
    deleteSiteAndSync,
    // 인물
    createPersonAndSync,
    updatePersonAndSync,
    deletePersonAndSync,
    // OSINT
    createOsintAndSync,
    updateOsintAndSync,
    deleteOsintAndSync,
    // 증거
    createEvidenceAndSync,
    // 유틸
    refreshConfig,
    requestSync,
  }
}
