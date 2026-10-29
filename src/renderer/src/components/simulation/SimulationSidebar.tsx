import { MAX_SPEED, MIN_SPEED, SPEED_STEP } from '@shared/simulationSettings'
import { Icon } from '@/components/common/Icon'
import { tokenizeWord } from '@/core/automaton/word'
import { useShortcutTitle } from '@/hooks/useShortcutTitle'
import { usesTape } from '@/model/graph'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'
import type { SimulationControls, SimulationStatus } from './useSimulation'

const STATUS_LABEL: Record<SimulationStatus, string> = {
  idle: 'Bereit',
  paused: 'Pausiert',
  playing: 'Läuft',
  accepted: 'Akzeptiert',
  rejected: 'Verworfen'
}


/** Linke Randleiste: Eingabewort, Band, Steuerung, Geschwindigkeit. */
export function SimulationSidebar({ sim }: { sim: SimulationControls }) {
  const alphabet = useEditorStore((s) => s.document.alphabet)
  // Die Turingmaschine zeigt ihr Band groß über dem Graphen
  const hasTape = useEditorStore((s) => usesTape(s.document.type))
  const tokens = tokenizeWord(sim.word, alphabet)
  const current = sim.steps[sim.index]
  const title = {
    reset: useShortcutTitle('Zurücksetzen', 'sim.reset'),
    stepBack: useShortcutTitle('Schritt zurück', 'sim.stepBack'),
    togglePlay: useShortcutTitle('Abspielen / Pause', 'sim.togglePlay'),
    stepForward: useShortcutTitle('Schritt', 'sim.stepForward'),
    runToEnd: useShortcutTitle('Bis zum Ende', 'sim.runToEnd')
  }
  /** Anzahl gelesener Symbole; -1 solange nichts gestartet ist */
  const position = current ? current.inputPosition : -1
  const isRunning = sim.status === 'playing' || sim.status === 'paused'

  return (
    <aside className="sim-sidebar">
      <header className="sim-sidebar-header">
        <h1>Simulation</h1>
        <span className={classNames('sim-badge', `is-${sim.status}`)}>
          {STATUS_LABEL[sim.status]}
        </span>
      </header>

      <section className="sim-section">
        <label className="sim-section-label" htmlFor="sim-word">
          Eingabewort
        </label>
        <input
          id="sim-word"
          className="input is-mono sim-word"
          placeholder="z. B. abba"
          value={sim.word}
          autoFocus
          onChange={(e) => sim.setWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
              sim.togglePlay()
            }
          }}
        />
        {!hasTape && (
          <div className="sim-tape" aria-label="Eingabeband">
            {tokens.length === 0 ? (
              <span className={classNames('sim-cell', position >= 0 && 'is-current')}>ε</span>
            ) : (
              tokens.map((symbol, i) => (
                <span
                  key={i}
                  className={classNames(
                    'sim-cell',
                    i < position && 'is-consumed',
                    isRunning && i === position && 'is-current'
                  )}
                >
                  {symbol}
                </span>
              ))
            )}
          </div>
        )}
      </section>

      <section className="sim-section">
        <span className="sim-section-label">Steuerung</span>
        <div className="sim-transport">
          <button
            className="btn is-icon"
            onClick={sim.reset}
            disabled={sim.status === 'idle'}
            title={title.reset}
            aria-label="Zurücksetzen"
          >
            <Icon name="reset" />
          </button>
          <button
            className="btn is-icon"
            onClick={sim.stepBack}
            disabled={!sim.canStepBack}
            title={title.stepBack}
            aria-label="Schritt zurück"
          >
            <Icon name="stepBack" />
          </button>
          <button
            className="btn is-primary sim-play"
            onClick={sim.togglePlay}
            title={title.togglePlay}
          >
            <Icon name={sim.status === 'playing' ? 'pause' : 'play'} />
            {sim.status === 'playing' ? 'Pause' : 'Abspielen'}
          </button>
          <button
            className="btn is-icon"
            onClick={sim.stepForward}
            disabled={!sim.canStepForward}
            title={title.stepForward}
            aria-label="Schritt"
          >
            <Icon name="step" />
          </button>
          <button
            className="btn is-icon"
            onClick={sim.runToEnd}
            disabled={!sim.canStepForward}
            title={title.runToEnd}
            aria-label="Bis zum Ende"
          >
            <Icon name="runAll" />
          </button>
        </div>
      </section>

      <section className="sim-section">
        <div className="sim-section-row">
          <label className="sim-section-label" htmlFor="sim-speed">
            Geschwindigkeit
          </label>
          <span className="sim-speed-value">{formatSpeed(sim.speed)}</span>
        </div>
        <input
          id="sim-speed"
          className="sim-slider"
          type="range"
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={SPEED_STEP}
          value={sim.speed}
          onChange={(e) => sim.setSpeed(Number(e.target.value))}
        />
      </section>

      {(sim.errors.length > 0 || sim.abortReason) && (
        <ul className="sim-errors">
          {[...sim.errors, ...(sim.abortReason ? [sim.abortReason] : [])].map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function formatSpeed(speed: number): string {
  return `${speed.toLocaleString('de-DE')} ${speed === 1 ? 'Schritt' : 'Schritte'}/s`
}
