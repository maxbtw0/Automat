import { beforeEach, describe, expect, it } from 'vitest'
import { askChoice, useDialogStore } from './dialogStore'

beforeEach(() => useDialogStore.setState({ request: null }))

describe('askChoice', () => {
  it('liefert den Index des gewählten Knopfs', async () => {
    const choice = askChoice({ title: 'Löschen?', buttons: ['Löschen', 'Abbrechen'] })
    useDialogStore.getState().answer(0)
    expect(await choice).toBe(0)
  })

  it('beendet einen ersetzten Dialog mit dessen eigenem Abbrechen-Knopf', async () => {
    const previous = askChoice({
      title: 'Speichern?',
      buttons: ['Speichern', 'Nicht speichern', 'Abbrechen']
    })
    const next = askChoice({ title: 'Ersetzen?', buttons: ['Ersetzen', 'Abbrechen'] })
    expect(await previous).toBe(2)

    useDialogStore.getState().answer(1)
    expect(await next).toBe(1)
  })
})
