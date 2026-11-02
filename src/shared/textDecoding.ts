/**
 * Text einer geöffneten Datei aus ihren Bytes. Die Kodierung steht im BOM, bei XML sonst in der
 * Deklaration (`<?xml version="1.0" encoding="ISO-8859-1"?>`), sonst gilt UTF-8. Ungültige
 * Bytefolgen sind ein Fehler – still ersetzte Zeichen („�“) würden Symbole verfälschen.
 */
export function decodeFileText(bytes: Uint8Array): string {
  const encoding = detectEncoding(bytes)
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(encoding, { fatal: true })
  } catch {
    throw new Error(`Kodierung „${encoding}“ wird nicht unterstützt.`)
  }
  try {
    return decoder.decode(bytes)
  } catch {
    throw new Error(`Die Datei ist nicht gültig als ${encoding.toUpperCase()} kodiert.`)
  }
}

const startsWith = (bytes: Uint8Array, prefix: number[]): boolean =>
  prefix.every((b, i) => bytes[i] === b)

/** Die Deklaration steht in ASCII vorn in der Datei */
const XML_DECLARATION = /^<\?xml[^>]*?\sencoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/

function detectEncoding(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return 'utf-8'
  // UTF-16 mit BOM oder – ohne BOM – an „<?“ erkennbar
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0x3c, 0x00, 0x3f, 0x00])) {
    return 'utf-16le'
  }
  if (startsWith(bytes, [0xfe, 0xff]) || startsWith(bytes, [0x00, 0x3c, 0x00, 0x3f])) {
    return 'utf-16be'
  }
  const head = String.fromCharCode(...bytes.subarray(0, 256))
  const declared = XML_DECLARATION.exec(head)?.[1].toLowerCase()
  // „UTF-16“ ohne BOM und ohne Nullbytes kann nicht stimmen – die Bytes sind 8-Bit-Text
  return declared && !declared.startsWith('utf-16') ? declared : 'utf-8'
}
