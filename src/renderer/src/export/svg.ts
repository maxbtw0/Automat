import { labelLines, labelWordAlphabet, stateText } from '@/core/automaton/labels'
import type { TapeSnapshot } from '@/core/automaton/types'
import { endsWithoutFinal, type AutomatonDocument } from '@/model/graph'
import type { Highlight } from '@/store/editorStore'
import {
  LABEL_LINE_HEIGHT,
  STATE_RADIUS,
  edgeGeometries,
  labelCenter,
  labelLineYs
} from '@/utils/geometry'

/** Ein fertiges Bild als SVG-Text mit seiner Größe in Pixeln und seiner Hintergrundfarbe */
export interface SvgImage {
  svg: string
  width: number
  height: number
  background: string
}

export type ExportTheme = 'light' | 'dark'

export interface Palette {
  background: string
  ink: string
  edge: string
  muted: string
  stateFill: string
  accent: string
  accentSoft: string
  success: string
  successSoft: string
  danger: string
  dangerSoft: string
  header: string
  border: string
}

/**
 * Export-Farben. Hell: weißer Hintergrund zum Drucken. Dunkel: wie die App im Claude-Stil.
 * Die „Soft“-Töne sind fertig gemischt (16 % Farbe auf dem Hintergrund), damit sie in allen
 * Formaten gleich aussehen.
 */
export const PALETTES: Record<ExportTheme, Palette> = {
  light: {
    background: '#ffffff',
    ink: '#1f1e1d',
    edge: '#5f5d57',
    muted: '#85837a',
    stateFill: '#ffffff',
    accent: '#d97757',
    accentSoft: '#fbe8e1',
    success: '#3f8f3a',
    successSoft: '#e4f1de',
    danger: '#c0392b',
    dangerSoft: '#f8e1de',
    header: '#f4f3ee',
    border: '#dedbd2'
  },
  dark: {
    background: '#262624',
    ink: '#f0eee6',
    edge: '#9c998f',
    muted: '#b8b5aa',
    stateFill: '#2e2d2a',
    accent: '#d97757',
    accentSoft: '#43332c',
    success: '#8cbf73',
    successSoft: '#363e31',
    danger: '#e5534b',
    dangerSoft: '#452d2a',
    header: '#33322f',
    border: '#3a3935'
  }
}

const LIGHT = PALETTES.light

export const FONT = "'Segoe UI', system-ui, sans-serif"
export const MONO = "'Cascadia Code', Consolas, 'Courier New', monospace"
export const SERIF = "Georgia, 'Times New Roman', serif"

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

let measureContext: CanvasRenderingContext2D | null | undefined

/** Textbreite in Pixeln – ohne DOM (Tests) grob geschätzt. */
export function measureText(text: string, font: string, size: number): number {
  if (measureContext === undefined) {
    measureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (!measureContext) return text.length * size * 0.62
  measureContext.font = `${size}px ${font}`
  return measureContext.measureText(text).width
}

const svgImage = (width: number, height: number, content: string, palette: Palette): SvgImage => ({
  svg:
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${palette.background}"/>${content}</svg>`,
  width,
  height,
  background: palette.background
})

// --- Graph --------------------------------------------------------------------------

const R = STATE_RADIUS
const PADDING = 24

/**
 * Zeichnet den Graphen als eigenständiges SVG – unabhängig von Zoom und Verschiebung im
 * Editor, auf den Inhalt zugeschnitten. `highlight` färbt Zustände/Übergänge wie in der
 * Simulation. `idPrefix` hält Marker-IDs eindeutig, wenn mehrere Bilder in einem Dokument landen.
 */
export function graphSvg(
  document: AutomatonDocument,
  highlight?: Highlight | null,
  { palette = LIGHT, idPrefix = 'g' }: { palette?: Palette; idPrefix?: string } = {}
): SvgImage {
  const P = palette
  const { states, transitions } = document.graph
  if (states.length === 0) return svgImage(240, 120, '', P)

  // Hervorgehoben: der Pfad (NEA) bzw. alle aktiven Zustände; übrige aktive gestrichelt
  const activeStates = new Set(highlight?.pathStateIds ?? highlight?.activeStateIds)
  const reachableStates = new Set(highlight?.activeStateIds)
  const activeTransitions = new Set(highlight?.usedTransitionIds)

  // Begrenzung: Zustände, Startpfeile, Kantenbeschriftungen
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const include = (x1: number, y1: number, x2: number, y2: number): void => {
    minX = Math.min(minX, x1)
    minY = Math.min(minY, y1)
    maxX = Math.max(maxX, x2)
    maxY = Math.max(maxY, y2)
  }

  const edges: string[] = []
  const geometries = edgeGeometries(document.graph)
  for (const t of transitions) {
    const geometry = geometries.get(t.id)
    if (!geometry) continue
    const active = activeTransitions.has(t.id)
    const color = active ? P.accent : P.edge
    const lines = t.labels.length === 0 ? ['?'] : labelLines(t.labels, labelWordAlphabet(document))
    const textWidth = Math.max(...lines.map((line) => measureText(line, MONO, 13)))
    const { x, y } = labelCenter(geometry, textWidth, lines.length)
    const halfWidth = textWidth / 2 + 4
    const halfHeight = (lines.length * LABEL_LINE_HEIGHT) / 2 + 2
    include(x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight)
    const tspans = labelLineYs(y, lines.length)
      .map(
        (lineY, i) =>
          `<tspan x="${x}" y="${lineY}" dominant-baseline="central">${escapeXml(lines[i])}</tspan>`
      )
      .join('')
    const marker = active ? 'arrow-active' : 'arrow'
    edges.push(
      `<path d="${geometry.path}" fill="none" stroke="${color}" ` +
        `stroke-width="${active ? 3 : 2}" marker-end="url(#${idPrefix}-${marker})"/>` +
        `<text text-anchor="middle" font-family="${escapeXml(MONO)}" font-size="13" ` +
        `fill="${active ? P.accent : P.ink}" stroke="${P.background}" ` +
        `stroke-width="5" stroke-linejoin="round" paint-order="stroke">${tspans}</text>`
    )
  }

  const nodes: string[] = []
  for (const s of states) {
    // Lange Namen ragen über den Kreis hinaus (Moore: „q0/1“)
    const text = stateText(s, document)
    const half = Math.max(R, measureText(text, MONO, 14) / 2 + 2)
    include(Math.min(s.x - half, s.x - R - (s.isStart ? 40 : 0)), s.y - R, s.x + half, s.y + R)
    const active = activeStates.has(s.id)
    const accepted =
      active && highlight?.outcome === 'accepted' && (s.isFinal || endsWithoutFinal(document))
    const rejected = active && highlight?.outcome === 'rejected'
    const reachable = !active && reachableStates.has(s.id)
    const [stroke, fill] = accepted
      ? [P.success, P.successSoft]
      : rejected
        ? [P.danger, P.dangerSoft]
        : active || reachable
          ? [P.accent, P.accentSoft]
          : [P.ink, P.stateFill]
    const width = active ? 3 : 2
    const dash = reachable ? ' stroke-dasharray="5 4"' : ''
    nodes.push(
      `<g transform="translate(${s.x} ${s.y})">` +
        (s.isStart
          ? `<path d="M ${-R - 36} 0 L ${-R} 0" stroke="${P.ink}" stroke-width="2" ` +
            `marker-end="url(#${idPrefix}-arrow-start)"/>`
          : '') +
        `<circle r="${R}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash}/>` +
        (s.isFinal
          ? `<circle r="${R - 5}" fill="none" stroke="${reachable ? P.ink : stroke}" ` +
            `stroke-width="1.5"/>`
          : '') +
        `<text text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(MONO)}" ` +
        `font-size="14" fill="${P.ink}">${escapeXml(text)}</text></g>`
    )
  }

  const marker = (id: string, color: string): string =>
    `<marker id="${idPrefix}-${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="11" ` +
    `markerHeight="11" markerUnits="userSpaceOnUse" orient="auto">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"/></marker>`
  const defs =
    `<defs>${marker('arrow', P.edge)}${marker('arrow-active', P.accent)}` +
    `${marker('arrow-start', P.ink)}</defs>`

  const width = Math.ceil(maxX - minX + 2 * PADDING)
  const height = Math.ceil(maxY - minY + 2 * PADDING)
  const content =
    `${defs}<g transform="translate(${PADDING - minX} ${PADDING - minY})">` +
    `${edges.join('')}${nodes.join('')}</g>`
  return svgImage(width, height, content, P)
}

// --- Tabelle ------------------------------------------------------------------------

export interface ExportColumn {
  title: string
  mono?: boolean
  align?: 'left' | 'right'
}

/** current = hervorgehoben (aktueller Schritt), accepted/rejected = Ergebnisfarbe */
export type RowTone = 'current' | 'accepted' | 'rejected'

/** Ergebnis unter der Tabelle, z. B. „Verworfen“ oder der Grund eines Abbruchs */
export interface TableResult {
  text: string
  tone: 'accepted' | 'rejected' | 'aborted'
}

export interface ExportTable {
  title?: string
  /** Kleinere Zeile unter dem Titel, z. B. der Name des Automaten */
  subtitle?: string
  columns: ExportColumn[]
  rows: string[][]
  rowTones?: (RowTone | undefined)[]
  result?: TableResult
}

const CELL_PAD = 12
const ROW_HEIGHT = 28
const TEXT_SIZE = 13
const TITLE_SIZE = 20
const TITLE_HEIGHT = 44
const SUBTITLE_HEIGHT = 22
const RESULT_SIZE = 14
const RESULT_HEIGHT = 36
const MARGIN = 16

/**
 * Zeichnet eine Tabelle als SVG (Spaltenbreite nach dem längsten Eintrag). Das Bild ist
 * mindestens so breit wie Titel, Untertitel und Ergebniszeile.
 */
export function tableSvg(table: ExportTable, palette: Palette = LIGHT): SvgImage {
  const P = palette
  const fontOf = (column: ExportColumn): string => (column.mono ? MONO : FONT)
  // Schleife statt Math.max(...rows) – sehr lange Tabellen sprengen sonst den Aufrufstack
  const widths = table.columns.map(
    (column, c) =>
      table.rows.reduce(
        (max, row) => Math.max(max, measureText(row[c] ?? '', fontOf(column), TEXT_SIZE)),
        Math.max(48, measureText(column.title, FONT, TEXT_SIZE) + 8)
      ) +
      2 * CELL_PAD
  )
  const tableWidth = widths.reduce((a, b) => a + b, 0)
  const titleHeight =
    (table.title ? TITLE_HEIGHT : 0) + (table.title && table.subtitle ? SUBTITLE_HEIGHT : 0)
  const contentWidth = Math.max(
    tableWidth,
    table.title ? measureText(table.title, SERIF, TITLE_SIZE) : 0,
    table.title && table.subtitle ? measureText(table.subtitle, FONT, TEXT_SIZE) : 0,
    table.result ? measureText(table.result.text, FONT, RESULT_SIZE) : 0
  )
  const tableBottom = MARGIN + titleHeight + ROW_HEIGHT * (table.rows.length + 1)
  const width = Math.ceil(contentWidth + 2 * MARGIN)
  const height = Math.ceil(tableBottom + (table.result ? RESULT_HEIGHT : 0) + MARGIN)

  const columnX = (c: number): number => MARGIN + widths.slice(0, c).reduce((a, b) => a + b, 0)
  /** Text in Zelle (Spalte c, Zeile ab y); `attributes` z. B. Farbe/Fettdruck */
  const cellText = (text: string, c: number, y: number, attributes: string, font: string): string => {
    const right = table.columns[c].align === 'right'
    const x = right ? columnX(c) + widths[c] - CELL_PAD : columnX(c) + CELL_PAD
    return (
      `<text x="${x}" y="${y + ROW_HEIGHT / 2}" text-anchor="${right ? 'end' : 'start'}" ` +
      `dominant-baseline="central" font-family="${escapeXml(font)}" ` +
      `font-size="${TEXT_SIZE}" ${attributes}>${escapeXml(text)}</text>`
    )
  }
  const band = (y: number, fill: string): string =>
    `<rect x="${MARGIN}" y="${y}" width="${tableWidth}" height="${ROW_HEIGHT}" fill="${fill}"/>`
  const rule = (y: number): string =>
    `<line x1="${MARGIN}" y1="${y}" x2="${MARGIN + tableWidth}" y2="${y}" stroke="${P.border}"/>`

  const parts: string[] = []
  if (table.title) {
    parts.push(
      `<text x="${MARGIN}" y="${MARGIN + 22}" font-family="${escapeXml(SERIF)}" ` +
        `font-size="${TITLE_SIZE}" ` +
        `fill="${P.ink}">${escapeXml(table.title)}</text>`
    )
    if (table.subtitle) {
      parts.push(
        `<text x="${MARGIN}" y="${MARGIN + 46}" font-family="${escapeXml(FONT)}" font-size="13" ` +
          `fill="${P.muted}">${escapeXml(table.subtitle)}</text>`
      )
    }
  }
  const top = MARGIN + titleHeight
  parts.push(band(top, P.header))
  const headerStyle = `font-weight="600" fill="${P.muted}"`
  table.columns.forEach((column, c) => parts.push(cellText(column.title, c, top, headerStyle, FONT)))
  table.rows.forEach((row, r) => {
    const y = top + ROW_HEIGHT * (r + 1)
    const tone = table.rowTones?.[r]
    if (tone === 'current') parts.push(band(y, P.accentSoft))
    const color =
      tone === 'accepted' ? P.success : tone === 'rejected' ? P.danger : P.ink
    table.columns.forEach((column, c) =>
      parts.push(cellText(row[c] ?? '', c, y, `fill="${color}"`, fontOf(column)))
    )
    parts.push(rule(y))
  })
  parts.push(rule(tableBottom))
  if (table.result) {
    const { tone } = table.result
    const color = tone === 'accepted' ? P.success : tone === 'rejected' ? P.danger : P.muted
    parts.push(
      `<text x="${MARGIN}" y="${tableBottom + RESULT_HEIGHT / 2 + 4}" dominant-baseline="central" ` +
        `font-family="${escapeXml(FONT)}" font-size="${RESULT_SIZE}" font-weight="600" ` +
        `fill="${color}">${escapeXml(table.result.text)}</text>`
    )
  }

  return svgImage(width, height, parts.join(''), P)
}

/**
 * Eine Textzeile als Bild – z. B. Beschriftung „Schritt 2 · gelesen „a““ über einem Graphen.
 * Mindestens `minWidth` breit, bei längerem Text breiter.
 */
export function captionSvg(text: string, minWidth: number, palette: Palette = LIGHT): SvgImage {
  const P = palette
  const width = Math.ceil(Math.max(minWidth, measureText(text, SERIF, 18) + 2 * MARGIN))
  const height = 40
  const content =
    `<text x="${MARGIN}" y="${height / 2}" dominant-baseline="central" ` +
    `font-family="${escapeXml(SERIF)}" font-size="18" fill="${P.ink}">` +
    `${escapeXml(text)}</text>`
  return svgImage(width, height, content, P)
}

/**
 * Absatz mit Zeilenumbruch auf `width` – z. B. die Beschreibung unter einem Schritt. Ein
 * einzelnes Wort, das nicht in eine Zeile passt, macht das Bild breiter.
 */
export function paragraphSvg(text: string, minWidth: number, palette: Palette = LIGHT): SvgImage {
  const P = palette
  const size = 14
  const lineHeight = 20
  const longestWord = Math.max(0, ...text.split(' ').map((word) => measureText(word, FONT, size)))
  const width = Math.ceil(Math.max(minWidth, longestWord + 2 * MARGIN))
  const maxWidth = width - 2 * MARGIN
  const lines: string[] = []
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1]
    if (last !== undefined && measureText(`${last} ${word}`, FONT, size) <= maxWidth) {
      lines[lines.length - 1] = `${last} ${word}`
    } else {
      lines.push(word)
    }
  }
  const height = lines.length * lineHeight + 8
  const content = lines
    .map(
      (line, i) =>
        `<text x="${MARGIN}" y="${4 + (i + 0.5) * lineHeight}" dominant-baseline="central" ` +
        `font-family="${escapeXml(FONT)}" font-size="${size}" fill="${P.ink}">` +
        `${escapeXml(line)}</text>`
    )
    .join('')
  return svgImage(width, height, content, P)
}

/** Mehrere Bilder untereinander (horizontal zentriert) zu einem Bild zusammensetzen. */
export function columnSvg(images: SvgImage[], gap = 8): SvgImage {
  const background = images[0]?.background ?? LIGHT.background
  const width = Math.max(...images.map((i) => i.width))
  const height = images.reduce((sum, i) => sum + i.height, 0) + gap * (images.length - 1)
  let y = 0
  const parts = images.map((image) => {
    const x = (width - image.width) / 2
    // Das innere <svg> braucht eine eigene Position – die äußeren Attribute ersetzen.
    const placed = image.svg.replace('<svg ', `<svg x="${x}" y="${y}" `)
    y += image.height + gap
    return placed
  })
  return svgImage(width, height, parts.join(''), { ...LIGHT, background })
}

/** Mehrere Bilder nebeneinander (oben bündig) zu einem Bild zusammensetzen. */
export function rowSvg(images: SvgImage[], gap = 8): SvgImage {
  const background = images[0]?.background ?? LIGHT.background
  const width = images.reduce((sum, i) => sum + i.width, 0) + gap * (images.length - 1)
  const height = Math.max(...images.map((i) => i.height))
  let x = 0
  const parts = images.map((image) => {
    const placed = image.svg.replace('<svg ', `<svg x="${x}" y="0" `)
    x += image.width + gap
    return placed
  })
  return svgImage(width, height, parts.join(''), { ...LIGHT, background })
}

// --- Seiten -------------------------------------------------------------------------

export type Orientation = 'portrait' | 'landscape'

/** DIN A4 in Pixeln bei 96 dpi (21 × 29,7 cm) */
export const A4: Record<Orientation, { width: number; height: number }> = {
  portrait: { width: 794, height: 1123 },
  landscape: { width: 1123, height: 794 }
}

/** Seitenrand: 1 cm */
const PAGE_MARGIN = 38

/** Wie viele Zeilen eine Tabelle mit Titel, Untertitel und Ergebnis bei `scale` auf der Seite hat */
export function tableRowsPerPage(orientation: Orientation, scale = 1): number {
  const height = (A4[orientation].height - 2 * PAGE_MARGIN) / scale
  const fixed = 2 * MARGIN + TITLE_HEIGHT + SUBTITLE_HEIGHT + RESULT_HEIGHT + ROW_HEIGHT
  return Math.max(1, Math.floor((height - fixed) / ROW_HEIGHT))
}

/**
 * Bilder nebeneinander auf A4-Seiten (oben bündig): so viele pro Seite, wie bei `minScale` in
 * die Breite passen, der Rest auf die nächste Seite. Alle Seiten haben denselben Maßstab – höchstens
 * `scale`, kleiner, wenn eine Seite sonst nicht passt (ein einzelnes zu breites Bild auch darunter).
 */
export function sideBySidePages(
  images: SvgImage[],
  orientation: Orientation,
  { scale = 1, minScale = scale, gap = 24 }: { scale?: number; minScale?: number; gap?: number } = {}
): SvgImage[] {
  const page = {
    width: A4[orientation].width - 2 * PAGE_MARGIN,
    height: A4[orientation].height - 2 * PAGE_MARGIN
  }
  const width = page.width / minScale
  const groups: SvgImage[][] = []
  let used = 0
  for (const image of images) {
    const current = groups[groups.length - 1]
    if (current && used + gap + image.width <= width) {
      current.push(image)
      used += gap + image.width
    } else {
      groups.push([image])
      used = image.width
    }
  }
  const rows = groups.map((group) => rowSvg(group, gap))
  const common = rows.reduce(
    (min, row) => Math.min(min, Math.max(minScale, page.width / row.width), page.height / row.height),
    scale
  )
  return rows.map((row) => pageSvg(row, orientation, { maxScale: common }))
}

/**
 * Setzt ein Bild auf eine A4-Seite: horizontal zentriert, oben (`top`) oder in der Mitte
 * (`center`), zu große Bilder verkleinert, kleine bis `maxScale` vergrößert. Vorschau, PNG/JPG
 * und PDF zeigen dieselbe Seite.
 */
export function pageSvg(
  image: SvgImage,
  orientation: Orientation,
  { align = 'top', maxScale = 1 }: { align?: 'top' | 'center'; maxScale?: number } = {}
): SvgImage {
  const { width, height } = A4[orientation]
  const scale = Math.min(
    maxScale,
    (width - 2 * PAGE_MARGIN) / image.width,
    (height - 2 * PAGE_MARGIN) / image.height
  )
  const x = (width - image.width * scale) / 2
  const y = align === 'center' ? (height - image.height * scale) / 2 : PAGE_MARGIN
  const content = `<g transform="translate(${x} ${y}) scale(${scale})">${image.svg}</g>`
  return svgImage(width, height, content, { ...LIGHT, background: image.background })
}

// --- Stack --------------------------------------------------------------------------

const STACK_CELL_WIDTH = 72
const STACK_CELL_HEIGHT = 28
const STACK_CELL_GAP = 4
const STACK_HEADER = 32

/**
 * Stack des Kellerautomaten wie im Simulations-Screen: ein oben offenes Gefäß, das unterste
 * Symbol am Boden, das oberste hervorgehoben. `stack` = Inhalt, oben = letztes Element.
 * `minCells` hält die Höhe in einer Bildfolge gleich (größte Stackhöhe aller Schritte).
 */
export function stackFigureSvg(
  stack: string[],
  { palette = LIGHT, minCells = 1 }: { palette?: Palette; minCells?: number } = {}
): SvgImage {
  const P = palette
  const cells = Math.max(minCells, stack.length, 1)
  const cellWidth = Math.max(
    STACK_CELL_WIDTH,
    ...stack.map((s) => measureText(s, MONO, 14) + 2 * CELL_PAD)
  )
  const inner = 6
  const vesselWidth = cellWidth + 2 * inner
  const vesselHeight = cells * (STACK_CELL_HEIGHT + STACK_CELL_GAP) + inner
  const width = vesselWidth + 2 * MARGIN
  const height = STACK_HEADER + vesselHeight + 2 * MARGIN
  const left = MARGIN
  const top = MARGIN + STACK_HEADER
  const bottom = top + vesselHeight

  const parts: string[] = [
    `<text x="${left}" y="${MARGIN + 14}" font-family="${escapeXml(FONT)}" font-size="12" ` +
      `font-weight="600" fill="${P.muted}">Stack</text>`,
    `<text x="${left + vesselWidth}" y="${MARGIN + 14}" text-anchor="end" ` +
      `font-family="${escapeXml(MONO)}" font-size="12" fill="${P.muted}">${stack.length}</text>`,
    // Gefäß: links, unten, rechts – oben offen
    `<path d="M ${left} ${top} V ${bottom} H ${left + vesselWidth} V ${top}" fill="none" ` +
      `stroke="${P.edge}" stroke-width="2" stroke-linejoin="round"/>`
  ]
  const cell = (i: number, text: string, kind: 'top' | 'normal' | 'empty'): string => {
    const y = bottom - inner - (i + 1) * STACK_CELL_HEIGHT - i * STACK_CELL_GAP
    const [stroke, fill, color] =
      kind === 'top'
        ? [P.accent, P.accentSoft, P.ink]
        : kind === 'empty'
          ? [P.border, 'none', P.muted]
          : [P.border, P.stateFill, P.ink]
    return (
      `<rect x="${left + inner}" y="${y}" width="${cellWidth}" height="${STACK_CELL_HEIGHT}" ` +
      `rx="6" fill="${fill}" stroke="${stroke}"${kind === 'empty' ? ' stroke-dasharray="4 3"' : ''}/>` +
      `<text x="${left + inner + cellWidth / 2}" y="${y + STACK_CELL_HEIGHT / 2}" ` +
      `text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(MONO)}" ` +
      `font-size="14" fill="${color}">${escapeXml(text)}</text>`
    )
  }
  if (stack.length === 0) parts.push(cell(0, 'ε', 'empty'))
  stack.forEach((symbol, i) => parts.push(cell(i, symbol, i === stack.length - 1 ? 'top' : 'normal')))
  return svgImage(width, height, parts.join(''), P)
}

// --- Band ---------------------------------------------------------------------------

const TAPE_CELL = 40
const TAPE_HEADER = 28
/** Platz über den Zellen für Zustandsname und Kopf-Dreieck */
const TAPE_HEAD = 36

/**
 * Band der Turingmaschine wie im Simulations-Screen: Zellen von `from` bis `to`, die Zelle unter
 * dem Kopf hervorgehoben, darüber ein Dreieck mit dem Zustand. `from`/`to` halten das Bild in
 * einer Bildfolge gleich breit (Bereich aller Schritte).
 */
export function tapeFigureSvg(
  tape: TapeSnapshot,
  head: number,
  {
    palette = LIGHT,
    blank,
    state = '',
    from = Math.min(tape.start, head),
    to = Math.max(tape.start + tape.symbols.length - 1, head),
    alphabet
  }: {
    palette?: Palette
    blank: string
    state?: string
    from?: number
    to?: number
    /** Bandalphabet Γ für die Zellbreite – sonst zählen die Symbole im Ausschnitt */
    alphabet?: string[]
  }
): SvgImage {
  const P = palette
  const read = (p: number): string => tape.symbols[p - tape.start] ?? blank
  const shown = alphabet ?? Array.from({ length: to - from + 1 }, (_, i) => read(from + i))
  let cellWidth = TAPE_CELL
  for (const s of [...shown, blank]) {
    cellWidth = Math.max(cellWidth, measureText(s, MONO, 15) + 2 * CELL_PAD)
  }
  const count = to - from + 1
  const cellsWidth = count * cellWidth
  // Ein langer Zustandsname über dem Kopf darf seitlich über die Zellen hinausragen
  const labelWidth = measureText(state, MONO, 12) + 14
  const headOffset = (head - from + 0.5) * cellWidth
  const overLeft = Math.max(0, labelWidth / 2 - headOffset)
  const overRight = Math.max(0, headOffset + labelWidth / 2 - cellsWidth)
  const contentWidth = cellsWidth + overLeft + overRight
  const width = Math.ceil(Math.max(contentWidth + 2 * MARGIN, 120))
  const left = (width - contentWidth) / 2 + overLeft
  const top = MARGIN + TAPE_HEADER + TAPE_HEAD
  const height = top + TAPE_CELL + MARGIN
  const cellX = (p: number): number => left + (p - from) * cellWidth

  const parts: string[] = [
    `<text x="${MARGIN}" y="${MARGIN + 14}" font-family="${escapeXml(FONT)}" font-size="12" ` +
      `font-weight="600" fill="${P.muted}">Band</text>`
  ]
  const cell = (p: number, isHead: boolean): string => {
    const symbol = read(p)
    const [stroke, fill, strokeWidth] = isHead
      ? [P.accent, P.accentSoft, 2]
      : [P.border, P.stateFill, 1]
    const color = symbol === blank && !isHead ? P.muted : P.ink
    return (
      `<rect x="${cellX(p)}" y="${top}" width="${cellWidth}" height="${TAPE_CELL}" ` +
      `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
      `<text x="${cellX(p) + cellWidth / 2}" y="${top + TAPE_CELL / 2}" text-anchor="middle" ` +
      `dominant-baseline="central" font-family="${escapeXml(MONO)}" font-size="15" ` +
      `fill="${color}">${escapeXml(symbol)}</text>`
    )
  }
  for (let p = from; p <= to; p++) if (p !== head) parts.push(cell(p, false))
  parts.push(cell(head, true))

  // Kopf: Zustandsname über einem Dreieck, das auf die Zelle zeigt
  const headX = cellX(head) + cellWidth / 2
  const labelY = MARGIN + TAPE_HEADER
  parts.push(
    `<rect x="${headX - labelWidth / 2}" y="${labelY}" width="${labelWidth}" height="20" rx="4" ` +
      `fill="${P.accentSoft}"/>` +
      `<text x="${headX}" y="${labelY + 10}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="${escapeXml(MONO)}" font-size="12" fill="${P.accent}">${escapeXml(state)}</text>` +
      `<path d="M ${headX - 7} ${top - 12} L ${headX + 7} ${top - 12} L ${headX} ${top - 3} z" ` +
      `fill="${P.accent}"/>`
  )
  return svgImage(width, height, parts.join(''), P)
}

// --- Ausgabe ------------------------------------------------------------------------

const OUTPUT_CELL = 36
const OUTPUT_ROW_GAP = 6
const OUTPUT_HEADER = 28

/** Eine Spalte der Ausgabe: Eingabesymbol (`null` = Moore-Start) und erzeugtes Stück */
export interface OutputColumn {
  input: string | null
  /** Erzeugtes Stück als Text – `null`, solange die Spalte noch nicht gelesen ist */
  output: string | null
  /** Text, nach dem sich die Breite richtet (in einer Bildfolge das endgültige Stück) */
  reserve?: string
}

/**
 * Transduktor wie im Simulations-Screen: Eingabe über Ausgabe, eine Spalte pro Eingabesymbol.
 * `current` = Spalte des letzten Schritts (-1 = keine), am Ende grün bzw. rot. Rechts oben steht
 * die ganze Ausgabe `word`; `reserveWord` hält die Breite in einer Bildfolge gleich.
 */
export function outputFigureSvg(
  columns: OutputColumn[],
  {
    palette = LIGHT,
    current = -1,
    outcome,
    word,
    reserveWord = word
  }: {
    palette?: Palette
    current?: number
    outcome?: 'accepted' | 'rejected'
    word: string
    reserveWord?: string
  }
): SvgImage {
  const P = palette
  const names = ['Eingabe', 'Ausgabe']
  const nameWidth = Math.max(...names.map((n) => measureText(n, FONT, 12))) + 12
  const widths = columns.map((c) =>
    Math.max(
      OUTPUT_CELL,
      ...[c.input ?? 'Start', c.output ?? '', c.reserve ?? ''].map(
        (text) => measureText(text, MONO, 15) + 2 * CELL_PAD
      )
    )
  )
  const cellsWidth = widths.reduce((sum, w) => sum + w, 0)
  const headerWidth = measureText('Ausgabe', FONT, 12) + 24 + measureText(reserveWord, MONO, 15)
  const width = Math.ceil(2 * MARGIN + Math.max(nameWidth + cellsWidth, headerWidth, 120))
  const top = MARGIN + OUTPUT_HEADER
  const height = top + 2 * OUTPUT_CELL + OUTPUT_ROW_GAP + MARGIN
  const [accent, accentSoft] =
    outcome === 'accepted'
      ? [P.success, P.successSoft]
      : outcome === 'rejected'
        ? [P.danger, P.dangerSoft]
        : [P.accent, P.accentSoft]

  const parts: string[] = [
    `<text x="${MARGIN}" y="${MARGIN + 14}" font-family="${escapeXml(FONT)}" font-size="12" ` +
      `font-weight="600" fill="${P.muted}">Ausgabe</text>`,
    `<text x="${width - MARGIN}" y="${MARGIN + 14}" text-anchor="end" ` +
      `font-family="${escapeXml(MONO)}" font-size="15" ` +
      `fill="${outcome ? accent : P.ink}">${escapeXml(word)}</text>`,
    ...names.map(
      (name, row) =>
        `<text x="${MARGIN}" y="${top + row * (OUTPUT_CELL + OUTPUT_ROW_GAP) + OUTPUT_CELL / 2}" ` +
        `dominant-baseline="central" font-family="${escapeXml(FONT)}" font-size="12" ` +
        `font-weight="600" fill="${P.muted}">${name}</text>`
    )
  ]
  const cell = (
    x: number,
    w: number,
    row: number,
    text: string,
    color: string,
    isCurrent: boolean
  ): string => {
    const y = top + row * (OUTPUT_CELL + OUTPUT_ROW_GAP)
    const [stroke, fill, strokeWidth] = isCurrent
      ? [accent, accentSoft, 2]
      : [P.border, P.stateFill, 1]
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${OUTPUT_CELL}" fill="${fill}" ` +
      `stroke="${stroke}" stroke-width="${strokeWidth}"/>` +
      `<text x="${x + w / 2}" y="${y + OUTPUT_CELL / 2}" text-anchor="middle" ` +
      `dominant-baseline="central" font-family="${escapeXml(text === 'Start' ? FONT : MONO)}" ` +
      `font-size="${text === 'Start' ? 12 : 15}" fill="${color}">${escapeXml(text)}</text>`
    )
  }
  // Erst die übrigen Spalten, dann die aktuelle – ihr Rahmen liegt oben
  const left = MARGIN + nameWidth
  const xs = widths.map((_, i) => left + widths.slice(0, i).reduce((sum, w) => sum + w, 0))
  const order = [...columns.keys()].sort((a, b) => Number(a === current) - Number(b === current))
  for (const i of order) {
    const { input, output } = columns[i]
    const isCurrent = i === current
    const inputColor = input === null || (current >= 0 && i < current) ? P.muted : P.ink
    const outputColor = output === 'ε' ? P.muted : isCurrent ? accent : P.ink
    parts.push(cell(xs[i], widths[i], 0, input ?? 'Start', inputColor, isCurrent))
    parts.push(cell(xs[i], widths[i], 1, output ?? '', outputColor, isCurrent))
  }
  if (columns.length === 0) {
    parts.push(
      cell(left, OUTPUT_CELL, 0, 'ε', P.muted, false),
      cell(left, OUTPUT_CELL, 1, '', P.ink, false)
    )
  }
  return svgImage(width, height, parts.join(''), P)
}
