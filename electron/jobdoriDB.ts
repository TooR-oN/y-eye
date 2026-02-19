/**
 * Jobdori Neon PostgreSQL 읽기 전용 연결 모듈
 * 
 * Jobdori의 Neon DB에서 데이터를 가져와 Y-EYE 로컬 SQLite에 동기화합니다.
 * 읽기 전용: SELECT 쿼리만 수행하며, Jobdori DB에 쓰기는 하지 않습니다.
 */
import { Pool, PoolConfig } from 'pg'

let pool: Pool | null = null

// Jobdori DB 테이블 인터페이스
export interface JobdoriSite {
  domain: string
  type: 'illegal' | 'legal'
  site_type: string | null
  site_status: string | null
  new_url: string | null
  distribution_channel: string | null
  created_at: string
}

export interface JobdoriDomainAnalysisResult {
  id: number
  report_id: number
  rank: number
  domain: string
  threat_score: number | null
  total_visits: number | null
  unique_visitors: number | null
  global_rank: number | null
  recommendation: string | null
  site_type: string | null
  type_score: number | null
  created_at: string
}

export interface JobdoriDomainAnalysisReport {
  id: number
  analysis_month: string
  status: string
  total_domains: number
  created_at: string
  updated_at: string
}

export interface JobdoriSiteNote {
  id: number
  domain: string
  note_type: string
  content: string
  created_at: string
}

export interface JobdoriDetectionResult {
  id: number
  session_id: number
  domain: string
  url: string
  title: string
  final_status: string
  llm_judgment: string | null
  llm_reason: string | null
  source: string | null
}

/**
 * Neon DB 연결 초기화
 */
export function initJobdoriConnection(databaseUrl: string): void {
  if (pool) {
    pool.end()
  }

  const config: PoolConfig = {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 3,              // 최소한의 연결 풀
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  }

  pool = new Pool(config)
  console.log('🔗 Jobdori Neon DB 연결 풀 생성됨')
}

/**
 * 연결 종료
 */
export async function closeJobdoriConnection(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log('🔌 Jobdori Neon DB 연결 종료')
  }
}

/**
 * 연결 테스트
 */
export async function testConnection(): Promise<{ success: boolean; message: string; tables?: string[] }> {
  if (!pool) return { success: false, message: 'DATABASE_URL이 설정되지 않았습니다.' }

  try {
    const client = await pool.connect()
    try {
      const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")
      const tables = res.rows.map((r: any) => r.tablename)
      return { success: true, message: `연결 성공. ${tables.length}개 테이블 확인됨.`, tables }
    } finally {
      client.release()
    }
  } catch (err: any) {
    return { success: false, message: `연결 실패: ${err.message}` }
  }
}

/**
 * 불법 사이트 목록 가져오기
 */
export async function fetchIllegalSites(): Promise<JobdoriSite[]> {
  if (!pool) throw new Error('DB not connected')
  const res = await pool.query(
    `SELECT domain, type, site_type, site_status, new_url, distribution_channel, created_at
     FROM sites WHERE type = 'illegal' ORDER BY created_at DESC`
  )
  return res.rows
}

/**
 * 최신 도메인 분석 리포트 가져오기
 */
export async function fetchLatestAnalysisReport(): Promise<JobdoriDomainAnalysisReport | null> {
  if (!pool) throw new Error('DB not connected')
  const res = await pool.query(
    `SELECT * FROM domain_analysis_reports ORDER BY analysis_month DESC LIMIT 1`
  )
  return res.rows[0] || null
}

/**
 * 특정 리포트의 분석 결과 가져오기
 */
export async function fetchAnalysisResults(reportId: number): Promise<JobdoriDomainAnalysisResult[]> {
  if (!pool) throw new Error('DB not connected')
  const res = await pool.query(
    `SELECT * FROM domain_analysis_results WHERE report_id = ? ORDER BY rank ASC`,
    [reportId]
  )
  return res.rows
}

/**
 * 권고사항별 사이트 필터링 (최상위 타겟, OSINT 조사 필요, 모니터링 권고)
 */
export async function fetchSitesByRecommendation(recommendation?: string): Promise<JobdoriDomainAnalysisResult[]> {
  if (!pool) throw new Error('DB not connected')

  // 가장 최근 리포트에서 결과 조회
  const latestReport = await fetchLatestAnalysisReport()
  if (!latestReport) return []

  let query = `SELECT * FROM domain_analysis_results WHERE report_id = $1`
  const params: any[] = [latestReport.id]

  if (recommendation) {
    query += ` AND recommendation = $2`
    params.push(recommendation)
  }

  query += ` ORDER BY rank ASC`
  const res = await pool.query(query, params)
  return res.rows
}

/**
 * 특정 도메인의 사이트 노트 가져오기
 */
export async function fetchSiteNotes(domain: string): Promise<JobdoriSiteNote[]> {
  if (!pool) throw new Error('DB not connected')
  const res = await pool.query(
    `SELECT * FROM site_notes WHERE domain = $1 ORDER BY created_at DESC`,
    [domain]
  )
  return res.rows
}

/**
 * 모든 사이트 노트 가져오기
 */
export async function fetchAllSiteNotes(): Promise<JobdoriSiteNote[]> {
  if (!pool) throw new Error('DB not connected')
  const res = await pool.query(
    `SELECT * FROM site_notes ORDER BY created_at DESC`
  )
  return res.rows
}

/**
 * 특정 도메인의 감지 결과 가져오기
 */
export async function fetchDetectionResults(domain: string): Promise<JobdoriDetectionResult[]> {
  if (!pool) throw new Error('DB not connected')
  const res = await pool.query(
    `SELECT * FROM detection_results WHERE domain = $1 ORDER BY id DESC LIMIT 50`,
    [domain]
  )
  return res.rows
}

/**
 * 동기화용: 모든 필요한 데이터를 한 번에 가져오기
 */
export interface JobdoriSyncData {
  illegalSites: JobdoriSite[]
  analysisResults: JobdoriDomainAnalysisResult[]
  latestReport: JobdoriDomainAnalysisReport | null
  siteNotes: JobdoriSiteNote[]
}

export async function fetchSyncData(): Promise<JobdoriSyncData> {
  if (!pool) throw new Error('DB not connected')

  const [illegalSites, latestReport, siteNotes] = await Promise.all([
    fetchIllegalSites(),
    fetchLatestAnalysisReport(),
    fetchAllSiteNotes(),
  ])

  let analysisResults: JobdoriDomainAnalysisResult[] = []
  if (latestReport) {
    const res = await pool.query(
      `SELECT * FROM domain_analysis_results WHERE report_id = $1 ORDER BY rank ASC`,
      [latestReport.id]
    )
    analysisResults = res.rows
  }

  return { illegalSites, analysisResults, latestReport, siteNotes }
}

export function isConnected(): boolean {
  return pool !== null
}
