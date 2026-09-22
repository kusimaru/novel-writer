import { useEffect, useMemo, useRef } from 'react'
import { selectCurrentEpisode, selectCurrentProject, useStore } from '../store'
import { findMatches, replaceAll, replaceAt } from '../utils/search'

export default function SearchBar() {
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const episode = useStore(selectCurrentEpisode)
  const project = useStore(selectCurrentProject)
  const chapters = useStore((s) => s.chapters)
  const episodes = useStore((s) => s.episodes)
  const setSettings = useStore((s) => s.setSettings)
  const updateEpisode = useStore((s) => s.updateEpisode)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (search.open) inputRef.current?.focus()
  }, [search.open])

  // 作品内の話の順序
  const flat = useMemo(
    () => (project ? project.chapterOrder.flatMap((cid) => chapters[cid]?.episodeOrder ?? []) : []),
    [project, chapters]
  )
  const matchesIn = (id: string) => findMatches(episodes[id]?.body ?? '', search.query, search.caseSensitive)
  const cur = episode ? matchesIn(episode.id) : []
  const total = useMemo(
    () => (search.scope === 'project' ? flat.reduce((n, id) => n + matchesIn(id).length, 0) : cur.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search.scope, search.query, search.caseSensitive, flat, episodes, cur.length]
  )
  const epCount = cur.length

  const jump = (dir: 1 | -1) => {
    if (!episode || !search.query) return
    const idx = search.current
    if (epCount > 0 && idx + dir >= 0 && idx + dir < epCount) {
      setSearch({ current: idx + dir, nonce: search.nonce + 1 })
      return
    }
    if (search.scope === 'episode') {
      if (epCount > 0) setSearch({ current: dir === 1 ? 0 : epCount - 1, nonce: search.nonce + 1 })
      return
    }
    // 作品全体: 次(前)の一致がある話へ
    const start = flat.indexOf(episode.id)
    for (let step = 1; step <= flat.length; step++) {
      const id = flat[(start + dir * step + flat.length * step) % flat.length]
      const ms = matchesIn(id)
      if (ms.length > 0) {
        setSettings({ currentEpisodeId: id })
        setSearch({ current: dir === 1 ? 0 : ms.length - 1, nonce: search.nonce + 1 })
        return
      }
    }
  }

  const replaceOne = () => {
    if (!episode) return
    const m = cur[search.current]
    if (!m) {
      jump(1)
      return
    }
    updateEpisode(episode.id, { body: replaceAt(episode.body, m, search.replace) })
    // 置換後、同じ番号の位置に次の一致が来る
    setSearch({ current: Math.min(search.current, Math.max(0, epCount - 2)), nonce: search.nonce + 1 })
  }

  const replaceEverything = () => {
    if (!search.query) return
    if (search.scope === 'project') {
      if (!window.confirm(`作品全体の ${total} 件を「${search.replace}」に置き換えます。よろしいですか?`)) return
      for (const id of flat) {
        const e = episodes[id]
        if (!e) continue
        const next = replaceAll(e.body, search.query, search.replace, search.caseSensitive)
        if (next !== e.body) updateEpisode(id, { body: next })
      }
    } else if (episode) {
      updateEpisode(episode.id, { body: replaceAll(episode.body, search.query, search.replace, search.caseSensitive) })
    }
    setSearch({ current: 0, nonce: search.nonce + 1 })
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      jump(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      setSearch({ open: false })
    }
  }

  if (!search.open) return null

  const pos = epCount > 0 ? Math.min(search.current, epCount - 1) + 1 : 0

  return (
    <div className="searchbar" onKeyDown={onKey}>
      <input
        ref={inputRef}
        className="text"
        placeholder="検索"
        value={search.query}
        onChange={(e) => setSearch({ query: e.target.value, current: 0 })}
      />
      <span className="search-count">
        {search.query ? (search.scope === 'project' ? `この話 ${pos}/${epCount}(全体 ${total})` : `${pos}/${epCount}`) : ''}
      </span>
      <button className="btn tool" onClick={() => jump(-1)} title="前へ(Shift+Enter)">
        ↑
      </button>
      <button className="btn tool" onClick={() => jump(1)} title="次へ(Enter)">
        ↓
      </button>
      <input className="text" placeholder="置換" value={search.replace} onChange={(e) => setSearch({ replace: e.target.value })} />
      <button className="btn tool" onClick={replaceOne} disabled={!search.query || epCount === 0}>
        置換
      </button>
      <button className="btn tool" onClick={replaceEverything} disabled={!search.query || total === 0}>
        すべて置換
      </button>
      <label className="chk">
        <select value={search.scope} onChange={(e) => setSearch({ scope: e.target.value as any, current: 0 })}>
          <option value="episode">この話</option>
          <option value="project">作品全体</option>
        </select>
      </label>
      <label className="chk" title="大文字・小文字を区別">
        <input type="checkbox" checked={search.caseSensitive} onChange={(e) => setSearch({ caseSensitive: e.target.checked, current: 0 })} />
        Aa
      </label>
      <button className="icon-btn" onClick={() => setSearch({ open: false })} aria-label="閉じる">
        ✕
      </button>
    </div>
  )
}
