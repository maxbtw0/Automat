import type { EditorGraph, StateNode, TransitionEdge } from '@/model/graph'

export const STATE_RADIUS = 28

export interface Point {
  x: number
  y: number
}

export interface Viewport {
  /** Verschiebung in Bildschirm-Pixeln */
  x: number
  y: number
  zoom: number
}

export interface EdgeGeometry {
  /** SVG-Pfad (endet am Kreisrand – dort sitzt die Pfeilspitze) */
  path: string
  /** Position der Beschriftung (bei einer Zeile ihr Mittelpunkt) */
  label: Point
  /** Richtung (Einheitsvektor), in der die Beschriftung vom Übergang weg liegt */
  labelSide: Point
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (a: Point, f: number): Point => ({ x: a.x * f, y: a.y * f })
const normalize = (a: Point): Point => {
  const len = Math.hypot(a.x, a.y)
  return len < 1e-6 ? { x: 1, y: 0 } : { x: a.x / len, y: a.y / len }
}
/** Senkrechte, die bei Links-nach-rechts-Richtung nach oben zeigt */
const normalOf = (dir: Point): Point => ({ x: dir.y, y: -dir.x })

const LABEL_OFFSET = 14

export function straightEdge(a: Point, b: Point, r = STATE_RADIUS): EdgeGeometry {
  const dir = normalize(sub(b, a))
  const start = add(a, scale(dir, r))
  const end = sub(b, scale(dir, r))
  const mid = scale(add(start, end), 0.5)
  return {
    path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    label: add(mid, scale(normalOf(dir), LABEL_OFFSET)),
    labelSide: normalOf(dir)
  }
}

/** Gebogene Kante – für Gegenkanten (a→b und b→a), die sonst übereinander lägen. */
export function curvedEdge(a: Point, b: Point, r = STATE_RADIUS, bend = 45): EdgeGeometry {
  const dir = normalize(sub(b, a))
  const normal = normalOf(dir)
  const control = add(scale(add(a, b), 0.5), scale(normal, bend))
  const start = add(a, scale(normalize(sub(control, a)), r))
  const end = add(b, scale(normalize(sub(control, b)), r))
  // Scheitelpunkt der quadratischen Bézierkurve (t = 0.5)
  const peak = add(add(scale(start, 0.25), scale(control, 0.5)), scale(end, 0.25))
  return {
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    label: add(peak, scale(normal, LABEL_OFFSET)),
    labelSide: normal
  }
}

/**
 * Schleife am Zustand. `angle` = Richtung, in die sie zeigt (0 = oben, im Uhrzeigersinn,
 * Bogenmaß). Gezeichnet wird sie wie nach oben und dann um den Mittelpunkt gedreht.
 */
export function selfLoop(a: Point, r = STATE_RADIUS, angle = 0): EdgeGeometry {
  const spread = Math.PI / 7
  const height = r * 2.6
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Punkt relativ zum Mittelpunkt (für „oben“ berechnet) drehen und verschieben
  const at = (x: number, y: number): Point => ({
    x: a.x + x * cos - y * sin,
    y: a.y + x * sin + y * cos
  })
  const start = at(-r * Math.sin(spread), -r * Math.cos(spread))
  const end = at(r * Math.sin(spread), -r * Math.cos(spread))
  const c1 = at(-r * 1.4, -height)
  const c2 = at(r * 1.4, -height)
  // Scheitel der Bézierkurve (t = 0,5): 0,125·y₀ + 0,375·y₁ + 0,375·y₂ + 0,125·y₃
  const peak = 0.25 * r * Math.cos(spread) + 0.75 * height
  // Seitlich braucht die Beschriftung etwas mehr Abstand als oben/unten
  const labelDistance = peak + LABEL_OFFSET - 4 + 10 * Math.abs(sin)
  return {
    path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`,
    label: at(0, -labelDistance),
    labelSide: { x: sin, y: -cos }
  }
}

/** Zeilenabstand mehrzeiliger Beschriftungen (Stackregeln) */
export const LABEL_LINE_HEIGHT = 16

/**
 * Mittelpunkt einer Beschriftung mit `lines` Zeilen und Breite `width`: Der Block wächst vom
 * Übergang weg, statt sich über die Linie zu legen. Bei einer schmalen Zeile bleibt es bei
 * `geometry.label`.
 */
export function labelCenter(geometry: EdgeGeometry, width: number, lines: number): Point {
  const { label, labelSide: side } = geometry
  const height = lines * LABEL_LINE_HEIGHT
  return {
    x: label.x + side.x * Math.max(0, width / 2 - 8),
    y: label.y + side.y * Math.max(0, height / 2 - LABEL_LINE_HEIGHT / 2)
  }
}

/** y-Koordinaten der Zeilen eines Beschriftungsblocks um `centerY` */
export function labelLineYs(centerY: number, lines: number): number[] {
  return Array.from(
    { length: lines },
    (_, i) => centerY + (i - (lines - 1) / 2) * LABEL_LINE_HEIGHT
  )
}

/** Richtungen für Schleifen, in dieser Reihenfolge bevorzugt: oben, unten, rechts, links, schräg */
const LOOP_ANGLES = [0, 180, 90, 270, 45, 315, 135, 225].map((deg) => (deg * Math.PI) / 180)
/** So weit (Bogenmaß) soll eine Schleife mindestens von jeder Kante des Zustands entfernt sein */
const LOOP_CLEARANCE = (50 * Math.PI) / 180

/** Kleinster Winkelabstand zweier Richtungen (0 … π) */
const angleBetween = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (2 * Math.PI)
  return d > Math.PI ? 2 * Math.PI - d : d
}

/**
 * Richtung der Schleife so wählen, dass sie nicht auf einer anderen Kante des Zustands liegt:
 * die erste freie aus LOOP_ANGLES (meist oben), sonst die mit dem meisten Platz.
 */
export function loopAngle(state: StateNode, graph: EditorGraph): number {
  const neighbours = graph.transitions
    .filter((t) => t.from !== t.to && (t.from === state.id || t.to === state.id))
    .map((t) => graph.states.find((s) => s.id === (t.from === state.id ? t.to : t.from)))
    .filter((s): s is StateNode => s !== undefined)
    // Richtung zum Nachbarn im selben Maß wie `angle`: 0 = oben, im Uhrzeigersinn
    .map((s) => Math.atan2(s.x - state.x, -(s.y - state.y)))
  if (neighbours.length === 0) return 0
  const clearance = (angle: number): number =>
    Math.min(...neighbours.map((n) => angleBetween(angle, n)))
  const free = LOOP_ANGLES.find((angle) => clearance(angle) >= LOOP_CLEARANCE)
  if (free !== undefined) return free
  return LOOP_ANGLES.reduce((best, angle) => (clearance(angle) > clearance(best) ? angle : best))
}

export function transitionGeometry(
  transition: TransitionEdge,
  graph: EditorGraph
): EdgeGeometry | null {
  const from = graph.states.find((s) => s.id === transition.from)
  const to = graph.states.find((s) => s.id === transition.to)
  if (!from || !to) return null
  if (from.id === to.id) return selfLoop(from, STATE_RADIUS, loopAngle(from, graph))

  const hasReverse = graph.transitions.some(
    (t) => t.from === transition.to && t.to === transition.from
  )
  return hasReverse ? curvedEdge(from, to) : straightEdge(from, to)
}

/** Vorschau-Linie beim Ziehen eines neuen Übergangs. */
export function previewEdgePath(from: Point, pointer: Point, r = STATE_RADIUS): string | null {
  if (Math.hypot(pointer.x - from.x, pointer.y - from.y) <= r) return null
  const start = add(from, scale(normalize(sub(pointer, from)), r))
  return `M ${start.x} ${start.y} L ${pointer.x} ${pointer.y}`
}

export function findStateAt(states: StateNode[], p: Point, r = STATE_RADIUS): StateNode | undefined {
  for (let i = states.length - 1; i >= 0; i--) {
    const s = states[i]
    if (Math.hypot(p.x - s.x, p.y - s.y) <= r) return s
  }
  return undefined
}

/**
 * Lasso: Zustände, deren Mittelpunkt im Rechteck zwischen `a` und `b` liegt, und die Übergänge
 * zwischen ihnen.
 */
export function elementsInRect(
  graph: EditorGraph,
  a: Point,
  b: Point
): { stateIds: string[]; transitionIds: string[] } {
  const [left, right] = [Math.min(a.x, b.x), Math.max(a.x, b.x)]
  const [top, bottom] = [Math.min(a.y, b.y), Math.max(a.y, b.y)]
  const inside = new Set(
    graph.states
      .filter((s) => s.x >= left && s.x <= right && s.y >= top && s.y <= bottom)
      .map((s) => s.id)
  )
  return {
    stateIds: [...inside],
    transitionIds: graph.transitions
      .filter((t) => inside.has(t.from) && inside.has(t.to))
      .map((t) => t.id)
  }
}

export function screenToWorld(viewport: Viewport, p: Point): Point {
  return { x: (p.x - viewport.x) / viewport.zoom, y: (p.y - viewport.y) / viewport.zoom }
}

export function worldToScreen(viewport: Viewport, p: Point): Point {
  return { x: p.x * viewport.zoom + viewport.x, y: p.y * viewport.zoom + viewport.y }
}
