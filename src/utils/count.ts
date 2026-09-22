import type { Settings } from '../types'

const spaceRe = /[\s\u3000]/g

/** 文字数を数える。exclude-space は改行・半角/全角スペースを除外 */
export function countChars(text: string, mode: Settings['countMode']): number {
  if (!text) return 0
  const s = mode === 'exclude-space' ? text.replace(spaceRe, '') : text.replace(/\r?\n/g, '')
  // サロゲートペアを1文字として数える
  return Array.from(s).length
}

export function countLines(text: string): number {
  if (!text) return 0
  return text.split(/\r?\n/).length
}

/** 400字詰め原稿用紙換算(改行ごとに行を消費する簡易計算) */
export function countManuscriptPages(text: string): number {
  if (!text) return 0
  let lines = 0
  for (const line of text.split(/\r?\n/)) {
    const n = Array.from(line).length
    lines += Math.max(1, Math.ceil(n / 20))
  }
  return Math.ceil(lines / 20)
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ja-JP')
}
