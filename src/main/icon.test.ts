import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Breite und Höhe aus dem IHDR-Block eines PNG. */
function pngSize(png: Buffer): [number, number] {
  return [png.readUInt32BE(16), png.readUInt32BE(20)]
}

describe('App-Icon (npm run icons)', () => {
  it('icon.ico enthält alle Größen von 16 bis 256 px als PNG', () => {
    const ico = readFileSync('build/icon.ico')
    expect(ico.readUInt16LE(2)).toBe(1)
    const count = ico.readUInt16LE(4)
    const sizes: number[] = []
    for (let i = 0; i < count; i++) {
      const entry = 6 + 16 * i
      const size = ico.readUInt8(entry) || 256
      const length = ico.readUInt32LE(entry + 8)
      const offset = ico.readUInt32LE(entry + 12)
      const png = ico.subarray(offset, offset + length)
      expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
      expect(pngSize(png)).toEqual([size, size])
      sizes.push(size)
    }
    expect(sizes).toEqual(expect.arrayContaining([16, 24, 32, 48, 256]))
  })

  it('icon.png hat 512 × 512 px', () => {
    const png = readFileSync('build/icon.png')
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    expect(pngSize(png)).toEqual([512, 512])
  })

  it('Favicon entspricht der SVG-Quelle', () => {
    expect(readFileSync('src/renderer/public/favicon.svg', 'utf8')).toBe(
      readFileSync('build/icon.svg', 'utf8')
    )
  })
})
