import { useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { describeError } from '@/core/automaton/errors'
import { compareRegexWithAutomaton, type RegexComparison } from '@/core/regex/compare'
import { automatonToRegex } from '@/core/regex/fromAutomaton'
import {
  EMPTY_SET,
  UNION_SYMBOL,
  formatRegex,
  formatRegexParts,
  parseRegex,
  type Regex
} from '@/core/regex/regex'
import { regexToDocument } from '@/core/regex/toAutomaton'
import { EPSILON } from '@/model/graph'
import { askChoice } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { useScreenStore } from '@/store/screenStore'
import { classNames } from '@/utils/dom'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const attempt = <T,>(fn: () => T): Result<T> => {
  try {
    return { ok: true, value: fn() }
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }
}

/** Zeichen, die sich auf der Tastatur schlecht tippen lassen */
const INSERTABLE = [EPSILON, EMPTY_SET, UNION_SYMBOL, '*', '(', ')']

const BUILD_KINDS = [
  { kind: 'dfa', label: 'DEA (minimal)' },
  { kind: 'nfa', label: 'ε-NEA (Thompson)' }
] as const

/**
 * Reguläre Ausdrücke: Ausdruck aus dem Automaten (Zustandselimination), Vergleich mit einem
 * eingegebenen Ausdruck und Automat aus einem eingegebenen Ausdruck bauen.
 */
export function RegularExpressionScreen() {
  const doc = useEditorStore((s) => s.document)
  const compareInput = useScreenStore((s) => s.regexInput)
  const buildInput = useScreenStore((s) => s.regexBuildInput)
  const buildKind = useScreenStore((s) => s.regexBuildKind)
  const { setRegexInput, setRegexBuildInput, setRegexBuildKind } = useScreenStore.getState()
  const [copied, setCopied] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)

  const computed = useMemo(() => attempt(() => automatonToRegex(doc)), [doc])

  const comparison = useMemo((): Result<RegexComparison> | null => {
    if (!compareInput.trim()) return null
    return attempt(() => compareRegexWithAutomaton(doc, parseRegex(compareInput, doc.alphabet)))
  }, [doc, compareInput])

  const copy = (regex: Regex): void => {
    void navigator.clipboard.writeText(formatRegex(regex, doc.alphabet)).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  const build = async (): Promise<void> => {
    const parsed = attempt(() => parseRegex(buildInput, doc.alphabet))
    if (!parsed.ok) {
      setBuildError(parsed.error)
      return
    }
    setBuildError(null)
    if (doc.graph.states.length > 0) {
      const choice = await askChoice({
        title: 'Aktuellen Automaten ersetzen?',
        buttons: ['Ersetzen', 'Abbrechen']
      })
      if (choice !== 0) return
    }
    const result = attempt(() => regexToDocument(parsed.value, buildKind, doc.alphabet))
    if (!result.ok) {
      setBuildError(result.error)
      return
    }
    const store = useEditorStore.getState()
    store.applyDocument(result.value)
    store.resetViewport()
    useScreenStore.getState().setScreen('graph')
  }

  return (
    <div className="regex-screen">
      <div className="regex-content">
        <h1>Reguläre Ausdrücke</h1>

        <section className="regex-card">
          <span className="section-label">Aus dem Automaten</span>
          {computed.ok ? (
            <div className="regex-output">
              <RegexText regex={computed.value} className="regex-text" />
              <button
                className="btn is-ghost"
                onClick={() => copy(computed.value)}
                title="In die Zwischenablage kopieren"
              >
                <Icon name={copied ? 'check' : 'copy'} />
                {copied ? 'Kopiert' : 'Kopieren'}
              </button>
            </div>
          ) : (
            <p className="regex-error">{computed.error}</p>
          )}
        </section>

        <section className="regex-card">
          <label className="section-label" htmlFor="regex-compare">
            Vergleichen mit
          </label>
          <RegexInput id="regex-compare" value={compareInput} onChange={setRegexInput} />
          {comparison && <ComparisonResult result={comparison} />}
        </section>

        <section className="regex-card">
          <label className="section-label" htmlFor="regex-build">
            Automat aus Ausdruck
          </label>
          <RegexInput
            id="regex-build"
            value={buildInput}
            onChange={(value) => {
              setRegexBuildInput(value)
              setBuildError(null)
            }}
            onEnter={() => void build()}
          />
          <div className="regex-build-row">
            <div className="segmented" role="radiogroup" aria-label="Art des Automaten">
              {BUILD_KINDS.map(({ kind, label }) => (
                <button
                  key={kind}
                  role="radio"
                  aria-checked={kind === buildKind}
                  className={classNames('segmented-option', kind === buildKind && 'is-active')}
                  onClick={() => setRegexBuildKind(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn is-primary regex-build-button"
              disabled={!buildInput.trim()}
              onClick={() => void build()}
            >
              Automat bauen
            </button>
          </div>
          {buildError && <p className="regex-error">{buildError}</p>}
        </section>
      </div>
    </div>
  )
}

/** Regulärer Ausdruck mit hochgestelltem Kleene-Stern */
function RegexText({ regex, className }: { regex: Regex; className?: string }) {
  const alphabet = useEditorStore((s) => s.document.alphabet)
  return (
    <code className={className}>
      {formatRegexParts(regex, alphabet).map((part, i) =>
        part.sup ? <sup key={i}>{part.text}</sup> : <span key={i}>{part.text}</span>
      )}
    </code>
  )
}

/** Eingabefeld für einen Ausdruck mit Knöpfen für schwer tippbare Zeichen */
function RegexInput({
  id,
  value,
  onChange,
  onEnter
}: {
  id: string
  value: string
  onChange(value: string): void
  onEnter?(): void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  /** Fügt ein Zeichen an der Cursorposition ein. */
  const insert = (text: string): void => {
    const el = inputRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + text + value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  return (
    <>
      <input
        id={id}
        ref={inputRef}
        className="input is-mono regex-input"
        placeholder="z. B. (a+b)*ab"
        title="Vereinigung: +   Stern: *   leeres Wort: ε   leere Menge: ∅"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter()
        }}
      />
      <div className="regex-insert">
        {INSERTABLE.map((text) => (
          <button
            key={text}
            className="btn is-ghost regex-insert-button"
            onClick={() => insert(text)}
            title={`„${text}“ einfügen`}
          >
            {text}
          </button>
        ))}
      </div>
    </>
  )
}

function ComparisonResult({ result }: { result: Result<RegexComparison> }) {
  if (!result.ok) return <p className="regex-error">{result.error}</p>
  const comparison = result.value
  if (comparison.kind === 'equal') {
    return <p className="regex-verdict is-equal">Gleich</p>
  }
  const word = comparison.word || EPSILON
  const who = comparison.acceptedBy === 'automaton' ? 'nur der Automat' : 'nur der Ausdruck'
  return (
    <p className={classNames('regex-verdict', 'is-different')}>
      Verschieden
      <span className="regex-counterexample">
        „<code>{word}</code>“ akzeptiert {who}
      </span>
    </p>
  )
}
