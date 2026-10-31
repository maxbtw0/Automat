import type { FileFilter } from '@shared/ipc'
import { pdfHtml, rasterize } from '@/export/render'
import {
  PALETTES,
  captionSvg,
  graphSvg,
  columnSvg,
  pageSvg,
  paragraphSvg,
  rowSvg,
  stackFigureSvg,
  tableSvg,
  tapeFigureSvg,
  type ExportTable,
  type ExportTheme,
  type Palette,
  type SvgImage
} from '@/export/svg'
import {
  alphabetTable,
  paginateTable,
  simulationTable,
  tableToCsv,
  transitionTable,
  type SimulationSnapshot
} from '@/export/tables'
import { describeOutcome, describeStep } from '@/core/automaton/describe'
import { formatLabel } from '@/core/automaton/labels'
import { EXPORT_STEP_LIMIT, simulationLimits } from '@/core/automaton/limits'
import { createAutomaton } from '@/core/automaton/registry'
import type { SimulationStep } from '@/core/automaton/types'
import { tapeSettings, type AutomatonDocument } from '@/model/graph'
import { useDialogStore } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore, type Screen } from '@/store/screenStore'
import { commitActiveInput } from '@/utils/dom'
import { displayName } from './fileActions'

export type ExportFormat = 'csv' | 'png' | 'jpg' | 'pdf'

export type ExportContent =
  | 'graph'
  | 'alphabet'
  | 'transitionTable'
  | 'simulationTable'
  | 'simulationGraph'
  | 'simulationGraphTable'

export const CONTENT_LABEL: Record<ExportContent, string> = {
  graph: 'Graph',
  alphabet: 'Alphabet',
  transitionTable: 'Übergangstabelle',
  simulationTable: 'Tabelle',
  simulationGraph: 'Graph als Bildfolge',
  simulationGraphTable: 'Graph mit Tabelle'
}

const TABLE_FORMATS: ExportFormat[] = ['csv', 'png', 'jpg', 'pdf']
const IMAGE_FORMATS: ExportFormat[] = ['png', 'jpg', 'pdf']

export const FORMATS: Record<ExportContent, ExportFormat[]> = {
  graph: IMAGE_FORMATS,
  alphabet: TABLE_FORMATS,
  transitionTable: TABLE_FORMATS,
  simulationTable: TABLE_FORMATS,
  simulationGraph: IMAGE_FORMATS,
  simulationGraphTable: IMAGE_FORMATS
}

/** Bereiche = Reiter im Export-Fenster, jeweils mit ihren möglichen Inhalten */
export type ExportArea = 'graph' | 'alphabet' | 'transitionTable' | 'simulation'

export const EXPORT_AREAS: { area: ExportArea; label: string; contents: ExportContent[] }[] = [
  { area: 'graph', label: 'Graph', contents: ['graph'] },
  { area: 'alphabet', label: 'Alphabet', contents: ['alphabet'] },
  { area: 'transitionTable', label: 'Übergangstabelle', contents: ['transitionTable'] },
  {
    area: 'simulation',
    label: 'Simulation',
    contents: ['simulationTable', 'simulationGraph', 'simulationGraphTable']
  }
]

export function areaContents(area: ExportArea): ExportContent[] {
  return EXPORT_AREAS.find((a) => a.area === area)?.contents ?? []
}

/** Mit welchem Reiter das Export-Fenster auf einem Screen öffnet */
export function defaultExportArea(screen: Screen): ExportArea {
  return screen === 'regex' ? 'graph' : screen
}

const FILTERS: Record<ExportFormat, FileFilter> = {
  csv: { name: 'CSV-Tabelle', extensions: ['csv'] },
  png: { name: 'PNG-Bild', extensions: ['png'] },
  jpg: { name: 'JPG-Bild', extensions: ['jpg', 'jpeg'] },
  pdf: { name: 'PDF', extensions: ['pdf'] }
}

const FILE_SUFFIX: Record<ExportContent, string> = {
  graph: 'graph',
  alphabet: 'alphabet',
  transitionTable: 'uebergangstabelle',
  simulationTable: 'simulation',
  simulationGraph: 'simulation-schritt',
  simulationGraphTable: 'simulation'
}

/** Zeilen pro A4-Seite bei langen Tabellen (PDF) */
const ROWS_PER_PAGE = 32

export interface ExportOptions {
  /** Bildfolge: unter jedem Bild ein Satz, was in dem Schritt passiert */
  description?: boolean
}

/** Das, was exportiert wird: die Seiten und – bei Tabellen-Inhalten – die Tabelle (für CSV). */
interface Prepared {
  table: ExportTable | null
  pages: SvgImage[]
}

/**
 * Wie Tabellen und Graphen auf die Seiten kommen. PDF: A4-Seiten – Tabellen hoch (lange auf
 * mehrere Seiten verteilt), Graphen quer, mittig, kleine bis aufs Doppelte vergrößert.
 * PNG/JPG/CSV: zugeschnittene Bilder, eine Tabelle immer als ein Bild.
 */
interface Layout {
  table(table: ExportTable): SvgImage[]
  graph(image: SvgImage): SvgImage
}

function layoutFor(format: ExportFormat, palette: Palette): Layout {
  if (format !== 'pdf') return { table: (t) => [tableSvg(t, palette)], graph: (image) => image }
  return {
    table: (t) =>
      paginateTable(t, ROWS_PER_PAGE).map((page) => pageSvg(tableSvg(page, palette), 'portrait')),
    graph: (image) => pageSvg(image, 'landscape', { align: 'center', maxScale: 2 })
  }
}

function highlightOf(step: SimulationStep, outcome?: 'accepted' | 'rejected') {
  const { activeStateIds, usedTransitionIds } = step
  return { activeStateIds, usedTransitionIds, outcome }
}

function stepCaption(step: SimulationStep): string {
  const rule = step.label ? formatLabel(step.label) : 'Start'
  // Turingmaschine: Eingabe und Band sind dasselbe – das Bild zeigt das Band
  if (step.tape) return `Schritt ${step.index} · ${rule}`
  const rest = `Rest „${step.remaining || 'ε'}“`
  // Den Stack zeigt das Bild daneben
  if (step.stack) return `Schritt ${step.index} · ${rule} · ${rest}`
  const read = step.symbol === null ? 'Start' : `gelesen „${step.symbol}“`
  return `Schritt ${step.index} · ${read} · ${rest}`
}

/**
 * Die Simulation für den Export: immer der komplette Lauf für das eingegebene Wort, mit
 * Ergebnis – unabhängig davon, ob und wie weit sie auf dem Screen schon gelaufen ist.
 * „Graph mit Tabelle“ zeigt die Endkonfiguration.
 */
function simulationForExport(document: AutomatonDocument): SimulationSnapshot {
  const word = useScreenStore.getState().simulationWord
  const automaton = createAutomaton(document)
  const errors = automaton.validate().filter((issue) => issue.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map((issue) => issue.message).join(' · '))
  const simulator = automaton.createSimulator(word)
  // Darf die Turingmaschine unbegrenzt laufen, rechnet der Export trotzdem nur bis zur Grenze.
  const unlimited = simulationLimits().tmStepLimit === 0
  const steps = [
    simulator.reset(),
    ...simulator.run(unlimited ? EXPORT_STEP_LIMIT : Infinity).steps
  ]
  const outcome = simulator.isFinished && simulator.accepted ? 'accepted' : 'rejected'
  const abortReason = simulator.isFinished
    ? (simulator.abortReason ?? null)
    : `Abbruch nach ${EXPORT_STEP_LIMIT.toLocaleString('de-DE')} Schritten`
  return { word, steps, index: steps.length - 1, outcome, abortReason }
}

/** Bandausschnitt über alle Schritte – mit einer leeren Zelle Rand auf jeder Seite */
function tapeRangeOf(steps: SimulationStep[]): { from: number; to: number } {
  let from = 0
  let to = 0
  for (const step of steps) {
    if (!step.tape) continue
    const head = step.head ?? 0
    from = Math.min(from, step.tape.start, head)
    to = Math.max(to, step.tape.start + step.tape.symbols.length - 1, head)
  }
  return { from: from - 1, to: to + 1 }
}

function prepare(
  content: ExportContent,
  format: ExportFormat,
  document: AutomatonDocument,
  palette: Palette,
  name: string,
  layout: Layout,
  { description = false }: ExportOptions
): Prepared {
  // Tabellen tragen den Namen des Automaten unter dem Titel
  const named = (table: ExportTable): ExportTable => ({ ...table, subtitle: name })
  const tableOnly = (table: ExportTable): Prepared => ({
    table: named(table),
    pages: layout.table(named(table))
  })
  if (content === 'graph') {
    return { table: null, pages: [layout.graph(graphSvg(document, null, { palette }))] }
  }
  if (content === 'alphabet') return tableOnly(alphabetTable(document))
  if (content === 'transitionTable') {
    const sorted = useScreenStore.getState().transitionTableSorted
    return tableOnly(transitionTable(document, sorted))
  }

  const snapshot = simulationForExport(document)
  const last = snapshot.steps.length - 1
  const outcomeAt = (i: number): 'accepted' | 'rejected' | undefined =>
    i === last ? snapshot.outcome : undefined

  if (content === 'simulationTable') return tableOnly(simulationTable(document, snapshot))
  // Kellerautomat: Stack rechts neben dem Graphen, in der Bildfolge überall gleich hoch
  // (Schleife statt Math.max(...steps) – zu viele Argumente sprengen den Aufrufstack)
  const minCells = snapshot.steps.reduce((max, s) => Math.max(max, s.stack?.length ?? 0), 1)
  // Turingmaschine: Band über dem Graphen, in der Bildfolge überall derselbe Ausschnitt
  const tapeRange = tapeRangeOf(snapshot.steps)
  const { blank } = tapeSettings(document)
  /** Beschreibung zu Schritt i, beim letzten mit dem Ergebnis */
  const describe = (i: number): string => {
    const text = describeStep(document, snapshot.steps[i], snapshot.steps[i - 1])
    if (i !== last) return text
    const accepted = snapshot.outcome === 'accepted'
    return `${text} ${describeOutcome(snapshot.word, accepted, snapshot.abortReason)}`
  }
  const stateLabel = (step: SimulationStep): string =>
    document.graph.states.find((s) => s.id === step.activeStateIds[0])?.label ?? ''
  const withStack = (graph: SvgImage, step: SimulationStep): SvgImage => {
    if (step.tape) {
      const tape = tapeFigureSvg(step.tape, step.head ?? 0, {
        palette,
        blank,
        state: stateLabel(step),
        ...tapeRange
      })
      return columnSvg([tape, graph], 8)
    }
    if (!step.stack) return graph
    return rowSvg([graph, stackFigureSvg(step.stack, { palette, minCells })], 16)
  }

  if (content === 'simulationGraph') {
    const pages = snapshot.steps.map((step, i) => {
      const highlight = highlightOf(step, outcomeAt(i))
      const graph = withStack(graphSvg(document, highlight, { palette, idPrefix: `s${i}` }), step)
      // Mindestbreite, damit die Beschreibung bei kleinen Graphen nicht zu oft umbricht
      const width = description ? Math.max(graph.width, 480) : graph.width
      const parts = [captionSvg(stepCaption(step), width, palette), graph]
      if (description) parts.push(paragraphSvg(describe(i), width, palette))
      return layout.graph(columnSvg(parts))
    })
    return { table: null, pages }
  }
  // Graph mit Tabelle: Graph (und Stack/Band) in der Endkonfiguration + ganze Tabelle –
  // als PDF Graph quer, dahinter die Tabelle hoch; als Bild beides untereinander
  const step = snapshot.steps[snapshot.index]
  const highlight = highlightOf(step, outcomeAt(snapshot.index))
  const graph = withStack(graphSvg(document, highlight, { palette }), step)
  const table = named(simulationTable(document, snapshot, { markCurrent: true }))
  if (format === 'pdf') return { table: null, pages: [layout.graph(graph), ...layout.table(table)] }
  return { table: null, pages: [columnSvg([graph, tableSvg(table, palette)], 16)] }
}

export interface ExportPlan {
  /** Die Tabelle (für CSV), falls der Inhalt eine Tabelle ist */
  table: ExportTable | null
  /** Die Bilder bzw. PDF-Seiten, genau so, wie sie exportiert werden – auch für die Vorschau */
  pages: SvgImage[]
}

/**
 * Bereitet den Export vor, ohne etwas zu speichern (Vorschau und Export nutzen dasselbe).
 * PDF besteht aus A4-Seiten (Tabellen hoch, Graphen quer), PNG/JPG aus zugeschnittenen Bildern.
 */
export function planExport(
  content: ExportContent,
  format: ExportFormat,
  theme: ExportTheme,
  options: ExportOptions = {}
): ExportPlan {
  const { document, filePath } = useEditorStore.getState()
  // CSV hat keine Farben – die Vorschau zeigt die Tabelle hell
  const palette = PALETTES[format === 'csv' ? 'light' : theme]
  const layout = layoutFor(format, palette)
  const name = displayName(filePath)
  return prepare(content, format, document, palette, name, layout, options)
}

/** Speichert die Datei – in Electron über den Dialog, im Browser als Download. */
async function save(
  fileName: string,
  format: ExportFormat,
  data: Uint8Array
): Promise<string | null> {
  if (window.api) return window.api.saveExport(fileName, FILTERS[format], data)
  download(fileName, data)
  return fileName
}

function download(fileName: string, data: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart]))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Führt den Export aus. Liefert den Speicherort oder `null`, wenn der Nutzer abbricht.
 * Bildfolgen (mehrere Bilder als PNG/JPG) landen als nummerierte Dateien in einem Ordner,
 * als PDF bekommt jedes Bild eine eigene Seite.
 */
export async function runExport(
  content: ExportContent,
  format: ExportFormat,
  theme: ExportTheme,
  options: ExportOptions = {}
): Promise<string | null> {
  const { filePath } = useEditorStore.getState()
  const { table, pages } = planExport(content, format, theme, options)
  const base = `${displayName(filePath)}-${FILE_SUFFIX[content]}`

  if (format === 'csv') {
    if (!table) throw new Error('CSV gibt es nur für Tabellen.')
    return save(`${base}.csv`, 'csv', new TextEncoder().encode(tableToCsv(table)))
  }

  if (format === 'pdf') {
    const html = pdfHtml(pages)
    if (window.api) return window.api.exportPdf(`${base}.pdf`, html)
    printInBrowser(html)
    return `${base}.pdf`
  }

  const type = format === 'jpg' ? 'jpeg' : 'png'
  const files = await Promise.all(pages.map((image) => rasterize(image, type)))
  if (files.length === 1) return save(`${base}.${format}`, format, files[0])
  if (window.api) return window.api.saveExportSequence(base, format, files)
  files.forEach((data, i) => download(`${base}-${String(i + 1).padStart(2, '0')}.${format}`, data))
  return base
}

/** Browser-Modus (Entwicklung): Druckdialog mit „Als PDF speichern“. */
function printInBrowser(html: string): void {
  const win = window.open('', '_blank')
  if (!win) throw new Error('Popup blockiert')
  win.document.write(html)
  win.document.close()
  window.setTimeout(() => win.print(), 100)
}

/** Öffnet das Export-Fenster (mit dem Reiter des aktuellen Screens). */
export function openExportDialog(): void {
  commitActiveInput()
  useDialogStore.getState().setExportOpen(true)
}
