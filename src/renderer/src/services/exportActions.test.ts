import { DEFAULT_SIMULATION } from '@shared/simulationSettings'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomatApi } from '@shared/ipc'
import { setSimulationLimits } from '@/core/automaton/limits'
import { buildDocument } from '@/core/automaton/testing'
import { TuringSimulator } from '@/core/automaton/tmSimulator'
import type { SimulationStep } from '@/core/automaton/types'
import { MAX_CANVAS_PIXELS, MAX_CANVAS_SIDE } from '@/export/render'
import { A4 } from '@/export/svg'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import {
  FORMATS,
  allPages,
  defaultExportArea,
  forEachLimited,
  planExport,
  MAX_TAPE_CELLS,
  runExport,
  tapeRangeOf,
  tapeWindow
} from './exportActions'

/** Rastern braucht einen echten Browser – hier zählt nur, wie viele gleichzeitig laufen */
const raster = vi.hoisted(() => ({ running: 0, most: 0 }))
vi.mock('@/export/render', async (original) => ({
  ...(await original<typeof import('@/export/render')>()),
  rasterize: async () => {
    raster.most = Math.max(raster.most, ++raster.running)
    await new Promise((resolve) => setTimeout(resolve, 1))
    raster.running--
    return new Uint8Array([1])
  }
}))

/** Wie oft ein Graph gebaut wird – die Vorschau einer Bildfolge soll nur eine Seite bauen */
const built = vi.hoisted(() => ({ graphs: 0 }))
vi.mock('@/export/svg', async (original) => {
  const svg = await original<typeof import('@/export/svg')>()
  return {
    ...svg,
    graphSvg: (...args: Parameters<typeof svg.graphSvg>) => {
      built.graphs++
      return svg.graphSvg(...args)
    }
  }
})

const pagesOf = (...args: Parameters<typeof planExport>) => allPages(planExport(...args))

/** Gerade Anzahl a */
const evenAs = buildDocument('DFA', ['a', 'b'], { start: 'q0', finals: ['q0'] }, [
  ['q0', 'a', 'q1'],
  ['q1', 'a', 'q0'],
  ['q0', 'b', 'q0'],
  ['q1', 'b', 'q1']
])

beforeEach(() => {
  useEditorStore.getState().loadDocument(structuredClone(evenAs), null)
  useScreenStore.setState({ simulationWord: 'aba' })
})

describe('Simulation exportieren', () => {
  it('geht auch ohne gestartete Simulation – mit dem kompletten Lauf', () => {
    const plan = planExport('simulationTable', 'csv', 'light')
    const { table } = plan
    const pages = allPages(plan)
    expect(table?.rows.map((r) => r[2])).toEqual(['q0', 'q1', 'q1', 'q0'])
    expect(table?.rowTones?.at(-1)).toBe('accepted')
    expect(pages).toHaveLength(1)
  })

  it('Bildfolge: ein Bild pro Schritt – als PDF A4 quer, als PNG zugeschnitten', () => {
    const pdf = pagesOf('simulationGraph', 'pdf', 'dark')
    expect(pdf).toHaveLength(4)
    expect(pdf.every((p) => p.width === A4.landscape.width)).toBe(true)
    const png = pagesOf('simulationGraph', 'png', 'dark')
    expect(png).toHaveLength(4)
    expect(png[0].width).toBeLessThan(A4.landscape.width)
  })

  it('Bildfolge: baut eine Seite erst, wenn sie gebraucht wird', () => {
    useScreenStore.setState({ simulationWord: 'ab'.repeat(50) })
    built.graphs = 0
    const plan = planExport('simulationGraph', 'png', 'light')
    expect(plan.pageCount).toBe(101)
    expect(built.graphs).toBe(0)
    expect(plan.page(100).svg).toContain('Schritt 100')
    expect(built.graphs).toBe(1)
  })

  it('Bildfolge mit Beschreibung: ein Satz pro Schritt, am Ende das Ergebnis', () => {
    const plain = pagesOf('simulationGraph', 'pdf', 'light')
    expect(plain[1].svg).not.toContain('gelesen und')
    const pages = pagesOf('simulationGraph', 'pdf', 'light', { description: true })
    expect(pages[1].svg).toContain('Es wird „a“ gelesen und in Zustand q1 gewechselt.')
    expect(pages[3].svg).toContain('Das Wort „aba“ wird akzeptiert.')
  })

  it('Graph mit Tabelle: als PDF Graph quer, Tabelle hoch – als PNG ein Bild', () => {
    const pages = pagesOf('simulationGraphTable', 'pdf', 'light')
    expect(pages.map((p) => p.width)).toEqual([A4.landscape.width, A4.portrait.width])
    expect(pagesOf('simulationGraphTable', 'png', 'light')).toHaveLength(1)
  })

  it('Graph mit Tabelle schafft auch sehr lange Läufe', () => {
    const loop = buildDocument('TM', ['a'], { start: 'q0', finals: [] }, [['q0', '# → #, N', 'q0']])
    useEditorStore.getState().loadDocument(loop, null)
    useScreenStore.setState({ simulationWord: '' })
    setSimulationLimits({ ...DEFAULT_SIMULATION, tmStepLimit: 150_000 })
    try {
      expect(pagesOf('simulationGraphTable', 'png', 'light')).toHaveLength(1)
    } finally {
      setSimulationLimits(DEFAULT_SIMULATION)
    }
  })

  it('rechnet nur die Turingmaschine bis zur Exportgrenze – andere Typen bis zum Ende', () => {
    const loop = buildDocument('DFA', ['a'], { start: 'q0', finals: ['q0'] }, [['q0', 'a', 'q0']])
    useEditorStore.getState().loadDocument(loop, null)
    useScreenStore.setState({ simulationWord: 'a'.repeat(10_001) })
    setSimulationLimits({ ...DEFAULT_SIMULATION, tmStepLimit: 0 })
    try {
      const { table } = planExport('simulationTable', 'csv', 'light')
      expect(table?.rows).toHaveLength(10_002)
      expect(table?.result).toEqual({ text: 'Akzeptiert', tone: 'accepted' })
    } finally {
      setSimulationLimits(DEFAULT_SIMULATION)
    }
  })

  it('ein Abbruch am Limit ist weder akzeptiert noch verworfen', () => {
    const tm = buildDocument('TM', ['a'], { start: 'q0', finals: ['q2'] }, [
      ['q0', '# → #, N', 'q1'],
      ['q1', '# → #, N', 'q2']
    ])
    useEditorStore.getState().loadDocument(tm, null)
    useScreenStore.setState({ simulationWord: '' })
    setSimulationLimits({ ...DEFAULT_SIMULATION, tmStepLimit: 1 })
    try {
      const { table } = planExport('simulationTable', 'csv', 'light')
      expect(table?.rowTones?.at(-1)).toBeUndefined()
      expect(table?.result).toEqual({ text: 'Abbruch nach 1 Schritten', tone: 'aborted' })
    } finally {
      setSimulationLimits(DEFAULT_SIMULATION)
    }
    expect(planExport('simulationTable', 'csv', 'light').table?.result?.tone).toBe('accepted')
  })

  it('meldet, warum es nicht geht', () => {
    useEditorStore.getState().updateState('q0', { isStart: false })
    expect(() => planExport('simulationTable', 'csv', 'light')).toThrow('Kein Startzustand')
  })
})

describe('Bildfolge exportieren', () => {
  const events: string[] = []
  const api = {
    beginExportSequence: vi.fn<AutomatApi['beginExportSequence']>(async () => {
      events.push('Ordner')
      return { id: 1, folder: '/bilder' }
    }),
    writeExportSequence: vi.fn<AutomatApi['writeExportSequence']>(async (_id, index) => {
      events.push(`Bild ${index}`)
    })
  }

  beforeEach(() => {
    events.length = 0
    raster.most = 0
    vi.stubGlobal('window', { api })
    useScreenStore.setState({ simulationWord: 'ab'.repeat(10) })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('fragt zuerst nach dem Ordner und rastert höchstens zwei Bilder gleichzeitig', async () => {
    expect(await runExport('simulationGraph', 'png', 'light')).toBe('/bilder')
    expect(events[0]).toBe('Ordner')
    expect(events).toHaveLength(22)
    expect(new Set(events.slice(1)).size).toBe(21)
    expect(raster.most).toBe(2)
    expect(api.writeExportSequence).toHaveBeenCalledWith(1, 0, expect.any(Uint8Array))
  })

  it('rastert nichts, wenn die Ordnerwahl abgebrochen wird', async () => {
    api.beginExportSequence.mockResolvedValueOnce(null)
    expect(await runExport('simulationGraph', 'png', 'light')).toBeNull()
    expect(raster.most).toBe(0)
  })
})

describe('Seitenformat', () => {
  it('PDF: Tabellen A4 hoch (lange auf mehrere Seiten), Graph A4 quer', () => {
    expect(pagesOf('transitionTable', 'pdf', 'light')[0]).toMatchObject(A4.portrait)
    expect(pagesOf('graph', 'pdf', 'light')[0]).toMatchObject(A4.landscape)
    useScreenStore.setState({ simulationWord: 'ab'.repeat(20) })
    const pages = pagesOf('simulationTable', 'pdf', 'light')
    expect(pages).toHaveLength(2)
    expect(pages.every((p) => p.height === A4.portrait.height)).toBe(true)
  })

  it('PNG/JPG/CSV: zugeschnitten, lange Tabelle als ein Bild', () => {
    useScreenStore.setState({ simulationWord: 'ab'.repeat(20) })
    const [table] = pagesOf('simulationTable', 'jpg', 'light')
    expect(pagesOf('simulationTable', 'jpg', 'light')).toHaveLength(1)
    expect(table.height).toBeGreaterThan(A4.portrait.height)
    expect(pagesOf('graph', 'png', 'light')[0].width).toBeLessThan(A4.landscape.width)
    expect(pagesOf('simulationTable', 'csv', 'light')).toHaveLength(1)
  })
})

describe('Alles exportieren', () => {
  it('PDF: Graph quer, dahinter alle Tabellen nebeneinander auf einer Querseite', () => {
    const plan = planExport('all', 'pdf', 'light')
    const { table } = plan
    const pages = allPages(plan)
    expect(table).toBeNull()
    expect(pages).toHaveLength(2)
    expect(pages.every((p) => p.width === A4.landscape.width)).toBe(true)
    const sheet = pages[1].svg
    for (const title of ['Alphabet', 'Übergangstabelle', 'Simulation „aba“', 'Akzeptiert']) {
      expect(sheet).toContain(title)
    }
  })

  it('PDF: lange Tabellen laufen in weiteren Spalten und Seiten weiter', () => {
    useScreenStore.setState({ simulationWord: 'ab'.repeat(60) })
    const pages = pagesOf('all', 'pdf', 'light')
    expect(pages.length).toBeGreaterThan(2)
    expect(pages.every((p) => p.height === A4.landscape.height)).toBe(true)
    const sheets = pages.slice(1).map((p) => p.svg).join('')
    expect(sheets).toContain('(Fortsetzung)')
    expect(sheets.match(/Akzeptiert/g)).toHaveLength(1)
  })

  it('PNG: ein Bild mit Graph und allen Tabellen, kein CSV', () => {
    const pages = pagesOf('all', 'png', 'dark')
    expect(pages).toHaveLength(1)
    expect(pages[0].svg).toContain('Übergangstabelle')
    expect(FORMATS.all).not.toContain('csv')
  })
})

describe('defaultExportArea', () => {
  it('öffnet den Reiter des aktuellen Screens, vom Regex-Screen aus den Graph', () => {
    expect(defaultExportArea('transitionTable')).toBe('transitionTable')
    expect(defaultExportArea('simulation')).toBe('simulation')
    expect(defaultExportArea('regex')).toBe('graph')
  })
})

describe('forEachLimited', () => {
  it('vergibt nach einem Fehler nichts mehr und meldet ihn erst, wenn alle fertig sind', async () => {
    const started: number[] = []
    let finishSlow = (): void => undefined
    let slowDone = false
    const run = forEachLimited(10, 2, async (i) => {
      started.push(i)
      if (i === 0) throw new Error('kaputt')
      await new Promise<void>((resolve) => (finishSlow = resolve))
      slowDone = true
    })
    let settled = false
    void run.catch(() => undefined).finally(() => (settled = true))
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(settled).toBe(false)
    finishSlow()
    await expect(run).rejects.toThrow('kaputt')
    expect(slowDone).toBe(true)
    expect(started).toEqual([0, 1])
  })
})

describe('Bandausschnitt der Turingmaschine', () => {
  // Läuft über a…a nach rechts (schreibt X), dann bis zwei Felder links vom Anfang
  const tm = buildDocument('TM', ['a'], { start: 'q0', finals: ['q3'], tape: ['X'] }, [
    ['q0', 'a → X, R', 'q0'],
    ['q0', '# → #, L', 'q1'],
    ['q1', 'X → X, L', 'q1'],
    ['q1', '# → #, L', 'q2'],
    ['q2', '# → #, N', 'q3']
  ])

  /** Wie bisher: jedes Band ganz aufbauen */
  function bruteForce(steps: SimulationStep[]): { from: number; to: number } {
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

  it('stimmt mit dem vollständigen Aufbau überein und baut nur das Anfangsband', () => {
    for (const word of ['', 'a', 'aaaa']) {
      const sim = new TuringSimulator(tm, word)
      const steps = [sim.reset(), ...sim.run().steps]
      let built = 0
      const counted = steps.map((step) =>
        Object.create(step, {
          tape: {
            get: () => {
              built++
              return step.tape
            }
          }
        })
      )
      expect(tapeRangeOf(counted), word).toEqual(bruteForce(steps))
      expect(built, word).toBeLessThanOrEqual(1)
    }
  })
})

describe('Bandausschnitt pro Bild', () => {
  it('zeigt kurze Bänder ganz, lange nur um den Kopf', () => {
    expect(tapeWindow({ from: -1, to: 5 }, 3)).toEqual({ from: -1, to: 5 })
    const range = { from: -1, to: 400 }
    expect(tapeWindow(range, 0)).toEqual({ from: -1, to: MAX_TAPE_CELLS - 2 })
    expect(tapeWindow(range, 200)).toEqual({ from: 185, to: 215 })
    expect(tapeWindow(range, 400)).toEqual({ from: 400 - MAX_TAPE_CELLS + 1, to: 400 })
  })

  it('Seiten der Bildfolge wachsen nicht mit der Lauflänge', () => {
    const right = buildDocument('TM', ['a'], { start: 'q0', finals: [] }, [
      ['q0', '# → #, R', 'q0']
    ])
    useEditorStore.getState().loadDocument(right, null)
    useScreenStore.setState({ simulationWord: '' })
    const sizes = (limit: number): number[] => {
      setSimulationLimits({ ...DEFAULT_SIMULATION, tmStepLimit: limit })
      try {
        const plan = planExport('simulationGraph', 'pdf', 'light')
        return [plan.page(0).svg.length, plan.page(plan.pageCount - 1).svg.length]
      } finally {
        setSimulationLimits(DEFAULT_SIMULATION)
      }
    }
    const [shortFirst, shortLast] = sizes(100)
    const [longFirst, longLast] = sizes(2000)
    expect(longFirst).toBeLessThan(shortFirst * 1.1)
    expect(longLast).toBeLessThan(shortLast * 1.1)
  })
})

describe('Lange Tabellen als Bild', () => {
  const aStar = buildDocument('DFA', ['a'], { start: 'q0', finals: ['q0'] }, [['q0', 'a', 'q0']])

  it('teilt eine sehr lange Simulationstabelle in Bilder, die sich rastern lassen', () => {
    useEditorStore.getState().loadDocument(structuredClone(aStar), null)
    useScreenStore.setState({ simulationWord: 'a'.repeat(2000) })
    const plan = planExport('simulationTable', 'png', 'light')
    expect(plan.pageCount).toBeGreaterThan(1)
    for (const page of allPages(plan)) {
      expect(page.height).toBeLessThanOrEqual(MAX_CANVAS_SIDE)
      expect(page.width * page.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS)
    }
    // Alle 2001 Konfigurationen kommen vor, die CSV bleibt eine Tabelle
    expect(plan.table?.rows).toHaveLength(2001)
  })

  it('lässt kurze Tabellen in einem Bild', () => {
    expect(planExport('simulationTable', 'png', 'light').pageCount).toBe(1)
  })
})

describe('Titel der Simulationstabelle', () => {
  const titleFor = (word: string) => {
    useScreenStore.setState({ simulationWord: word })
    return planExport('simulationTable', 'csv', 'light').table?.title
  }

  it('unterscheidet das leere Wort von einem eingegebenen „ε“', () => {
    expect(titleFor('')).toBe('Simulation des leeren Worts ε')
    expect(titleFor('   ')).toBe('Simulation des leeren Worts ε')
    expect(titleFor('ε')).toBe('Simulation „ε“ · „ε“ nicht in Σ')
    expect(titleFor('aba')).toBe('Simulation „aba“')
  })
})
