import { useEffect, useMemo, useRef } from 'react'
import { selectCurrentEpisode, selectCurrentProject, useStore } from '../store'

export default function Editor() {
  const episode = useStore(selectCurrentEpisode)
  const settings = useStore((s) => s.settings)
  const updateEpisode = useStore((s) => s.updateEpisode)
  const chapter = useStore((s) => (episode ? s.chapters[episode.chapterId] : undefined))
  const project = useStore(selectCurrentProject)
  const chapters = useStore((s) => s.chapters)
  const episodes = useStore((s) => s.episodes)
  const setSettings = useStore((s) => s.setSettings)
  const createEpisode = useStore((s) => s.createEpisode)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  // 話を切り替えたら先頭へ
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [episode?.id])

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

  return (
    <div className="page-scroll" ref={scrollRef}>
      <div className="page" style={{ fontFamily, fontSize: settings.fontSize, lineHeight: settings.lineHeight }}>
        <div className="page-chapter">
          {chapter?.title}
          {chapter?.subtitle ? `　${chapter.subtitle}` : ''}
        </div>
        <input
          className="page-title"
          value={episode.title}
          placeholder="話のタイトル"
          onChange={(e) => updateEpisode(episode.id, { title: e.target.value })}
        />
        <input
          className="page-subtitle"
          value={episode.subtitle ?? ''}
          placeholder="サブタイトル(空欄なら表示されません)"
          onChange={(e) => updateEpisode(episode.id, { subtitle: e.target.value })}
        />
        <div className="grow-wrap" data-value={episode.body}>
          <textarea
            className="page-body"
            value={episode.body}
            placeholder="ここに本文を書きます…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(e) => updateEpisode(episode.id, { body: e.target.value })}
          />
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
