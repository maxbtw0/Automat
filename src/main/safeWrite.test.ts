import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { safeWriteFile } from './safeWrite'

let folder: string

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'automat-safe-'))
})

afterEach(async () => {
  await rm(folder, { recursive: true, force: true })
})

describe('safeWriteFile', () => {
  it('ersetzt eine vorhandene Datei und lässt keine Hilfsdatei zurück', async () => {
    const target = join(folder, 'a.json')
    await writeFile(target, 'alt')
    await safeWriteFile(target, 'neu')
    expect(await readFile(target, 'utf-8')).toBe('neu')
    expect(await readdir(folder)).toEqual(['a.json'])
  })

  it('schreibt Aufträge für denselben Pfad in Aufrufreihenfolge', async () => {
    const target = join(folder, 'a.json')
    const big = 'x'.repeat(2_000_000)
    await Promise.all([safeWriteFile(target, big), safeWriteFile(target, 'zuletzt')])
    expect(await readFile(target, 'utf-8')).toBe('zuletzt')
  })

  it('räumt die Hilfsdatei auf, wenn das Ersetzen scheitert', async () => {
    // Ein Ordner lässt sich nicht durch eine Datei ersetzen
    await mkdir(join(folder, 'a.json'))
    await expect(safeWriteFile(join(folder, 'a.json'), 'neu')).rejects.toThrow()
    expect(await readdir(folder)).toEqual(['a.json'])
  })
})
