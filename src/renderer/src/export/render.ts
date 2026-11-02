import type { SvgImage } from './svg'

export type ImageType = 'png' | 'jpeg'

/** Auflösung: 2 = doppelt so viele Pixel wie im SVG (scharf auf hochauflösenden Displays). */
const SCALE = 2

/**
 * Größtes Canvas, das sicher entsteht: Chromium lehnt Seiten über 32 767 Pixel ab, sehr viele
 * Pixel scheitern am Speicher („Bild konnte nicht erzeugt werden“).
 */
export const MAX_CANVAS_SIDE = 32_767
export const MAX_CANVAS_PIXELS = 2 ** 25

/** Maßstab fürs Rastern: `SCALE`, bei sehr großen Bildern so weit kleiner, dass es passt. */
export function rasterScale(width: number, height: number): number {
  return Math.min(
    SCALE,
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
    Math.sqrt(MAX_CANVAS_PIXELS / (width * height))
  )
}

/** Einzelne UTF-16-Hälften (kaputte Surrogate), z. B. aus importierten Dokumenten */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * SVG als data:-URL (Vorschau und Rastern). `encodeURIComponent` wirft bei einzelnen
 * Surrogaten – die werden vorher zum Ersatzzeichen „�“.
 */
export function svgDataUrl(svg: string): string {
  const safe = svg.replace(LONE_SURROGATE, '�')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safe)}`
}

/**
 * SVG → PNG/JPG. Das SVG wird als data:-URL in ein <img> geladen (erlaubt die CSP) und auf ein
 * Canvas gezeichnet. JPG kennt keine Transparenz, deshalb immer erst weiß füllen.
 */
export async function rasterize(image: SvgImage, type: ImageType): Promise<Uint8Array> {
  const img = new Image()
  img.src = svgDataUrl(image.svg)
  await img.decode()

  const canvas = document.createElement('canvas')
  const scale = rasterScale(image.width, image.height)
  canvas.width = Math.floor(image.width * scale)
  canvas.height = Math.floor(image.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfügbar')
  ctx.fillStyle = image.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))),
      `image/${type}`,
      0.92
    )
  )
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * HTML zum Drucken als PDF: jede Seite (fertiges A4-SVG, hoch oder quer) auf ein eigenes Blatt.
 * Querseiten nutzen die benannte Seite `quer` – so mischt eine PDF Hoch- und Querformat.
 * Gedruckt wird ohne Seitenrand, der Rand steckt im SVG – so füllt beim dunklen Export die
 * Hintergrundfarbe das ganze Blatt.
 */
export function pdfHtml(pages: SvgImage[]): string {
  const background = pages[0]?.background ?? '#ffffff'
  const page = (p: SvgImage): string =>
    `<div class="page${p.width > p.height ? ' is-landscape' : ''}">${p.svg}</div>`
  return (
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '@page{size:A4 portrait;margin:0}@page quer{size:A4 landscape;margin:0}' +
    `html,body{margin:0;background:${background}}` +
    // Seite etwas niedriger als das Blatt, sonst erzeugen Rundungen leere Zusatzseiten
    '.page{width:21cm;height:29.6cm;break-after:page;overflow:hidden}' +
    '.page.is-landscape{page:quer;width:29.7cm;height:20.9cm}' +
    '.page:last-child{break-after:auto}' +
    '.page>svg{display:block;width:100%;height:100%}' +
    '</style></head><body>' +
    pages.map(page).join('') +
    '</body></html>'
  )
}
