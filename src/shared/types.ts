// Type definitions for the Electron API exposed via preload

export interface Site {
  id: string
  domain: string
  display_name: string | null
  site_type: string | null
  status: 'active' | 'closed' | 'redirected' | 'unknown'
  priority: 'critical' | 'high' | 'medium' | 'low'
  recommendation: string | null
  jobdori_site_id: string | null
  traffic_monthly: string | null
  traffic_rank: string | null
  unique_visitors: string | null
  investigation_status: 'pending' | 'in_progress' | 'completed' | 'on_hold'
  parent_site_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  synced_at: string | null
}

export interface Person {
  id: string
  alias: string | null
  real_name: string | null
  description: string | null
  risk_level: 'critical' | 'high' | 'medium' | 'low'
  status: 'active' | 'identified' | 'arrested' | 'unknown'
  profile_image_path: string | null
  created_at: string
  updated_at: string
}

export interface PersonSiteRelation {
  id: string
  person_id: string
  site_id: string
  role: string | null
  confidence: 'confirmed' | 'high' | 'medium' | 'low' | 'suspected'
  evidence: string | null
  created_at: string
  // Joined fields
  domain?: string
  display_name?: string
  site_status?: string
  alias?: string
  real_name?: string
  risk_level?: string
}

export interface PersonRelation {
  id: string
  person_a_id: string
  person_b_id: string
  relation_type: string | null
  confidence: string
  evidence: string | null
  created_at: string
  // Joined fields
  person_a_alias?: string
  person_a_name?: string
  person_b_alias?: string
  person_b_name?: string
}

export interface OsintEntry {
  id: string
  entity_type: 'site' | 'person'
  entity_id: string
  category: string | null
  subcategory: string | null
  title: string
  content: string | null
  raw_input: string | null
  source: string | null
  confidence: 'confirmed' | 'high' | 'medium' | 'low'
  is_key_evidence: number
  created_at: string
  updated_at: string
}

export interface EvidenceFile {
  id: string
  entry_id: string | null
  entity_type: string | null
  entity_id: string | null
  file_name: string
  file_path: string
  file_type: string | null
  mime_type: string | null
  file_size: number | null
  description: string | null
  ai_analysis: string | null
  captured_at: string | null
  created_at: string
}

export interface TimelineEvent {
  id: string
  entity_type: string
  entity_id: string
  event_type: string
  title: string
  description: string | null
  event_date: string
  source: string | null
  importance: 'critical' | 'high' | 'normal' | 'low'
  created_at: string
}

export interface AiInsight {
  id: string
  insight_type: string
  title: string
  description: string
  related_entities: string | null
  confidence: number | null
  status: 'new' | 'reviewed' | 'confirmed' | 'dismissed'
  ai_model: string | null
  analyzed_at: string
  reviewed_at: string | null
}

export interface Tag {
  id: string
  name: string
  color: string | null
}

export interface SiteGroup {
  id: string
  name: string
  primary_site_id: string | null
  description: string | null
  created_at: string
  primary_domain?: string
  members?: SiteGroupMember[]
}

export interface SiteGroupMember {
  group_id: string
  site_id: string
  role: string
  added_at: string
  domain?: string
  display_name?: string
  status?: string
}

export interface DomainHistory {
  id: string
  site_id: string
  domain: string
  status: string | null
  detected_at: string | null
  source: string | null
  notes: string | null
  created_at: string
}

export interface DashboardStats {
  totalSites: number
  activeSites: number
  closedSites: number
  totalPersons: number
  pendingInvestigations: number
  inProgressInvestigations: number
  totalOsintEntries: number
  recentEvents: TimelineEvent[]
}

export interface SyncLog {
  id: string
  sync_type: string | null
  status: string | null
  sites_added: number
  sites_updated: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
}

export interface SyncResult {
  success: boolean
  sitesAdded: number
  sitesUpdated: number
  notesImported: number
  domainChangesDetected: number
  errors: string[]
  duration: number
  timestamp: string
}

// OSINT Categories
export const OSINT_CATEGORIES = [
  { value: 'whois', label: 'WHOIS', icon: '🔍' },
  { value: 'ip', label: 'IP/서버', icon: '🖥️' },
  { value: 'dns', label: 'DNS', icon: '🌐' },
  { value: 'ssl', label: 'SSL 인증서', icon: '🔒' },
  { value: 'email', label: '이메일', icon: '📧' },
  { value: 'social', label: 'SNS/소셜', icon: '👤' },
  { value: 'payment', label: '결제 정보', icon: '💳' },
  { value: 'hosting', label: '호스팅', icon: '☁️' },
  { value: 'analytics', label: '애널리틱스', icon: '📊' },
  { value: 'screenshot', label: '스크린샷', icon: '📸' },
  { value: 'custom', label: '기타', icon: '📝' },
] as const

export const SITE_TYPES = [
  { value: 'aggregator', label: 'Aggregator', color: 'text-orange-400' },
  { value: 'scanlation', label: 'Scanlation', color: 'text-red-400' },
  { value: 'clone', label: 'Clone', color: 'text-yellow-400' },
  { value: 'blog', label: 'Blog', color: 'text-blue-400' },
  { value: 'other', label: '기타', color: 'text-gray-400' },
] as const

export const PERSON_ROLES = [
  { value: 'owner', label: '소유자' },
  { value: 'operator', label: '운영자' },
  { value: 'developer', label: '개발자' },
  { value: 'uploader', label: '업로더' },
  { value: 'suspected', label: '추정' },
] as const

export const CONFIDENCE_LEVELS = [
  { value: 'confirmed', label: '확인됨', color: 'text-emerald-400' },
  { value: 'high', label: '높음', color: 'text-blue-400' },
  { value: 'medium', label: '보통', color: 'text-yellow-400' },
  { value: 'low', label: '낮음', color: 'text-orange-400' },
  { value: 'suspected', label: '추정', color: 'text-gray-400' },
] as const

// Electron API type for window
export interface ElectronAPI {
  sites: {
    list: (filters?: any) => Promise<Site[]>
    get: (id: string) => Promise<Site | null>
    create: (site: Partial<Site>) => Promise<Site>
    update: (id: string, updates: Partial<Site>) => Promise<Site>
    delete: (id: string) => Promise<{ success: boolean }>
  }
  persons: {
    list: (filters?: any) => Promise<Person[]>
    get: (id: string) => Promise<Person | null>
    create: (person: Partial<Person>) => Promise<Person>
    update: (id: string, updates: Partial<Person>) => Promise<Person>
    delete: (id: string) => Promise<{ success: boolean }>
  }
  personSiteRelations: {
    list: (filters: any) => Promise<PersonSiteRelation[]>
    create: (relation: any) => Promise<{ success: boolean }>
    delete: (id: string) => Promise<{ success: boolean }>
  }
  personRelations: {
    list: (personId: string) => Promise<PersonRelation[]>
    create: (relation: any) => Promise<{ success: boolean }>
    delete: (id: string) => Promise<{ success: boolean }>
  }
  osint: {
    list: (filters: any) => Promise<OsintEntry[]>
    create: (entry: any) => Promise<OsintEntry>
    update: (id: string, updates: any) => Promise<OsintEntry>
    delete: (id: string) => Promise<{ success: boolean }>
  }
  evidence: {
    list: (filters: any) => Promise<EvidenceFile[]>
    create: (file: any) => Promise<EvidenceFile>
  }
  timeline: {
    list: (filters: any) => Promise<TimelineEvent[]>
    create: (event: any) => Promise<TimelineEvent>
  }
  tags: {
    list: () => Promise<Tag[]>
    create: (tag: any) => Promise<Tag>
    listForEntity: (entityType: string, entityId: string) => Promise<Tag[]>
    setForEntity: (entityType: string, entityId: string, tagIds: string[]) => Promise<{ success: boolean }>
  }
  siteGroups: {
    list: () => Promise<SiteGroup[]>
    get: (id: string) => Promise<SiteGroup | null>
    create: (group: any) => Promise<SiteGroup>
    addMember: (groupId: string, siteId: string, role: string) => Promise<{ success: boolean }>
    removeMember: (groupId: string, siteId: string) => Promise<{ success: boolean }>
  }
  domainHistory: {
    list: (siteId: string) => Promise<DomainHistory[]>
    create: (entry: any) => Promise<{ success: boolean }>
  }
  dashboard: {
    stats: () => Promise<DashboardStats>
  }
  obsidian: {
    open: (vaultPath: string, filePath: string) => Promise<{ success: boolean }>
  }
  app: {
    info: () => Promise<{ version: string; name: string; platform: string; userData: string }>
  }
  jobdori: {
    connect: (databaseUrl?: string) => Promise<{ success: boolean; message: string; tables?: string[] }>
    status: () => Promise<{ connected: boolean }>
    disconnect: () => Promise<{ success: boolean }>
    sync: (options?: { autoAddTopTargets?: boolean; autoAddOsintNeeded?: boolean; syncAllIllegal?: boolean }) => Promise<SyncResult>
    syncHistory: (limit?: number) => Promise<SyncLog[]>
    search: (searchTerm: string) => Promise<{ success: boolean; results: any[]; error?: string }>
    sitesByRecommendation: (recommendation?: string) => Promise<{ success: boolean; results: any[]; error?: string }>
    envPath: () => Promise<string>
  }
  aiInsights: {
    list: (filters?: { entity_type?: string; entity_id?: string; status?: string }) => Promise<AiInsight[]>
    analyze: (entityType: 'site' | 'person', entityId: string) => Promise<AiInsight[]>
    updateStatus: (id: string, status: 'confirmed' | 'dismissed' | 'reviewed') => Promise<{ success: boolean }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
