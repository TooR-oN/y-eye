import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database | null = null

export function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  const dbDir = path.join(userDataPath, 'data')
  
  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  
  return path.join(dbDir, 'y-eye.db')
}

export function initDatabase(): void {
  const dbPath = getDbPath()
  console.log(`📁 Database path: ${dbPath}`)
  
  db = new Database(dbPath)
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  
  // Create all tables
  createTables(db)
  
  console.log('✅ Database initialized')
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

function createTables(db: Database.Database): void {
  db.exec(`
    -- ============================================
    -- 조사 대상 사이트
    -- ============================================
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      display_name TEXT,
      site_type TEXT,
      status TEXT DEFAULT 'active',
      priority TEXT DEFAULT 'medium',
      recommendation TEXT,
      jobdori_site_id TEXT,
      traffic_monthly TEXT,
      traffic_rank TEXT,
      unique_visitors TEXT,
      investigation_status TEXT DEFAULT 'pending',
      parent_site_id TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      synced_at DATETIME,
      FOREIGN KEY (parent_site_id) REFERENCES sites(id) ON DELETE SET NULL
    );

    -- ============================================
    -- 도메인 이력
    -- ============================================
    CREATE TABLE IF NOT EXISTS domain_history (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      status TEXT,
      detected_at DATETIME,
      source TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    -- ============================================
    -- 연관 도메인 그룹
    -- ============================================
    CREATE TABLE IF NOT EXISTS site_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      primary_site_id TEXT,
      description TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (primary_site_id) REFERENCES sites(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS site_group_members (
      group_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      added_at DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, site_id),
      FOREIGN KEY (group_id) REFERENCES site_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    -- ============================================
    -- 운영자/인물 프로파일
    -- ============================================
    CREATE TABLE IF NOT EXISTS persons (
      id TEXT PRIMARY KEY,
      alias TEXT,
      real_name TEXT,
      description TEXT,
      risk_level TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'active',
      profile_image_path TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    -- ============================================
    -- 인물 ↔ 사이트 관계
    -- ============================================
    CREATE TABLE IF NOT EXISTS person_site_relations (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      role TEXT,
      confidence TEXT DEFAULT 'medium',
      evidence TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE,
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    );

    -- ============================================
    -- 인물 ↔ 인물 관계
    -- ============================================
    CREATE TABLE IF NOT EXISTS person_relations (
      id TEXT PRIMARY KEY,
      person_a_id TEXT NOT NULL,
      person_b_id TEXT NOT NULL,
      relation_type TEXT,
      confidence TEXT DEFAULT 'medium',
      evidence TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (person_a_id) REFERENCES persons(id) ON DELETE CASCADE,
      FOREIGN KEY (person_b_id) REFERENCES persons(id) ON DELETE CASCADE
    );

    -- ============================================
    -- OSINT 정보 항목
    -- ============================================
    CREATE TABLE IF NOT EXISTS osint_entries (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      category TEXT,
      subcategory TEXT,
      title TEXT NOT NULL,
      content TEXT,
      raw_input TEXT,
      source TEXT,
      confidence TEXT DEFAULT 'medium',
      is_key_evidence INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    -- ============================================
    -- 증거 자료
    -- ============================================
    CREATE TABLE IF NOT EXISTS evidence_files (
      id TEXT PRIMARY KEY,
      entry_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      mime_type TEXT,
      file_size INTEGER,
      description TEXT,
      ai_analysis TEXT,
      captured_at DATETIME,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (entry_id) REFERENCES osint_entries(id) ON DELETE SET NULL
    );

    -- ============================================
    -- 타임라인 이벤트
    -- ============================================
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      event_date DATETIME NOT NULL,
      source TEXT,
      importance TEXT DEFAULT 'normal',
      created_at DATETIME DEFAULT (datetime('now'))
    );

    -- ============================================
    -- AI 분석 결과
    -- ============================================
    CREATE TABLE IF NOT EXISTS ai_insights (
      id TEXT PRIMARY KEY,
      insight_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      related_entities TEXT,
      confidence REAL,
      status TEXT DEFAULT 'new',
      ai_model TEXT,
      analyzed_at DATETIME DEFAULT (datetime('now')),
      reviewed_at DATETIME
    );

    -- ============================================
    -- 태그 시스템
    -- ============================================
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS entity_tags (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    -- ============================================
    -- Jobdori 동기화 로그
    -- ============================================
    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      sync_type TEXT,
      status TEXT,
      sites_added INTEGER DEFAULT 0,
      sites_updated INTEGER DEFAULT 0,
      error_message TEXT,
      started_at DATETIME,
      completed_at DATETIME
    );

    -- ============================================
    -- 앱 설정
    -- ============================================
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    -- ============================================
    -- 인덱스
    -- ============================================
    CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain);
    CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
    CREATE INDEX IF NOT EXISTS idx_sites_priority ON sites(priority);
    CREATE INDEX IF NOT EXISTS idx_sites_investigation ON sites(investigation_status);
    CREATE INDEX IF NOT EXISTS idx_sites_jobdori ON sites(jobdori_site_id);
    CREATE INDEX IF NOT EXISTS idx_domain_history_site ON domain_history(site_id);
    CREATE INDEX IF NOT EXISTS idx_persons_alias ON persons(alias);
    CREATE INDEX IF NOT EXISTS idx_person_site_person ON person_site_relations(person_id);
    CREATE INDEX IF NOT EXISTS idx_person_site_site ON person_site_relations(site_id);
    CREATE INDEX IF NOT EXISTS idx_osint_entity ON osint_entries(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_osint_category ON osint_entries(category);
    CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence_files(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_entity ON timeline_events(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline_events(event_date DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_insights_status ON ai_insights(status);
  `)
}
