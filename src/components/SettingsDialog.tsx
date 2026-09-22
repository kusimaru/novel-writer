import { useRef, useState } from 'react'
import { selectCurrentProject, useStore, type ExportData } from '../store'
import { signIn, signOut } from '../sync/firebase'
import { syncNow, testGithub } from '../sync/github'
import { applySyncSettings, stopAllSync } from '../sync'
import type { Settings } from '../types'

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const syncStatus = useStore((s) => s.syncStatus)
  const syncMessage = useStore((s) => s.syncMessage)
  const project = useStore(selectCurrentProject)
  const st = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [ghMsg, setGhMsg] = useState('')
  // 同期設定は「接続」を押すまで確定しない
  const [draft, setDraft] = useState<Pick<Settings, 'syncProvider' | 'githubRepo' | 'githubBranch' | 'githubToken' | 'githubDir' | 'firebaseConfig'>>({
    syncProvider: settings.syncProvider,
    githubRepo: settings.githubRepo,
    githubBranch: settings.githubBranch,
    githubToken: settings.githubToken,
    githubDir: settings.githubDir,
    firebaseConfig: settings.firebaseConfig
  })
  const patch = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }))

  const exportJson = async () => {
    const data = await st.exportData()
    download(`執筆ノート-バックアップ-${stamp()}.json`, JSON.stringify(data, null, 1), 'application/json')
  }

  const exportTxt = () => {
    if (!project) return
    const lines: string[] = [project.title, '']
    for (const chId of project.chapterOrder) {
      const ch = st.chapters[chId]
      if (!ch) continue
      lines.push(ch.title, '')
      for (const eid of ch.episodeOrder) {
        const ep = st.episodes[eid]
        if (!ep) continue
        lines.push(ep.title, '', ep.body, '', '')
      }
    }
    download(`${project.title}-${stamp()}.txt`, lines.join('\n'), 'text/plain;charset=utf-8')
  }

  const importJson = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as ExportData
      if (!data.projects || !data.episodes) throw new Error('形式が違います')
      if (!window.confirm(`${data.projects.length} 作品 / ${data.episodes.length} 話を読み込みます。同じIDのデータは上書きされます。よろしいですか?`)) return
      await st.importData(data)
      setMsg('読み込みました')
    } catch (e: any) {
      setMsg('読み込み失敗: ' + (e?.message ?? e))
    }
  }

  const connect = async () => {
    setSettings(draft)
    setGhMsg('')
    await applySyncSettings({ ...settings, ...draft })
  }

  const disconnect = async () => {
    patch({ syncProvider: 'none' })
    setSettings({ syncProvider: 'none' })
    await stopAllSync()
  }

  const test = async () => {
    setGhMsg('確認中…')
    try {
      setGhMsg(await testGithub({ ...settings, ...draft }))
    } catch (e: any) {
      setGhMsg('エラー: ' + (e?.message ?? e))
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>設定</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <section>
            <h3>表示</h3>
            <label className="row">
              <span>フォント</span>
              <select value={settings.fontFamily} onChange={(e) => setSettings({ fontFamily: e.target.value as any })}>
                <option value="serif">明朝</option>
                <option value="sans">ゴシック</option>
              </select>
            </label>
            <label className="row">
              <span>文字サイズ {settings.fontSize}px</span>
              <input type="range" min={13} max={26} value={settings.fontSize} onChange={(e) => setSettings({ fontSize: Number(e.target.value) })} />
            </label>
            <label className="row">
              <span>行間 {settings.lineHeight.toFixed(1)}</span>
              <input type="range" min={1.4} max={2.6} step={0.1} value={settings.lineHeight} onChange={(e) => setSettings({ lineHeight: Number(e.target.value) })} />
            </label>
          </section>

          <section>
            <h3>文字数カウント</h3>
            <label className="row">
              <span>数え方</span>
              <select value={settings.countMode} onChange={(e) => setSettings({ countMode: e.target.value as any })}>
                <option value="exclude-space">空白・改行を除く</option>
                <option value="all">改行のみ除く(空白は数える)</option>
              </select>
            </label>
          </section>

          <section>
            <h3>端末間の同期</h3>
            <label className="row">
              <span>同期方式</span>
              <select value={draft.syncProvider} onChange={(e) => patch({ syncProvider: e.target.value as any })}>
                <option value="none">同期しない(この端末のみ)</option>
                <option value="github">GitHub(非公開リポジトリ)</option>
                <option value="firebase">Firebase(Firestore)</option>
              </select>
            </label>

            {draft.syncProvider === 'github' && (
              <>
                <p className="help">
                  非公開リポジトリに、話・メモごとの JSON をコミットとして保存します。リアルタイムではなく、起動時・画面に戻ったとき・1分ごとに取り込み、変更は数秒後にまとめて送信します。
                  トークンは GitHub の「Fine-grained personal access tokens」で、対象リポジトリだけ・Contents: Read and write のみで発行してください(手順は README)。
                </p>
                <label className="row">
                  <span>リポジトリ</span>
                  <input className="text" placeholder="owner/repo" value={draft.githubRepo} onChange={(e) => patch({ githubRepo: e.target.value })} spellCheck={false} />
                </label>
                <label className="row">
                  <span>ブランチ</span>
                  <input className="text" placeholder="main" value={draft.githubBranch} onChange={(e) => patch({ githubBranch: e.target.value })} spellCheck={false} />
                </label>
                <label className="row">
                  <span>保存先フォルダ</span>
                  <input className="text" placeholder="data" value={draft.githubDir} onChange={(e) => patch({ githubDir: e.target.value })} spellCheck={false} />
                </label>
                <label className="row">
                  <span>アクセストークン</span>
                  <input
                    className="text"
                    type="password"
                    placeholder="github_pat_…"
                    value={draft.githubToken}
                    onChange={(e) => patch({ githubToken: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <div className="row btns">
                  <button className="btn" onClick={test} disabled={!draft.githubRepo || !draft.githubToken}>
                    接続テスト
                  </button>
                  <button className="btn primary" onClick={connect} disabled={!draft.githubRepo || !draft.githubToken}>
                    この設定で同期を開始
                  </button>
                  {settings.syncProvider === 'github' && syncStatus !== 'off' && (
                    <button className="btn" onClick={() => void syncNow()}>
                      今すぐ同期
                    </button>
                  )}
                </div>
                {ghMsg && <p className="help">{ghMsg}</p>}
              </>
            )}

            {draft.syncProvider === 'firebase' && (
              <>
                <p className="help">
                  自分の Firebase プロジェクトを使ってリアルタイム同期します。Firebase コンソールで Web アプリを追加し、表示される
                  <code>firebaseConfig</code> をそのまま貼り付けてください(Authentication で Google ログイン、Firestore を有効化しておく必要があります。手順は README)。
                </p>
                <textarea
                  className="config-input"
                  rows={6}
                  placeholder={'{\n  "apiKey": "...",\n  "authDomain": "...",\n  "projectId": "...",\n  ...\n}'}
                  value={draft.firebaseConfig}
                  onChange={(e) => patch({ firebaseConfig: e.target.value })}
                  spellCheck={false}
                />
                <div className="row btns">
                  <button className="btn primary" onClick={connect} disabled={!draft.firebaseConfig.trim()}>
                    この設定で同期を開始
                  </button>
                  {settings.syncProvider === 'firebase' && syncStatus === 'connecting' && (
                    <button className="btn" onClick={signIn}>
                      Googleでログイン
                    </button>
                  )}
                  {settings.syncProvider === 'firebase' && (syncStatus === 'synced' || syncStatus === 'syncing' || syncStatus === 'offline') && (
                    <button className="btn" onClick={signOut}>
                      ログアウト
                    </button>
                  )}
                </div>
              </>
            )}

            {draft.syncProvider === 'none' && settings.syncProvider !== 'none' && (
              <div className="row btns">
                <button className="btn" onClick={disconnect}>
                  同期を停止する
                </button>
              </div>
            )}

            <p className={'help status-' + syncStatus}>
              状態: {syncStatus} {syncMessage && `— ${syncMessage}`}
            </p>
          </section>

          <section>
            <h3>バックアップ・書き出し</h3>
            <div className="row btns">
              <button className="btn" onClick={exportJson}>
                すべてをJSONで保存
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                JSONを読み込む
              </button>
              <button className="btn" onClick={exportTxt} disabled={!project}>
                この作品をテキストで書き出す
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importJson(f)
                  e.target.value = ''
                }}
              />
            </div>
            {msg && <p className="help">{msg}</p>}
            <p className="help">
              同期を使わない場合は、JSON を iCloud Drive や Google ドライブに保存して、もう一方の端末で読み込むことでもデータを移せます。
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
