import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Purple gradient background
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, '#6D28D9')
  gradient.addColorStop(1, '#C4B5FD')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, size * 0.22)
  ctx.fill()

  // White "L" letter
  ctx.fillStyle = 'white'
  ctx.font = `bold ${size * 0.55}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('L', size / 2, size / 2)

  return canvas.toBuffer('image/png')
}

mkdirSync(publicDir, { recursive: true })
writeFileSync(join(publicDir, 'icon-192.png'), generateIcon(192))
writeFileSync(join(publicDir, 'icon-512.png'), generateIcon(512))
console.log('Icons generated ✓')
