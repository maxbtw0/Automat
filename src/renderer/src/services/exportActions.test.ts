import { DEFAULT_SIMULATION } from '@shared/simulationSettings'
import { beforeEach, describe, expect, it } from 'vitest'
import { setSimulationLimits } from '@/core/automaton/limits'
import { buildDocument } from '@/core/automaton/testing'
import { A4 } from '@/export/svg'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { FORMATS, defaultExportArea, planExport } from './exportActions'

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
    const { table, pages } = planExport('simulationTable', 'csv', 'light')
    expect(table?.rows.map((r) => r[2])).toEqual(['q0', 'q1', 'q1', 'q0'])
    expect(table?.rowTones?.at(-1)).toBe('accepted')
    expect(pages).toHaveLength(1)
  })

  it('Bildfolge: ein Bild pro Schritt – als PDF A4 quer, als PNG zugeschnitten', () => {
    const pdf = planExport('simulationGraph', 'pdf', 'dark').pages
    expect(pdf).toHaveLength(4)
    expect(pdf.every((p) => p.width === A4.landscape.width)).toBe(true)
    const png = planExport('simulationGraph', 'png', 'dark').pages
    expect(png).toHaveLength(4)
    expect(png[0].width).toBeLessThan(A4.landscape.width)
  })

  it('Bildfolge mit Beschreibung: ein Satz pro Schritt, am Ende das Ergebnis', () => {
    const plain = planExport('simulationGraph', 'pdf', 'light').pages
    expect(plain[1].svg).not.toContain('gelesen und')
    const { pages } = planExport('simulationGraph', 'pdf', 'light', { description: true })
    expect(pages[1].svg).toContain('Es wird „a“ gelesen und in Zustand q1 gewechselt.')
    expect(pages[3].svg).toContain('Das Wort „aba“ wird akzeptiert.')
  })

  it('Graph mit Tabelle: als PDF Graph quer, Tabelle hoch – als PNG ein Bild', () => {
    const { pages } = planExport('simulationGraphTable', 'pdf', 'light')
    expect(pages.map((p) => p.width)).toEqual([A4.landscape.width, A4.portrait.width])
    expect(planExport('simulationGraphTable', 'png', 'light').pages).toHaveLength(1)
  })

  it('Graph mit Tabelle schafft auch sehr lange Läufe', () => {
    const loop = buildDocument('TM', ['a'], { start: 'q0', finals: [] }, [['q0', '# → #, N', 'q0']])
    useEditorStore.getState().loadDocument(loop, null)
    useScreenStore.setState({ simulationWord: '' })
    setSimulationLimits({ ...DEFAULT_SIMULATION, tmStepLimit: 150_000 })
    try {
      expect(planExport('simulationGraphTable', 'png', 'light').pages).toHaveLength(1)
    } finally {
      setSimulationLimits(DEFAULT_SIMULATION)
    }
  })

  it('meldet, warum es nicht geht', () => {
    useEditorStore.getState().updateState('q0', { isStart: false })
    expect(() => planExport('simulationTable', 'csv', 'light')).toThrow('Kein Startzustand')
  })
})

describe('Seitenformat', () => {
  it('PDF: Tabellen A4 hoch (lange auf mehrere Seiten), Graph A4 quer', () => {
    expect(planExport('transitionTable', 'pdf', 'light').pages[0]).toMatchObject(A4.portrait)
    expect(planExport('graph', 'pdf', 'light').pages[0]).toMatchObject(A4.landscape)
    useScreenStore.setState({ simulationWord: 'ab'.repeat(20) })
    const pages = planExport('simulationTable', 'pdf', 'light').pages
    expect(pages).toHaveLength(2)
    expect(pages.every((p) => p.height === A4.portrait.height)).toBe(true)
  })

  it('PNG/JPG/CSV: zugeschnitten, lange Tabelle als ein Bild', () => {
    useScreenStore.setState({ simulationWord: 'ab'.repeat(20) })
    const [table] = planExport('simulationTable', 'jpg', 'light').pages
    expect(planExport('simulationTable', 'jpg', 'light').pages).toHaveLength(1)
    expect(table.height).toBeGreaterThan(A4.portrait.height)
    expect(planExport('graph', 'png', 'light').pages[0].width).toBeLessThan(A4.landscape.width)
    expect(planExport('simulationTable', 'csv', 'light').pages).toHaveLength(1)
  })
})

describe('Alles exportieren', () => {
  it('PDF: Graph quer, dahinter alle Tabellen nebeneinander auf einer Querseite', () => {
    const { table, pages } = planExport('all', 'pdf', 'light')
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
    const { pages } = planExport('all', 'pdf', 'light')
    expect(pages.length).toBeGreaterThan(2)
    expect(pages.every((p) => p.height === A4.landscape.height)).toBe(true)
    const sheets = pages.slice(1).map((p) => p.svg).join('')
    expect(sheets).toContain('(Fortsetzung)')
    expect(sheets.match(/Akzeptiert/g)).toHaveLength(1)
  })

  it('PNG: ein Bild mit Graph und allen Tabellen, kein CSV', () => {
    const { pages } = planExport('all', 'png', 'dark')
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
