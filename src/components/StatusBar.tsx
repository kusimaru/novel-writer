import { useMemo } from 'react'
import { selectCurrentEpisode, selectCurrentProject, useStore } from '../store'
import { countChars, countLines, countManuscriptPages, formatNumber } from '../utils/count'

export default function StatusBar() {
  const episode = useStore(selectCurrentEpisode)
  const project = useStore(selectCurrentProject)
  const chapters = useStore((s) => s.chapters)
  const episodes = useStore((s) => s.episodes)
  const mode = useStore((s) => s.settings.countMode)

  const epCount = episode ? countChars(episode.body, mode) : 0
  const epLines = episode ? countLines(episode.body) : 0
  const pages = episode ? countManuscriptPages(episode.body) : 0

  const chapter = episode ? chapters[episode.chapterId] : undefined
  const chCount = useMemo(
    () => (chapter ? chapter.episodeOrder.reduce((n, id) => n + countChars(episodes[id]?.body ?? '', mode), 0) : 0),
    [chapter, episodes, mode]
  )
  const total = useMemo(
    () =>
      project
        ? Object.values(episodes)
            .filter((e) => e.projectId === project.id)
            .reduce((n, e) => n + countChars(e.body, mode), 0)
        : 0,
    [project, episodes, mode]
  )

  return (
    <footer className="statusbar">
      <span className="stat main">
        この話 <b>{formatNumber(epCount)}</b> 字
      </span>
      <span className="stat">{formatNumber(epLines)} 行</span>
      <span className="stat">原稿用紙 {formatNumber(pages)} 枚</span>
      <span className="spacer" />
      <span className="stat">
        {chapter?.title ?? '章'} <b>{formatNumber(chCount)}</b> 字
      </span>
      <span className="stat">
        作品全体 <b>{formatNumber(total)}</b> 字
      </span>
      <span className="stat dim">{mode === 'exclude-space' ? '空白・改行を除く' : '改行のみ除く'}</span>
    </footer>
  )
}
