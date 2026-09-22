import { create } from 'zustand'
import { db } from './db'
import { defaultSettings, type Chapter, type Episode, type Memo, type Project, type Settings, type SyncStatus } from './types'
import { newId, now } from './utils/id'

export type EntityKind = 'project' | 'chapter' | 'episode' | 'memo'
export type Entity = Project | Chapter | Episode | Memo
export type ChangeListener = (kind: EntityKind, entity: Entity) => void

const listeners = new Set<ChangeListener>()
export function onLocalChange(fn: ChangeListener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---- persistence (debounced per entity) ----
const pending = new Map<string, { kind: EntityKind; entity: Entity; notify: boolean; timer: number }>()
const tableOf = (kind: EntityKind) =>
  kind === 'project' ? db.projects : kind === 'chapter' ? db.chapters : kind === 'episode' ? db.episodes : db.memos

function persist(kind: EntityKind, entity: Entity, notify = true) {
  const key = kind + ':' + entity.id
  const prev = pending.get(key)
  if (prev) clearTimeout(prev.timer)
  const timer = window.setTimeout(async () => {
    pending.delete(key)
    await (tableOf(kind) as any).put(entity)
    if (notify) listeners.forEach((l) => l(kind, entity))
  }, 250)
  pending.set(key, { kind, entity, notify, timer })
}

export async function flushPersist() {
  const items = [...pending.values()]
  pending.forEach((p) => clearTimeout(p.timer))
  pending.clear()
  for (const p of items) {
    await (tableOf(p.kind) as any).put(p.entity)
    if (p.notify) listeners.forEach((l) => l(p.kind, p.entity))
  }
}

let settingsTimer = 0
function persistSettings(s: Settings) {
  clearTimeout(settingsTimer)
  settingsTimer = window.setTimeout(() => db.settings.put({ key: 'app', value: s }), 200)
}

const byId = <T extends { id: string }>(arr: T[]) => Object.fromEntries(arr.map((x) => [x.id, x])) as Record<string, T>

export interface ExportData {
  version: 1
  exportedAt: number
  projects: Project[]
  chapters: Chapter[]
  episodes: Episode[]
  memos: Memo[]
}

export interface SearchState {
  open: boolean
  query: string
  replace: string
  scope: 'episode' | 'project'
  caseSensitive: boolean
  current: number // 現在の話の中での一致番号
  nonce: number // 同じ番号でも再選択させたいとき用
}

export interface AppState {
  loaded: boolean
  search: SearchState
  setSearch: (patch: Partial<SearchState>) => void
  projects: Record<string, Project>
  chapters: Record<string, Chapter>
  episodes: Record<string, Episode>
  memos: Record<string, Memo>
  settings: Settings
  syncStatus: SyncStatus
  syncMessage: string

  load: () => Promise<void>
  setSettings: (patch: Partial<Settings>) => void
  setSync: (status: SyncStatus, message?: string) => void

  createProject: (title: string) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void

  createChapter: (projectId: string, title?: string) => string
  updateChapter: (id: string, patch: Partial<Chapter>) => void
  deleteChapter: (id: string) => void
  moveChapter: (projectId: string, chapterId: string, dir: -1 | 1) => void

  createEpisode: (chapterId: string, title?: string) => string
  updateEpisode: (id: string, patch: Partial<Episode>) => void
  deleteEpisode: (id: string) => void
  moveEpisode: (episodeId: string, dir: -1 | 1) => void

  createMemo: (projectId: string, episodeId?: string) => string
  updateMemo: (id: string, patch: Partial<Memo>) => void
  deleteMemo: (id: string) => void
  /** メモを別の話(または作品共通 = undefined)へ移す */
  moveMemo: (id: string, episodeId: string | undefined) => void

  applyRemote: (kind: EntityKind, entity: Entity) => void
  exportData: () => Promise<ExportData>
  importData: (data: ExportData) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  loaded: false,
  projects: {},
  chapters: {},
  episodes: {},
  memos: {},
  settings: defaultSettings,
  syncStatus: 'off',
  syncMessage: '',
  search: { open: false, query: '', replace: '', scope: 'episode', caseSensitive: false, current: 0, nonce: 0 },
  setSearch: (patch) => set((s) => ({ search: { ...s.search, ...patch } })),

  load: async () => {
    const [projects, chapters, episodes, memos, settingsRow] = await Promise.all([
      db.projects.toArray(),
      db.chapters.toArray(),
      db.episodes.toArray(),
      db.memos.toArray(),
      db.settings.get('app')
    ])
    const settings = { ...defaultSettings, ...(settingsRow?.value ?? {}) }
    // 旧バージョン(Firebase設定のみ)からの移行
    if (!(settingsRow?.value as any)?.syncProvider && settings.firebaseConfig.trim()) settings.syncProvider = 'firebase'
    set({
      projects: byId(projects.filter((p) => !p.deleted)),
      chapters: byId(chapters.filter((c) => !c.deleted)),
      episodes: byId(episodes.filter((e) => !e.deleted)),
      memos: byId(memos.filter((m) => !m.deleted)),
      settings,
      loaded: true
    })
    // 初回起動: 空の作品を作る
    if (Object.keys(get().projects).length === 0) {
      get().createProject('新しい作品')
    } else if (!settings.currentProjectId || !get().projects[settings.currentProjectId]) {
      get().setSettings({ currentProjectId: Object.keys(get().projects)[0] })
    }
    const s = get().settings
    if (s.currentProjectId && (!s.currentEpisodeId || !get().episodes[s.currentEpisodeId])) {
      const p = get().projects[s.currentProjectId]
      const firstCh = p?.chapterOrder.map((id) => get().chapters[id]).find(Boolean)
      get().setSettings({ currentEpisodeId: firstCh?.episodeOrder[0] ?? null })
    }
  },

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    persistSettings(settings)
  },

  setSync: (syncStatus, syncMessage = '') => set({ syncStatus, syncMessage }),

  createProject: (title) => {
    const t = now()
    const project: Project = { id: newId(), title, chapterOrder: [], createdAt: t, updatedAt: t }
    set((s) => ({ projects: { ...s.projects, [project.id]: project } }))
    persist('project', project)
    const chId = get().createChapter(project.id, '第一章')
    const epId = get().createEpisode(chId, '第一話')
    get().setSettings({ currentProjectId: project.id, currentEpisodeId: epId })
    return project.id
  },
  updateProject: (id, patch) => {
    const p = get().projects[id]
    if (!p) return
    const next = { ...p, ...patch, updatedAt: now() }
    set((s) => ({ projects: { ...s.projects, [id]: next } }))
    persist('project', next)
  },
  deleteProject: (id) => {
    const p = get().projects[id]
    if (!p) return
    for (const chId of [...p.chapterOrder]) get().deleteChapter(chId)
    Object.values(get().memos)
      .filter((m) => m.projectId === id)
      .forEach((m) => get().deleteMemo(m.id))
    const rest = { ...get().projects }
    delete rest[id]
    set({ projects: rest })
    persist('project', { ...p, deleted: true, updatedAt: now() })
    if (get().settings.currentProjectId === id) {
      const nextId = Object.keys(rest)[0] ?? null
      const np = nextId ? rest[nextId] : undefined
      const firstCh = np?.chapterOrder.map((cid) => get().chapters[cid]).find(Boolean)
      get().setSettings({ currentProjectId: nextId, currentEpisodeId: firstCh?.episodeOrder[0] ?? null })
    }
  },

  createChapter: (projectId, title) => {
    const p = get().projects[projectId]
    if (!p) return ''
    const n = p.chapterOrder.length + 1
    const chapter: Chapter = { id: newId(), projectId, title: title ?? `第${toKanji(n)}章`, episodeOrder: [], updatedAt: now() }
    set((s) => ({ chapters: { ...s.chapters, [chapter.id]: chapter } }))
    persist('chapter', chapter)
    get().updateProject(projectId, { chapterOrder: [...p.chapterOrder, chapter.id] })
    return chapter.id
  },
  updateChapter: (id, patch) => {
    const c = get().chapters[id]
    if (!c) return
    const next = { ...c, ...patch, updatedAt: now() }
    set((s) => ({ chapters: { ...s.chapters, [id]: next } }))
    persist('chapter', next)
  },
  deleteChapter: (id) => {
    const c = get().chapters[id]
    if (!c) return
    for (const epId of [...c.episodeOrder]) get().deleteEpisode(epId)
    const rest = { ...get().chapters }
    delete rest[id]
    set({ chapters: rest })
    persist('chapter', { ...c, deleted: true, updatedAt: now() })
    const p = get().projects[c.projectId]
    if (p) get().updateProject(p.id, { chapterOrder: p.chapterOrder.filter((x) => x !== id) })
  },
  moveChapter: (projectId, chapterId, dir) => {
    const p = get().projects[projectId]
    if (!p) return
    const order = [...p.chapterOrder]
    const i = order.indexOf(chapterId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
    get().updateProject(projectId, { chapterOrder: order })
  },

  createEpisode: (chapterId, title) => {
    const c = get().chapters[chapterId]
    if (!c) return ''
    const n = c.episodeOrder.length + 1
    const episode: Episode = {
      id: newId(),
      projectId: c.projectId,
      chapterId,
      title: title ?? `第${toKanji(n)}話`,
      body: '',
      updatedAt: now()
    }
    set((s) => ({ episodes: { ...s.episodes, [episode.id]: episode } }))
    persist('episode', episode)
    get().updateChapter(chapterId, { episodeOrder: [...c.episodeOrder, episode.id] })
    return episode.id
  },
  updateEpisode: (id, patch) => {
    const e = get().episodes[id]
    if (!e) return
    const next = { ...e, ...patch, updatedAt: now() }
    set((s) => ({ episodes: { ...s.episodes, [id]: next } }))
    persist('episode', next)
  },
  deleteEpisode: (id) => {
    const e = get().episodes[id]
    if (!e) return
    Object.values(get().memos)
      .filter((m) => m.episodeId === id)
      .forEach((m) => get().deleteMemo(m.id))
    const rest = { ...get().episodes }
    delete rest[id]
    set({ episodes: rest })
    persist('episode', { ...e, deleted: true, updatedAt: now() })
    const c = get().chapters[e.chapterId]
    if (c) get().updateChapter(c.id, { episodeOrder: c.episodeOrder.filter((x) => x !== id) })
    if (get().settings.currentEpisodeId === id) get().setSettings({ currentEpisodeId: null })
  },
  moveEpisode: (episodeId, dir) => {
    const e = get().episodes[episodeId]
    if (!e) return
    const c = get().chapters[e.chapterId]
    if (!c) return
    const order = [...c.episodeOrder]
    const i = order.indexOf(episodeId)
    const j = i + dir
    if (i < 0) return
    if (j >= 0 && j < order.length) {
      const tmp = order[i]
      order[i] = order[j]
      order[j] = tmp
      get().updateChapter(c.id, { episodeOrder: order })
      return
    }
    // 章をまたいで移動
    const p = get().projects[c.projectId]
    if (!p) return
    const ci = p.chapterOrder.indexOf(c.id)
    const target = get().chapters[p.chapterOrder[ci + dir]]
    if (!target) return
    get().updateChapter(c.id, { episodeOrder: order.filter((x) => x !== episodeId) })
    const tOrder = dir === 1 ? [episodeId, ...target.episodeOrder] : [...target.episodeOrder, episodeId]
    get().updateChapter(target.id, { episodeOrder: tOrder })
    get().updateEpisode(episodeId, { chapterId: target.id })
  },

  createMemo: (projectId, episodeId) => {
    const existing = Object.values(get().memos).filter((m) => m.projectId === projectId && (m.episodeId ?? '') === (episodeId ?? ''))
    const order = existing.reduce((mx, m) => Math.max(mx, m.order), -1) + 1
    const memo: Memo = { id: newId(), projectId, episodeId, title: '', text: '', strokes: [], height: 320, order, updatedAt: now() }
    set((s) => ({ memos: { ...s.memos, [memo.id]: memo } }))
    persist('memo', memo)
    return memo.id
  },
  updateMemo: (id, patch) => {
    const m = get().memos[id]
    if (!m) return
    const next = { ...m, ...patch, updatedAt: now() }
    set((s) => ({ memos: { ...s.memos, [id]: next } }))
    persist('memo', next)
  },
  deleteMemo: (id) => {
    const m = get().memos[id]
    if (!m) return
    const rest = { ...get().memos }
    delete rest[id]
    set({ memos: rest })
    persist('memo', { ...m, deleted: true, updatedAt: now() })
  },

  moveMemo: (id, episodeId) => {
    const m = get().memos[id]
    if (!m) return
    const siblings = Object.values(get().memos).filter((x) => x.projectId === m.projectId && (x.episodeId ?? '') === (episodeId ?? '') && x.id !== id)
    const order = siblings.reduce((mx, x) => Math.max(mx, x.order), -1) + 1
    get().updateMemo(id, { episodeId, order })
  },

  applyRemote: (kind, entity) => {
    const mapKey = (kind + 's') as 'projects' | 'chapters' | 'episodes' | 'memos'
    const current = (get() as any)[mapKey][entity.id] as Entity | undefined
    if (current && current.updatedAt >= entity.updatedAt) return
    const map = { ...(get() as any)[mapKey] }
    if (entity.deleted) delete map[entity.id]
    else map[entity.id] = entity
    set({ [mapKey]: map } as any)
    persist(kind, entity, false)
  },

  exportData: async () => {
    await flushPersist()
    const [projects, chapters, episodes, memos] = await Promise.all([
      db.projects.toArray(),
      db.chapters.toArray(),
      db.episodes.toArray(),
      db.memos.toArray()
    ])
    return {
      version: 1,
      exportedAt: now(),
      projects: projects.filter((x) => !x.deleted),
      chapters: chapters.filter((x) => !x.deleted),
      episodes: episodes.filter((x) => !x.deleted),
      memos: memos.filter((x) => !x.deleted)
    }
  },

  importData: async (data) => {
    const t = now()
    const bump = <T extends { updatedAt: number }>(x: T) => ({ ...x, updatedAt: Math.max(x.updatedAt ?? 0, t) })
    const projects = data.projects.map(bump)
    const chapters = data.chapters.map(bump)
    const episodes = data.episodes.map(bump)
    const memos = data.memos.map(bump)
    await db.transaction('rw', db.projects, db.chapters, db.episodes, db.memos, async () => {
      await db.projects.bulkPut(projects)
      await db.chapters.bulkPut(chapters)
      await db.episodes.bulkPut(episodes)
      await db.memos.bulkPut(memos)
    })
    await get().load()
    projects.forEach((x) => listeners.forEach((l) => l('project', x)))
    chapters.forEach((x) => listeners.forEach((l) => l('chapter', x)))
    episodes.forEach((x) => listeners.forEach((l) => l('episode', x)))
    memos.forEach((x) => listeners.forEach((l) => l('memo', x)))
  }
}))

export function toKanji(n: number): string {
  const d = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n < 10) return d[n]
  if (n < 20) return '十' + d[n - 10]
  if (n < 100) return d[Math.floor(n / 10)] + '十' + d[n % 10]
  return String(n)
}

// 便利セレクタ
export const selectCurrentProject = (s: AppState) =>
  s.settings.currentProjectId ? s.projects[s.settings.currentProjectId] : undefined
export const selectCurrentEpisode = (s: AppState) =>
  s.settings.currentEpisodeId ? s.episodes[s.settings.currentEpisodeId] : undefined

window.addEventListener('beforeunload', () => {
  void flushPersist()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushPersist()
})
