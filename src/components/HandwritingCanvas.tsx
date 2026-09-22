import { useEffect, useRef } from 'react'
import type { Point, Stroke } from '../types'
import { newId } from '../utils/id'

export type PenMode = 'off' | 'pen' | 'eraser'

interface Props {
  strokes: Stroke[]
  width: number
  height: number
  mode: PenMode
  color: string
  penWidth: number
  penOnly: boolean
  onChange: (strokes: Stroke[]) => void
}

const r1 = (n: number) => Math.round(n * 10) / 10

function segmentWidth(base: number, p: number) {
  return base * (0.45 + p * 1.1)
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = s.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const pts = s.points
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.fillStyle = s.color
    ctx.arc(pts[0].x, pts[0].y, segmentWidth(s.width, pts[0].p) / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    ctx.beginPath()
    ctx.lineWidth = segmentWidth(s.width, (a.p + b.p) / 2)
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
}

function drawSegment(ctx: CanvasRenderingContext2D, s: Stroke, a: Point, b: Point) {
  ctx.strokeStyle = s.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.lineWidth = segmentWidth(s.width, (a.p + b.p) / 2)
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

function hitStroke(s: Stroke, x: number, y: number, radius: number) {
  const r2 = (radius + s.width) ** 2
  const pts = s.points
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - x
    const dy = pts[i].y - y
    if (dx * dx + dy * dy <= r2) return true
    if (i > 0) {
      // 線分との距離
      const ax = pts[i - 1].x
      const ay = pts[i - 1].y
      const bx = pts[i].x
      const by = pts[i].y
      const vx = bx - ax
      const vy = by - ay
      const len2 = vx * vx + vy * vy
      if (len2 > 0) {
        let t = ((x - ax) * vx + (y - ay) * vy) / len2
        t = Math.max(0, Math.min(1, t))
        const px = ax + vx * t - x
        const py = ay + vy * t - y
        if (px * px + py * py <= r2) return true
      }
    }
  }
  return false
}

export default function HandwritingCanvas({ strokes, width, height, mode, color, penWidth, penOnly, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const current = useRef<Stroke | null>(null)
  const pointerId = useRef<number | null>(null)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  // サイズ変更・ストローク変更時に全描画
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || height <= 0) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(width * dpr)
    const h = Math.round(height * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    for (const s of strokes) drawStroke(ctx, s)
  }, [strokes, width, height])

  const accepts = (e: React.PointerEvent) => {
    if (mode === 'off') return false
    if (penOnly) return e.pointerType === 'pen' || e.pointerType === 'mouse'
    return true
  }

  const toPoint = (e: PointerEvent | React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const p = e.pointerType === 'pen' ? e.pressure : 0.5
    return { x: r1(e.clientX - rect.left), y: r1(e.clientY - rect.top), p: p > 0 ? r1(p) : 0.5 }
  }

  const eraseAt = (x: number, y: number) => {
    const list = strokesRef.current
    const keep = list.filter((s) => !hitStroke(s, x, y, 8))
    if (keep.length !== list.length) {
      strokesRef.current = keep
      onChange(keep)
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!accepts(e)) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    pointerId.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = toPoint(e)
    if (mode === 'eraser') {
      eraseAt(pt.x, pt.y)
      return
    }
    current.current = { id: newId(), color, width: penWidth, points: [pt] }
    const ctx = canvasRef.current!.getContext('2d')!
    drawStroke(ctx, current.current)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerId.current !== e.pointerId) return
    e.preventDefault()
    const native = e.nativeEvent as PointerEvent
    const events: PointerEvent[] = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
    const list = events.length ? events : [native]
    if (mode === 'eraser') {
      for (const ev of list) {
        const pt = toPoint(ev)
        eraseAt(pt.x, pt.y)
      }
      return
    }
    const s = current.current
    if (!s) return
    const ctx = canvasRef.current!.getContext('2d')!
    for (const ev of list) {
      const pt = toPoint(ev)
      const last = s.points[s.points.length - 1]
      if (Math.abs(last.x - pt.x) < 0.3 && Math.abs(last.y - pt.y) < 0.3) continue
      s.points.push(pt)
      drawSegment(ctx, s, last, pt)
    }
  }

  const finish = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerId.current !== e.pointerId) return
    pointerId.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const s = current.current
    current.current = null
    if (s) {
      const next = [...strokesRef.current, s]
      strokesRef.current = next
      onChange(next)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className={'hw-canvas mode-' + mode}
      style={{ width, height, pointerEvents: mode === 'off' ? 'none' : 'auto', touchAction: mode === 'off' ? 'auto' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onContextMenu={(e) => mode !== 'off' && e.preventDefault()}
    />
  )
}
