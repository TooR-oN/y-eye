import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Sites
  sites: {
    list: (filters?: any) => ipcRenderer.invoke('db:sites:list', filters),
    get: (id: string) => ipcRenderer.invoke('db:sites:get', id),
    create: (site: any) => ipcRenderer.invoke('db:sites:create', site),
    update: (id: string, updates: any) => ipcRenderer.invoke('db:sites:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('db:sites:delete', id),
  },

  // Persons
  persons: {
    list: (filters?: any) => ipcRenderer.invoke('db:persons:list', filters),
    get: (id: string) => ipcRenderer.invoke('db:persons:get', id),
    create: (person: any) => ipcRenderer.invoke('db:persons:create', person),
    update: (id: string, updates: any) => ipcRenderer.invoke('db:persons:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('db:persons:delete', id),
  },

  // Person-Site Relations
  personSiteRelations: {
    list: (filters: any) => ipcRenderer.invoke('db:person-site:list', filters),
    create: (relation: any) => ipcRenderer.invoke('db:person-site:create', relation),
    delete: (id: string) => ipcRenderer.invoke('db:person-site:delete', id),
  },

  // Person Relations
  personRelations: {
    list: (personId: string) => ipcRenderer.invoke('db:person-relations:list', personId),
    create: (relation: any) => ipcRenderer.invoke('db:person-relations:create', relation),
    delete: (id: string) => ipcRenderer.invoke('db:person-relations:delete', id),
  },

  // OSINT Entries
  osint: {
    list: (filters: any) => ipcRenderer.invoke('db:osint:list', filters),
    create: (entry: any) => ipcRenderer.invoke('db:osint:create', entry),
    update: (id: string, updates: any) => ipcRenderer.invoke('db:osint:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('db:osint:delete', id),
  },

  // Evidence Files
  evidence: {
    list: (filters: any) => ipcRenderer.invoke('db:evidence:list', filters),
    create: (file: any) => ipcRenderer.invoke('db:evidence:create', file),
  },

  // Timeline Events
  timeline: {
    list: (filters: any) => ipcRenderer.invoke('db:timeline:list', filters),
    create: (event: any) => ipcRenderer.invoke('db:timeline:create', event),
  },

  // Tags
  tags: {
    list: () => ipcRenderer.invoke('db:tags:list'),
    create: (tag: any) => ipcRenderer.invoke('db:tags:create', tag),
    listForEntity: (entityType: string, entityId: string) => ipcRenderer.invoke('db:entity-tags:list', entityType, entityId),
    setForEntity: (entityType: string, entityId: string, tagIds: string[]) => ipcRenderer.invoke('db:entity-tags:set', entityType, entityId, tagIds),
  },

  // Site Groups
  siteGroups: {
    list: () => ipcRenderer.invoke('db:site-groups:list'),
    get: (id: string) => ipcRenderer.invoke('db:site-groups:get', id),
    create: (group: any) => ipcRenderer.invoke('db:site-groups:create', group),
    addMember: (groupId: string, siteId: string, role: string) => ipcRenderer.invoke('db:site-groups:add-member', groupId, siteId, role),
    removeMember: (groupId: string, siteId: string) => ipcRenderer.invoke('db:site-groups:remove-member', groupId, siteId),
  },

  // Domain History
  domainHistory: {
    list: (siteId: string) => ipcRenderer.invoke('db:domain-history:list', siteId),
    create: (entry: any) => ipcRenderer.invoke('db:domain-history:create', entry),
  },

  // Dashboard
  dashboard: {
    stats: () => ipcRenderer.invoke('db:dashboard:stats'),
  },

  // Obsidian
  obsidian: {
    open: (vaultPath: string, filePath: string) => ipcRenderer.invoke('obsidian:open', vaultPath, filePath),
  },

  // App
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },

  // Jobdori
  jobdori: {
    connect: (databaseUrl?: string) => ipcRenderer.invoke('jobdori:connect', databaseUrl),
    status: () => ipcRenderer.invoke('jobdori:status'),
    disconnect: () => ipcRenderer.invoke('jobdori:disconnect'),
    sync: (options?: any) => ipcRenderer.invoke('jobdori:sync', options),
    syncHistory: (limit?: number) => ipcRenderer.invoke('jobdori:sync-history', limit),
    search: (searchTerm: string) => ipcRenderer.invoke('jobdori:search', searchTerm),
    sitesByRecommendation: (recommendation?: string) => ipcRenderer.invoke('jobdori:sites-by-recommendation', recommendation),
    envPath: () => ipcRenderer.invoke('jobdori:env-path'),
  },
})
