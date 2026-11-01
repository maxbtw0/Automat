import { describe, expect, it } from 'vitest'
import { DEFAULT_NEW_AUTOMATON, newAutomatonProblems, normalizeNewAutomaton } from './newAutomaton'
import { defaultSettings, newAutomatonAlphabet, normalizeSettings, settingsValid } from './settings'
import { DEFAULT_SIMULATION, normalizeSimulation, parseLimit } from './simulationSettings'
import {
  DEFAULT_NAVIGATION,
  isPanKey,
  normalizeNavigation,
  panModifierHeld
} from './navigationSettings'

describe('Einstellungen – neuer Automat', () => {
  it('fehlende Vorgaben werden zum Standard', () => {
    expect(normalizeSettings({}).newAutomaton).toEqual(DEFAULT_NEW_AUTOMATON)
  })

  it('übernimmt gültige Felder und verwirft ungültige einzeln', () => {
    expect(
      normalizeNewAutomaton({
        type: 'TM',
        alphabetPreset: ' a, b ',
        statePrefix: ' z ',
        stackStart: 'a b',
        acceptance: 'empty',
        blank: 'ε',
        tapeMove: 'X'
      })
    ).toEqual({
      ...DEFAULT_NEW_AUTOMATON,
      type: 'TM',
      alphabetPreset: 'a, b',
      statePrefix: 'z',
      acceptance: 'empty'
    })
    expect(normalizeNewAutomaton({ type: 'Mealy' }).type).toBe('DFA')
  })

  it('meldet Probleme je Feld', () => {
    const presets = defaultSettings().alphabetPresets
    expect(newAutomatonProblems(DEFAULT_NEW_AUTOMATON, presets)).toEqual({})
    expect(
      newAutomatonProblems(
        { ...DEFAULT_NEW_AUTOMATON, statePrefix: '', stackStart: 'a,b', blank: 'a' },
        presets
      )
    ).toEqual({ statePrefix: 'Präfix fehlt', stackStart: 'Kein Leerzeichen, Komma oder Semikolon' })
    // Blank darf nicht im gewählten Alphabet stehen
    expect(
      newAutomatonProblems({ ...DEFAULT_NEW_AUTOMATON, alphabetPreset: 'a, b', blank: 'a' }, presets)
    ).toEqual({ blank: '„a“ ist im Alphabet' })
  })

  it('Alphabet kommt aus der gewählten Voreinstellung', () => {
    const settings = defaultSettings()
    expect(newAutomatonAlphabet(settings)).toEqual([])
    settings.newAutomaton.alphabetPreset = 'a, b, c'
    expect(newAutomatonAlphabet(settings)).toEqual(['a', 'b', 'c'])
    settings.newAutomaton.alphabetPreset = 'gibt es nicht'
    expect(newAutomatonAlphabet(settings)).toEqual([])
  })

  it('Probleme sperren das Speichern', () => {
    const settings = defaultSettings()
    expect(settingsValid(settings)).toBe(true)
    settings.newAutomaton.statePrefix = ''
    expect(settingsValid(settings)).toBe(false)
  })
})

describe('Einstellungen – Simulation', () => {
  it('fehlende Grenzen werden zum Standard', () => {
    expect(normalizeSettings({}).simulation).toEqual(DEFAULT_SIMULATION)
  })

  it('Schrittlimit 0 heißt unbegrenzt, die Grenzen der Suche brauchen mindestens 1', () => {
    expect(
      normalizeSimulation({ tmStepLimit: 0, pdaConfigurationLimit: 0, pdaStackLimit: 5 })
    ).toEqual({ ...DEFAULT_SIMULATION, tmStepLimit: 0, pdaStackLimit: 5 })
  })

  it('verwirft Unsinn und rundet die Geschwindigkeit auf den Regler', () => {
    expect(normalizeSimulation({ speed: 3.3, tmStepLimit: -1, pdaStackLimit: 2.5 })).toEqual({
      ...DEFAULT_SIMULATION,
      speed: 3.5
    })
    expect(normalizeSimulation({ speed: 99 }).speed).toBe(10)
  })

  it('liest Grenzen auch mit Tausenderpunkt', () => {
    expect(parseLimit('10.000')).toBe(10000)
    expect(parseLimit(' 2 500 ')).toBe(2500)
    expect(parseLimit('0')).toBe(0)
    expect(parseLimit('-3')).toBeNull()
    expect(parseLimit('1,5')).toBeNull()
    expect(parseLimit('')).toBeNull()
  })
})

describe('Einstellungen – Ansicht verschieben', () => {
  it('Standard: Strg und mittlere Maustaste, auch wenn der Eintrag in der Datei fehlt', () => {
    expect(normalizeSettings({}).navigation).toEqual({ panKey: 'Ctrl', panMiddleMouse: true })
  })

  it('übernimmt gültige Felder und verwirft ungültige einzeln', () => {
    expect(normalizeNavigation({ panKey: 'Space', panMiddleMouse: false })).toEqual({
      panKey: 'Space',
      panMiddleMouse: false
    })
    expect(normalizeNavigation({ panKey: 'Shift', panMiddleMouse: 'ja' })).toEqual(
      DEFAULT_NAVIGATION
    )
  })

  it('erkennt die Taste im Tastatur- und im Mausereignis', () => {
    const mouse = { ctrlKey: false, altKey: true, metaKey: false }
    expect(panModifierHeld('Alt', mouse)).toBe(true)
    expect(panModifierHeld('Ctrl', mouse)).toBe(false)
    expect(panModifierHeld('Space', { ...mouse, ctrlKey: true })).toBe(false)
    expect(isPanKey('Ctrl', { key: 'Control', code: 'ControlLeft' })).toBe(true)
    expect(isPanKey('Space', { key: ' ', code: 'Space' })).toBe(true)
    expect(isPanKey('none', { key: ' ', code: 'Space' })).toBe(false)
  })
})
