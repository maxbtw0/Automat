import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from '@/core/automaton/errors'
import { createAutomaton } from '@/core/automaton/registry'
import type { SimulationStep, Simulator } from '@/core/automaton/types'
import { useEditorStore, type HighlightPulse } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'

export type SimulationStatus =
  | 'idle'
  | 'paused'
  | 'playing'
  | 'accepted'
  | 'rejected'
  /** an einem Limit abgebrochen, ohne Ergebnis */
  | 'aborted'

/**
 * „Bis zum Ende“ rechnet in Häppchen zu so vielen Schritten und lässt dazwischen die Oberfläche
 * zeichnen – eine Turingmaschine ohne Schrittlimit hält vielleicht nie, Pause stoppt dann.
 */
const RUN_BATCH = 5000

export interface SimulationControls {
  word: string
  setWord(word: string): void
  /** Schritte pro Sekunde beim Abspielen */
  speed: number
  setSpeed(speed: number): void
  /** Alle bisher berechneten Konfigurationen – man kann zu jeder zurückspringen */
  steps: SimulationStep[]
  /** Angezeigte Konfiguration (Index in `steps`) */
  index: number
  status: SimulationStatus
  /** Fehler, wegen derer nicht simuliert werden kann (z. B. „Kein Startzustand“) */
  errors: string[]
  /** Am Ende: warum die Suche vorzeitig aufgehört hat (Kellerautomat, Limit erreicht) */
  abortReason: string | null
  canStepBack: boolean
  canStepForward: boolean
  stepForward(): void
  stepBack(): void
  togglePlay(): void
  runToEnd(): void
  reset(): void
  goTo(index: number): void
}

/**
 * Steuerung der Simulation: Start, Schritt vor/zurück, Abspielen mit Geschwindigkeit.
 *
 * Der Simulator läuft nur vorwärts. Jede berechnete Konfiguration wird in `steps` gespeichert,
 * „Schritt zurück“ zeigt einfach eine frühere davon an. Die angezeigte Konfiguration wird im
 * Canvas hervorgehoben (editorStore.highlight).
 */
export function useSimulation(): SimulationControls {
  const revision = useEditorStore((s) => s.revision)
  const word = useScreenStore((s) => s.simulationWord)
  const speed = useScreenStore((s) => s.simulationSpeed)

  const simulatorRef = useRef<Simulator | null>(null)
  const [steps, setSteps] = useState<SimulationStep[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  /** „Bis zum Ende“ läuft gerade (in Häppchen) */
  const [running, setRunning] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const simulator = simulatorRef.current
  const atLastStep = steps.length > 0 && index === steps.length - 1
  const finished = simulator !== null && simulator.isFinished && atLastStep
  const status: SimulationStatus = finished
    ? simulator.accepted
      ? 'accepted'
      : simulator.undecided
        ? 'aborted'
        : 'rejected'
    : playing || running
      ? 'playing'
      : steps.length > 0
        ? 'paused'
        : 'idle'

  const reset = useCallback((): void => {
    simulatorRef.current = null
    setSteps([])
    setIndex(0)
    setPlaying(false)
    setRunning(false)
    setErrors([])
  }, [])

  // Neues Wort oder geänderter Automat → Simulation beginnt von vorn.
  useEffect(reset, [word, revision, reset])

  /** Prüft den Automaten und legt die Startkonfiguration an. `null`, wenn er Fehler hat. */
  const start = (): Simulator | null => {
    try {
      const automaton = createAutomaton(useEditorStore.getState().document)
      const problems = automaton
        .validate()
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.message)
      if (problems.length > 0) {
        reset()
        setErrors(problems)
        return null
      }
      const sim = automaton.createSimulator(word)
      simulatorRef.current = sim
      setSteps([sim.reset()])
      setIndex(0)
      setErrors([])
      return sim
    } catch (err) {
      reset()
      setErrors([describeError(err)])
      return null
    }
  }

  const stepForward = (): void => {
    const sim = simulatorRef.current
    if (!sim) {
      start() // erster Schritt = Startkonfiguration anzeigen
      return
    }
    if (index < steps.length - 1) {
      setIndex(index + 1)
    } else if (!sim.isFinished) {
      setSteps([...steps, sim.step()])
      setIndex(steps.length)
    }
  }

  const stepBack = (): void => {
    setPlaying(false)
    setRunning(false)
    setIndex((i) => Math.max(0, i - 1))
  }

  const runToEnd = (): void => {
    setPlaying(false)
    if (!simulatorRef.current && !start()) return
    setRunning(true)
  }

  // „Bis zum Ende“: Häppchen für Häppchen rechnen, bis der Simulator fertig ist (oder Pause).
  useEffect(() => {
    if (!running) return
    const sim = simulatorRef.current
    if (!sim || sim.isFinished) {
      if (sim && steps.length > 0) setIndex(steps.length - 1)
      setRunning(false)
      return
    }
    const timer = window.setTimeout(() => {
      // Der Simulator steht immer auf der letzten berechneten Konfiguration.
      const all = [...steps, ...sim.run(RUN_BATCH).steps]
      setSteps(all)
      setIndex(all.length - 1)
    }, 0)
    return () => window.clearTimeout(timer)
  })

  const togglePlay = (): void => {
    if (playing || running) {
      setPlaying(false)
      setRunning(false)
      return
    }
    // Am Ende: von vorn abspielen
    if (!simulatorRef.current || finished) {
      if (!start()) return
    }
    setPlaying(true)
  }

  const goTo = (target: number): void => {
    setPlaying(false)
    setRunning(false)
    setIndex(Math.min(Math.max(0, target), steps.length - 1))
  }

  // Abspielen: nach jeder Pause einen Schritt weiter, bis die Simulation fertig ist.
  useEffect(() => {
    if (!playing) return
    if (finished) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(stepForward, 1000 / speed)
    return () => window.clearTimeout(timer)
  })

  // Angezeigte Konfiguration im Canvas hervorheben
  const current = steps[index]
  /** Zuletzt angezeigter Schritt – für das kurze Abdimmen wiederholt aktiver Elemente */
  const shownRef = useRef<{ step: SimulationStep; pulse?: HighlightPulse } | null>(null)
  useEffect(() => {
    const { setHighlight } = useEditorStore.getState()
    if (!current) {
      shownRef.current = null
      setHighlight(null)
      return
    }
    const shown = shownRef.current
    let pulse = shown?.pulse
    if (shown && shown.step !== current) {
      // Neuer Schritt: was schon vorher aktiv war, dimmt einmal kurz ab
      const previous = shown.step
      pulse = {
        stateIds: current.activeStateIds.filter((id) => previous.activeStateIds.includes(id)),
        transitionIds: current.usedTransitionIds.filter((id) =>
          previous.usedTransitionIds.includes(id)
        ),
        token: (pulse?.token ?? 0) + 1,
        // Beim schnellen Abspielen kürzer, damit die Animation vor dem nächsten Schritt endet
        durationMs: Math.min(400, (0.8 * 1000) / speed)
      }
    }
    shownRef.current = { step: current, pulse }
    setHighlight({
      activeStateIds: current.activeStateIds,
      pathStateIds: current.pathStateIds,
      usedTransitionIds: current.usedTransitionIds,
      outcome: status === 'accepted' || status === 'rejected' ? status : undefined,
      pulse
    })
  }, [current, status, speed])

  // Beim Verlassen des Screens keine Hervorhebung im Editor zurücklassen
  useEffect(() => () => useEditorStore.getState().setHighlight(null), [])

  return {
    word,
    setWord: useScreenStore.getState().setSimulationWord,
    speed,
    setSpeed: useScreenStore.getState().setSimulationSpeed,
    steps,
    index,
    status,
    errors,
    abortReason: finished ? (simulator.abortReason ?? null) : null,
    canStepBack: index > 0,
    canStepForward: !finished,
    stepForward,
    stepBack,
    togglePlay,
    runToEnd,
    reset,
    goTo
  }
}
