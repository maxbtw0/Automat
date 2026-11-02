import { describe, expect, it } from 'vitest'
import { decodeFileText } from './textDecoding'

const latin1 = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0))

describe('decodeFileText', () => {
  it('liest UTF-8 ohne und mit BOM', () => {
    const bytes = new TextEncoder().encode('{"a":"ä"}')
    expect(decodeFileText(bytes)).toBe('{"a":"ä"}')
    expect(decodeFileText(Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]))).toBe('{"a":"ä"}')
  })

  it('liest XML in der deklarierten Kodierung', () => {
    const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><SYMBOL value="ä"/>'
    expect(decodeFileText(latin1(xml))).toBe(xml)
  })

  it('liest UTF-16 mit BOM', () => {
    const text = '<?xml version="1.0" encoding="UTF-16"?><a>ä</a>'
    const bytes = [0xff, 0xfe, ...[...text].flatMap((c) => [c.charCodeAt(0), 0])]
    expect(decodeFileText(Uint8Array.from(bytes))).toBe(text)
  })

  it('meldet Latin-1-Bytes ohne Deklaration, statt „�“ einzusetzen', () => {
    expect(() => decodeFileText(latin1('<a>ä</a>'))).toThrow('nicht gültig als UTF-8')
  })

  it('meldet eine unbekannte Kodierung', () => {
    const xml = '<?xml version="1.0" encoding="x-unbekannt"?><a/>'
    expect(() => decodeFileText(latin1(xml))).toThrow('Kodierung „x-unbekannt“ wird nicht unterstützt.')
  })
})
