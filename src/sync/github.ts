// GitHub リポジトリをデータ置き場にした同期。
// 各エンティティを <dir>/<kind>s/<id>.json として保存し、変更はまとめて1コミットにする。
// 取得は「ブランチ先頭の SHA が変わったときだけ」ツリーを比較して差分ファイルを読む。
import { db } from '../db'
import { onLocalChange, useStore, type Entity, type EntityKind } from '../store'
import type { Settings, SyncStatus } from '../types'

const API = 'https://api.github.com'
const KINDS: EntityKind[] = ['project', 'chapter', 'episode', 'memo']
const PULL_INTERVAL = 60_000
const PUSH_DEBOUNCE = 4_000

interface Config {
  owner: string
  repo: string
  branch: string
  token: string
  dir: string
}

interface PersistedState {
  head: string | null
  blobs: Record<string, string> // path -> blob sha
  remoteUpdated: Record<string, number> // path -> updatedAt
}

let cfg: Config | null = null
let state: PersistedState = { head: null, blobs: {}, remoteUpdated: {} }
let offLocal: (() => void) | null = null
let queue = new Map<string, { kind: EntityKind; entity: Entity }>()
let pushTimer = 0
let pullTimer = 0
let busy: Promise<void> = Promise.resolve()
let stopped = true

const setSync = (s: SyncStatus, m?: string) => useStore.getState().setSync(s, m)
const stateKey = () => `gh-sync:${cfg?.owner}/${cfg?.repo}@${cfg?.branch}:${cfg?.dir}`

export function parseRepo(text: string): { owner: string; repo: string } | null {
  const t = text
    .trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
  const m = t.match(/^([\w.-]+)\/([\w.-]+)$/)
  return m ? { owner: m[1], repo: m[2] } : null
}

export function isGithubSyncActive() {
  return !stopped
}

export async function startGithubSync(settings: Settings) {
  await stopGithubSync()
  const r = parseRepo(settings.githubRepo)
  if (!r || !settings.githubToken.trim()) {
    setSync('error', 'リポジトリ名とトークンを入力してください')
    return
  }
  cfg = {
    owner: r.owner,
    repo: r.repo,
    branch: settings.githubBranch.trim() || 'main',
    token: settings.githubToken.trim(),
    dir: settings.githubDir.trim().replace(/^\/+|\/+$/g, '') || 'data'
  }
  stopped = false
  try {
    const saved = localStorage.getItem(stateKey())
    state = saved ? JSON.parse(saved) : { head: null, blobs: {}, remoteUpdated: {} }
  } catch {
    state = { head: null, blobs: {}, remoteUpdated: {} }
  }
  setSync('connecting', 'GitHub に接続中…')
  offLocal = onLocalChange((kind, entity) => enqueue(kind, entity))
  window.addEventListener('focus', onWake)
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('online', onWake)
  pullTimer = window.setInterval(() => void pullNow(), PULL_INTERVAL)
  await run(async () => {
    await pull(true)
  })
}

export async function stopGithubSync() {
  if (stopped) return
  stopped = true
  if (offLocal) offLocal()
  offLocal = null
  window.removeEventListener('focus', onWake)
  document.removeEventListener('visibilitychange', onWake)
  window.removeEventListener('online', onWake)
  clearInterval(pullTimer)
  clearTimeout(pushTimer)
  await busy
  queue.clear()
  cfg = null
  setSync('off')
}

/** 「今すぐ同期」ボタン用 */
export async function syncNow() {
  if (stopped) return
  clearTimeout(pushTimer)
  await run(async () => {
    await pull(false)
    await flush()
  })
}

/** 接続テスト(設定画面用) */
export async function testGithub(settings: Settings): Promise<string> {
  const r = parseRepo(settings.githubRepo)
  if (!r) return 'リポジトリは owner/repo の形式で入力してください'
  const res = await fetch(`${API}/repos/${r.owner}/${r.repo}`, { headers: headers(settings.githubToken.trim()) })
  if (res.status === 401) return 'トークンが無効です'
  if (res.status === 404) return 'リポジトリが見つかりません(トークンにこのリポジトリへのアクセス権があるか確認)'
  if (!res.ok) return `エラー: ${res.status}`
  const j = await res.json()
  return `接続OK: ${j.full_name}${j.private ? '(非公開)' : '(公開リポジトリです。原稿が誰でも見える状態なので非公開にしてください)'}`
}

// ---------------- internals ----------------

function onWake() {
  if (document.visibilityState === 'hidden') return
  void pullNow()
}

async function pullNow() {
  if (stopped || !navigator.onLine) return
  await run(() => pull(false))
}

/** 同期処理は直列に実行する */
function run(fn: () => Promise<void>) {
  const next = busy.then(fn).catch((e) => {
    console.error(e)
    setSync('error', String(e?.message ?? e))
  })
  busy = next
  return next
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
}

async function gh(method: string, path: string, body?: unknown): Promise<any> {
  if (!cfg) throw new Error('not configured')
  const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}${path}`, {
    method,
    headers: { ...headers(cfg.token), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    let msg = `${res.status}`
    try {
      const j = await res.json()
      if (j?.message) msg += ' ' + j.message
    } catch {
      /* ignore */
    }
    const err: any = new Error(msg)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return null
  return res.json()
}

const pathOf = (kind: EntityKind, id: string) => `${cfg!.dir}/${kind}s/${id}.json`

function kindOfPath(path: string): { kind: EntityKind; id: string } | null {
  const prefix = cfg!.dir + '/'
  if (!path.startsWith(prefix)) return null
  const m = path.slice(prefix.length).match(/^(project|chapter|episode|memo)s\/([^/]+)\.json$/)
  return m ? { kind: m[1] as EntityKind, id: m[2] } : null
}

function saveState() {
  try {
    localStorage.setItem(stateKey(), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function decodeBlob(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function getHead(): Promise<string | null> {
  try {
    const ref = await gh('GET', `/git/ref/heads/${encodeURIComponent(cfg!.branch)}`)
    return ref.object.sha as string
  } catch (e: any) {
    if (e.status === 404 || e.status === 409) return null // 空リポジトリ or ブランチ無し
    throw e
  }
}

/** 空のリポジトリに最初のコミットを作る(Contents API は空リポジトリでも使える) */
async function ensureBranch(): Promise<string> {
  const head = await getHead()
  if (head) return head
  const content = btoa(unescape(encodeURIComponent('# 執筆ノート データ\n\nこのリポジトリは執筆ノートの同期用です。\n')))
  await gh('PUT', `/contents/README.md`, {
    message: 'init: 執筆ノート',
    content,
    branch: cfg!.branch
  })
  const h = await getHead()
  if (!h) throw new Error('ブランチを作成できませんでした')
  return h
}

async function pull(initial: boolean) {
  if (stopped || !cfg) return
  const head = await ensureBranch()
  if (head === state.head && !initial) {
    if (queue.size === 0) setSync('synced', `${cfg.owner}/${cfg.repo}`)
    return
  }
  setSync('syncing', '取得中…')
  const tree = await gh('GET', `/git/trees/${head}?recursive=1`)
  const remote: Record<string, string> = {}
  for (const e of tree.tree as { path: string; type: string; sha: string }[]) {
    if (e.type === 'blob' && kindOfPath(e.path)) remote[e.path] = e.sha
  }
  const changed = Object.entries(remote).filter(([p, sha]) => state.blobs[p] !== sha || (initial && state.remoteUpdated[p] === undefined))
  for (const [path, sha] of changed) {
    const info = kindOfPath(path)!
    const blob = await gh('GET', `/git/blobs/${sha}`)
    let entity: Entity
    try {
      entity = JSON.parse(decodeBlob(blob.content))
    } catch {
      continue
    }
    state.remoteUpdated[path] = entity.updatedAt ?? 0
    state.blobs[path] = sha
    useStore.getState().applyRemote(info.kind, entity)
  }
  // リモートで消えたファイルは追跡から外す
  for (const p of Object.keys(state.blobs)) if (!remote[p]) delete state.blobs[p]
  state.head = head
  saveState()

  if (initial) await reconcileLocal()
  if (queue.size === 0) setSync('synced', `${cfg.owner}/${cfg.repo}`)
  else schedulePush(0)
}

/** ローカルにしかない/ローカルの方が新しいものを送信対象にする */
async function reconcileLocal() {
  const tables = { project: db.projects, chapter: db.chapters, episode: db.episodes, memo: db.memos } as const
  for (const kind of KINDS) {
    const rows = (await (tables[kind] as any).toArray()) as Entity[]
    for (const row of rows) {
      const r = state.remoteUpdated[pathOf(kind, row.id)]
      if (r === undefined || r < row.updatedAt) queue.set(kind + ':' + row.id, { kind, entity: row })
    }
  }
}

function enqueue(kind: EntityKind, entity: Entity) {
  if (stopped) return
  queue.set(kind + ':' + entity.id, { kind, entity })
  setSync('syncing', '変更あり(まもなく保存)')
  schedulePush(PUSH_DEBOUNCE)
}

function schedulePush(delay: number) {
  clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => void run(flush), delay)
}

async function flush(attempt = 0): Promise<void> {
  if (stopped || !cfg || queue.size === 0) return
  if (!navigator.onLine) {
    setSync('offline', 'オフライン(再接続時に保存)')
    return
  }
  // 最新のローカル状態を採用し、リモートの方が新しいものは送らない
  const st = useStore.getState()
  const items: { path: string; entity: Entity }[] = []
  for (const [key, { kind, entity }] of queue) {
    const live = (st as any)[kind + 's'][entity.id] as Entity | undefined
    const e = live && live.updatedAt > entity.updatedAt ? live : entity
    const path = pathOf(kind, e.id)
    if ((state.remoteUpdated[path] ?? -1) >= e.updatedAt) {
      queue.delete(key)
      continue
    }
    items.push({ path, entity: e })
  }
  if (items.length === 0) {
    setSync('synced', `${cfg.owner}/${cfg.repo}`)
    return
  }
  setSync('syncing', '保存中…')
  const head = await ensureBranch()
  if (head !== state.head) {
    // 先に取り込んでから送る
    await pull(false)
    if (attempt < 2) return flush(attempt + 1)
  }
  const base = await gh('GET', `/git/commits/${head}`)
  const tree = await gh('POST', `/git/trees`, {
    base_tree: base.tree.sha,
    tree: items.map((it) => ({ path: it.path, mode: '100644', type: 'blob', content: JSON.stringify(it.entity, null, 1) }))
  })
  const titles = items
    .map((it) => (it.entity as any).title)
    .filter(Boolean)
    .slice(0, 3)
    .join('、')
  const commit = await gh('POST', `/git/commits`, {
    message: `update: ${titles || items.length + ' files'}`,
    tree: tree.sha,
    parents: [head]
  })
  try {
    await gh('PATCH', `/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { sha: commit.sha, force: false })
  } catch (e: any) {
    if (e.status === 422 && attempt < 2) {
      await pull(false)
      return flush(attempt + 1)
    }
    throw e
  }
  // 送ったものを既知状態に反映
  const newTree = await gh('GET', `/git/trees/${commit.sha}?recursive=1`)
  const shaByPath: Record<string, string> = {}
  for (const e of newTree.tree as { path: string; sha: string; type: string }[]) if (e.type === 'blob') shaByPath[e.path] = e.sha
  for (const it of items) {
    state.blobs[it.path] = shaByPath[it.path]
    state.remoteUpdated[it.path] = it.entity.updatedAt
    for (const [key, q] of queue) if (pathOf(q.kind, q.entity.id) === it.path && q.entity.updatedAt <= it.entity.updatedAt) queue.delete(key)
  }
  state.head = commit.sha
  saveState()
  setSync(queue.size ? 'syncing' : 'synced', `${cfg.owner}/${cfg.repo}`)
  if (queue.size) schedulePush(PUSH_DEBOUNCE)
}
