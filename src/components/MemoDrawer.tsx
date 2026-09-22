import { useEffect, useMemo, useRef, useState } from 'react'
import { selectCurrentEpisode, selectCurrentProject, useStore } from '../store'
import type { Episode, Memo } from '../types'
import { insertFigure } from '../utils/figures'
import { fileToDataUrl } from '../utils/image'
import HandwritingCanvas, { type PenMode } from './HandwritingCanvas'
import Menu from './Menu'

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
  const fileRef = useRef<HTMLInputElement>(null)

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

  const commonMemos = useMemo(() => projectMemos.filter((m) => !m.episodeId || !episodes[m.episodeId]).sort(byOrder), [projectMemos, episodes])
  const [showCommon, setShowCommon] = useState(false)

  // メモ欄を開いたとき・話を切り替えたとき、その話にメモが1枚もなければ自動で作る
  // (メモを移動・削除して空になっただけでは作らない)
  const autoCreated = useRef<string | null>(null)
  const episodeId = episode?.id
  const projectId = project?.id
  useEffect(() => {
    if (!settings.drawerOpen || !projectId || !episodeId || view !== 'episode') return
    if (autoCreated.current === episodeId) return
    const exists = Object.values(useStore.getState().memos).some((m) => m.episodeId === episodeId && !m.deleted)
    if (exists) return
    autoCreated.current = episodeId
    createMemo(projectId, episodeId)
  }, [settings.drawerOpen, projectId, episodeId, createMemo, view])

  const addImages = async (files: FileList | null) => {
    if (!files || !project) return
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      try {
        const data = await fileToDataUrl(f)
        createMemo(project.id, episode?.id, { image: data, height: 80 })
      } catch (e) {
        window.alert('画像を読み込めませんでした: ' + f.name)
      }
    }
  }

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
          <>
            <button className="btn" onClick={() => project && episode && createMemo(project.id, episode.id)} disabled={!project || !episode}>
              ＋ 新規
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={!project} title="写真や画像をメモとして追加">
              ＋ 画像
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addImages(e.target.files)
                e.target.value = ''
              }}
            />
          </>
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
          <SortableMemos memos={list} mode={mode} />
          {commonMemos.length > 0 && (
            <section className="memo-group common">
              <button className="memo-group-head static" onClick={() => setShowCommon((v) => !v)} title="どの話にも属さないメモ">
                {showCommon ? '▾' : '▸'} 作品共通のメモ
                <span className="count">{commonMemos.length}</span>
              </button>
              {showCommon && <SortableMemos memos={commonMemos} mode={mode} />}
            </section>
          )}
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
              <SortableMemos memos={g.memos} mode={mode} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/** 同じグループ内のメモを、つまみ(⠿)のドラッグで並べ替える */
function SortableMemos({ memos, mode }: { memos: Memo[]; mode: PenMode }) {
  const updateMemo = useStore((s) => s.updateMemo)
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null)

  const onHandleDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const from = memos.findIndex((m) => m.id === id)
    let over = from
    setDrag({ id, over })
    const computeOver = (clientY: number) => {
      const cards = listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLElement>(':scope > .memo-card')) : []
      let idx = cards.length
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect()
        if (clientY < r.top + r.height / 2) {
          idx = i
          break
        }
      }
      return idx
    }
    const move = (ev: PointerEvent) => {
      const idx = computeOver(ev.clientY)
      if (idx !== over) {
        over = idx
        setDrag({ id, over: idx })
      }
      // 端に近づいたら一覧をスクロール
      const list = listRef.current?.closest('.memo-list') as HTMLElement | null
      if (list) {
        const r = list.getBoundingClientRect()
        if (ev.clientY < r.top + 40) list.scrollTop -= 8
        else if (ev.clientY > r.bottom - 40) list.scrollTop += 8
      }
    }
    const up = (ev: PointerEvent) => {
      if (ev.type === 'pointerup') over = computeOver(ev.clientY)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      setDrag(null)
      let to = over > from ? over - 1 : over
      to = Math.max(0, Math.min(memos.length - 1, to))
      if (to === from) return
      const ids = memos.map((m) => m.id)
      ids.splice(from, 1)
      ids.splice(to, 0, id)
      ids.forEach((mid, i) => {
        const m = memos.find((x) => x.id === mid)!
        if (m.order !== i) updateMemo(mid, { order: i })
      })
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  return (
    <div className="memo-cards" ref={listRef}>
      {memos.map((m, i) => (
        <MemoCard
          key={m.id}
          memo={m}
          mode={mode}
          dragging={drag?.id === m.id}
          dropBefore={drag !== null && drag.over === i}
          onHandleDown={(e) => onHandleDown(e, m.id)}
        />
      ))}
      {drag !== null && drag.over === memos.length && <div className="drop-line" />}
    </div>
  )
}

function MemoCard({
  memo,
  mode,
  dragging,
  dropBefore,
  onHandleDown
}: {
  memo: Memo
  mode: PenMode
  dragging: boolean
  dropBefore: boolean
  onHandleDown: (e: React.PointerEvent<HTMLElement>) => void
}) {
  const settings = useStore((s) => s.settings)
  const updateMemo = useStore((s) => s.updateMemo)
  const updateEpisode = useStore((s) => s.updateEpisode)
  const deleteMemo = useStore((s) => s.deleteMemo)
  const moveMemo = useStore((s) => s.moveMemo)
  const episode = useStore(selectCurrentEpisode)
  const project = useStore(selectCurrentProject)
  const chapters = useStore((s) => s.chapters)
  const episodes = useStore((s) => s.episodes)
  const [picking, setPicking] = useState(false)
  const isCommon = !memo.episodeId || !episodes[memo.episodeId]
  const isCurrent = !!episode && memo.episodeId === episode.id
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
      const h = Math.max(memo.image ? 40 : 120, Math.round(startH + (ev.clientY - startY)))
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

  // 画像を本文のカーソル位置に挿絵として入れる
  const insertIntoBody = () => {
    if (!episode || !memo.image) return
    const caret = useStore.getState().editorCaret
    const pos = caret >= 0 ? caret : episode.body.length
    updateEpisode(episode.id, { body: insertFigure(episode.body, pos, memo.id) })
  }

  return (
    <>
      {dropBefore && <div className="drop-line" />}
      <div className={'memo-card' + (collapsed ? ' collapsed' : '') + (dragging ? ' dragging' : '') + (memo.image ? ' has-image' : '')}>
        <div className="memo-head">
          <span className="drag-handle" title="ドラッグして並べ替え" onPointerDown={onHandleDown}>
            ⠿
          </span>
          <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} aria-label="折りたたみ">
            {collapsed ? '▸' : '▾'}
          </button>
          <input
            className="memo-title"
            value={memo.title}
            placeholder={memo.image ? '画像の説明(挿絵のキャプションになります)' : 'メモのタイトル'}
            onChange={(e) => updateMemo(memo.id, { title: e.target.value })}
          />
          {memo.image && (
            <button className="btn tool" title="本文のカーソル位置に挿絵として挿入" onClick={insertIntoBody} disabled={!episode}>
              本文に挿入
            </button>
          )}
          {memo.strokes.length > 0 && (
            <button
              className="icon-btn"
              title="手書きを1画戻す"
              onClick={() => updateMemo(memo.id, { strokes: memo.strokes.slice(0, -1) })}
            >
              ↶
            </button>
          )}
          <Menu
            items={[
              { label: 'この話のメモにする', disabled: !episode || isCurrent, onClick: () => episode && moveMemo(memo.id, episode.id) },
              { label: '作品共通にする', disabled: isCommon, onClick: () => moveMemo(memo.id, undefined) },
              { label: '別の話へ移す…', onClick: () => setPicking(true) },
              ...(memo.image ? [{ label: '本文に挿絵として挿入', disabled: !episode, onClick: insertIntoBody }] : []),
              {
                label: 'メモを削除',
                danger: true,
                onClick: () => {
                  if (window.confirm('このメモを削除しますか?' + (memo.image ? '\n(本文に挿入した挿絵も表示されなくなります)' : ''))) deleteMemo(memo.id)
                }
              }
            ]}
          />
        </div>
        {picking && project && (
          <div className="memo-move">
            <span>移動先:</span>
            <select
              autoFocus
              defaultValue={isCommon ? '' : memo.episodeId}
              onChange={(e) => {
                moveMemo(memo.id, e.target.value || undefined)
                setPicking(false)
              }}
            >
              <option value="">作品共通(話に属さない)</option>
              {project.chapterOrder.map((cid) => {
                const ch = chapters[cid]
                if (!ch) return null
                return (
                  <optgroup key={cid} label={ch.title}>
                    {ch.episodeOrder.map((eid) => {
                      const ep = episodes[eid]
                      return ep ? (
                        <option key={eid} value={eid}>
                          {epLabel(ep)}
                        </option>
                      ) : null
                    })}
                  </optgroup>
                )
              })}
            </select>
            <button className="icon-btn" onClick={() => setPicking(false)} aria-label="やめる">
              ✕
            </button>
          </div>
        )}
        {isCommon && <div className="memo-common-note">作品共通のメモ(どの話にも属していません)</div>}
        {!collapsed && (
          <>
            <div className="memo-body" ref={bodyRef} style={{ minHeight: memo.height }}>
              {memo.image && <img className="memo-image" src={memo.image} alt={memo.title || '画像'} draggable={false} />}
              <div className="grow-wrap memo-grow" data-value={memo.text}>
                <textarea
                  className="memo-text"
                  value={memo.text}
                  placeholder={memo.image ? '画像についてのメモ…' : '思いついたことを自由に…'}
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
    </>
  )
}
