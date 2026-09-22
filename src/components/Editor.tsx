import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { selectCurrentEpisode, selectCurrentProject, useStore } from '../store'
import { MIN_FIGURE_WIDTH, removeFigure, setFigureWidth, splitBody } from '../utils/figures'
import { findMatches, type Match } from '../utils/search'

/** 空白・改行を記号つきで描画する(show=false のときは素の文字列) */
function renderChunk(text: string, show: boolean, keyPrefix: string): ReactNode {
  if (!show) return text
  return text.split(/([ 　\t\n])/).map((seg, j) => {
    const key = keyPrefix + j
    if (seg === ' ')
      return (
        <span key={key} className="inv-sp">
          {' '}
        </span>
      )
    if (seg === '　')
      return (
        <span key={key} className="inv-zsp">
          {'　'}
        </span>
      )
    if (seg === '\t')
      return (
        <span key={key} className="inv-tab">
          {'\t'}
        </span>
      )
    if (seg === '\n')
      return (
        <Fragment key={key}>
          <span className="inv-nl" />
          {'\n'}
        </Fragment>
      )
    return seg
  })
}

/** テキストエリアの裏に置く鏡。高さの自動調整、記号表示、検索ハイライトに使う */
function Mirror({ text, show, matches, current }: { text: string; show: boolean; matches: Match[]; current: number }) {
  const nodes: ReactNode[] = []
  let last = 0
  matches.forEach((m, i) => {
    if (m.start > last) nodes.push(<Fragment key={'t' + i}>{renderChunk(text.slice(last, m.start), show, 't' + i + '-')}</Fragment>)
    nodes.push(
      <mark key={'m' + i} className={'hl' + (i === current ? ' cur' : '')}>
        {renderChunk(text.slice(m.start, m.end), show, 'm' + i + '-')}
      </mark>
    )
    last = m.end
  })
  nodes.push(<Fragment key="tail">{renderChunk(text.slice(last), show, 'tail-')}</Fragment>)
  return (
    <div className={'grow-mirror' + (show ? ' show-inv' : '')} aria-hidden>
      {nodes}{' '}
    </div>
  )
}

const emWidth = (s: string, min = 4) => `${Math.max(min, Array.from(s).length + 1.5)}em`

export default function Editor() {
  const episode = useStore(selectCurrentEpisode)
  const settings = useStore((s) => s.settings)
  const search = useStore((s) => s.search)
  const memos = useStore((s) => s.memos)
  const updateEpisode = useStore((s) => s.updateEpisode)
  const updateChapter = useStore((s) => s.updateChapter)
  const setEditorCaret = useStore((s) => s.setEditorCaret)
  const chapter = useStore((s) => (episode ? s.chapters[episode.chapterId] : undefined))
  const project = useStore(selectCurrentProject)
  const chapters = useStore((s) => s.chapters)
  const episodes = useStore((s) => s.episodes)
  const setSettings = useStore((s) => s.setSettings)
  const createEpisode = useStore((s) => s.createEpisode)
  const scrollRef = useRef<HTMLDivElement>(null)
  const subtitleRef = useRef<HTMLInputElement>(null)
  const chSubRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [editingSubtitle, setEditingSubtitle] = useState(false)
  const [editingChSub, setEditingChSub] = useState(false)

  // 作品内の話を章順・話順に並べた一覧(前後の話への移動用)
  const flat = useMemo(
    () => (project ? project.chapterOrder.flatMap((cid) => chapters[cid]?.episodeOrder ?? []) : []),
    [project, chapters]
  )
  const idx = episode ? flat.indexOf(episode.id) : -1
  const prevId = idx > 0 ? flat[idx - 1] : null
  const nextId = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null
  const goTo = (id: string) => setSettings({ currentEpisodeId: id })
  const label = (id: string) => {
    const e = episodes[id]
    if (!e) return ''
    return e.subtitle ? `${e.title}「${e.subtitle}」` : e.title
  }

  // 本文をテキスト区間と挿絵に分解
  const body = episode?.body ?? ''
  const segments = useMemo(() => splitBody(body), [body])

  // 検索の一致箇所(本文全体の位置)
  const matches = useMemo(
    () => (search.open && episode ? findMatches(body, search.query, search.caseSensitive) : []),
    [search.open, search.query, search.caseSensitive, body, episode]
  )
  const currentMatch = matches.length ? Math.min(search.current, matches.length - 1) : -1

  // 話を切り替えたら先頭へ
  useEffect(() => {
    if (!search.open) scrollRef.current?.scrollTo({ top: 0 })
    setEditingSubtitle(false)
    setEditingChSub(false)
    setEditorCaret(-1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.id])

  useEffect(() => {
    if (editingSubtitle) subtitleRef.current?.focus()
  }, [editingSubtitle])
  useEffect(() => {
    if (editingChSub) chSubRef.current?.focus()
  }, [editingChSub])

  // 検索の現在位置を選択し、画面内に表示
  useEffect(() => {
    if (!search.open || currentMatch < 0) return
    const m = matches[currentMatch]
    const seg = segments.find((s) => s.type === 'text' && m.start >= s.start && m.end <= s.end)
    if (seg) {
      const ta = wrapRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-start="${seg.start}"]`)
      if (ta && document.activeElement !== ta) {
        try {
          ta.setSelectionRange(m.start - seg.start, m.end - seg.start)
        } catch {
          /* ignore */
        }
      }
    }
    const el = wrapRef.current?.querySelector('mark.cur') as HTMLElement | null
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [search.open, search.nonce, currentMatch, matches, segments, episode?.id])

  if (!episode) {
    return (
      <div className="editor-empty">
        <p>左のリストから話を選ぶか、新しく作成してください。</p>
      </div>
    )
  }

  const fontFamily =
    settings.fontFamily === 'serif'
      ? '"Hiragino Mincho ProN", "Yu Mincho", "游明朝", "Noto Serif JP", "MS Mincho", serif'
      : '"Hiragino Sans", "Yu Gothic", "游ゴシック", "Noto Sans JP", Meiryo, sans-serif'

  const hasSubtitle = !!episode.subtitle
  const textSegCount = segments.filter((s) => s.type === 'text').length

  // 区間の編集 → 本文全体を組み立て直す
  const editSegment = (start: number, end: number, text: string) => {
    updateEpisode(episode.id, { body: body.slice(0, start) + text + body.slice(end) })
  }
  const recordCaret = (e: React.SyntheticEvent<HTMLTextAreaElement>, start: number) => {
    const ta = e.currentTarget
    setEditorCaret(start + ta.selectionStart)
  }

  return (
    <div className="page-scroll" ref={scrollRef}>
      <div className="page" style={{ fontFamily, fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>
        {chapter && (
          <div className="page-chapter">
            <input
              className="chapter-input"
              value={chapter.title}
              placeholder="章の名前"
              style={{ width: emWidth(chapter.title || '章の名前') }}
              onChange={(e) => updateChapter(chapter.id, { title: e.target.value })}
              title="章の名前(クリックして編集)"
            />
            {chapter.subtitle || editingChSub ? (
              <input
                ref={chSubRef}
                className="chapter-input sub"
                value={chapter.subtitle ?? ''}
                placeholder="章のサブタイトル"
                style={{ width: emWidth(chapter.subtitle || '章のサブタイトル', 8) }}
                onChange={(e) => updateChapter(chapter.id, { subtitle: e.target.value })}
                onBlur={() => setEditingChSub(false)}
              />
            ) : (
              <button className="subtitle-add inline" onClick={() => setEditingChSub(true)}>
                ＋ 章のサブタイトルを追加
              </button>
            )}
          </div>
        )}
        <input
          className="page-title"
          value={episode.title}
          placeholder="話のタイトル"
          onChange={(e) => updateEpisode(episode.id, { title: e.target.value })}
        />
        {hasSubtitle || editingSubtitle ? (
          <input
            ref={subtitleRef}
            className="page-subtitle"
            value={episode.subtitle ?? ''}
            placeholder="サブタイトルを入力"
            onChange={(e) => updateEpisode(episode.id, { subtitle: e.target.value })}
            onBlur={() => setEditingSubtitle(false)}
          />
        ) : (
          <button className="subtitle-add" onClick={() => setEditingSubtitle(true)}>
            ＋ サブタイトルを追加
          </button>
        )}

        <div className="body-blocks" ref={wrapRef}>
          {segments.map((seg, i) => {
            if (seg.type === 'image') {
              const memo = memos[seg.memoId]
              const occurrence = segments.slice(0, i).filter((s) => s.type === 'image' && s.memoId === seg.memoId).length
              // 右下のつまみをドラッグして幅(%)を変える。幅は本文の目印に記録する
              const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
                e.preventDefault()
                const handle = e.currentTarget
                const fig = handle.parentElement as HTMLElement
                const container = wrapRef.current!
                handle.setPointerCapture(e.pointerId)
                let pct = seg.width
                const move = (ev: PointerEvent) => {
                  const cw = container.getBoundingClientRect().width
                  const r = fig.getBoundingClientRect()
                  const centerX = r.left + r.width / 2
                  pct = Math.round(Math.max(MIN_FIGURE_WIDTH, Math.min(100, ((ev.clientX - centerX) * 2 * 100) / cw)))
                  fig.style.width = pct + '%'
                  fig.dataset.pct = String(pct)
                }
                const up = () => {
                  handle.removeEventListener('pointermove', move)
                  handle.removeEventListener('pointerup', up)
                  handle.removeEventListener('pointercancel', up)
                  delete fig.dataset.pct
                  if (pct !== seg.width) updateEpisode(episode.id, { body: setFigureWidth(body, seg.memoId, occurrence, pct) })
                }
                handle.addEventListener('pointermove', move)
                handle.addEventListener('pointerup', up)
                handle.addEventListener('pointercancel', up)
              }
              return (
                <figure key={'img' + i + seg.memoId} className="page-figure" style={{ width: seg.width + '%' }}>
                  {memo?.image ? (
                    <img src={memo.image} alt={memo.title || '挿絵'} draggable={false} />
                  ) : (
                    <div className="figure-missing">(画像が見つかりません。メモが削除された可能性があります)</div>
                  )}
                  {memo?.title && <figcaption>{memo.title}</figcaption>}
                  <button
                    className="figure-remove"
                    title="この位置から挿絵を外す(メモの画像は残ります)"
                    onClick={() => updateEpisode(episode.id, { body: removeFigure(body, seg.memoId, occurrence) })}
                  >
                    ✕ 挿絵を外す
                  </button>
                  {memo?.image && <div className="figure-resize" title="ドラッグして大きさを変更" onPointerDown={onResizeStart} />}
                </figure>
              )
            }
            const segMatches = matches
              .filter((m) => m.start >= seg.start && m.end <= seg.end)
              .map((m) => ({ start: m.start - seg.start, end: m.end - seg.start }))
            const curLocal = currentMatch >= 0 ? segMatches.findIndex((m) => m.start + seg.start === matches[currentMatch].start) : -1
            return (
              <div className={'grow-wrap' + (textSegCount === 1 ? ' only' : '')} key={'t' + seg.start}>
                <Mirror text={seg.text} show={settings.showInvisibles} matches={segMatches} current={curLocal} />
                <textarea
                  className="page-body"
                  data-start={seg.start}
                  value={seg.text}
                  placeholder={i === 0 ? 'ここに本文を書きます…' : ''}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  onChange={(e) => editSegment(seg.start, seg.end, e.target.value)}
                  onSelect={(e) => recordCaret(e, seg.start)}
                  onFocus={(e) => recordCaret(e, seg.start)}
                  onKeyUp={(e) => recordCaret(e, seg.start)}
                  onClick={(e) => recordCaret(e, seg.start)}
                />
              </div>
            )
          })}
        </div>

        <nav className="page-nav">
          {prevId ? (
            <button className="nav-btn" onClick={() => goTo(prevId)}>
              ← {label(prevId)}
            </button>
          ) : (
            <span />
          )}
          {nextId ? (
            <button className="nav-btn next" onClick={() => goTo(nextId)}>
              {label(nextId)} →
            </button>
          ) : (
            <button className="nav-btn next add" onClick={() => goTo(createEpisode(episode.chapterId))}>
              ＋ 次の話を追加
            </button>
          )}
        </nav>
      </div>
    </div>
  )
}
