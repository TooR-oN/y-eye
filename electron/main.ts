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
        investigation_status, parent_site_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      site.id, site.domain, site.display_name, site.site_type,
      site.status || 'active', site.priority || 'medium', site.recommendation,
      site.jobdori_site_id, site.traffic_monthly, site.traffic_rank, site.unique_visitors,
      site.investigation_status || 'pending', site.parent_site_id, site.notes
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
}
