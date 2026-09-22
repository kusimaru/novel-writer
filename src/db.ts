import Dexie, { type Table } from 'dexie'
import type { Chapter, Episode, Memo, Project, Settings } from './types'

class NovelDB extends Dexie {
  projects!: Table<Project, string>
  chapters!: Table<Chapter, string>
  episodes!: Table<Episode, string>
  memos!: Table<Memo, string>
  settings!: Table<{ key: string; value: Settings }, string>

  constructor() {
    super('novel-writer')
    this.version(1).stores({
      projects: 'id, updatedAt',
      chapters: 'id, projectId, updatedAt',
      episodes: 'id, projectId, chapterId, updatedAt',
      memos: 'id, projectId, updatedAt',
      settings: 'key'
    })
  }
}

export const db = new NovelDB()
