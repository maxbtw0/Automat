import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_NEW_AUTOMATON } from '@shared/newAutomaton'
import { defaultSettings } from '@shared/settings'
import { DEFAULT_SIMULATION } from '@shared/simulationSettings'
import { changeDocumentType } from '@/core/algorithms/changeType'
import { relabelInOrder } from '@/core/algorithms/layout'
import { nextTuringLabel } from '@/core/automaton/labels'
import { setSimulationLimits } from '@/core/automaton/limits'
import { createAutomaton } from '@/core/automaton/registry'
import { buildDocument } from '@/core/automaton/testing'
import {
  createEmptyDocument,
  nextStateLabel,
  setDocumentDefaults,
  type AutomatonDocument
} from '@/model/graph'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { useSettingsStore } from '@/store/settingsStore'
import { planExport } from './exportActions'
import { createConfiguredDocument } from './settingsActions'

afterEach(() => {
  setDocumentDefaults(DEFAULT_NEW_AUTOMATON)
  setSimulationLimits(DEFAULT_SIMULATION)
  useSettingsStore.getState().setSettings(defaultSettings())
})

/** Hält nie: liest immer wieder dasselbe Feld */
const endless = (): AutomatonDocument =>
  buildDocument('TM', ['a'], { start: 'q0', finals: ['q0'] }, [['q0', 'a → a, N', 'q0']])

describe('Vorgaben für neue Automaten', () => {
  it('Zustandsnamen mit eigenem Präfix – auch beim Neu-Anordnen', () => {
    setDocumentDefaults({ ...DEFAULT_NEW_AUTOMATON, statePrefix: 'z' })
    const doc = buildDocument('DFA', ['a'], { start: 'q0' }, [['q0', 'a', 'q1']])
    expect(nextStateLabel(doc.graph)).toBe('z0')
    expect(relabelInOrder(doc.graph).states.map((s) => s.label)).toEqual(['z0', 'z1'])
  })

  it('Startsymbol und Akzeptanz für neue Stacks – auch beim Typwechsel', () => {
    setDocumentDefaults({ ...DEFAULT_NEW_AUTOMATON, stackStart: 'Z', acceptance: 'empty' })
    expect(createEmptyDocument('NPDA').stack).toEqual({
      alphabet: ['Z'],
      start: 'Z',
      acceptance: 'empty'
    })
    const dfa = buildDocument('DFA', ['a'], { start: 'q0' }, [['q0', 'a', 'q0']])
    const pda = changeDocumentType(dfa, 'DPDA')
    expect(pda.stack?.start).toBe('Z')
    expect(pda.graph.transitions[0].labels).toEqual([{ read: 'a', pop: 'Z', push: ['Z'] }])
  })

  it('Blank und Bewegung neuer Regeln der Turingmaschine', () => {
    setDocumentDefaults({ ...DEFAULT_NEW_AUTOMATON, blank: '□', tapeMove: 'R' })
    expect(createEmptyDocument('TM', ['a', 'b']).tape).toEqual({
      alphabet: ['a', 'b', '□'],
      blank: '□'
    })
    expect(nextTuringLabel([], ['a'])).toEqual({ read: 'a', write: 'a', move: 'R' })
  })

  it('„Neu“ nimmt Typ und Alphabet aus den Einstellungen', () => {
    const settings = defaultSettings()
    settings.newAutomaton = { ...settings.newAutomaton, type: 'NFA', alphabetPreset: 'a, b, c' }
    useSettingsStore.getState().setSettings(settings)
    expect(createConfiguredDocument()).toMatchObject({ type: 'NFA', alphabet: ['a', 'b', 'c'] })
  })
})

describe('Grenzen der Simulation', () => {
  it('Schrittlimit der Turingmaschine aus den Einstellungen', () => {
    setSimulationLimits({ ...DEFAULT_SIMULATION, tmStepLimit: 5 })
    const sim = createAutomaton(endless()).createSimulator('a')
    expect(sim.run().steps).toHaveLength(5)
    expect(sim.abortReason).toBe('Abbruch nach 5 Schritten')
  })

  it('Schrittlimit 0: läuft unbegrenzt – in Häppchen über run(maxSteps)', () => {
    setSimulationLimits({ ...DEFAULT_SIMULATION, tmStepLimit: 0 })
    const sim = createAutomaton(endless()).createSimulator('a')
    expect(sim.run(25_000).steps).toHaveLength(25_000)
    expect(sim.run(25_000).steps).toHaveLength(25_000)
    expect(sim.isFinished).toBe(false)
    expect(sim.accepted).toBeNull()
    expect(sim.abortReason).toBeNull()
  })

  it('Export rechnet bei unbegrenztem Schrittlimit trotzdem nur bis zur Grenze', () => {
    setSimulationLimits({ ...DEFAULT_SIMULATION, tmStepLimit: 0 })
    useEditorStore.getState().loadDocument(endless(), null)
    useScreenStore.setState({ simulationWord: 'a' })
    const { table } = planExport('simulationTable', 'csv', 'light')
    // Startkonfiguration + 10 000 Schritte
    expect(table?.rows).toHaveLength(DEFAULT_SIMULATION.tmStepLimit + 1)
  })

  it('Grenzen des Kellerautomaten aus den Einstellungen', () => {
    const doc = buildDocument('NPDA', ['a'], { start: 'q0', finals: ['q1'], stack: ['A', '#'] }, [
      ['q0', 'ε, # → A#; ε, A → AA', 'q0']
    ])
    setSimulationLimits({ ...DEFAULT_SIMULATION, pdaStackLimit: 3 })
    const byStack = createAutomaton(doc).createSimulator('a')
    byStack.run()
    expect(byStack.abortReason).toBe('Abbruch bei Stackhöhe 3')

    setSimulationLimits({ ...DEFAULT_SIMULATION, pdaConfigurationLimit: 10 })
    const byCount = createAutomaton(doc).createSimulator('a')
    byCount.run()
    expect(byCount.abortReason).toBe('Abbruch nach 10 Konfigurationen')
  })
})
