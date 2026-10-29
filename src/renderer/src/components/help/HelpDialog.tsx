import { useEffect, useState } from 'react'
import { getAutomatonDefinition } from '@/core/automaton/registry'
import { useDialogStore } from '@/store/dialogStore'
import { useEditorStore } from '@/store/editorStore'
import { classNames } from '@/utils/dom'
import { HelpPage } from './HelpPages'
import { HELP_GROUPS, helpTabKey, initialHelpTab, type HelpTab } from './helpTabs'

function tabLabel(tab: HelpTab): string {
  switch (tab.kind) {
    case 'type':
      return getAutomatonDefinition(tab.type).name
    case 'saving':
      return 'Speichern'
    case 'tooltips':
      return 'Tooltips'
  }
}

/** Hilfe: links die Reiter in Gruppen, rechts die Seite. */
export function HelpDialog() {
  const open = useDialogStore((s) => s.helpOpen)
  // Eigene Komponente: bei jedem Öffnen startet die Hilfe beim aktuellen Automatentyp.
  return open ? <HelpWindow /> : null
}

function HelpWindow() {
  const [tab, setTab] = useState<HelpTab>(() =>
    initialHelpTab(useEditorStore.getState().document.type)
  )
  const close = (): void => useDialogStore.getState().setHelpOpen(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useDialogStore.getState().request) close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog settings-dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <h2 id="help-title" className="dialog-title">
          Hilfe
        </h2>
        <div className="settings-body">
          <nav className="settings-tabs" role="tablist" aria-orientation="vertical">
            {HELP_GROUPS.map((group) => (
              <div key={group.label} className="help-tab-group">
                <span className="help-tab-group-label">{group.label}</span>
                {group.tabs.map((t) => {
                  const active = helpTabKey(t) === helpTabKey(tab)
                  return (
                    <button
                      key={helpTabKey(t)}
                      role="tab"
                      aria-selected={active}
                      className={classNames('settings-tab', active && 'is-active')}
                      onClick={() => setTab(t)}
                    >
                      {tabLabel(t)}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
          <div key={helpTabKey(tab)} className="settings-content help-content" role="tabpanel">
            <HelpPage tab={tab} />
          </div>
        </div>
        <div className="dialog-buttons">
          <button className="btn" autoFocus onClick={close}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
