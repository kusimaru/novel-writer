import { useEffect, useRef, useState } from 'react'
import { selectCurrentProject, useStore } from '../store'
import { countChars, formatNumber } from '../utils/count'
import Menu from './Menu'

export default function Sidebar() {
  const project = useStore(selectCurrentProject)
  const projects = useStore((s) => s.projects)
  const chapters = useStore((s) => s.chapters)
  const episodes = useStore((s) => s.episodes)
  const settings = useStore((s) => s.settings)
  const st = useStore()
  const [editingSub, setEditingSub] = useState(false)
  const subRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editingSub) subRef.current?.focus()
  }, [editingSub])
  useEffect(() => setEditingSub(false), [project?.id])

  const selectEpisode = (id: string) => {
    st.setSettings({ currentEpisodeId: id, ...(window.innerWidth < 900 ? { sidebarOpen: false } : {}) })
  }

  const rename = (current: string, apply: (t: string) => void) => {
    const t = window.prompt('名前を変更', current)
    if (t !== null && t.trim()) apply(t.trim())
  }
  const subtitle = (current: string | undefined, apply: (t: string) => void) => {
    const t = window.prompt('サブタイトル(空欄にすると消えます)', current ?? '')
    if (t !== null) apply(t.trim())
  }

  return (
    <aside className={'sidebar' + (settings.sidebarOpen ? ' open' : '')}>
      <div className="sidebar-head">
        <select
          className="project-select"
          value={project?.id ?? ''}
          onChange={(e) => {
            const p = projects[e.target.value]
            const firstCh = p?.chapterOrder.map((id) => chapters[id]).find(Boolean)
            st.setSettings({ currentProjectId: e.target.value, currentEpisodeId: firstCh?.episodeOrder[0] ?? null })
          }}
        >
          {Object.values(projects)
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
        </select>
        <Menu
          items={[
            {
              label: '新しい作品を作る',
              onClick: () => {
                const t = window.prompt('作品のタイトル', '新しい作品')
                if (t !== null && t.trim()) st.createProject(t.trim())
              }
            },
            { label: '作品名を変更', onClick: () => project && rename(project.title, (t) => st.updateProject(project.id, { title: t })), disabled: !project },
            {
              label: '作品を削除',
              danger: true,
              disabled: !project,
              onClick: () => {
                if (project && window.confirm(`「${project.title}」を削除しますか?\n(章・話・メモもすべて削除されます)`)) st.deleteProject(project.id)
              }
            }
          ]}
        />
      </div>
      {project && (
        <div className="sidebar-sub">
          {project.subtitle || editingSub ? (
            <input
              ref={subRef}
              value={project.subtitle ?? ''}
              placeholder="作品のサブタイトル"
              onChange={(e) => st.updateProject(project.id, { subtitle: e.target.value })}
              onBlur={() => setEditingSub(false)}
            />
          ) : (
            <button className="subtitle-add" onClick={() => setEditingSub(true)}>
              ＋ 作品のサブタイトルを追加
            </button>
          )}
        </div>
      )}

      <div className="tree">
        {project?.chapterOrder.map((chId, ci) => {
          const ch = chapters[chId]
          if (!ch) return null
          const chCount = ch.episodeOrder.reduce((n, eid) => n + countChars(episodes[eid]?.body ?? '', settings.countMode), 0)
          return (
            <div className="chapter" key={ch.id}>
              <div className="chapter-row">
                <span className="chapter-title" onDoubleClick={() => rename(ch.title, (t) => st.updateChapter(ch.id, { title: t }))}>
                  {ch.title}
                  {ch.subtitle && <span className="subtitle">「{ch.subtitle}」</span>}
                </span>
                <span className="count">{formatNumber(chCount)}</span>
                <Menu
                  items={[
                    { label: '話を追加', onClick: () => selectEpisode(st.createEpisode(ch.id)) },
                    { label: '章の名前を変更', onClick: () => rename(ch.title, (t) => st.updateChapter(ch.id, { title: t })) },
                    { label: 'サブタイトルを設定', onClick: () => subtitle(ch.subtitle, (t) => st.updateChapter(ch.id, { subtitle: t })) },
                    { label: '上へ移動', disabled: ci === 0, onClick: () => st.moveChapter(project.id, ch.id, -1) },
                    { label: '下へ移動', disabled: ci === project.chapterOrder.length - 1, onClick: () => st.moveChapter(project.id, ch.id, 1) },
                    {
                      label: '章を削除',
                      danger: true,
                      onClick: () => {
                        if (window.confirm(`「${ch.title}」と、その中の話をすべて削除しますか?`)) st.deleteChapter(ch.id)
                      }
                    }
                  ]}
                />
              </div>
              {ch.episodeOrder.map((eid, ei) => {
                const ep = episodes[eid]
                if (!ep) return null
                const active = settings.currentEpisodeId === ep.id
                return (
                  <div
                    key={ep.id}
                    className={'episode-row' + (active ? ' active' : '')}
                    onClick={() => selectEpisode(ep.id)}
                  >
                    <span className="episode-title">
                      {ep.title || '(無題)'}
                      {ep.subtitle && <span className="subtitle">「{ep.subtitle}」</span>}
                    </span>
                    <span className="count">{formatNumber(countChars(ep.body, settings.countMode))}</span>
                    <Menu
                      items={[
                        { label: '名前を変更', onClick: () => rename(ep.title, (t) => st.updateEpisode(ep.id, { title: t })) },
                        { label: 'サブタイトルを設定', onClick: () => subtitle(ep.subtitle, (t) => st.updateEpisode(ep.id, { subtitle: t })) },
                        { label: '上へ移動', disabled: ei === 0 && ci === 0, onClick: () => st.moveEpisode(ep.id, -1) },
                        {
                          label: '下へ移動',
                          disabled: ei === ch.episodeOrder.length - 1 && ci === project.chapterOrder.length - 1,
                          onClick: () => st.moveEpisode(ep.id, 1)
                        },
                        {
                          label: '話を削除',
                          danger: true,
                          onClick: () => {
                            if (window.confirm(`「${ep.title}」を削除しますか?`)) st.deleteEpisode(ep.id)
                          }
                        }
                      ]}
                    />
                  </div>
                )
              })}
              <button className="add-row" onClick={() => selectEpisode(st.createEpisode(ch.id))}>
                ＋ 話を追加
              </button>
            </div>
          )
        })}
        {project && (
          <button className="add-row add-chapter" onClick={() => st.createChapter(project.id)}>
            ＋ 章を追加
          </button>
        )}
      </div>
    </aside>
  )
}
