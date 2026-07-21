/**
 * Generates the app icons.
 *
 * A tiny hand-rolled PNG encoder rather than a 30MB image dependency — the
 * artwork is a warm lens flare on a near-black square, which is just maths over
 * a pixel buffer.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = path.join(root, 'public', 'icons')
mkdirSync(iconsDir, { recursive: true })

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, pixel) {
  // Raw scanlines, each prefixed with filter type 0.
  const stride = size * 3
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(x, y, size)
      const at = y * (stride + 1) + 1 + x * 3
      raw[at] = r
      raw[at + 1] = g
      raw[at + 2] = b
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const INK = [10, 9, 8]
const EMBER = [217, 155, 82]
const EMBER_SOFT = [240, 195, 145]

/** A warm light source, slightly high and left, like a lamp in the corner. */
function pixel(x, y, size) {
  const cx = size * 0.5
  const cy = size * 0.48
  const radius = size * 0.26

  const distance = Math.hypot(x - cx, y - cy) / radius

  if (distance <= 1) {
    // Inside the disc: soft gradient from a hot centre to the ember edge.
    // Light the top-left a touch more, so it reads as lit rather than printed.
    const lean = ((x - cx) * 0.5 + (y - cy) * 0.5) / (radius * 2)
    const t = Math.min(1, Math.max(0, distance ** 1.4 + lean * 0.35))
    return [
      Math.round(EMBER_SOFT[0] + (EMBER[0] - EMBER_SOFT[0]) * t),
      Math.round(EMBER_SOFT[1] + (EMBER[1] - EMBER_SOFT[1]) * t),
      Math.round(EMBER_SOFT[2] + (EMBER[2] - EMBER_SOFT[2]) * t),
    ]
  }

  // Outside: a close halo that gives way to the warm black quickly, so the
  // icon still reads as dark at 40px on a home screen.
  const glow = Math.max(0, 1 - (distance - 1) / 0.55) ** 2.6 * 0.22
  return [
    Math.round(INK[0] + (EMBER[0] - INK[0]) * glow),
    Math.round(INK[1] + (EMBER[1] - INK[1]) * glow),
    Math.round(INK[2] + (EMBER[2] - INK[2]) * glow),
  ]
}

for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  writeFileSync(path.join(iconsDir, name), encodePng(size, pixel))
  console.log(`  wrote public/icons/${name}`)
}

// An SVG for the browser tab, where it stays crisp at 16px.
writeFileSync(
  path.join(iconsDir, 'icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="lamp" cx="50%" cy="47%" r="30%">
      <stop offset="0%" stop-color="#f0c391"/>
      <stop offset="70%" stop-color="#d99b52"/>
      <stop offset="100%" stop-color="#8a5c28"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0a0908"/>
  <circle cx="32" cy="30" r="18" fill="url(#lamp)"/>
</svg>
`,
)
console.log('  wrote public/icons/icon.svg')
