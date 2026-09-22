export interface Point {
  x: number
  y: number
  p: number // pressure 0..1
}

export interface Stroke {
  id: string
  color: string
  width: number
  points: Point[]
}

export interface Project {
  id: string
  title: string
  chapterOrder: string[]
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface Chapter {
  id: string
  projectId: string
  title: string
  subtitle?: string
  episodeOrder: string[]
  updatedAt: number
  deleted?: boolean
}

export interface Episode {
  id: string
  projectId: string
  chapterId: string
  title: string
  subtitle?: string
  body: string
  updatedAt: number
  deleted?: boolean
}

export interface Memo {
  id: string
  projectId: string
  title: string
  text: string
  strokes: Stroke[]
  height: number // canvas height in css px
  order: number
  updatedAt: number
  deleted?: boolean
}

export interface Settings {
  currentProjectId: string | null
  currentEpisodeId: string | null
  drawerOpen: boolean
  drawerWidth: number
  sidebarOpen: boolean
  fontSize: number
  lineHeight: number
  fontFamily: 'serif' | 'sans'
  countMode: 'exclude-space' | 'all'
  penOnly: boolean
  penColor: string
  penWidth: number
  firebaseConfig: string // JSON string, empty = disabled
  syncProvider: 'none' | 'github' | 'firebase'
  githubRepo: string // "owner/repo"
  githubBranch: string
  githubToken: string
  githubDir: string // データを置くディレクトリ
}

export const defaultSettings: Settings = {
  currentProjectId: null,
  currentEpisodeId: null,
  drawerOpen: false,
  drawerWidth: 380,
  sidebarOpen: true,
  fontSize: 17,
  lineHeight: 1.9,
  fontFamily: 'serif',
  countMode: 'exclude-space',
  penOnly: false,
  penColor: '#2b2a28',
  penWidth: 2.5,
  firebaseConfig: '',
  syncProvider: 'none',
  githubRepo: '',
  githubBranch: 'main',
  githubToken: '',
  githubDir: 'data'
}

export type SyncStatus = 'off' | 'connecting' | 'synced' | 'syncing' | 'error' | 'offline'
