// 本文中の挿絵マーカー: 1行まるごと【挿絵:メモID】または【挿絵:メモID:幅%】
export const FIGURE_RE = /【挿絵:([A-Za-z0-9_-]+)(?::(\d{1,3}))?】/g
const LINE_RE = /^【挿絵:[A-Za-z0-9_-]+(?::\d{1,3})?】\n?/gm

export type Segment =
  | { type: 'text'; start: number; end: number; text: string }
  | { type: 'image'; start: number; end: number; memoId: string; width: number }

export const MIN_FIGURE_WIDTH = 15

/** 本文をテキスト区間と挿絵に分解する。区間の start/end は本文内の位置 */
export function splitBody(body: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of body.matchAll(FIGURE_RE)) {
    const s = m.index!
    const e = s + m[0].length
    // マーカーの前後の改行1つずつはマーカーの一部として扱う
    let ts = s
    let te = e
    if (body[te] === '\n') te++
    if (ts > 0 && body[ts - 1] === '\n') ts--
    const width = m[2] ? Math.max(MIN_FIGURE_WIDTH, Math.min(100, Number(m[2]))) : 100
    out.push({ type: 'text', start: last, end: ts, text: body.slice(last, ts) })
    out.push({ type: 'image', start: ts, end: te, memoId: m[1], width })
    last = te
  }
  out.push({ type: 'text', start: last, end: body.length, text: body.slice(last) })
  return out
}

export function insertFigure(body: string, pos: number, memoId: string): string {
  const p = Math.max(0, Math.min(pos, body.length))
  const before = body.slice(0, p)
  const after = body.slice(p)
  const pre = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
  const post = after.startsWith('\n') ? '' : '\n'
  return before + pre + `【挿絵:${memoId}】` + post + after
}

function markerRe(memoId: string) {
  return new RegExp(`【挿絵:${memoId}(?::\d{1,3})?】`, 'g')
}

/** n番目(0始まり)のこのメモの挿絵を取り除く */
export function removeFigure(body: string, memoId: string, occurrence = 0): string {
  const re = new RegExp(`【挿絵:${memoId}(?::\d{1,3})?】\n?`, 'g')
  let i = 0
  return body.replace(re, (m) => (i++ === occurrence ? '' : m))
}

/** n番目のこのメモの挿絵の幅(%)を変える */
export function setFigureWidth(body: string, memoId: string, occurrence: number, width: number): string {
  const w = Math.round(Math.max(MIN_FIGURE_WIDTH, Math.min(100, width)))
  let i = 0
  return body.replace(markerRe(memoId), (m) => (i++ === occurrence ? (w >= 100 ? `【挿絵:${memoId}】` : `【挿絵:${memoId}:${w}】`) : m))
}

/** 書き出し・文字数用: マーカー行を取り除く */
export function stripFigures(body: string): string {
  return body.replace(LINE_RE, '')
}

