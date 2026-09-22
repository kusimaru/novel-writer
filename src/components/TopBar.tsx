import { selectCurrentProject, useStore } from '../store'
import { exportProjectText } from '../utils/exportText'

const SYNC_LABEL: Record<string, string> = {
  off: '同期オフ',
  connecting: '接続中',
  synced: '同期済み',
  syncing: '保存中',
  error: 'エラー',
  offline: 'オフライン'
}

const narrow = () => window.innerWidth < 900

export default function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const project = useStore(selectCurrentProject)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const syncStatus = useStore((s) => s.syncStatus)
  const syncMessage = useStore((s) => s.syncMessage)
  const chapters = useStore((s) => s.chapters)
  const episodes = useStore((s) => s.episodes)

  return (
    <header className="topbar">
      <button
        className="icon-btn"
        onClick={() => setSettings({ sidebarOpen: !settings.sidebarOpen, ...(narrow() && !settings.sidebarOpen ? { drawerOpen: false } : {}) })}
        aria-label="目次"
      >
        ☰
      </button>
      <span className="app-name">執筆ノート</span>
      <span className="project-title">
        {project?.title ?? ''}
        {project?.subtitle && <span className="project-subtitle-top">{project.subtitle}</span>}
      </span>
      <span className="spacer" />
      <button
        className={'btn tool' + (settings.showInvisibles ? ' on' : '')}
        title="全角・半角スペースや改行の記号を表示する"
        onClick={() => setSettings({ showInvisibles: !settings.showInvisibles })}
      >
        ¶ 記号
      </button>
      <button
        className="btn tool"
        title="この作品の全文をテキストファイル(.txt)として保存"
        disabled={!project}
        onClick={() => project && exportProjectText(project, chapters, episodes)}
      >
        ⤓ TXT保存
      </button>
      <span className={'sync sync-' + syncStatus} title={syncMessage} onClick={onOpenSettings}>
        <span className="dot" />
        {SYNC_LABEL[syncStatus]}
      </span>
      <button className="icon-btn" onClick={onOpenSettings} aria-label="設定">
        ⚙
      </button>
      <button
        className={'btn drawer-toggle' + (settings.drawerOpen ? ' on' : '')}
        onClick={() => setSettings({ drawerOpen: !settings.drawerOpen, ...(narrow() && !settings.drawerOpen ? { sidebarOpen: false } : {}) })}
      >
        メモ
      </button>
    </header>
  )
}
