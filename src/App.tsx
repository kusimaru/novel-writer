import { useEffect, useState } from 'react'
import Editor from './components/Editor'
import MemoDrawer from './components/MemoDrawer'
import SettingsDialog from './components/SettingsDialog'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import TopBar from './components/TopBar'
import { useStore } from './store'
import { applySyncSettings } from './sync'

export default function App() {
  const loaded = useStore((s) => s.loaded)
  const load = useStore((s) => s.load)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    void load().then(() => {
      const s = useStore.getState()
      // 狭い画面(iPad縦など)では目次とメモを同時に開かない
      if (window.innerWidth < 900 && s.settings.sidebarOpen && s.settings.drawerOpen) s.setSettings({ sidebarOpen: false })
      if (s.settings.syncProvider !== 'none') void applySyncSettings(s.settings)
    })
  }, [load])

  // 引き出しの幅をドラッグで変更
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const w = Math.max(280, Math.min(window.innerWidth - 320, Math.round(window.innerWidth - ev.clientX)))
      setSettings({ drawerWidth: w })
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

  if (!loaded) {
    return <div className="loading">読み込み中…</div>
  }

  return (
    <div className={'app' + (settings.drawerOpen ? ' drawer-open' : '') + (settings.sidebarOpen ? ' sidebar-open' : '')}>
      <TopBar onOpenSettings={() => setShowSettings(true)} />
      <div className="body">
        <Sidebar />
        <div className="sidebar-backdrop" onClick={() => setSettings({ sidebarOpen: false })} />
        <main className="editor-area">
          <Editor />
        </main>
        <aside className="drawer" style={{ width: settings.drawerWidth, ["--drawer-w" as any]: settings.drawerWidth + "px" }}>
          <div className="drawer-resize" onPointerDown={onResizeStart} />
          <MemoDrawer />
        </aside>
        {!settings.drawerOpen && (
          <button
            className="drawer-tab"
            onClick={() => setSettings({ drawerOpen: true, ...(window.innerWidth < 900 ? { sidebarOpen: false } : {}) })}
            aria-label="メモを開く"
          >
            メモ
          </button>
        )}
      </div>
      <StatusBar />
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  )
}
