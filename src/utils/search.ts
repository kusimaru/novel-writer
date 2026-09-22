export interface Match {
  start: number
  end: number
}

/** 本文中の一致位置をすべて返す(重ならない) */
export function findMatches(text: string, query: string, caseSensitive: boolean): Match[] {
  if (!query) return []
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const out: Match[] = []
  let i = 0
  while (i <= hay.length - needle.length) {
    const k = hay.indexOf(needle, i)
    if (k < 0) break
    out.push({ start: k, end: k + needle.length })
    i = k + needle.length
  }
  return out
}

export function replaceAt(text: string, m: Match, replacement: string): string {
  return text.slice(0, m.start) + replacement + text.slice(m.end)
}

export function replaceAll(text: string, query: string, replacement: string, caseSensitive: boolean): string {
  const ms = findMatches(text, query, caseSensitive)
  if (ms.length === 0) return text
  let out = ''
  let last = 0
  for (const m of ms) {
    out += text.slice(last, m.start) + replacement
    last = m.end
  }
  return out + text.slice(last)
}
