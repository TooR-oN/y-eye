import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, getDatabase } from './database'
import {
  initJobdoriConnection,
  closeJobdoriConnection,
  testConnection as testJobdoriConnection,
  isConnected as isJobdoriConnected,
  fetchSitesByRecommendation,
} from './jobdoriDB'
import { runSync, searchJobdoriSites, getSyncHistory } from './syncEngine'

// Fix path for production
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Y-EYE',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Load content
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// App lifecycle
app.whenReady().then(() => {
  // Initialize database
  initDatabase()
  
  // Register IPC handlers
  registerIpcHandlers()
  
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ============================================
// IPC Handlers — Database Operations
// ============================================

function registerIpcHandlers() {
  const db = getDatabase()

  // ---- Sites ----
  ipcMain.handle('db:sites:list', (_event, filters?: { status?: string; priority?: string; search?: string }) => {
    let query = 'SELECT * FROM sites WHERE 1=1'
    const params: any[] = []

    if (filters?.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }
    if (filters?.priority) {
      query += ' AND priority = ?'
      params.push(filters.priority)
    }
    if (filters?.search) {
      query += ' AND (domain LIKE ? OR display_name LIKE ? OR notes LIKE ?)'
      const term = `%${filters.search}%`
      params.push(term, term, term)
    }
    query += ' ORDER BY updated_at DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('db:sites:get', (_event, id: string) => {
    return db.prepare('SELECT * FROM sites WHERE id = ?').get(id)
  })

  ipcMain.handle('db:sites:create', (_event, site: any) => {
    const stmt = db.prepare(`
      INSERT INTO sites (id, domain, display_name, site_type, status, priority, recommendation,
        jobdori_site_id, traffic_monthly, traffic_rank, unique_visitors,
        investigation_status, action_status, parent_site_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      site.id, site.domain, site.display_name, site.site_type,
      site.status || 'active', site.priority || 'medium', site.recommendation,
      site.jobdori_site_id, site.traffic_monthly, site.traffic_rank, site.unique_visitors,
      site.investigation_status || 'pending', site.action_status || null, site.parent_site_id, site.notes
    )
    return db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id)
  })

  ipcMain.handle('db:sites:update', (_event, id: string, updates: any) => {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    const values = Object.values(updates)
    db.prepare(`UPDATE sites SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
    return db.prepare('SELECT * FROM sites WHERE id = ?').get(id)
  })

  ipcMain.handle('db:sites:delete', (_event, id: string) => {
    db.prepare('DELETE FROM sites WHERE id = ?').run(id)
    return { success: true }
  })

  // ---- Persons ----
  ipcMain.handle('db:persons:list', (_event, filters?: { search?: string; risk_level?: string }) => {
    let query = 'SELECT * FROM persons WHERE 1=1'
    const params: any[] = []

    if (filters?.risk_level) {
      query += ' AND risk_level = ?'
      params.push(filters.risk_level)
    }
    if (filters?.search) {
      query += ' AND (alias LIKE ? OR real_name LIKE ? OR description LIKE ?)'
      const term = `%${filters.search}%`
      params.push(term, term, term)
    }
    query += ' ORDER BY updated_at DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('db:persons:get', (_event, id: string) => {
    return db.prepare('SELECT * FROM persons WHERE id = ?').get(id)
  })

  ipcMain.handle('db:persons:create', (_event, person: any) => {
    const stmt = db.prepare(`
      INSERT INTO persons (id, alias, real_name, description, risk_level, status, profile_image_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      person.id, person.alias, person.real_name, person.description,
      person.risk_level || 'medium', person.status || 'active', person.profile_image_path
    )
    return db.prepare('SELECT * FROM persons WHERE id = ?').get(person.id)
  })

  ipcMain.handle('db:persons:update', (_event, id: string, updates: any) => {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    const values = Object.values(updates)
    db.prepare(`UPDATE persons SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
    return db.prepare('SELECT * FROM persons WHERE id = ?').get(id)
  })

  ipcMain.handle('db:persons:delete', (_event, id: string) => {
    db.prepare('DELETE FROM persons WHERE id = ?').run(id)
    return { success: true }
  })

  // ---- Person-Site Relations ----
  ipcMain.handle('db:person-site:list', (_event, filters: { person_id?: string; site_id?: string }) => {
    if (filters.person_id) {
      return db.prepare(`
        SELECT psr.*, s.domain, s.display_name, s.status as site_status
        FROM person_site_relations psr
        JOIN sites s ON psr.site_id = s.id
        WHERE psr.person_id = ?
        ORDER BY psr.created_at DESC
      `).all(filters.person_id)
    }
    if (filters.site_id) {
      return db.prepare(`
        SELECT psr.*, p.alias, p.real_name, p.risk_level
        FROM person_site_relations psr
        JOIN persons p ON psr.person_id = p.id
        WHERE psr.site_id = ?
        ORDER BY psr.created_at DESC
      `).all(filters.site_id)
    }
    return []
  })

  ipcMain.handle('db:person-site:create', (_event, relation: any) => {
    db.prepare(`
      INSERT INTO person_site_relations (id, person_id, site_id, role, confidence, evidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(relation.id, relation.person_id, relation.site_id, relation.role, relation.confidence, relation.evidence)
    return { success: true }
  })

  ipcMain.handle('db:person-site:delete', (_event, id: string) => {
    db.prepare('DELETE FROM person_site_relations WHERE id = ?').run(id)
    return { success: true }
  })

  // ---- OSINT Entries ----
  ipcMain.handle('db:osint:list', (_event, filters: { entity_type: string; entity_id: string; category?: string }) => {
    let query = 'SELECT * FROM osint_entries WHERE entity_type = ? AND entity_id = ?'
    const params: any[] = [filters.entity_type, filters.entity_id]

    if (filters.category) {
      query += ' AND category = ?'
      params.push(filters.category)
    }
    query += ' ORDER BY created_at DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('db:osint:create', (_event, entry: any) => {
    db.prepare(`
      INSERT INTO osint_entries (id, entity_type, entity_id, category, subcategory, title, content, raw_input, source, confidence, is_key_evidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id, entry.entity_type, entry.entity_id, entry.category,
      entry.subcategory, entry.title, entry.content, entry.raw_input,
      entry.source, entry.confidence, entry.is_key_evidence ? 1 : 0
    )
    return db.prepare('SELECT * FROM osint_entries WHERE id = ?').get(entry.id)
  })

  ipcMain.handle('db:osint:update', (_event, id: string, updates: any) => {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    const values = Object.values(updates)
    db.prepare(`UPDATE osint_entries SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, id)
    return db.prepare('SELECT * FROM osint_entries WHERE id = ?').get(id)
  })

  ipcMain.handle('db:osint:delete', (_event, id: string) => {
    db.prepare('DELETE FROM osint_entries WHERE id = ?').run(id)
    return { success: true }
  })

  // ---- Evidence Files ----
  ipcMain.handle('db:evidence:list', (_event, filters: { entity_type?: string; entity_id?: string; entry_id?: string }) => {
    if (filters.entry_id) {
      return db.prepare('SELECT * FROM evidence_files WHERE entry_id = ? ORDER BY created_at DESC').all(filters.entry_id)
    }
    if (filters.entity_type && filters.entity_id) {
      return db.prepare('SELECT * FROM evidence_files WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC')
        .all(filters.entity_type, filters.entity_id)
    }
    return []
  })

  ipcMain.handle('db:evidence:create', (_event, file: any) => {
    db.prepare(`
      INSERT INTO evidence_files (id, entry_id, entity_type, entity_id, file_name, file_path, file_type, mime_type, file_size, description, ai_analysis, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      file.id, file.entry_id, file.entity_type, file.entity_id,
      file.file_name, file.file_path, file.file_type, file.mime_type,
      file.file_size, file.description, file.ai_analysis, file.captured_at
    )
    return db.prepare('SELECT * FROM evidence_files WHERE id = ?').get(file.id)
  })

  // ---- Timeline Events ----
  ipcMain.handle('db:timeline:list', (_event, filters: { entity_type?: string; entity_id?: string; limit?: number }) => {
    let query = 'SELECT * FROM timeline_events WHERE 1=1'
    const params: any[] = []

    if (filters.entity_type && filters.entity_id) {
      query += ' AND entity_type = ? AND entity_id = ?'
      params.push(filters.entity_type, filters.entity_id)
    }
    query += ' ORDER BY event_date DESC'
    if (filters.limit) {
      query += ' LIMIT ?'
      params.push(filters.limit)
    }
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('db:timeline:create', (_event, event: any) => {
    db.prepare(`
      INSERT INTO timeline_events (id, entity_type, entity_id, event_type, title, description, event_date, source, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.entity_type, event.entity_id, event.event_type,
      event.title, event.description, event.event_date, event.source, event.importance
    )
    return db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(event.id)
  })

  // ---- Tags ----
  ipcMain.handle('db:tags:list', () => {
    return db.prepare('SELECT * FROM tags ORDER BY name').all()
  })

  ipcMain.handle('db:tags:create', (_event, tag: any) => {
    db.prepare('INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)').run(tag.id, tag.name, tag.color)
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id)
  })

  ipcMain.handle('db:entity-tags:list', (_event, entityType: string, entityId: string) => {
    return db.prepare(`
      SELECT t.* FROM tags t
      JOIN entity_tags et ON t.id = et.tag_id
      WHERE et.entity_type = ? AND et.entity_id = ?
    `).all(entityType, entityId)
  })

  ipcMain.handle('db:entity-tags:set', (_event, entityType: string, entityId: string, tagIds: string[]) => {
    const deleteStmt = db.prepare('DELETE FROM entity_tags WHERE entity_type = ? AND entity_id = ?')
    const insertStmt = db.prepare('INSERT OR IGNORE INTO entity_tags (entity_type, entity_id, tag_id) VALUES (?, ?, ?)')
    
    const transaction = db.transaction(() => {
      deleteStmt.run(entityType, entityId)
      for (const tagId of tagIds) {
        insertStmt.run(entityType, entityId, tagId)
      }
    })
    transaction()
    return { success: true }
  })

  // ---- Site Groups ----
  ipcMain.handle('db:site-groups:list', () => {
    return db.prepare(`
      SELECT sg.*, s.domain as primary_domain
      FROM site_groups sg
      LEFT JOIN sites s ON sg.primary_site_id = s.id
      ORDER BY sg.created_at DESC
    `).all()
  })

  ipcMain.handle('db:site-groups:get', (_event, id: string) => {
    const group = db.prepare('SELECT * FROM site_groups WHERE id = ?').get(id)
    const members = db.prepare(`
      SELECT sgm.*, s.domain, s.display_name, s.status
      FROM site_group_members sgm
      JOIN sites s ON sgm.site_id = s.id
      WHERE sgm.group_id = ?
    `).all(id)
    return { ...group, members }
  })

  ipcMain.handle('db:site-groups:create', (_event, group: any) => {
    db.prepare('INSERT INTO site_groups (id, name, primary_site_id, description) VALUES (?, ?, ?, ?)')
      .run(group.id, group.name, group.primary_site_id, group.description)
    return db.prepare('SELECT * FROM site_groups WHERE id = ?').get(group.id)
  })

  ipcMain.handle('db:site-groups:add-member', (_event, groupId: string, siteId: string, role: string) => {
    db.prepare('INSERT OR REPLACE INTO site_group_members (group_id, site_id, role) VALUES (?, ?, ?)')
      .run(groupId, siteId, role)
    return { success: true }
  })

  ipcMain.handle('db:site-groups:remove-member', (_event, groupId: string, siteId: string) => {
    db.prepare('DELETE FROM site_group_members WHERE group_id = ? AND site_id = ?').run(groupId, siteId)
    return { success: true }
  })

  // ---- Person Relations ----
  ipcMain.handle('db:person-relations:list', (_event, personId: string) => {
    return db.prepare(`
      SELECT pr.*,
        pa.alias as person_a_alias, pa.real_name as person_a_name,
        pb.alias as person_b_alias, pb.real_name as person_b_name
      FROM person_relations pr
      JOIN persons pa ON pr.person_a_id = pa.id
      JOIN persons pb ON pr.person_b_id = pb.id
      WHERE pr.person_a_id = ? OR pr.person_b_id = ?
      ORDER BY pr.created_at DESC
    `).all(personId, personId)
  })

  ipcMain.handle('db:person-relations:create', (_event, relation: any) => {
    db.prepare(`
      INSERT INTO person_relations (id, person_a_id, person_b_id, relation_type, confidence, evidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(relation.id, relation.person_a_id, relation.person_b_id, relation.relation_type, relation.confidence, relation.evidence)
    return { success: true }
  })

  ipcMain.handle('db:person-relations:delete', (_event, id: string) => {
    db.prepare('DELETE FROM person_relations WHERE id = ?').run(id)
    return { success: true }
  })

  // ---- Dashboard Stats ----
  ipcMain.handle('db:dashboard:stats', () => {
    const totalSites = db.prepare('SELECT COUNT(*) as count FROM sites').get() as any
    const activeSites = db.prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'active'").get() as any
    const closedSites = db.prepare("SELECT COUNT(*) as count FROM sites WHERE status = 'closed'").get() as any
    const totalPersons = db.prepare('SELECT COUNT(*) as count FROM persons').get() as any
    const pendingInvestigations = db.prepare("SELECT COUNT(*) as count FROM sites WHERE investigation_status = 'pending'").get() as any
    const inProgressInvestigations = db.prepare("SELECT COUNT(*) as count FROM sites WHERE investigation_status = 'in_progress'").get() as any
    const totalOsintEntries = db.prepare('SELECT COUNT(*) as count FROM osint_entries').get() as any
    const recentEvents = db.prepare('SELECT * FROM timeline_events ORDER BY event_date DESC LIMIT 10').all()

    return {
      totalSites: totalSites.count,
      activeSites: activeSites.count,
      closedSites: closedSites.count,
      totalPersons: totalPersons.count,
      pendingInvestigations: pendingInvestigations.count,
      inProgressInvestigations: inProgressInvestigations.count,
      totalOsintEntries: totalOsintEntries.count,
      recentEvents
    }
  })

  // ---- Domain History ----
  ipcMain.handle('db:domain-history:list', (_event, siteId: string) => {
    return db.prepare('SELECT * FROM domain_history WHERE site_id = ? ORDER BY detected_at DESC').all(siteId)
  })

  ipcMain.handle('db:domain-history:create', (_event, entry: any) => {
    db.prepare(`
      INSERT INTO domain_history (id, site_id, domain, status, detected_at, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.site_id, entry.domain, entry.status, entry.detected_at, entry.source, entry.notes)
    return { success: true }
  })

  // ---- Obsidian Integration ----
  ipcMain.handle('obsidian:open', (_event, vaultPath: string, filePath: string) => {
    const uri = `obsidian://open?vault=${encodeURIComponent(path.basename(vaultPath))}&file=${encodeURIComponent(filePath)}`
    shell.openExternal(uri)
    return { success: true }
  })

  // ---- App Info ----
  ipcMain.handle('app:info', () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      platform: process.platform,
      userData: app.getPath('userData'),
    }
  })

  // ============================================
  // Jobdori Integration
  // ============================================

  // .env 파일에서 DATABASE_URL 읽기
  function loadEnvFile(): Record<string, string> {
    const envPath = path.join(app.getPath('userData'), '.env')
    const env: Record<string, string> = {}
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8')
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eqIdx = trimmed.indexOf('=')
          if (eqIdx > 0) {
            env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim()
          }
        }
      }
    } catch (_) {}
    return env
  }

  // Jobdori DB 연결
  ipcMain.handle('jobdori:connect', async (_event, databaseUrl?: string) => {
    try {
      let url = databaseUrl
      if (!url) {
        const env = loadEnvFile()
        url = env.DATABASE_URL
      }
      if (!url) return { success: false, message: 'DATABASE_URL이 설정되지 않았습니다.' }

      initJobdoriConnection(url)
      const result = await testJobdoriConnection()

      // 성공 시 .env에 저장
      if (result.success && databaseUrl) {
        const envPath = path.join(app.getPath('userData'), '.env')
        fs.writeFileSync(envPath, `DATABASE_URL=${databaseUrl}\n`, 'utf-8')
      }

      return result
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  // Jobdori DB 연결 상태 확인
  ipcMain.handle('jobdori:status', () => {
    return { connected: isJobdoriConnected() }
  })

  // Jobdori DB 연결 해제
  ipcMain.handle('jobdori:disconnect', async () => {
    await closeJobdoriConnection()
    return { success: true }
  })

  // 동기화 실행
  ipcMain.handle('jobdori:sync', async (_event, options?: any) => {
    try {
      const result = await runSync(options)
      return result
    } catch (err: any) {
      return { success: false, errors: [err.message] }
    }
  })

  // 동기화 이력 조회
  ipcMain.handle('jobdori:sync-history', (_event, limit?: number) => {
    return getSyncHistory(limit || 20)
  })

  // Jobdori 사이트 검색 (수동 추가용)
  ipcMain.handle('jobdori:search', async (_event, searchTerm: string) => {
    try {
      const results = await searchJobdoriSites(searchTerm)
      return { success: true, results }
    } catch (err: any) {
      return { success: false, results: [], error: err.message }
    }
  })

  // Jobdori 권고사항별 사이트 조회
  ipcMain.handle('jobdori:sites-by-recommendation', async (_event, recommendation?: string) => {
    try {
      const results = await fetchSitesByRecommendation(recommendation)
      return { success: true, results }
    } catch (err: any) {
      return { success: false, results: [], error: err.message }
    }
  })

  // .env 파일 경로 반환
  ipcMain.handle('jobdori:env-path', () => {
    return path.join(app.getPath('userData'), '.env')
  })

  // ============================================
  // Evidence Delete (Phase 6)
  // ============================================
  ipcMain.handle('db:evidence:delete', (_event, id: string) => {
    const file = db.prepare('SELECT * FROM evidence_files WHERE id = ?').get(id) as any
    if (file?.file_path) {
      try { fs.unlinkSync(file.file_path) } catch (_) { /* file may not exist */ }
    }
    db.prepare('DELETE FROM evidence_files WHERE id = ?').run(id)
    return { success: true }
  })

  // ============================================
  // OSINT Links (Phase 7)
  // ============================================
  ipcMain.handle('db:osint-links:list', (_event, filters: any) => {
    let results: any[]
    if (filters.osint_entry_id) {
      results = db.prepare(`
        SELECT ol.* FROM osint_links ol WHERE ol.osint_entry_id = ?
      `).all(filters.osint_entry_id)
    } else if (filters.source_type && filters.source_id) {
      results = db.prepare(`
        SELECT ol.* FROM osint_links ol WHERE ol.source_type = ? AND ol.source_id = ?
      `).all(filters.source_type, filters.source_id)
    } else if (filters.target_type && filters.target_id) {
      results = db.prepare(`
        SELECT ol.* FROM osint_links ol WHERE ol.target_type = ? AND ol.target_id = ?
      `).all(filters.target_type, filters.target_id)
    } else {
      results = db.prepare('SELECT * FROM osint_links').all()
    }
    // Enrich with names
    return results.map((l: any) => {
      let target_name = ''
      if (l.target_type === 'site') {
        const s = db.prepare('SELECT domain, display_name FROM sites WHERE id = ?').get(l.target_id) as any
        target_name = s?.display_name || s?.domain || '알 수 없음'
      } else {
        const p = db.prepare('SELECT alias, real_name FROM persons WHERE id = ?').get(l.target_id) as any
        target_name = p?.alias || p?.real_name || '미확인'
      }
      let source_name = ''
      if (l.source_type === 'site') {
        const s = db.prepare('SELECT domain, display_name FROM sites WHERE id = ?').get(l.source_id) as any
        source_name = s?.display_name || s?.domain || '알 수 없음'
      } else {
        const p = db.prepare('SELECT alias, real_name FROM persons WHERE id = ?').get(l.source_id) as any
        source_name = p?.alias || p?.real_name || '미확인'
      }
      const entry = db.prepare('SELECT title, category FROM osint_entries WHERE id = ?').get(l.osint_entry_id) as any
      return { ...l, target_name, source_name, osint_title: entry?.title, osint_category: entry?.category }
    })
  })

  ipcMain.handle('db:osint-links:create', (_event, link: any) => {
    db.prepare(`
      INSERT INTO osint_links (id, osint_entry_id, source_type, source_id, target_type, target_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(link.id, link.osint_entry_id, link.source_type, link.source_id, link.target_type, link.target_id)
    return db.prepare('SELECT * FROM osint_links WHERE id = ?').get(link.id)
  })

  ipcMain.handle('db:osint-links:delete', (_event, id: string) => {
    db.prepare('DELETE FROM osint_links WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('db:osint-links:list-linked-to', (_event, targetType: string, targetId: string) => {
    const links = db.prepare(`
      SELECT ol.* FROM osint_links ol WHERE ol.target_type = ? AND ol.target_id = ?
    `).all(targetType, targetId) as any[]
    return links.map((l: any) => {
      const entry = db.prepare('SELECT * FROM osint_entries WHERE id = ?').get(l.osint_entry_id)
      let source_name = ''
      if (l.source_type === 'site') {
        const s = db.prepare('SELECT domain, display_name FROM sites WHERE id = ?').get(l.source_id) as any
        source_name = s?.display_name || s?.domain || '알 수 없음'
      } else {
        const p = db.prepare('SELECT alias, real_name FROM persons WHERE id = ?').get(l.source_id) as any
        source_name = p?.alias || p?.real_name || '미확인'
      }
      return { ...l, entry, source_name }
    }).filter((l: any) => l.entry)
  })

  ipcMain.handle('db:osint-links:suggest-targets', (_event, entityType: string, entityId: string) => {
    const suggestions: any[] = []
    if (entityType === 'site') {
      const rels = db.prepare(`
        SELECT psr.*, p.alias, p.real_name FROM person_site_relations psr
        JOIN persons p ON psr.person_id = p.id
        WHERE psr.site_id = ?
      `).all(entityId) as any[]
      for (const rel of rels) {
        suggestions.push({ type: 'person', id: rel.person_id, name: rel.alias || rel.real_name || '미확인', role: rel.role || undefined })
      }
    } else {
      const rels = db.prepare(`
        SELECT psr.*, s.domain, s.display_name FROM person_site_relations psr
        JOIN sites s ON psr.site_id = s.id
        WHERE psr.person_id = ?
      `).all(entityId) as any[]
      for (const rel of rels) {
        suggestions.push({ type: 'site', id: rel.site_id, name: rel.display_name || rel.domain, role: rel.role || undefined })
      }
    }
    return suggestions
  })

  // ============================================
  // AI Insights (Phase 4)
  // ============================================
  ipcMain.handle('db:ai-insights:list', (_event, filters?: any) => {
    let query = 'SELECT * FROM ai_insights WHERE 1=1'
    const params: any[] = []
    if (filters?.entity_type && filters?.entity_id) {
      // Filter by related_entities JSON (simplified: LIKE search)
      query += ` AND related_entities LIKE ?`
      params.push(`%"id":"${filters.entity_id}"%`)
    }
    if (filters?.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }
    query += ' ORDER BY analyzed_at DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('db:ai-insights:analyze', async (_event, entityType: string, entityId: string) => {
    // Mock AI analysis — same logic as mockElectronAPI
    const entity = entityType === 'site'
      ? db.prepare('SELECT * FROM sites WHERE id = ?').get(entityId) as any
      : db.prepare('SELECT * FROM persons WHERE id = ?').get(entityId) as any
    if (!entity) return []

    const entityName = entityType === 'site'
      ? (entity.display_name || entity.domain)
      : (entity.alias || entity.real_name || '미확인')

    const osintEntries = db.prepare('SELECT * FROM osint_entries WHERE entity_type = ? AND entity_id = ?').all(entityType, entityId) as any[]
    const insights: any[] = []
    const ts = new Date().toISOString()
    const crypto = require('crypto')

    if (entityType === 'site') {
      const relations = db.prepare('SELECT * FROM person_site_relations WHERE site_id = ?').all(entityId) as any[]
      if (relations.length > 0) {
        const personIds = relations.map((r: any) => r.person_id)
        for (const pid of personIds) {
          const otherSites = db.prepare('SELECT psr.*, s.domain FROM person_site_relations psr JOIN sites s ON psr.site_id = s.id WHERE psr.person_id = ? AND psr.site_id != ?').all(pid, entityId) as any[]
          if (otherSites.length > 0) {
            const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(pid) as any
            const insight = {
              id: crypto.randomUUID(),
              insight_type: 'connection',
              title: `${entity.domain}과 ${otherSites[0].domain} 간 운영자 연결 가능성`,
              description: `${person?.alias || '미확인'} 인물이 두 사이트 모두에 연관되어 있습니다. OSINT 데이터(${osintEntries.length}건) 분석 결과, 동일 인프라를 공유할 가능성이 있습니다.`,
              related_entities: JSON.stringify([
                { type: 'site', id: entityId, name: entity.domain },
                { type: 'site', id: otherSites[0].site_id, name: otherSites[0].domain },
                { type: 'person', id: pid, name: person?.alias },
              ]),
              confidence: 0.85,
              status: 'new',
              ai_model: 'local-analysis',
              analyzed_at: ts,
              reviewed_at: null,
            }
            db.prepare(`INSERT INTO ai_insights (id, insight_type, title, description, related_entities, confidence, status, ai_model, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(insight.id, insight.insight_type, insight.title, insight.description, insight.related_entities, insight.confidence, insight.status, insight.ai_model, insight.analyzed_at)
            insights.push(insight)
            break
          }
        }
      }

      if (osintEntries.length >= 2) {
        const keyCount = osintEntries.filter((o: any) => o.is_key_evidence).length
        const insight = {
          id: crypto.randomUUID(),
          insight_type: 'pattern',
          title: `${entity.domain} OSINT 데이터 교차 분석 결과`,
          description: `${osintEntries.length}건의 수집된 정보를 분석했습니다. ${keyCount}건의 핵심 증거가 발견되었으며, 이를 통해 운영자 추적의 단서를 확보할 수 있습니다.`,
          related_entities: JSON.stringify([{ type: 'site', id: entityId, name: entity.domain }]),
          confidence: 0.72, status: 'new', ai_model: 'local-analysis', analyzed_at: ts, reviewed_at: null,
        }
        db.prepare(`INSERT INTO ai_insights (id, insight_type, title, description, related_entities, confidence, status, ai_model, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(insight.id, insight.insight_type, insight.title, insight.description, insight.related_entities, insight.confidence, insight.status, insight.ai_model, insight.analyzed_at)
        insights.push(insight)
      }
    } else {
      const relations = db.prepare('SELECT psr.*, s.domain FROM person_site_relations psr JOIN sites s ON psr.site_id = s.id WHERE psr.person_id = ?').all(entityId) as any[]
      if (relations.length > 1) {
        const siteNames = relations.map((r: any) => r.domain)
        const insight = {
          id: crypto.randomUUID(),
          insight_type: 'pattern',
          title: `${entityName} — 다중 사이트 운영 패턴`,
          description: `이 인물은 ${relations.length}개 사이트(${siteNames.join(', ')})에 연관되어 있습니다. 역할 분석 결과 조직적 운영 가능성이 있습니다.`,
          related_entities: JSON.stringify([
            { type: 'person', id: entityId, name: entityName },
            ...relations.map((r: any) => ({ type: 'site', id: r.site_id, name: r.domain })),
          ]),
          confidence: 0.78, status: 'new', ai_model: 'local-analysis', analyzed_at: ts, reviewed_at: null,
        }
        db.prepare(`INSERT INTO ai_insights (id, insight_type, title, description, related_entities, confidence, status, ai_model, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(insight.id, insight.insight_type, insight.title, insight.description, insight.related_entities, insight.confidence, insight.status, insight.ai_model, insight.analyzed_at)
        insights.push(insight)
      }

      if (osintEntries.length > 0) {
        const insight = {
          id: crypto.randomUUID(),
          insight_type: 'recommendation',
          title: `${entityName} 추가 조사 권고`,
          description: `현재 ${osintEntries.length}건의 정보가 수집되어 있습니다. SNS/소셜 미디어 및 결제 정보 추적을 통해 신원 확인 가능성을 높일 수 있습니다.`,
          related_entities: JSON.stringify([{ type: 'person', id: entityId, name: entityName }]),
          confidence: 0.65, status: 'new', ai_model: 'local-analysis', analyzed_at: ts, reviewed_at: null,
        }
        db.prepare(`INSERT INTO ai_insights (id, insight_type, title, description, related_entities, confidence, status, ai_model, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(insight.id, insight.insight_type, insight.title, insight.description, insight.related_entities, insight.confidence, insight.status, insight.ai_model, insight.analyzed_at)
        insights.push(insight)
      }
    }

    if (insights.length === 0) {
      const insight = {
        id: crypto.randomUUID(),
        insight_type: 'recommendation',
        title: `${entityName} — 추가 데이터 수집 필요`,
        description: '현재 수집된 OSINT 정보가 부족하여 의미 있는 분석을 수행하기 어렵습니다. 더 많은 정보를 수집한 후 다시 분석을 실행해주세요.',
        related_entities: JSON.stringify([{ type: entityType, id: entityId, name: entityName }]),
        confidence: 0.3, status: 'new', ai_model: 'local-analysis', analyzed_at: ts, reviewed_at: null,
      }
      db.prepare(`INSERT INTO ai_insights (id, insight_type, title, description, related_entities, confidence, status, ai_model, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(insight.id, insight.insight_type, insight.title, insight.description, insight.related_entities, insight.confidence, insight.status, insight.ai_model, insight.analyzed_at)
      insights.push(insight)
    }

    return insights
  })

  ipcMain.handle('db:ai-insights:update-status', (_event, id: string, status: string) => {
    db.prepare("UPDATE ai_insights SET status = ?, reviewed_at = datetime('now') WHERE id = ?").run(status, id)
    return { success: true }
  })

  // ============================================
  // Data Export / Import / Reset (Phase 6)
  // ============================================
  ipcMain.handle('data:export-all', () => {
    const data = {
      version: app.getVersion(),
      exportedAt: new Date().toISOString(),
      sites: db.prepare('SELECT * FROM sites').all(),
      persons: db.prepare('SELECT * FROM persons').all(),
      osintEntries: db.prepare('SELECT * FROM osint_entries').all(),
      personSiteRelations: db.prepare('SELECT * FROM person_site_relations').all(),
      personRelations: db.prepare('SELECT * FROM person_relations').all(),
      evidenceFiles: db.prepare('SELECT * FROM evidence_files').all(),
      timelineEvents: db.prepare('SELECT * FROM timeline_events').all(),
      tags: db.prepare('SELECT * FROM tags').all(),
      siteGroups: db.prepare('SELECT * FROM site_groups').all(),
      domainHistory: db.prepare('SELECT * FROM domain_history').all(),
      aiInsights: db.prepare('SELECT * FROM ai_insights').all(),
      osintLinks: db.prepare('SELECT * FROM osint_links').all(),
    }
    const json = JSON.stringify(data, null, 2)
    const fileName = `y-eye-backup-${new Date().toISOString().split('T')[0]}.json`
    return { success: true, json, fileName }
  })

  ipcMain.handle('data:import-all', (_event, json: string) => {
    try {
      const data = JSON.parse(json)
      const counts = { sites: 0, persons: 0, osint: 0, timeline: 0 }

      const transaction = db.transaction(() => {
        if (data.sites) {
          for (const s of data.sites) {
            db.prepare(`INSERT OR REPLACE INTO sites (id, domain, display_name, site_type, status, priority, recommendation, jobdori_site_id, traffic_monthly, traffic_rank, unique_visitors, investigation_status, action_status, parent_site_id, notes, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(s.id, s.domain, s.display_name, s.site_type, s.status, s.priority, s.recommendation, s.jobdori_site_id, s.traffic_monthly, s.traffic_rank, s.unique_visitors, s.investigation_status, s.action_status, s.parent_site_id, s.notes, s.created_at, s.updated_at, s.synced_at)
          }
          counts.sites = data.sites.length
        }
        if (data.persons) {
          for (const p of data.persons) {
            db.prepare(`INSERT OR REPLACE INTO persons (id, alias, real_name, description, risk_level, status, profile_image_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(p.id, p.alias, p.real_name, p.description, p.risk_level, p.status, p.profile_image_path, p.created_at, p.updated_at)
          }
          counts.persons = data.persons.length
        }
        if (data.osintEntries) {
          for (const o of data.osintEntries) {
            db.prepare(`INSERT OR REPLACE INTO osint_entries (id, entity_type, entity_id, category, subcategory, title, content, raw_input, source, confidence, is_key_evidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(o.id, o.entity_type, o.entity_id, o.category, o.subcategory, o.title, o.content, o.raw_input, o.source, o.confidence, o.is_key_evidence, o.created_at, o.updated_at)
          }
          counts.osint = data.osintEntries.length
        }
        if (data.personSiteRelations) {
          for (const r of data.personSiteRelations) {
            db.prepare(`INSERT OR REPLACE INTO person_site_relations (id, person_id, site_id, role, confidence, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(r.id, r.person_id, r.site_id, r.role, r.confidence, r.evidence, r.created_at)
          }
        }
        if (data.personRelations) {
          for (const r of data.personRelations) {
            db.prepare(`INSERT OR REPLACE INTO person_relations (id, person_a_id, person_b_id, relation_type, confidence, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(r.id, r.person_a_id, r.person_b_id, r.relation_type, r.confidence, r.evidence, r.created_at)
          }
        }
        if (data.timelineEvents) {
          for (const e of data.timelineEvents) {
            db.prepare(`INSERT OR REPLACE INTO timeline_events (id, entity_type, entity_id, event_type, title, description, event_date, source, importance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(e.id, e.entity_type, e.entity_id, e.event_type, e.title, e.description, e.event_date, e.source, e.importance, e.created_at)
          }
          counts.timeline = data.timelineEvents.length
        }
        if (data.tags) {
          for (const t of data.tags) {
            db.prepare(`INSERT OR REPLACE INTO tags (id, name, color) VALUES (?, ?, ?)`).run(t.id, t.name, t.color)
          }
        }
        if (data.domainHistory) {
          for (const d of data.domainHistory) {
            db.prepare(`INSERT OR REPLACE INTO domain_history (id, site_id, domain, status, detected_at, source, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(d.id, d.site_id, d.domain, d.status, d.detected_at, d.source, d.notes, d.created_at)
          }
        }
        if (data.aiInsights) {
          for (const i of data.aiInsights) {
            db.prepare(`INSERT OR REPLACE INTO ai_insights (id, insight_type, title, description, related_entities, confidence, status, ai_model, analyzed_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(i.id, i.insight_type, i.title, i.description, i.related_entities, i.confidence, i.status, i.ai_model, i.analyzed_at, i.reviewed_at)
          }
        }
        if (data.osintLinks) {
          for (const l of data.osintLinks) {
            db.prepare(`INSERT OR REPLACE INTO osint_links (id, osint_entry_id, source_type, source_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(l.id, l.osint_entry_id, l.source_type, l.source_id, l.target_type, l.target_id, l.created_at)
          }
        }
      })
      transaction()

      return { success: true, counts }
    } catch (err: any) {
      console.error('Import failed:', err)
      return { success: false, counts: { sites: 0, persons: 0, osint: 0, timeline: 0 } }
    }
  })

  ipcMain.handle('data:reset-all', () => {
    const tables = [
      'osint_links', 'evidence_files', 'osint_entries', 'timeline_events',
      'person_site_relations', 'person_relations', 'entity_tags',
      'site_group_members', 'site_groups', 'domain_history',
      'ai_insights', 'sync_logs', 'tags', 'persons', 'sites'
    ]
    const transaction = db.transaction(() => {
      for (const table of tables) {
        db.prepare(`DELETE FROM ${table}`).run()
      }
    })
    transaction()
    return { success: true }
  })

  // ============================================
  // Obsidian Integration — Full (Phase 5)
  // ============================================
  ipcMain.handle('obsidian:getConfig', () => {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'obsidian_config'").get() as any
    if (row) return JSON.parse(row.value)
    return {
      vaultPath: '',
      sitesFolder: 'Sites',
      personsFolder: 'Persons',
      reportsFolder: 'Reports',
      domainChangesFolder: 'Domain Changes',
      autoExport: false,
      includeTimeline: true,
      includeDomainHistory: true,
      includeRelatedEntities: true,
    }
  })

  ipcMain.handle('obsidian:saveConfig', (_event, config: any) => {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('obsidian_config', ?, datetime('now'))").run(JSON.stringify(config))
    return { success: true }
  })

  ipcMain.handle('obsidian:exportSite', (_event, siteId: string) => {
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as any
    if (!site) return { success: false, markdown: '', fileName: '', error: 'Site not found' }

    const osintEntries = db.prepare("SELECT * FROM osint_entries WHERE entity_type = 'site' AND entity_id = ?").all(siteId) as any[]
    const relations = db.prepare(`SELECT psr.*, p.alias, p.real_name FROM person_site_relations psr JOIN persons p ON psr.person_id = p.id WHERE psr.site_id = ?`).all(siteId) as any[]
    const timeline = db.prepare("SELECT * FROM timeline_events WHERE entity_type = 'site' AND entity_id = ? ORDER BY event_date DESC").all(siteId) as any[]
    const domainHist = db.prepare('SELECT * FROM domain_history WHERE site_id = ? ORDER BY detected_at DESC').all(siteId) as any[]

    const PRIORITY_KR: Record<string, string> = { critical: '긴급', high: '높음', medium: '보통', low: '낮음' }
    const STATUS_KR: Record<string, string> = { active: '운영 중', closed: '폐쇄', redirected: '리다이렉트', unknown: '미확인' }
    const INVEST_KR: Record<string, string> = { pending: '대기', in_progress: '진행중', completed: '완료', on_hold: '보류' }

    let md = `---\ntype: site\ndomain: "${site.domain}"\nstatus: "${site.status}"\npriority: "${site.priority}"\ninvestigation: "${site.investigation_status}"\ncreated: "${site.created_at}"\nupdated: "${site.updated_at}"\ntags:\n  - y-eye\n  - site\n---\n\n`
    md += `# 🌐 ${site.display_name || site.domain}\n\n`
    md += `| 항목 | 값 |\n|------|----|\n`
    md += `| 도메인 | \`${site.domain}\` |\n`
    md += `| 유형 | ${site.site_type || '미분류'} |\n`
    md += `| 상태 | ${STATUS_KR[site.status] || site.status} |\n`
    md += `| 우선순위 | ${PRIORITY_KR[site.priority] || site.priority} |\n`
    md += `| 조사 상태 | ${INVEST_KR[site.investigation_status] || site.investigation_status} |\n`
    if (site.traffic_monthly) md += `| 월간 트래픽 | ${site.traffic_monthly} |\n`
    if (site.traffic_rank) md += `| 글로벌 순위 | ${site.traffic_rank} |\n`
    if (site.recommendation) md += `| 권고사항 | ${site.recommendation} |\n`
    md += '\n'
    if (site.notes) md += `## 📝 메모\n\n${site.notes}\n\n`
    if (osintEntries.length > 0) {
      md += `## 🔍 인프라 정보 (${osintEntries.length}건)\n\n`
      for (const entry of osintEntries) {
        md += `### ${entry.title}\n\n- **카테고리**: ${entry.category || '기타'}\n- **신뢰도**: ${entry.confidence}\n`
        if (entry.source) md += `- **출처**: ${entry.source}\n`
        if (entry.is_key_evidence) md += `- **⭐ 핵심 증거**\n`
        if (entry.content) md += `\n${entry.content}\n`
        md += '\n'
      }
    }
    if (relations.length > 0) {
      md += `## 👤 연관 인물 (${relations.length}명)\n\n`
      for (const rel of relations) {
        md += `- **[[${rel.alias || rel.real_name || '미확인'}]]** — 역할: ${rel.role || '미지정'}, 신뢰도: ${rel.confidence}\n`
        if (rel.evidence) md += `  - 근거: ${rel.evidence}\n`
      }
      md += '\n'
    }
    if (timeline.length > 0) {
      md += `## 📅 타임라인 (${timeline.length}건)\n\n`
      for (const evt of timeline) {
        md += `- **${new Date(evt.event_date).toLocaleDateString('ko-KR')}** — ${evt.title}\n`
        if (evt.description) md += `  - ${evt.description}\n`
      }
      md += '\n'
    }
    if (domainHist.length > 0) {
      md += `## 🔄 도메인 변경 이력 (${domainHist.length}건)\n\n`
      for (const h of domainHist) {
        md += `- **${h.detected_at ? new Date(h.detected_at).toLocaleDateString('ko-KR') : '-'}** — \`${h.domain}\` (${h.status || '-'})\n`
        if (h.notes) md += `  - ${h.notes}\n`
      }
      md += '\n'
    }
    md += `---\n*Y-EYE에서 자동 생성 — ${new Date().toLocaleString('ko-KR')}*\n`

    const fileName = `${site.domain}.md`
    // Write to Obsidian vault if configured
    const configRow = db.prepare("SELECT value FROM app_settings WHERE key = 'obsidian_config'").get() as any
    let filePath = `Sites/${fileName}`
    if (configRow) {
      try {
        const config = JSON.parse(configRow.value)
        if (config.vaultPath) {
          const fullPath = path.join(config.vaultPath, config.sitesFolder || 'Sites', fileName)
          const dir = path.dirname(fullPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(fullPath, md, 'utf-8')
          filePath = fullPath
        }
      } catch (_) {}
    }

    return { success: true, markdown: md, fileName, filePath }
  })

  ipcMain.handle('obsidian:exportPerson', (_event, personId: string) => {
    const person = db.prepare('SELECT * FROM persons WHERE id = ?').get(personId) as any
    if (!person) return { success: false, markdown: '', fileName: '', error: 'Person not found' }

    const osintEntries = db.prepare("SELECT * FROM osint_entries WHERE entity_type = 'person' AND entity_id = ?").all(personId) as any[]
    const siteRelations = db.prepare(`SELECT psr.*, s.domain FROM person_site_relations psr JOIN sites s ON psr.site_id = s.id WHERE psr.person_id = ?`).all(personId) as any[]
    const personRelations = db.prepare(`SELECT pr.*, pa.alias as person_a_alias, pa.real_name as person_a_name, pb.alias as person_b_alias, pb.real_name as person_b_name FROM person_relations pr JOIN persons pa ON pr.person_a_id = pa.id JOIN persons pb ON pr.person_b_id = pb.id WHERE pr.person_a_id = ? OR pr.person_b_id = ?`).all(personId, personId) as any[]

    const RISK_KR: Record<string, string> = { critical: '긴급', high: '높음', medium: '보통', low: '낮음' }
    const STATUS_KR: Record<string, string> = { active: '활동 중', identified: '신원 확인', arrested: '체포됨', unknown: '미확인' }

    let md = `---\ntype: person\nalias: "${person.alias || ''}"\nreal_name: "${person.real_name || ''}"\nrisk_level: "${person.risk_level}"\nstatus: "${person.status}"\ntags:\n  - y-eye\n  - person\n---\n\n`
    md += `# 👤 ${person.alias || person.real_name || '미확인'}\n\n`
    md += `| 항목 | 값 |\n|------|----|\n`
    if (person.alias) md += `| 별칭 | ${person.alias} |\n`
    if (person.real_name) md += `| 실명 | ${person.real_name} |\n`
    md += `| 위험도 | ${RISK_KR[person.risk_level] || person.risk_level} |\n`
    md += `| 상태 | ${STATUS_KR[person.status] || person.status} |\n`
    md += '\n'
    if (person.description) md += `## 📝 설명\n\n${person.description}\n\n`
    if (osintEntries.length > 0) {
      md += `## 🔍 수집 정보 (${osintEntries.length}건)\n\n`
      for (const entry of osintEntries) {
        md += `### ${entry.title}\n\n- **카테고리**: ${entry.category || '기타'}\n- **신뢰도**: ${entry.confidence}\n`
        if (entry.source) md += `- **출처**: ${entry.source}\n`
        if (entry.is_key_evidence) md += `- **⭐ 핵심 증거**\n`
        if (entry.content) md += `\n${entry.content}\n`
        md += '\n'
      }
    }
    if (siteRelations.length > 0) {
      md += `## 🌐 관련 사이트 (${siteRelations.length}개)\n\n`
      for (const rel of siteRelations) {
        md += `- **[[${rel.domain || '알 수 없음'}]]** — 역할: ${rel.role || '미지정'}, 신뢰도: ${rel.confidence}\n`
        if (rel.evidence) md += `  - 근거: ${rel.evidence}\n`
      }
      md += '\n'
    }
    if (personRelations.length > 0) {
      md += `## 🤝 인물 관계 (${personRelations.length}건)\n\n`
      for (const rel of personRelations) {
        const isA = rel.person_a_id === personId
        const otherName = isA ? (rel.person_b_alias || rel.person_b_name || '미확인') : (rel.person_a_alias || rel.person_a_name || '미확인')
        md += `- **[[${otherName}]]** — 관계: ${rel.relation_type || '미지정'}, 신뢰도: ${rel.confidence}\n`
        if (rel.evidence) md += `  - 근거: ${rel.evidence}\n`
      }
      md += '\n'
    }
    md += `---\n*Y-EYE에서 자동 생성 — ${new Date().toLocaleString('ko-KR')}*\n`

    const name = person.alias || person.real_name || personId
    const fileName = `${name}.md`
    const configRow = db.prepare("SELECT value FROM app_settings WHERE key = 'obsidian_config'").get() as any
    let filePath = `Persons/${fileName}`
    if (configRow) {
      try {
        const config = JSON.parse(configRow.value)
        if (config.vaultPath) {
          const fullPath = path.join(config.vaultPath, config.personsFolder || 'Persons', fileName)
          const dir = path.dirname(fullPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(fullPath, md, 'utf-8')
          filePath = fullPath
        }
      } catch (_) {}
    }

    return { success: true, markdown: md, fileName, filePath }
  })

  ipcMain.handle('obsidian:exportDomainChange', (_event, siteId: string, oldDomain: string, newDomain: string) => {
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as any
    const domainHist = db.prepare('SELECT * FROM domain_history WHERE site_id = ? ORDER BY detected_at ASC').all(siteId) as any[]

    let md = `---\ntype: domain_change\nold_domain: "${oldDomain}"\nnew_domain: "${newDomain}"\ntags:\n  - y-eye\n  - domain-change\n---\n\n`
    md += `# 🔄 도메인 변경: ${oldDomain} → ${newDomain}\n\n`
    md += `| 항목 | 값 |\n|------|----|\n`
    md += `| 사이트 | [[${site?.domain || newDomain}]] |\n`
    md += `| 이전 도메인 | \`${oldDomain}\` |\n`
    md += `| 새 도메인 | \`${newDomain}\` |\n`
    md += `| 감지일 | ${new Date().toLocaleDateString('ko-KR')} |\n\n`
    if (domainHist.length > 0) {
      md += `## 📜 전체 도메인 이력\n\n`
      for (const h of domainHist) {
        md += `- **${h.detected_at ? new Date(h.detected_at).toLocaleDateString('ko-KR') : '-'}** — \`${h.domain}\` (${h.status || '-'})\n`
        if (h.notes) md += `  - ${h.notes}\n`
      }
      md += '\n'
    }
    md += `## 📝 분석 노트\n\n> 도메인 변경의 원인과 영향을 여기에 기록하세요.\n\n`
    md += `---\n*Y-EYE에서 자동 생성 — ${new Date().toLocaleString('ko-KR')}*\n`

    const fileName = `${oldDomain}→${newDomain}.md`
    return { success: true, markdown: md, fileName, filePath: `Domain Changes/${fileName}` }
  })
}
