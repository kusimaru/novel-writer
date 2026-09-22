import type { Settings } from '../types'
import { startSync as startFirebase, stopSync as stopFirebase } from './firebase'
import { startGithubSync, stopGithubSync } from './github'

/** 設定に応じて同期方式を切り替える */
export async function applySyncSettings(settings: Settings) {
  await stopFirebase()
  await stopGithubSync()
  if (settings.syncProvider === 'github') {
    await startGithubSync(settings)
  } else if (settings.syncProvider === 'firebase' && settings.firebaseConfig.trim()) {
    await startFirebase(settings.firebaseConfig)
  }
}

export async function stopAllSync() {
  await stopFirebase()
  await stopGithubSync()
}
