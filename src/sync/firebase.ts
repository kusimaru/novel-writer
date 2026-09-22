// Firebase(Firestore)による端末間同期。設定が空なら何もしない。
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  type Auth,
  type User
} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  setDoc,
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore'
import { db } from '../db'
import { onLocalChange, useStore, type Entity, type EntityKind } from '../store'
import type { SyncStatus } from '../types'

const KINDS: EntityKind[] = ['project', 'chapter', 'episode', 'memo']
const colName = (k: EntityKind) => k + 's'

let app: FirebaseApp | null = null
let auth: Auth | null = null
let fs: Firestore | null = null
let user: User | null = null
let unsubs: Unsubscribe[] = []
let offLocal: (() => void) | null = null
let queue = new Map<string, { kind: EntityKind; entity: Entity }>()
let queueTimer = 0
let inflight = 0

const setSync = (s: SyncStatus, m?: string) => useStore.getState().setSync(s, m)

export function isSyncEnabled() {
  return !!app
}

export function currentUser() {
  return user
}

export async function startSync(configJson: string) {
  await stopSync()
  const trimmed = configJson.trim()
  if (!trimmed) {
    setSync('off')
    return
  }
  let config: any
  try {
    config = parseConfig(trimmed)
  } catch (e) {
    setSync('error', 'Firebase設定のJSONが読めません')
    return
  }
  try {
    app = initializeApp(config)
    auth = getAuth(app)
    fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  } catch (e: any) {
    setSync('error', 'Firebase初期化に失敗: ' + (e?.message ?? e))
    return
  }
  setSync('connecting', 'ログイン確認中…')
  try {
    await getRedirectResult(auth)
  } catch {
    /* ignore */
  }
  onAuthStateChanged(auth, (u) => {
    user = u
    if (u) {
      subscribeAll(u)
    } else {
      unsubscribeAll()
      setSync('connecting', 'Googleでログインしてください')
    }
  })
}

export async function stopSync() {
  unsubscribeAll()
  if (offLocal) offLocal()
  offLocal = null
  queue.clear()
  clearTimeout(queueTimer)
  if (app) {
    try {
      await deleteApp(app)
    } catch {
      /* ignore */
    }
  }
  app = null
  auth = null
  fs = null
  user = null
  setSync('off')
}

export async function signIn() {
  if (!auth) return
  const provider = new GoogleAuthProvider()
  try {
    await signInWithPopup(auth, provider)
  } catch (e: any) {
    // iPad のスタンドアロンPWAなどポップアップが使えない環境
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment' || e?.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, provider)
    } else {
      setSync('error', 'ログイン失敗: ' + (e?.message ?? e))
    }
  }
}

export async function signOut() {
  if (!auth) return
  await fbSignOut(auth)
}

function parseConfig(text: string) {
  // JSON か、Firebaseコンソールが出す `const firebaseConfig = {...};` 形式の両方を受け付ける
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('no object')
  const src = m[0]
  try {
    return JSON.parse(src)
  } catch {
    // 非JSON(キーが引用符なし)→ 簡易変換
    const fixed = src
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}')
    return JSON.parse(fixed)
  }
}

function userCol(u: User, kind: EntityKind) {
  return collection(fs!, 'users', u.uid, colName(kind))
}

function subscribeAll(u: User) {
  unsubscribeAll()
  setSync('connecting', '同期を開始…')
  let firstSnapshots = 0
  const remoteSeen = new Map<EntityKind, Map<string, number>>()
  for (const kind of KINDS) {
    remoteSeen.set(kind, new Map())
    const unsub = onSnapshot(
      userCol(u, kind),
      { includeMetadataChanges: false },
      (snap) => {
        const seen = remoteSeen.get(kind)!
        snap.docChanges().forEach((ch) => {
          const data = ch.doc.data() as Entity
          seen.set(data.id, data.updatedAt)
          if (ch.type === 'removed') return
          if (ch.doc.metadata.hasPendingWrites) return // 自分の書き込み
          useStore.getState().applyRemote(kind, data)
        })
        if (!snap.metadata.fromCache && firstSnapshots < KINDS.length) {
          firstSnapshots++
          if (firstSnapshots === KINDS.length) {
            void reconcileLocal(u, remoteSeen)
          }
        }
        if (inflight === 0) setSync(navigator.onLine ? 'synced' : 'offline', u.email ?? '')
      },
      (err) => {
        setSync('error', '同期エラー: ' + err.message)
      }
    )
    unsubs.push(unsub)
  }
  offLocal = onLocalChange((kind, entity) => enqueue(kind, entity))
}

function unsubscribeAll() {
  unsubs.forEach((f) => f())
  unsubs = []
  if (offLocal) offLocal()
  offLocal = null
}

/** 接続直後: ローカルにしかない/ローカルの方が新しいものをアップロード */
async function reconcileLocal(u: User, remoteSeen: Map<EntityKind, Map<string, number>>) {
  const tables = { project: db.projects, chapter: db.chapters, episode: db.episodes, memo: db.memos } as const
  for (const kind of KINDS) {
    const rows = (await (tables[kind] as any).toArray()) as Entity[]
    const seen = remoteSeen.get(kind)!
    for (const row of rows) {
      const r = seen.get(row.id)
      if (r === undefined || r < row.updatedAt) enqueue(kind, row)
    }
  }
  void u
}

function enqueue(kind: EntityKind, entity: Entity) {
  if (!fs || !user) return
  queue.set(kind + ':' + entity.id, { kind, entity })
  setSync('syncing', '保存中…')
  clearTimeout(queueTimer)
  queueTimer = window.setTimeout(flushQueue, 800)
}

async function flushQueue() {
  if (!fs || !user) return
  const items = [...queue.values()]
  queue.clear()
  const u = user
  inflight += items.length
  await Promise.all(
    items.map(async ({ kind, entity }) => {
      try {
        const clean = JSON.parse(JSON.stringify(entity))
        await setDoc(doc(userCol(u, kind), entity.id), clean)
      } catch (e: any) {
        setSync('error', '保存エラー: ' + (e?.message ?? e))
      } finally {
        inflight--
      }
    })
  )
  if (inflight === 0 && queue.size === 0 && useStore.getState().syncStatus !== 'error') {
    setSync(navigator.onLine ? 'synced' : 'offline', u.email ?? '')
  }
}

window.addEventListener('online', () => {
  if (app && user && inflight === 0) setSync('synced', user.email ?? '')
})
window.addEventListener('offline', () => {
  if (app && user) setSync('offline', 'オフライン(再接続時に同期)')
})
