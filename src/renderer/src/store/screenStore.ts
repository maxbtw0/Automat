import { create } from 'zustand'

export type Screen = 'graph' | 'alphabet' | 'simulation' | 'regex' | 'transitionTable'

interface ScreenState {
  screen: Screen
  setScreen(screen: Screen): void
  /** Übergangstabelle sortiert anzeigen (reine Ansicht – das Dokument bleibt unverändert) */
  transitionTableSorted: boolean
  setTransitionTableSorted(sorted: boolean): void
  /** Simulation: Eingabewort und Geschwindigkeit bleiben beim Screen-Wechsel erhalten */
  simulationWord: string
  setSimulationWord(word: string): void
  /** Schritte pro Sekunde beim Abspielen */
  simulationSpeed: number
  setSimulationSpeed(speed: number): void
  /** Regulärer Ausdruck zum Vergleichen */
  regexInput: string
  setRegexInput(input: string): void
  /** Regulärer Ausdruck, aus dem ein Automat gebaut werden soll, und die gewünschte Art */
  regexBuildInput: string
  setRegexBuildInput(input: string): void
  regexBuildKind: 'dfa' | 'nfa'
  setRegexBuildKind(kind: 'dfa' | 'nfa'): void
}

export const useScreenStore = create<ScreenState>((set) => ({
  screen: 'graph',
  setScreen: (screen) => set({ screen }),
  transitionTableSorted: false,
  setTransitionTableSorted: (transitionTableSorted) => set({ transitionTableSorted }),
  simulationWord: '',
  setSimulationWord: (simulationWord) => set({ simulationWord }),
  simulationSpeed: 2,
  setSimulationSpeed: (simulationSpeed) => set({ simulationSpeed }),
  regexInput: '',
  setRegexInput: (regexInput) => set({ regexInput }),
  regexBuildInput: '',
  setRegexBuildInput: (regexBuildInput) => set({ regexBuildInput }),
  regexBuildKind: 'dfa',
  setRegexBuildKind: (regexBuildKind) => set({ regexBuildKind })
}))
