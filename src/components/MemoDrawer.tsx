import { useEffect, useMemo, useRef, useState } from 'react'
import { selectCurrentEpisode, selectCurrentProject, useStore } from '../store'
import type { Episode, Memo } from '../types'
import HandwritingCanvas, { type PenMode } from './HandwritingCanvas'

const COLORS = ['#2b2a28', '#c0392b', '#1f5fbf', '#1e8449', '#8e44ad', '#e67e22']

const epLabel = (e: Episode) => (e.subtitle ? `${e.title}「${e.subtitle}」` : e.title)
const byOrder = (a: Memo, b: Memo) => a.order - b.order

export default function MemoDrawer() {
  const project = useStore(selectCurrentProject)
  const episode = useStore(selectCurrentEpisode)
  const memos = useStore((s) => s.memos)
  const chapters = useStore((s) => s.chapters)
  const episodes = useStore((s) => s.episodes)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const createMemo = useStore((s) => s.createMemo)
  const [mode, setMode] = useState<PenMode>('off')
  const [view, setView] = useState<'episode' | 'all'>('episode')

  const projectMemos = useMemo(() => Object.values(memos).filter((m) => m.projectId === project?.id), [memos, project?.id])

  // この話のメモ
  const list = useMemo(
    () => projectMemos.filter((m) => m.episodeId === episode?.id).sort(byOrder),
    [projectMemos, episode?.id]
  )

  // 全話一覧: 章順・話順にまとめる。旧データ(話に属さないメモ)は「作品共通」
  const groups = useMemo(() => {
    if (!project) return []
    const out: { key: string; label: string; episodeId?: string; memos: Memo[] }[] = []
    for (const cid of project.chapterOrder) {
      const ch = chapters[cid]
      if (!ch) continue
      for (const eid of ch.episodeOrder) {
        const ep = episodes[eid]
        if (!ep) continue
        const ms = projectMemos.filter((m) => m.episodeId === eid).sort(byOrder)
        if (ms.length) out.push({ key: eid, label: `${ch.title}　${epLabel(ep)}`, episodeId: eid, memos: ms })
      }
    }
    const common = projectMemos.filter((m) => !m.episodeId || !episodes[m.episodeId]).sort(byOrder)
    if (common.length) out.push({ key: 'common', label: '作品共通(話に属さないメモ)', memos: common })
    return out
  }, [project, chapters, episodes, projectMemos])

  // メモ欄を開いたとき、この話にメモが1枚もなければ自動で作る
  const autoCreated = useRef<string | null>(null)
  useEffect(() => {
    if (!settings.drawerOpen || !project || !episode || view !== 'episode') return
    if (list.length > 0 || autoCreated.current === episode.id) return
    // StrictMode などで effect が二重に走っても重複して作らないよう、直前に最新の状態で再確認
    const exists = Object.values(useStore.getState().memos).some((m) => m.episodeId === episode.id)
    if (exists) return
    autoCreated.current = episode.id
    createMemo(project.id, episode.id)
  }, [settings.drawerOpen, project, episode, list.length, createMemo, view])

  const totalCount = projectMemos.length

  return (
    <div className="drawer-inner">
      <div className="drawer-head">
        <div className="seg view-seg">
          <button className={view === 'episode' ? 'on' : ''} onClick={() => setView('episode')} title="いま開いている話のメモ">
            この話
          </button>
          <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')} title="作品内の全話のメモを一覧">
            全話一覧{totalCount ? `(${totalCount})` : ''}
          </button>
        </div>
        <div className="seg">
          <button className={mode === 'off' ? 'on' : ''} onClick={() => setMode('off')} title="テキスト入力">
            文字
          </button>
          <button className={mode === 'pen' ? 'on' : ''} onClick={() => setMode('pen')} title="ペンで手書き">
            ペン
          </button>
          <button className={mode === 'eraser' ? 'on' : ''} onClick={() => setMode('eraser')} title="ストロークを消す">
            消しゴム
          </button>
        </div>
        {view === 'episode' && (
          <button className="btn" onClick={() => project && episode && createMemo(project.id, episode.id)} disabled={!project || !episode}>
            ＋ 新規
          </button>
        )}
        <button className="icon-btn" onClick={() => setSettings({ drawerOpen: false })} aria-label="閉じる">
          ✕
        </button>
      </div>

      {mode !== 'off' && (
        <div className="pen-tools">
          {COLORS.map((c) => (
            <button
              key={c}
              className={'swatch' + (settings.penColor === c ? ' on' : '')}
              style={{ background: c }}
              onClick={() => setSettings({ penColor: c })}
              aria-label={c}
            />
          ))}
          <input
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={settings.penWidth}
            onChange={(e) => setSettings({ penWidth: Number(e.target.value) })}
            title="太さ"
          />
          <label className="chk" title="指でのタッチを無視し、ペン(Apple Pencilなど)とマウスだけで描く">
            <input type="checkbox" checked={settings.penOnly} onChange={(e) => setSettings({ penOnly: e.target.checked })} />
            ペンのみ
          </label>
        </div>
      )}

      {view === 'episode' ? (
        <div className="memo-list">
          {episode && <div className="memo-episode-label">{epLabel(episode)} のメモ</div>}
          {!episode && <div className="memo-empty-text">話を開くと、その話のメモがここに表示されます。</div>}
          {episode && list.length === 0 && project && (
            <button className="memo-empty" onClick={() => createMemo(project.id, episode.id)}>
              ここを押してメモを作る
              <br />
              <small>この話についてのアイデアや設定を書き留める場所です。「ペン」で手書きもできます。</small>
            </button>
          )}
          {list.map((m) => (
            <MemoCard key={m.id} memo={m} mode={mode} />
          ))}
        </div>
      ) : (
        <div className="memo-list">
          {groups.length === 0 && <div className="memo-empty-text">まだメモがありません。</div>}
          {groups.map((g) => (
            <section key={g.key} className="memo-group">
              <button
                className={'memo-group-head' + (g.episodeId ? '' : ' static')}
                onClick={() => {
                  if (g.episodeId) {
                    setSettings({ currentEpisodeId: g.episodeId })
                    setView('episode')
                  }
                }}
                title={g.episodeId ? 'この話を開く' : undefined}
              >
                {g.label}
                <span className="count">{g.memos.length}</span>
              </button>
              {g.memos.map((m) => (
                <MemoCard key={m.id} memo={m} mode={mode} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function MemoCard({ memo, mode }: { memo: Memo; mode: PenMode }) {
  const settings = useStore((s) => s.settings)
  const updateMemo = useStore((s) => s.updateMemo)
  const deleteMemo = useStore((s) => s.deleteMemo)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [collapsed])

  // 高さの手動リサイズ
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = memo.height
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const h = Math.max(120, Math.round(startH + (ev.clientY - startY)))
      updateMemo(memo.id, { height: h })
    }
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  return (
    <div className={'memo-card' + (collapsed ? ' collapsed' : '')}>
      <div className="memo-head">
        <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} aria-label="折りたたみ">
          {collapsed ? '▸' : '▾'}
        </button>
        <input
          className="memo-title"
          value={memo.title}
          placeholder="メモのタイトル"
          onChange={(e) => updateMemo(memo.id, { title: e.target.value })}
        />
        {memo.strokes.length > 0 && (
          <button
            className="icon-btn"
            title="手書きを1画戻す"
            onClick={() => updateMemo(memo.id, { strokes: memo.strokes.slice(0, -1) })}
          >
            ↶
          </button>
        )}
        <button
          className="icon-btn"
          title="メモを削除"
          onClick={() => {
            if (window.confirm('このメモを削除しますか?')) deleteMemo(memo.id)
          }}
        >
          🗑
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="memo-body" ref={bodyRef} style={{ minHeight: memo.height }}>
            <div className="grow-wrap memo-grow" data-value={memo.text}>
              <textarea
                className="memo-text"
                value={memo.text}
                placeholder="思いついたことを自由に…"
                spellCheck={false}
                readOnly={mode !== 'off'}
                onChange={(e) => updateMemo(memo.id, { text: e.target.value })}
              />
            </div>
            <HandwritingCanvas
              strokes={memo.strokes}
              width={size.w}
              height={size.h}
              mode={mode}
              color={settings.penColor}
              penWidth={settings.penWidth}
              penOnly={settings.penOnly}
              onChange={(strokes) => updateMemo(memo.id, { strokes })}
            />
          </div>
          <div className="memo-resize" onPointerDown={onResizeStart} title="ドラッグして高さを変更">
            ⋯
          </div>
        </>
      )}
    </div>
  )
}
