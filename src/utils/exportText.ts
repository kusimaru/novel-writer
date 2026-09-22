import type { Chapter, Episode, Project } from '../types'
import { stripFigures } from './figures'

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const timestamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 作品全体を1つのテキストにまとめる */
export function projectToText(project: Project, chapters: Record<string, Chapter>, episodes: Record<string, Episode>): string {
  const lines: string[] = project.subtitle ? [project.title, project.subtitle, ''] : [project.title, '']
  for (const chId of project.chapterOrder) {
    const ch = chapters[chId]
    if (!ch) continue
    lines.push(ch.subtitle ? `${ch.title}　「${ch.subtitle}」` : ch.title, '')
    for (const eid of ch.episodeOrder) {
      const ep = episodes[eid]
      if (!ep) continue
      lines.push(ep.subtitle ? `${ep.title}「${ep.subtitle}」` : ep.title, '', stripFigures(ep.body), '', '')
    }
  }
  return lines.join('\n')
}

export function exportProjectText(project: Project, chapters: Record<string, Chapter>, episodes: Record<string, Episode>) {
  downloadFile(`${project.title}-${timestamp()}.txt`, projectToText(project, chapters, episodes), 'text/plain;charset=utf-8')
}
