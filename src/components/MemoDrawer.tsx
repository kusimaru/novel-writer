import { useEffect, useMemo, useRef, useState } from 'react'
import { selectCurrentProject, useStore } from '../store'
import type { Memo } from '../types'
import HandwritingCanvas, { type PenMode } from './HandwritingCanvas'

const COLORS = ['#2b2a28', '#c0392b', '#1f5fbf', '#1e8449', '#8e44ad', '#e67e22']

export default function MemoDrawer() {
  const project = useStore(selectCurrentProject)
  const memos = useStore((s) => s.memos)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const createMemo = useStore((s) => s.createMemo)
  const [mode, setMode] = useState<PenMode>('off')

  const list = useMemo(
    () =>
      Object.values(memos)
        .filter((m) => m.projectId === project?.id)
        .sort((a, b) => a.order - b.order),
    [memos, project?.id]
  )

  return (
    <div className="drawer-inner">
      <div className="drawer-head">
        <span className="drawer-title">メモ</span>
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
        <button className="btn" onClick={() => project && createMemo(project.id)} disabled={!project}>
          ＋ 新規
        </button>
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

      <div className="memo-list">
        {list.length === 0 && (
          <div className="memo-empty">
            アイデアや設定、思いついたことを自由に書き留める場所です。
            <br />
            「＋ 新規」でメモを追加し、「ペン」で手書きもできます。
          </div>
        )}
        {list.map((m) => (
          <MemoCard key={m.id} memo={m} mode={mode} />
        ))}
      </div>
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
            <div className="grow-wrap memo-grow" data-value={memo.text + '\n'}>
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
