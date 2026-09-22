// 本文中の挿絵マーカー: 1行まるごと【挿絵:メモID】
export const FIGURE_RE = /【挿絵:([A-Za-z0-9_-]+)】/g
const LINE_RE = /^【挿絵:[A-Za-z0-9_-]+】\n?/gm

export type Segment = { type: 'text'; start: number; end: number; text: string } | { type: 'image'; start: number; end: number; memoId: string }

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
    out.push({ type: 'text', start: last, end: ts, text: body.slice(last, ts) })
    out.push({ type: 'image', start: ts, end: te, memoId: m[1] })
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

export function removeFigure(body: string, memoId: string, occurrence = 0): string {
  const re = new RegExp(`【挿絵:${memoId}】\n?`, 'g')
  let i = 0
  return body.replace(re, (m) => (i++ === occurrence ? '' : m))
}

/** 書き出し・文字数用: マーカー行を取り除く */
export function stripFigures(body: string): string {
  return body.replace(LINE_RE, '')
}
