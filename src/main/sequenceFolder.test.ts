import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSequenceFolder } from './sequenceFolder'

let parent: string

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'automat-sequence-'))
})

afterEach(async () => {
  await rm(parent, { recursive: true, force: true })
})

describe('createSequenceFolder', () => {
  it('legt einen neuen Ordner mit dem Basisnamen an', async () => {
    const folder = await createSequenceFolder(parent, 'Unbenannt-simulation-schritt')
    expect(folder).toBe(join(parent, 'Unbenannt-simulation-schritt'))
    expect(await readdir(folder)).toEqual([])
  })

  it('benutzt nie einen vorhandenen Ordner', async () => {
    await mkdir(join(parent, 'serie'))
    await writeFile(join(parent, 'serie', 'serie-01.png'), 'alt')
    await mkdir(join(parent, 'serie (2)'))
    const folder = await createSequenceFolder(parent, 'serie')
    expect(folder).toBe(join(parent, 'serie (3)'))
    expect(await readdir(join(parent, 'serie'))).toEqual(['serie-01.png'])
  })

  it('weicht auch einer gleichnamigen Datei aus', async () => {
    await writeFile(join(parent, 'serie'), '')
    expect(await createSequenceFolder(parent, 'serie')).toBe(join(parent, 'serie (2)'))
  })
})
