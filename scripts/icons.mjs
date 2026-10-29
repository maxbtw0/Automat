// Erzeugt aus build/icon.svg das App-Icon in allen Formaten:
// build/icon.ico (Installer, .exe), build/icon.png (Fenster) und das Favicon des Renderers.
// Aufruf: npm run icons – rastert mit Electron selbst, braucht also kein weiteres Paket.
import { app, BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(root, 'build', 'icon.svg')
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
const PNG_SIZE = 512

/** Zeichnet das SVG in der Zielgröße (vektoriell, nicht herunterskaliert) und liefert PNG-Bytes. */
async function rasterize(win, svg, size) {
  const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = ${size}
      canvas.getContext('2d').drawImage(img, 0, 0, ${size}, ${size})
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('SVG lässt sich nicht laden'))
    img.src = ${JSON.stringify(url)}
  })`)
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
}

/** ICO mit PNG-Einträgen (ab Windows Vista): Kopf, ein Verzeichniseintrag pro Größe, dann die Bilder. */
function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

async function main() {
  const svg = await readFile(SOURCE, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('about:blank')

  const images = []
  for (const size of ICO_SIZES) images.push({ size, png: await rasterize(win, svg, size) })
  await writeFile(join(root, 'build', 'icon.ico'), encodeIco(images))
  await writeFile(join(root, 'build', 'icon.png'), await rasterize(win, svg, PNG_SIZE))

  const publicDir = join(root, 'src', 'renderer', 'public')
  await mkdir(publicDir, { recursive: true })
  await writeFile(join(publicDir, 'favicon.svg'), svg)

  console.log(`icon.ico (${ICO_SIZES.join(', ')} px), icon.png (${PNG_SIZE} px), favicon.svg`)
}

app.whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
