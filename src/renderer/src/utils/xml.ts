/**
 * Kleiner XML-Leser für Importe: nur Elemente und Attribute, Text fällt weg.
 * Bewusst ohne `DOMParser` – so laufen die Tests ohne DOM.
 */

export interface XmlElement {
  name: string
  attributes: Record<string, string>
  children: XmlElement[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? match
    const code =
      entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10)
    return code <= 0x10ffff ? String.fromCodePoint(code) : match
  })
}

const NAME = /^[^\s/>=]+/
const ATTRIBUTE = /^\s*([^\s/>=]+)\s*=\s*("([^"]*)"|'([^']*)')/

/** Liefert das Wurzelelement. Wirft bei kaputtem XML. */
export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: '', attributes: {}, children: [] }
  const open: XmlElement[] = [root]
  let pos = 0

  const skipPast = (end: string, what: string): void => {
    const index = text.indexOf(end, pos)
    if (index < 0) throw new Error(`${what} nicht abgeschlossen`)
    pos = index + end.length
  }

  while (pos < text.length) {
    const lt = text.indexOf('<', pos)
    if (lt < 0) break
    pos = lt
    if (text.startsWith('<?', pos)) skipPast('?>', 'Verarbeitungsanweisung')
    else if (text.startsWith('<!--', pos)) skipPast('-->', 'Kommentar')
    else if (text.startsWith('<![CDATA[', pos)) skipPast(']]>', 'CDATA-Abschnitt')
    else if (text.startsWith('<!', pos)) skipPast('>', 'Deklaration')
    else if (text.startsWith('</', pos)) {
      const name = NAME.exec(text.slice(pos + 2))?.[0]
      const current = open.pop()
      if (!name || !current || current === root || current.name !== name) {
        throw new Error(`Unerwartetes </${name ?? ''}>`)
      }
      skipPast('>', `</${name}>`)
    } else {
      const name = NAME.exec(text.slice(pos + 1))?.[0]
      if (!name) throw new Error('Element ohne Namen')
      pos += 1 + name.length
      const element: XmlElement = { name, attributes: {}, children: [] }
      for (;;) {
        const match = ATTRIBUTE.exec(text.slice(pos))
        if (!match) break
        element.attributes[match[1]] = decodeEntities(match[3] ?? match[4])
        pos += match[0].length
      }
      const rest = /^\s*(\/?)>/.exec(text.slice(pos))
      if (!rest) throw new Error(`<${name}> nicht abgeschlossen`)
      pos += rest[0].length
      open[open.length - 1].children.push(element)
      if (!rest[1]) open.push(element)
    }
  }

  if (open.length > 1) throw new Error(`<${open[open.length - 1].name}> nicht geschlossen`)
  if (root.children.length !== 1) throw new Error('Kein Wurzelelement')
  return root.children[0]
}

/** Kinder mit diesem Namen */
export function childrenNamed(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((c) => c.name === name)
}

export function childNamed(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((c) => c.name === name)
}
