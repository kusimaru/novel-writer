import { useEffect, useRef } from 'react'
import { selectCurrentEpisode, useStore } from '../store'

export default function Editor() {
  const episode = useStore(selectCurrentEpisode)
  const settings = useStore((s) => s.settings)
  const updateEpisode = useStore((s) => s.updateEpisode)
  const chapter = useStore((s) => (episode ? s.chapters[episode.chapterId] : undefined))
  const scrollRef = useRef<HTMLDivElement>(null)

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
        <div className="page-chapter">{chapter?.title}</div>
        <input
          className="page-title"
          value={episode.title}
          placeholder="話のタイトル"
          onChange={(e) => updateEpisode(episode.id, { title: e.target.value })}
        />
        <div className="grow-wrap" data-value={episode.body + '\n'}>
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
      </div>
    </div>
  )
}
