import { useEffect, useRef } from 'react'
import { Canvas } from '@/components/canvas/Canvas'
import { SimulationSidebar } from '@/components/simulation/SimulationSidebar'
import { SimulationStack } from '@/components/simulation/SimulationStack'
import { SimulationTape } from '@/components/simulation/SimulationTape'
import { SimulationTrace } from '@/components/simulation/SimulationTrace'
import { useSimulation, type SimulationControls } from '@/components/simulation/useSimulation'
import { usesStack, usesTape } from '@/model/graph'
import type { KeyAction } from '@shared/keybindings'
import { keyActionForEvent } from '@/services/keyActions'
import { isModalOpen } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'

/**
 * Simulation wie in AutoEdit: links die Steuerung, rechts oben der Graph (nur ansehen) – beim
 * Kellerautomaten rechts daneben der Stack, bei der Turingmaschine darüber das Band –, rechts
 * unten die Tabelle der Konfigurationen.
 */
export function SimulationScreen() {
  const sim = useSimulation()
  useSimulationKeys(sim)
  const hasStack = useEditorStore((s) => usesStack(s.document.type))
  const hasTape = useEditorStore((s) => usesTape(s.document.type))

  return (
    <div className="sim-screen">
      <SimulationSidebar sim={sim} />
      <div className={classNames('sim-main', hasTape && 'has-tape')}>
        {hasTape && <SimulationTape sim={sim} />}
        <div className={classNames('sim-top', hasStack && 'has-stack')}>
          <div className="sim-graph">
            <Canvas readOnly />
          </div>
          {hasStack && <SimulationStack sim={sim} />}
        </div>
        <SimulationTrace sim={sim} />
      </div>
    </div>
  )
}

/** Kürzel der Simulation aus den Einstellungen (Standard: Leertaste, ←/→, Pos1, Ende). */
function useSimulationKeys(sim: SimulationControls): void {
  // Immer die aktuellen Steuerfunktionen benutzen, ohne den Listener neu anzumelden.
  const simRef = useRef(sim)
  simRef.current = sim

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isModalOpen()) return
      const s = simRef.current
      const actions: Partial<Record<KeyAction, () => void>> = {
        'sim.togglePlay': s.togglePlay,
        'sim.stepForward': s.stepForward,
        'sim.stepBack': s.stepBack,
        'sim.reset': s.reset,
        'sim.runToEnd': s.runToEnd
      }
      const key = keyActionForEvent(e, 'simulation')
      const action = key && actions[key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
