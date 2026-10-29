import { useScreenStore } from '@/store/screenStore'

export function openSimulationEditor(): void {
  useScreenStore.getState().setScreen('simulation')
}

export function openGraphEditor(): void {
  useScreenStore.getState().setScreen('graph')
}

export function openAlphabetEditor(): void {
  useScreenStore.getState().setScreen('alphabet')
}

export function openRegularExpressionsEditor(): void {
  useScreenStore.getState().setScreen('regex')
}

export function openTransitionTableEditor(): void {
  useScreenStore.getState().setScreen('transitionTable')
}