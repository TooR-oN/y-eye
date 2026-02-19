/**
 * Mock Electron API for web preview mode
 * Electron 환경이 아닐 때 (웹 브라우저에서 Vite dev server로 실행 시)
 * 메모리 기반 데이터로 동작하는 mock API
 */
import type { ElectronAPI, Site, Person, OsintEntry, PersonSiteRelation, PersonRelation, EvidenceFile, TimelineEvent, Tag, SiteGroup, DomainHistory, DashboardStats, AiInsight } from '@/shared/types'

// In-memory data stores
const stores = {
  sites: new Map<string, Site>(),
  persons: new Map<string, Person>(),
  osintEntries: new Map<string, OsintEntry>(),
  personSiteRelations: new Map<string, PersonSiteRelation>(),
  personRelations: new Map<string, PersonRelation>(),
  evidenceFiles: new Map<string, EvidenceFile>(),
  timelineEvents: new Map<string, TimelineEvent>(),
  tags: new Map<string, Tag>(),
  entityTags: [] as { entity_type: string; entity_id: string; tag_id: string }[],
  siteGroups: new Map<string, SiteGroup>(),
  siteGroupMembers: [] as { group_id: string; site_id: string; role: string; added_at: string }[],
  domainHistory: new Map<string, DomainHistory>(),
  aiInsights: new Map<string, AiInsight>(),
}

function now() { return new Date().toISOString() }

function matchSearch(text: string | null | undefined, term: string): boolean {
  if (!text) return false
  return text.toLowerCase().includes(term.toLowerCase())
}

export const mockElectronAPI: ElectronAPI = {
  sites: {
    list: async (filters?: any) => {
      let results = Array.from(stores.sites.values())
      if (filters?.status) results = results.filter(s => s.status === filters.status)
      if (filters?.priority) results = results.filter(s => s.priority === filters.priority)
      if (filters?.search) {
        const term = filters.search
        results = results.filter(s => matchSearch(s.domain, term) || matchSearch(s.display_name, term) || matchSearch(s.notes, term))
      }
      return results.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    },
    get: async (id: string) => stores.sites.get(id) ?? null,
    create: async (site: Partial<Site>) => {
      const newSite: Site = {
        id: site.id || crypto.randomUUID(),
        domain: site.domain || '',
        display_name: site.display_name ?? null,
        site_type: site.site_type ?? null,
        status: site.status || 'active',
        priority: site.priority || 'medium',
        recommendation: site.recommendation ?? null,
        jobdori_site_id: site.jobdori_site_id ?? null,
        traffic_monthly: site.traffic_monthly ?? null,
        traffic_rank: site.traffic_rank ?? null,
        unique_visitors: site.unique_visitors ?? null,
        investigation_status: site.investigation_status || 'pending',
        parent_site_id: site.parent_site_id ?? null,
        notes: site.notes ?? null,
        created_at: now(),
        updated_at: now(),
        synced_at: null,
      }
      stores.sites.set(newSite.id, newSite)
      return newSite
    },
    update: async (id: string, updates: Partial<Site>) => {
      const site = stores.sites.get(id)
      if (!site) throw new Error('Site not found')
      const updated = { ...site, ...updates, updated_at: now() }
      stores.sites.set(id, updated)
      return updated
    },
    delete: async (id: string) => {
      stores.sites.delete(id)
      return { success: true }
    },
  },

  persons: {
    list: async (filters?: any) => {
      let results = Array.from(stores.persons.values())
      if (filters?.risk_level) results = results.filter(p => p.risk_level === filters.risk_level)
      if (filters?.search) {
        const term = filters.search
        results = results.filter(p => matchSearch(p.alias, term) || matchSearch(p.real_name, term) || matchSearch(p.description, term))
      }
      return results.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    },
    get: async (id: string) => stores.persons.get(id) ?? null,
    create: async (person: Partial<Person>) => {
      const newPerson: Person = {
        id: person.id || crypto.randomUUID(),
        alias: person.alias ?? null,
        real_name: person.real_name ?? null,
        description: person.description ?? null,
        risk_level: person.risk_level || 'medium',
        status: person.status || 'active',
        profile_image_path: person.profile_image_path ?? null,
        created_at: now(),
        updated_at: now(),
      }
      stores.persons.set(newPerson.id, newPerson)
      return newPerson
    },
    update: async (id: string, updates: Partial<Person>) => {
      const person = stores.persons.get(id)
      if (!person) throw new Error('Person not found')
      const updated = { ...person, ...updates, updated_at: now() }
      stores.persons.set(id, updated)
      return updated
    },
    delete: async (id: string) => {
      stores.persons.delete(id)
      return { success: true }
    },
  },

  personSiteRelations: {
    list: async (filters: any) => {
      const results = Array.from(stores.personSiteRelations.values())
      if (filters.person_id) {
        return results.filter(r => r.person_id === filters.person_id).map(r => {
          const site = stores.sites.get(r.site_id)
          return { ...r, domain: site?.domain, display_name: site?.display_name, site_status: site?.status }
        })
      }
      if (filters.site_id) {
        return results.filter(r => r.site_id === filters.site_id).map(r => {
          const person = stores.persons.get(r.person_id)
          return { ...r, alias: person?.alias, real_name: person?.real_name, risk_level: person?.risk_level }
        })
      }
      return []
    },
    create: async (relation: any) => {
      stores.personSiteRelations.set(relation.id, { ...relation, created_at: now() })
      return { success: true }
    },
    delete: async (id: string) => {
      stores.personSiteRelations.delete(id)
      return { success: true }
    },
  },

  personRelations: {
    list: async (personId: string) => {
      return Array.from(stores.personRelations.values()).filter(
        r => r.person_a_id === personId || r.person_b_id === personId
      ).map(r => {
        const pa = stores.persons.get(r.person_a_id)
        const pb = stores.persons.get(r.person_b_id)
        return {
          ...r,
          person_a_alias: pa?.alias,
          person_a_name: pa?.real_name,
          person_b_alias: pb?.alias,
          person_b_name: pb?.real_name,
        }
      })
    },
    create: async (relation: any) => {
      stores.personRelations.set(relation.id, { ...relation, created_at: now() })
      return { success: true }
    },
    delete: async (id: string) => {
      stores.personRelations.delete(id)
      return { success: true }
    },
  },

  osint: {
    list: async (filters: any) => {
      let results = Array.from(stores.osintEntries.values())
      if (filters.entity_type && filters.entity_id) {
        results = results.filter(e => e.entity_type === filters.entity_type && e.entity_id === filters.entity_id)
      }
      if (filters.category) results = results.filter(e => e.category === filters.category)
      return results.sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    create: async (entry: any) => {
      const newEntry: OsintEntry = {
        ...entry,
        created_at: now(),
        updated_at: now(),
      }
      stores.osintEntries.set(newEntry.id, newEntry)
      return newEntry
    },
    update: async (id: string, updates: any) => {
      const entry = stores.osintEntries.get(id)
      if (!entry) throw new Error('OSINT entry not found')
      const updated = { ...entry, ...updates, updated_at: now() }
      stores.osintEntries.set(id, updated)
      return updated
    },
    delete: async (id: string) => {
      stores.osintEntries.delete(id)
      return { success: true }
    },
  },

  evidence: {
    list: async (filters: any) => {
      const results = Array.from(stores.evidenceFiles.values())
      if (filters.entry_id) return results.filter(e => e.entry_id === filters.entry_id)
      if (filters.entity_type && filters.entity_id) {
        return results.filter(e => e.entity_type === filters.entity_type && e.entity_id === filters.entity_id)
      }
      return []
    },
    create: async (file: any) => {
      const newFile: EvidenceFile = { ...file, created_at: now() }
      stores.evidenceFiles.set(newFile.id, newFile)
      return newFile
    },
  },

  timeline: {
    list: async (filters: any) => {
      let results = Array.from(stores.timelineEvents.values())
      if (filters.entity_type && filters.entity_id) {
        results = results.filter(e => e.entity_type === filters.entity_type && e.entity_id === filters.entity_id)
      }
      results.sort((a, b) => b.event_date.localeCompare(a.event_date))
      if (filters.limit) results = results.slice(0, filters.limit)
      return results
    },
    create: async (event: any) => {
      const newEvent: TimelineEvent = { ...event, created_at: now() }
      stores.timelineEvents.set(newEvent.id, newEvent)
      return newEvent
    },
  },

  tags: {
    list: async () => Array.from(stores.tags.values()).sort((a, b) => a.name.localeCompare(b.name)),
    create: async (tag: any) => {
      stores.tags.set(tag.id, tag)
      return tag
    },
    listForEntity: async (entityType: string, entityId: string) => {
      const tagIds = stores.entityTags.filter(et => et.entity_type === entityType && et.entity_id === entityId).map(et => et.tag_id)
      return tagIds.map(id => stores.tags.get(id)).filter(Boolean) as Tag[]
    },
    setForEntity: async (entityType: string, entityId: string, tagIds: string[]) => {
      stores.entityTags = stores.entityTags.filter(et => !(et.entity_type === entityType && et.entity_id === entityId))
      tagIds.forEach(tagId => stores.entityTags.push({ entity_type: entityType, entity_id: entityId, tag_id: tagId }))
      return { success: true }
    },
  },

  siteGroups: {
    list: async () => {
      return Array.from(stores.siteGroups.values()).map(sg => {
        const primarySite = sg.primary_site_id ? stores.sites.get(sg.primary_site_id) : null
        return { ...sg, primary_domain: primarySite?.domain }
      })
    },
    get: async (id: string) => {
      const group = stores.siteGroups.get(id)
      if (!group) return null
      const members = stores.siteGroupMembers.filter(m => m.group_id === id).map(m => {
        const site = stores.sites.get(m.site_id)
        return { ...m, domain: site?.domain, display_name: site?.display_name, status: site?.status }
      })
      return { ...group, members }
    },
    create: async (group: any) => {
      const newGroup = { ...group, created_at: now() }
      stores.siteGroups.set(newGroup.id, newGroup)
      return newGroup
    },
    addMember: async (groupId: string, siteId: string, role: string) => {
      stores.siteGroupMembers.push({ group_id: groupId, site_id: siteId, role, added_at: now() })
      return { success: true }
    },
    removeMember: async (groupId: string, siteId: string) => {
      stores.siteGroupMembers = stores.siteGroupMembers.filter(m => !(m.group_id === groupId && m.site_id === siteId))
      return { success: true }
    },
  },

  domainHistory: {
    list: async (siteId: string) => {
      return Array.from(stores.domainHistory.values())
        .filter(h => h.site_id === siteId)
        .sort((a, b) => (b.detected_at || b.created_at).localeCompare(a.detected_at || a.created_at))
    },
    create: async (entry: any) => {
      stores.domainHistory.set(entry.id, { ...entry, created_at: now() })
      return { success: true }
    },
  },

  dashboard: {
    stats: async () => {
      const sites = Array.from(stores.sites.values())
      const persons = Array.from(stores.persons.values())
      const osint = Array.from(stores.osintEntries.values())
      const events = Array.from(stores.timelineEvents.values())
        .sort((a, b) => b.event_date.localeCompare(a.event_date))
        .slice(0, 10)

      return {
        totalSites: sites.length,
        activeSites: sites.filter(s => s.status === 'active').length,
        closedSites: sites.filter(s => s.status === 'closed').length,
        totalPersons: persons.length,
        pendingInvestigations: sites.filter(s => s.investigation_status === 'pending').length,
        inProgressInvestigations: sites.filter(s => s.investigation_status === 'in_progress').length,
        totalOsintEntries: osint.length,
        recentEvents: events,
      }
    },
  },

  obsidian: {
    open: async (vaultPath: string, filePath: string) => {
      console.log(`[Mock] Obsidian open: vault=${vaultPath}, file=${filePath}`)
      alert(`Obsidian 열기 (웹 프리뷰 모드)\nVault: ${vaultPath}\nFile: ${filePath}`)
      return { success: true }
    },
  },

  app: {
    info: async () => ({
      version: '0.1.0',
      name: 'Y-EYE',
      platform: 'web-preview',
      userData: '/web-preview-mode',
    }),
  },

  jobdori: {
    connect: async (databaseUrl?: string) => {
      console.log('[Mock] Jobdori connect:', databaseUrl ? 'URL provided' : 'no URL')
      return {
        success: true,
        message: '(웹 프리뷰) Mock 연결 성공. 실제 Electron 앱에서 Neon DB에 연결됩니다.',
        tables: ['sites', 'sessions', 'monthly_stats', 'titles', 'pending_reviews', 'domain_analysis_reports', 'domain_analysis_results', 'site_notes'],
      }
    },
    status: async () => ({ connected: true }),
    disconnect: async () => ({ success: true }),
    sync: async (options?: any) => {
      // Mock 동기화: 약간의 지연 후 샘플 결과 반환
      await new Promise(r => setTimeout(r, 1500))

      // Mock 데이터로 사이트 추가 시뮬레이션
      const mockNewSites = [
        { domain: 'newtoon.net', recommendation: '최상위 타겟', site_type: 'aggregator' },
        { domain: 'webtoon-free.co', recommendation: 'OSINT 조사 필요', site_type: 'scanlation' },
      ]

      for (const ms of mockNewSites) {
        const existing = Array.from(stores.sites.values()).find(s => s.domain === ms.domain)
        if (!existing) {
          const id = crypto.randomUUID()
          stores.sites.set(id, {
            id,
            domain: ms.domain,
            display_name: ms.domain,
            site_type: ms.site_type,
            status: 'active',
            priority: ms.recommendation.includes('최상위') ? 'critical' : 'high',
            recommendation: ms.recommendation,
            jobdori_site_id: `mock-${id}`,
            traffic_monthly: null,
            traffic_rank: null,
            unique_visitors: null,
            investigation_status: 'pending',
            parent_site_id: null,
            notes: `Jobdori 동기화 (Mock): ${ms.recommendation}`,
            created_at: now(),
            updated_at: now(),
            synced_at: now(),
          })
        }
      }

      return {
        success: true,
        sitesAdded: 2,
        sitesUpdated: 1,
        notesImported: 0,
        domainChangesDetected: 0,
        errors: [],
        duration: 1500,
        timestamp: now(),
      }
    },
    syncHistory: async (limit?: number) => {
      return [
        { id: 'sync-001', sync_type: 'full', status: 'success', sites_added: 2, sites_updated: 3, error_message: null, started_at: now(), completed_at: now() },
        { id: 'sync-002', sync_type: 'full', status: 'success', sites_added: 0, sites_updated: 1, error_message: null, started_at: '2026-02-17T10:00:00Z', completed_at: '2026-02-17T10:00:02Z' },
      ]
    },
    search: async (searchTerm: string) => {
      const mockResults = [
        { domain: 'newtoon.net', threat_score: 85, total_visits: 1200000, recommendation: '최상위 타겟', site_type: 'Aggregator' },
        { domain: 'webtoon-free.co', threat_score: 72, total_visits: 450000, recommendation: 'OSINT 조사 필요', site_type: 'Scanlation' },
        { domain: 'manga-pirate.org', threat_score: 60, total_visits: 890000, recommendation: '모니터링 권고', site_type: 'Clone' },
      ]
      return {
        success: true,
        results: mockResults.filter(r => r.domain.includes(searchTerm.toLowerCase())),
      }
    },
    sitesByRecommendation: async (recommendation?: string) => {
      const mockResults = [
        { domain: 'toonkor.com', threat_score: 95, total_visits: 15200000, recommendation: '최상위 타겟', site_type: 'Aggregator' },
        { domain: 'manhwa-es.com', threat_score: 88, total_visits: 2340000, recommendation: '최상위 타겟', site_type: 'Scanlation' },
        { domain: 'newtoon.net', threat_score: 85, total_visits: 1200000, recommendation: '최상위 타겟', site_type: 'Aggregator' },
        { domain: 'webtoon-free.co', threat_score: 72, total_visits: 450000, recommendation: 'OSINT 조사 필요', site_type: 'Scanlation' },
        { domain: 'ero18x.com', threat_score: 55, total_visits: 300000, recommendation: '모니터링 권고', site_type: 'Clone' },
      ]
      return {
        success: true,
        results: recommendation
          ? mockResults.filter(r => r.recommendation === recommendation)
          : mockResults,
      }
    },
    envPath: async () => '/web-preview-mode/.env',
  },

  aiInsights: {
    list: async (filters?: any) => {
      let results = Array.from(stores.aiInsights.values())
      if (filters?.entity_type && filters?.entity_id) {
        results = results.filter(i => {
          const entities = i.related_entities ? JSON.parse(i.related_entities) : []
          return entities.some((e: any) => e.type === filters.entity_type && e.id === filters.entity_id)
        })
      }
      if (filters?.status) results = results.filter(i => i.status === filters.status)
      return results.sort((a, b) => b.analyzed_at.localeCompare(a.analyzed_at))
    },
    analyze: async (entityType: 'site' | 'person', entityId: string) => {
      // Mock: 분석 시뮬레이션 (1.5초 지연)
      await new Promise(r => setTimeout(r, 1500))

      const entity = entityType === 'site'
        ? stores.sites.get(entityId)
        : stores.persons.get(entityId)
      if (!entity) return []

      const entityName = entityType === 'site'
        ? (entity as Site).display_name || (entity as Site).domain
        : (entity as Person).alias || (entity as Person).real_name || '미확인'

      // 관련 OSINT 데이터 수집
      const osintEntries = Array.from(stores.osintEntries.values())
        .filter(o => o.entity_type === entityType && o.entity_id === entityId)

      // Mock 인사이트 생성
      const mockInsights: AiInsight[] = []
      const ts = now()

      if (entityType === 'site') {
        const site = entity as Site
        // 관련 인물 확인
        const relations = Array.from(stores.personSiteRelations.values())
          .filter(r => r.site_id === entityId)

        if (relations.length > 0) {
          const personIds = relations.map(r => r.person_id)
          const otherSites = Array.from(stores.personSiteRelations.values())
            .filter(r => personIds.includes(r.person_id) && r.site_id !== entityId)

          if (otherSites.length > 0) {
            const otherSite = stores.sites.get(otherSites[0].site_id)
            const person = stores.persons.get(otherSites[0].person_id)
            const insight: AiInsight = {
              id: crypto.randomUUID(),
              insight_type: 'connection',
              title: `${site.domain}과 ${otherSite?.domain || '알 수 없음'} 간 운영자 연결 가능성`,
              description: `${person?.alias || '미확인'} 인물이 두 사이트 모두에 연관되어 있습니다. OSINT 데이터(${osintEntries.length}건) 분석 결과, 동일 인프라를 공유할 가능성이 있습니다.`,
              related_entities: JSON.stringify([
                { type: 'site', id: entityId, name: site.domain },
                { type: 'site', id: otherSites[0].site_id, name: otherSite?.domain },
                { type: 'person', id: otherSites[0].person_id, name: person?.alias },
              ]),
              confidence: 0.85,
              status: 'new',
              ai_model: 'mock-ai',
              analyzed_at: ts,
              reviewed_at: null,
            }
            stores.aiInsights.set(insight.id, insight)
            mockInsights.push(insight)
          }
        }

        // OSINT 패턴 분석
        if (osintEntries.length >= 2) {
          const insight: AiInsight = {
            id: crypto.randomUUID(),
            insight_type: 'pattern',
            title: `${site.domain} OSINT 데이터 교차 분석 결과`,
            description: `${osintEntries.length}건의 수집된 정보를 분석했습니다. ${osintEntries.filter(o => o.is_key_evidence).length}건의 핵심 증거가 발견되었으며, 이를 통해 운영자 추적의 단서를 확보할 수 있습니다.`,
            related_entities: JSON.stringify([
              { type: 'site', id: entityId, name: site.domain },
            ]),
            confidence: 0.72,
            status: 'new',
            ai_model: 'mock-ai',
            analyzed_at: ts,
            reviewed_at: null,
          }
          stores.aiInsights.set(insight.id, insight)
          mockInsights.push(insight)
        }

        // 도메인 이력 분석
        const domainHistory = Array.from(stores.domainHistory.values()).filter(d => d.site_id === entityId)
        if (domainHistory.length > 0) {
          const insight: AiInsight = {
            id: crypto.randomUUID(),
            insight_type: 'anomaly',
            title: `${site.domain} 도메인 변경 패턴 감지`,
            description: `이 사이트는 ${domainHistory.length}회의 도메인 변경 이력이 있습니다. 빈번한 도메인 변경은 법적 조치 회피 가능성을 시사합니다.`,
            related_entities: JSON.stringify([
              { type: 'site', id: entityId, name: site.domain },
            ]),
            confidence: 0.68,
            status: 'new',
            ai_model: 'mock-ai',
            analyzed_at: ts,
            reviewed_at: null,
          }
          stores.aiInsights.set(insight.id, insight)
          mockInsights.push(insight)
        }
      } else {
        // 인물 분석
        const person = entity as Person
        const relations = Array.from(stores.personSiteRelations.values())
          .filter(r => r.person_id === entityId)

        if (relations.length > 1) {
          const siteNames = relations.map(r => stores.sites.get(r.site_id)?.domain || '알 수 없음')
          const insight: AiInsight = {
            id: crypto.randomUUID(),
            insight_type: 'pattern',
            title: `${entityName} — 다중 사이트 운영 패턴`,
            description: `이 인물은 ${relations.length}개 사이트(${siteNames.join(', ')})에 연관되어 있습니다. 역할 분석 결과 조직적 운영 가능성이 있습니다.`,
            related_entities: JSON.stringify([
              { type: 'person', id: entityId, name: entityName },
              ...relations.map(r => ({ type: 'site', id: r.site_id, name: stores.sites.get(r.site_id)?.domain })),
            ]),
            confidence: 0.78,
            status: 'new',
            ai_model: 'mock-ai',
            analyzed_at: ts,
            reviewed_at: null,
          }
          stores.aiInsights.set(insight.id, insight)
          mockInsights.push(insight)
        }

        if (osintEntries.length > 0) {
          const insight: AiInsight = {
            id: crypto.randomUUID(),
            insight_type: 'recommendation',
            title: `${entityName} 추가 조사 권고`,
            description: `현재 ${osintEntries.length}건의 정보가 수집되어 있습니다. SNS/소셜 미디어 및 결제 정보 추적을 통해 신원 확인 가능성을 높일 수 있습니다.`,
            related_entities: JSON.stringify([
              { type: 'person', id: entityId, name: entityName },
            ]),
            confidence: 0.65,
            status: 'new',
            ai_model: 'mock-ai',
            analyzed_at: ts,
            reviewed_at: null,
          }
          stores.aiInsights.set(insight.id, insight)
          mockInsights.push(insight)
        }
      }

      // 분석 결과가 없을 경우 기본 인사이트
      if (mockInsights.length === 0) {
        const insight: AiInsight = {
          id: crypto.randomUUID(),
          insight_type: 'recommendation',
          title: `${entityName} — 추가 데이터 수집 필요`,
          description: '현재 수집된 OSINT 정보가 부족하여 의미 있는 분석을 수행하기 어렵습니다. 더 많은 정보를 수집한 후 다시 분석을 실행해주세요.',
          related_entities: JSON.stringify([
            { type: entityType, id: entityId, name: entityName },
          ]),
          confidence: 0.3,
          status: 'new',
          ai_model: 'mock-ai',
          analyzed_at: ts,
          reviewed_at: null,
        }
        stores.aiInsights.set(insight.id, insight)
        mockInsights.push(insight)
      }

      return mockInsights
    },
    updateStatus: async (id: string, status: 'confirmed' | 'dismissed' | 'reviewed') => {
      const insight = stores.aiInsights.get(id)
      if (!insight) throw new Error('Insight not found')
      insight.status = status
      insight.reviewed_at = now()
      stores.aiInsights.set(id, insight)
      return { success: true }
    },
  },
}

/**
 * 샘플 데이터 추가 (웹 프리뷰용)
 */
export function seedMockData() {
  // 샘플 사이트 추가
  const sampleSites: Partial<Site>[] = [
    {
      id: 'site-001',
      domain: 'manhwa-es.com',
      display_name: 'Manhwa ES',
      site_type: 'scanlation',
      status: 'active',
      priority: 'critical',
      recommendation: '최상위 타겟 - OSINT 조사 필요',
      traffic_monthly: '2,340,000',
      traffic_rank: '45,230',
      unique_visitors: '890,000',
      investigation_status: 'in_progress',
    },
    {
      id: 'site-002',
      domain: 'toonkor.com',
      display_name: 'Toonkor',
      site_type: 'aggregator',
      status: 'active',
      priority: 'critical',
      recommendation: '최상위 타겟',
      traffic_monthly: '15,200,000',
      traffic_rank: '8,450',
      unique_visitors: '5,600,000',
      investigation_status: 'in_progress',
    },
    {
      id: 'site-003',
      domain: 'manhwa-latino.com',
      display_name: 'Manhwa Latino (이전)',
      site_type: 'scanlation',
      status: 'redirected',
      priority: 'high',
      recommendation: 'OSINT 조사 필요',
      investigation_status: 'completed',
    },
    {
      id: 'site-004',
      domain: 'ero18x.com',
      display_name: 'ERO18X',
      site_type: 'clone',
      status: 'active',
      priority: 'medium',
      recommendation: '모니터링 권고',
      investigation_status: 'pending',
    },
  ]

  sampleSites.forEach(s => {
    stores.sites.set(s.id!, {
      ...s,
      display_name: s.display_name ?? null,
      site_type: s.site_type ?? null,
      recommendation: s.recommendation ?? null,
      jobdori_site_id: null,
      traffic_monthly: s.traffic_monthly ?? null,
      traffic_rank: s.traffic_rank ?? null,
      unique_visitors: s.unique_visitors ?? null,
      parent_site_id: null,
      notes: null,
      created_at: now(),
      updated_at: now(),
      synced_at: null,
    } as Site)
  })

  // 샘플 인물 추가
  const samplePersons: Partial<Person>[] = [
    {
      id: 'person-001',
      alias: 'DarkWebtoon',
      real_name: null,
      description: 'manhwa-es.com 및 manhwa-latino.com 추정 운영자. Cloudflare 뒤에 숨겨진 인프라 사용.',
      risk_level: 'critical',
      status: 'active',
    },
    {
      id: 'person-002',
      alias: 'TK_Admin',
      real_name: null,
      description: 'Toonkor 사이트 관리자로 추정되는 인물. 텔레그램 채널 운영.',
      risk_level: 'high',
      status: 'active',
    },
  ]

  samplePersons.forEach(p => {
    stores.persons.set(p.id!, {
      ...p,
      alias: p.alias ?? null,
      real_name: p.real_name ?? null,
      description: p.description ?? null,
      risk_level: p.risk_level || 'medium',
      status: p.status || 'active',
      profile_image_path: null,
      created_at: now(),
      updated_at: now(),
    } as Person)
  })

  // 샘플 Person-Site 연결
  stores.personSiteRelations.set('psr-001', {
    id: 'psr-001',
    person_id: 'person-001',
    site_id: 'site-001',
    role: 'operator',
    confidence: 'high',
    evidence: 'WHOIS 이메일 유사성, Google Analytics ID 동일',
    created_at: now(),
  } as PersonSiteRelation)

  stores.personSiteRelations.set('psr-002', {
    id: 'psr-002',
    person_id: 'person-001',
    site_id: 'site-003',
    role: 'owner',
    confidence: 'confirmed',
    evidence: '동일 WHOIS 등록 정보',
    created_at: now(),
  } as PersonSiteRelation)

  stores.personSiteRelations.set('psr-003', {
    id: 'psr-003',
    person_id: 'person-002',
    site_id: 'site-002',
    role: 'operator',
    confidence: 'medium',
    evidence: '텔레그램 채널 관리자 정보',
    created_at: now(),
  } as PersonSiteRelation)

  // 샘플 OSINT 엔트리
  const sampleOsint: Partial<OsintEntry>[] = [
    {
      id: 'osint-001',
      entity_type: 'site',
      entity_id: 'site-001',
      category: 'whois',
      title: 'WHOIS 등록자 이메일',
      content: '등록자 이메일: dark***@protonmail.com\n등록일: 2023-04-15\nRegistrar: Namecheap\nPrivacy Protection: 활성화',
      source: 'WHOIS 조회',
      confidence: 'confirmed',
      is_key_evidence: 1,
    },
    {
      id: 'osint-002',
      entity_type: 'site',
      entity_id: 'site-001',
      category: 'ip',
      title: 'Cloudflare CDN IP',
      content: 'IP: 104.21.xx.xx (Cloudflare)\n실제 서버 IP 추적 필요\nSSL 인증서에서 Origin IP 추출 시도 중',
      source: 'DNS/IP 조사',
      confidence: 'medium',
      is_key_evidence: 0,
    },
    {
      id: 'osint-003',
      entity_type: 'site',
      entity_id: 'site-001',
      category: 'analytics',
      title: 'Google Analytics ID 발견',
      content: 'GA ID: UA-12345678-1\n동일 GA ID가 manhwa-latino.com에서도 발견됨 → 동일 운영자 추정',
      source: '소스 코드 분석',
      confidence: 'confirmed',
      is_key_evidence: 1,
    },
  ]

  sampleOsint.forEach(o => {
    stores.osintEntries.set(o.id!, {
      ...o,
      subcategory: null,
      raw_input: null,
      created_at: now(),
      updated_at: now(),
    } as OsintEntry)
  })

  // 샘플 도메인 이력
  stores.domainHistory.set('dh-001', {
    id: 'dh-001',
    site_id: 'site-001',
    domain: 'manhwa-latino.com',
    status: 'redirected',
    detected_at: '2024-08-15T00:00:00.000Z',
    source: 'Jobdori 모니터링',
    notes: 'manhwa-es.com으로 리다이렉트 감지',
    created_at: now(),
  })
  stores.domainHistory.set('dh-002', {
    id: 'dh-002',
    site_id: 'site-001',
    domain: 'manhwa-es.com',
    status: 'active',
    detected_at: '2024-08-16T00:00:00.000Z',
    source: 'Jobdori 모니터링',
    notes: '새 도메인으로 전환 확인',
    created_at: now(),
  })

  // 샘플 타임라인 이벤트
  const sampleEvents: Partial<TimelineEvent>[] = [
    {
      id: 'evt-001',
      entity_type: 'site',
      entity_id: 'site-001',
      event_type: 'domain_change',
      title: '도메인 변경: manhwa-latino.com → manhwa-es.com',
      description: 'Jobdori 모니터링에서 리다이렉트 감지',
      event_date: '2024-08-15T12:00:00.000Z',
      importance: 'high',
    },
    {
      id: 'evt-002',
      entity_type: 'site',
      entity_id: 'site-001',
      event_type: 'osint_discovery',
      title: 'Google Analytics ID 일치 발견',
      description: 'manhwa-es.com과 manhwa-latino.com에서 동일한 GA ID 발견',
      event_date: '2024-09-01T09:00:00.000Z',
      importance: 'critical',
    },
    {
      id: 'evt-003',
      entity_type: 'site',
      entity_id: 'site-002',
      event_type: 'investigation_start',
      title: 'Toonkor OSINT 조사 시작',
      description: '최상위 타겟으로 선정, WHOIS/IP/DNS 조사 개시',
      event_date: '2024-10-05T08:00:00.000Z',
      importance: 'high',
    },
  ]

  sampleEvents.forEach(e => {
    stores.timelineEvents.set(e.id!, {
      ...e,
      source: null,
      created_at: now(),
    } as TimelineEvent)
  })

  console.log('[Mock] Sample data loaded: sites=%d, persons=%d, osint=%d',
    stores.sites.size, stores.persons.size, stores.osintEntries.size)
}
