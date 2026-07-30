import * as THREE from 'three'
import { ValueNoise2D, mulberry32, ridged } from './Noise'

/**
 * Every surface in the game is drawn here at runtime on a 2D canvas.
 * No image files ship with the project, which keeps the asset licence trivial
 * and lets the whole building share one coherent, hand-tuned material language.
 */

export type TextureSet = {
  map: THREE.CanvasTexture
  normalMap?: THREE.CanvasTexture
  roughnessMap?: THREE.CanvasTexture
}

let RESOLUTION_SCALE = 1

export function setTextureResolutionScale(scale: number): void {
  RESOLUTION_SCALE = scale
}

const cache = new Map<string, TextureSet>()
const soloCache = new Map<string, THREE.CanvasTexture>()

function res(base: number): number {
  return Math.max(64, Math.round(base * RESOLUTION_SCALE))
}

export function makeCanvas(size: number, height = size): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = height
  return c
}

export function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) throw new Error('2D canvas context unavailable')
  return g
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean, repeat: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 16
  t.needsUpdate = true
  return t
}

/** Sobel height -> tangent-space normal map. */
export function normalFromCanvas(source: HTMLCanvasElement, strength = 1.6): HTMLCanvasElement {
  const w = source.width
  const h = source.height
  const src = ctx2d(source).getImageData(0, 0, w, h)
  const out = makeCanvas(w, h)
  const dst = ctx2d(out).createImageData(w, h)
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    lum[i] = (src.data[i * 4] * 0.299 + src.data[i * 4 + 1] * 0.587 + src.data[i * 4 + 2] * 0.114) / 255
  }
  const at = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
      const nx = dx * strength
      const ny = dy * strength
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      const i = (y * w + x) * 4
      dst.data[i] = ((nx / len) * 0.5 + 0.5) * 255
      dst.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      dst.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255
      dst.data[i + 3] = 255
    }
  }
  ctx2d(out).putImageData(dst, 0, 0)
  return out
}

/** Greyscale copy used as a roughness map. `bias`/`range` remap the contrast. */
export function greyscaleCanvas(source: HTMLCanvasElement, bias = 0.5, range = 0.35): HTMLCanvasElement {
  const w = source.width
  const h = source.height
  const src = ctx2d(source).getImageData(0, 0, w, h)
  const out = makeCanvas(w, h)
  const g = ctx2d(out)
  const dst = g.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const l = (src.data[i * 4] * 0.299 + src.data[i * 4 + 1] * 0.587 + src.data[i * 4 + 2] * 0.114) / 255
    const v = Math.max(0, Math.min(1, bias + (l - 0.5) * 2 * range)) * 255
    dst.data[i * 4] = v
    dst.data[i * 4 + 1] = v
    dst.data[i * 4 + 2] = v
    dst.data[i * 4 + 3] = 255
  }
  g.putImageData(dst, 0, 0)
  return out
}

/** Multiply a soft dirt/wear layer over whatever is already on the canvas. */
function grime(g: CanvasRenderingContext2D, size: number, seed: number, amount = 0.16, scale = 3): void {
  const n = new ValueNoise2D(64, seed)
  const img = g.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = n.fbm(x / size, y / size, 5, scale)
      const k = 1 - amount * (1 - v)
      const i = (y * size + x) * 4
      img.data[i] *= k
      img.data[i + 1] *= k
      img.data[i + 2] *= k
    }
  }
  g.putImageData(img, 0, 0)
}

/**
 * Run a drawing routine nine times, offset by one tile in each direction, so
 * anything that crosses an edge reappears on the opposite side. Without this
 * every hand-drawn detail cuts off at the seam and the tiling becomes visible
 * the moment a wall is more than two metres wide.
 */
function wrapDraw(g: CanvasRenderingContext2D, size: number, fn: () => void): void {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      g.save()
      g.translate(ox * size, oy * size)
      fn()
      g.restore()
    }
  }
}

function speckle(g: CanvasRenderingContext2D, size: number, seed: number, count: number, colors: string[], maxR = 1.6): void {
  const pts: Array<[number, number, number, string, number]> = []
  const rnd = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    pts.push([rnd() * size, rnd() * size, 0.3 + rnd() * maxR, colors[Math.floor(rnd() * colors.length)], 0.1 + rnd() * 0.5])
  }
  wrapDraw(g, size, () => {
    for (const [x, y, r, col, a] of pts) {
      g.fillStyle = col
      g.globalAlpha = a
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  })
}

// ---------------------------------------------------------------------------
// Surface library
// ---------------------------------------------------------------------------

/** Aged lime plaster with hairline cracks and damp staining near the base. */
export function agedPlaster(tint = '#b9ab93', seed = 11, repeat: [number, number] = [3, 2]): TextureSet {
  const key = `plaster:${tint}:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit

  const size = res(512)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(64, seed)

  g.fillStyle = tint
  g.fillRect(0, 0, size, size)

  const img = g.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = n.fbm(x / size, y / size, 5, 6)
      const fine = n.fbm(x / size + 3, y / size + 8, 3, 28)
      const trowel = n.fbm(x / size + 11, y / size + 5, 2, 14)
      const k = 0.93 + (broad - 0.5) * 0.1 + (fine - 0.5) * 0.09 + (trowel - 0.5) * 0.05
      const i = (y * size + x) * 4
      img.data[i] = Math.min(255, img.data[i] * k)
      img.data[i + 1] = Math.min(255, img.data[i + 1] * k * 0.995)
      img.data[i + 2] = Math.min(255, img.data[i + 2] * k * 0.982)
    }
  }
  g.putImageData(img, 0, 0)

  // hairline cracks: a few branching polylines, drawn thin and low contrast
  const rnd = mulberry32(seed * 7 + 3)
  const cracks: Array<{ pts: Array<[number, number]>; w: number; a: number }> = []
  for (let i = 0; i < 6; i++) {
    let x = rnd() * size
    let y = rnd() * size
    let a = rnd() * Math.PI * 2
    const pts: Array<[number, number]> = [[x, y]]
    const steps = 26 + Math.floor(rnd() * 40)
    for (let s = 0; s < steps; s++) {
      a += (rnd() - 0.5) * 0.9
      x += Math.cos(a) * (2 + rnd() * 4)
      y += Math.sin(a) * (2 + rnd() * 4)
      pts.push([x, y])
    }
    cracks.push({ pts, w: 0.6 + rnd() * 0.7, a: 0.1 + rnd() * 0.13 })
  }
  g.lineCap = 'round'
  wrapDraw(g, size, () => {
    for (const c of cracks) {
      g.strokeStyle = `rgba(72,62,50,${c.a})`
      g.lineWidth = c.w
      g.beginPath()
      c.pts.forEach(([px, py], i) => (i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)))
      g.stroke()
    }
  })

  speckle(g, size, seed + 99, Math.round(size * 1.2), ['#6a5f4d', '#8d8168', '#4d4438'])
  grime(g, size, seed + 5, 0.14, 3)

  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    normalMap: toTexture(normalFromCanvas(c, 0.9), false, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.86, 0.16), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Dark stained wood: vertical grain, growth rings, satin varnish wear. */
export function stainedWood(
  base = '#4a3527',
  seed = 23,
  repeat: [number, number] = [1, 1],
  grainAcross = 1,
): TextureSet {
  const key = `wood:${base}:${seed}:${repeat.join()}:${grainAcross}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit

  const size = res(512)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(64, seed)
  g.fillStyle = base
  g.fillRect(0, 0, size, size)

  const img = g.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = grainAcross ? x / size : y / size
      const v = grainAcross ? y / size : x / size
      // Growth rings, warped along the grain. Frequencies are kept low on
      // purpose: the previous fibre term ran at roughly one cycle per pixel,
      // which is not a texture but an aliasing pattern, and it turned every
      // large flat door into moire the moment it was seen at an angle.
      const warp = n.fbm(u, v * 3, 4, 3) * 0.5
      const rings = Math.sin((u * 9 + warp * 4) * Math.PI) * 0.5 + 0.5
      const fibre = n.fbm(u, v, 3, 18)
      const k = 0.80 + rings * 0.13 + (fibre - 0.5) * 0.16
      const i = (y * size + x) * 4
      img.data[i] = Math.min(255, img.data[i] * k * 1.04)
      img.data[i + 1] = Math.min(255, img.data[i + 1] * k)
      img.data[i + 2] = Math.min(255, img.data[i + 2] * k * 0.95)
    }
  }
  g.putImageData(img, 0, 0)

  // a couple of knots
  const rnd = mulberry32(seed + 41)
  const knots = [
    [rnd() * size, rnd() * size],
    [rnd() * size, rnd() * size],
  ]
  wrapDraw(g, size, () => {
    for (const [kx, ky] of knots) {
      for (let r = 14; r > 0; r -= 1.4) {
        g.strokeStyle = `rgba(30,20,13,${0.05 + (14 - r) * 0.012})`
        g.lineWidth = 1.1
        g.beginPath()
        g.ellipse(kx, ky, r * 1.5, r, 0.4, 0, Math.PI * 2)
        g.stroke()
      }
    }
  })

  grime(g, size, seed + 13, 0.13, 3)

  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    normalMap: toTexture(normalFromCanvas(c, 0.4), false, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.58, 0.2), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Worn 1980s linoleum: speckled sheet goods with traffic polish. */
export function wornLinoleum(seed = 31, repeat: [number, number] = [4, 4]): TextureSet {
  const key = `lino:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(512)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(64, seed)
  g.fillStyle = '#6b6154'
  g.fillRect(0, 0, size, size)

  const img = g.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = n.fbm(x / size, y / size, 4, 16)
      const k = 0.85 + v * 0.3
      const i = (y * size + x) * 4
      img.data[i] *= k
      img.data[i + 1] *= k * 0.99
      img.data[i + 2] *= k * 0.96
    }
  }
  g.putImageData(img, 0, 0)
  speckle(g, size, seed + 8, Math.round(size * 6), ['#8d8371', '#4e463b', '#9c9686', '#3c352c'], 1.1)
  // scuff arcs from a chair or a door sweep
  const rnd = mulberry32(seed + 77)
  const arcs = Array.from({ length: 5 }, () => ({
    x: rnd() * size,
    y: rnd() * size,
    r: 30 + rnd() * 120,
    a0: rnd() * 6,
    a1: rnd() * 6,
    w: 2 + rnd() * 5,
    o: 0.03 + rnd() * 0.05,
  }))
  wrapDraw(g, size, () => {
    for (const a of arcs) {
      g.strokeStyle = `rgba(230,226,214,${a.o})`
      g.lineWidth = a.w
      g.beginPath()
      g.arc(a.x, a.y, a.r, a.a0, a.a1)
      g.stroke()
    }
  })
  grime(g, size, seed + 3, 0.2, 3)

  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    normalMap: toTexture(normalFromCanvas(c, 0.4), false, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.5, 0.3), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Terrazzo entrance floor - the standard of a Showa-era shopfront. */
export function terrazzo(seed = 47, repeat: [number, number] = [3, 3]): TextureSet {
  const key = `terrazzo:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(512)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  g.fillStyle = '#605c55'
  g.fillRect(0, 0, size, size)
  const rnd = mulberry32(seed)
  const chipColors = ['#a8a294', '#8a8375', '#c9c3b2', '#4a463d', '#7b7060']
  const chips = Array.from({ length: 1200 }, () => {
    const r = 2 + rnd() * 7
    const n = 5 + Math.floor(rnd() * 3)
    return {
      x: rnd() * size,
      y: rnd() * size,
      col: chipColors[Math.floor(rnd() * chipColors.length)],
      pts: Array.from({ length: n }, (_, p) => {
        const a = (p / n) * Math.PI * 2
        const rr = r * (0.6 + rnd() * 0.6)
        return [Math.cos(a) * rr, Math.sin(a) * rr] as [number, number]
      }),
    }
  })
  g.globalAlpha = 0.75
  wrapDraw(g, size, () => {
    for (const c of chips) {
      g.fillStyle = c.col
      g.beginPath()
      c.pts.forEach(([dx, dy], i) => (i === 0 ? g.moveTo(c.x + dx, c.y + dy) : g.lineTo(c.x + dx, c.y + dy)))
      g.closePath()
      g.fill()
    }
  })
  g.globalAlpha = 1
  grime(g, size, seed + 2, 0.24, 3)
  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    normalMap: toTexture(normalFromCanvas(c, 0.5), false, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.42, 0.26), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Aged brass with rubbed highlights and green patina in the recesses. */
export function agedBrass(seed = 53, repeat: [number, number] = [1, 1]): TextureSet {
  const key = `brass:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(256)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(48, seed)
  const img = ctx2d(c).createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const brushed = ridged(n.fbm(x / size, y / size, 3, 40))
      const blotch = n.fbm(x / size + 5, y / size + 2, 4, 3)
      const patina = Math.max(0, blotch - 0.62) * 2.4
      const k = 0.72 + brushed * 0.2 + blotch * 0.22
      const i = (y * size + x) * 4
      img.data[i] = Math.min(255, 196 * k * (1 - patina * 0.5))
      img.data[i + 1] = Math.min(255, 158 * k * (1 - patina * 0.06))
      img.data[i + 2] = Math.min(255, 92 * k * (1 + patina * 0.45))
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.38, 0.3), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Black crinkle enamel - the finish on a 1950s view camera and its hardware. */
export function crinkleEnamel(seed = 61, repeat: [number, number] = [2, 2]): TextureSet {
  const key = `crinkle:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(256)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(48, seed)
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = ridged(n.fbm(x / size, y / size, 2, 26))
      const k = 0.55 + cell * 0.5
      const i = (y * size + x) * 4
      img.data[i] = 26 * k
      img.data[i + 1] = 25 * k
      img.data[i + 2] = 24 * k
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    normalMap: toTexture(normalFromCanvas(c, 1.5), false, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.62, 0.2), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Deep velvet backdrop cloth: soft weave, heavy vertical drape shading. */
export function velvetCloth(tint = '#2c2f38', seed = 67, repeat: [number, number] = [1, 1]): TextureSet {
  const key = `velvet:${tint}:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(512)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(64, seed)
  g.fillStyle = tint
  g.fillRect(0, 0, size, size)
  const img = g.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Fine pile rather than a visible grid: velvet reads as depth, not weave.
      const weave =
        (Math.sin((x / size) * Math.PI * 512) * 0.5 + 0.5) * 0.5 +
        (Math.sin((y / size) * Math.PI * 512) * 0.5 + 0.5) * 0.5
      const nap = n.fbm(x / size, y / size, 3, 48)
      const drape = n.fbm(x / size + 4, y / size, 4, 3)
      const k = 0.5 + weave * 0.05 + nap * 0.16 + drape * 0.42
      const i = (y * size + x) * 4
      img.data[i] *= k
      img.data[i + 1] *= k
      img.data[i + 2] *= k
    }
  }
  g.putImageData(img, 0, 0)
  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    normalMap: toTexture(normalFromCanvas(c, 0.32), false, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.96, 0.04), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Yellowed paper stock for documents, labels and photograph borders. */
export function yellowedPaper(seed = 71, repeat: [number, number] = [1, 1], tint = '#d8cba9'): TextureSet {
  const key = `paper:${seed}:${tint}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(256)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(48, seed)
  g.fillStyle = tint
  g.fillRect(0, 0, size, size)
  const img = g.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fibre = n.fbm(x / size, y / size, 3, 30)
      const foxing = Math.max(0, n.fbm(x / size + 9, y / size + 4, 4, 4) - 0.6) * 1.6
      const k = 0.92 + fibre * 0.12 - foxing * 0.22
      const i = (y * size + x) * 4
      img.data[i] *= k
      img.data[i + 1] *= k * 0.985
      img.data[i + 2] *= k * 0.95
    }
  }
  g.putImageData(img, 0, 0)
  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    normalMap: toTexture(normalFromCanvas(c, 0.35), false, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.88, 0.08), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Frosted / wire-reinforced glass for the entrance door and the transom. */
export function frostedGlass(seed = 83, repeat: [number, number] = [1, 1], wire = true): THREE.CanvasTexture {
  const key = `frost:${seed}:${wire}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = soloCache.get(key)
  if (hit) return hit
  const size = res(256)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(48, seed)
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = n.fbm(x / size, y / size, 4, 26)
      const l = 168 + v * 70
      const i = (y * size + x) * 4
      img.data[i] = l
      img.data[i + 1] = l * 1.01
      img.data[i + 2] = l * 1.06
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  if (wire) {
    g.strokeStyle = 'rgba(90,95,100,0.5)'
    g.lineWidth = 1.2
    const step = size / 8
    for (let i = 0; i <= 8; i++) {
      g.beginPath()
      g.moveTo(i * step, 0)
      g.lineTo(i * step, size)
      g.moveTo(0, i * step)
      g.lineTo(size, i * step)
      g.stroke()
    }
  }
  const t = toTexture(c, true, repeat)
  soloCache.set(key, t)
  return t
}

/** Glossy white enamel with chipped edges - the developing trays. */
export function enamel(tint = '#e6e3da', seed = 89, repeat: [number, number] = [1, 1]): TextureSet {
  const key = `enamel:${tint}:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(256)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  g.fillStyle = tint
  g.fillRect(0, 0, size, size)
  const rnd = mulberry32(seed)
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(40,40,44,${0.25 + rnd() * 0.4})`
    g.beginPath()
    g.ellipse(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 2.4, rnd() * 3, 0, Math.PI * 2)
    g.fill()
  }
  grime(g, size, seed + 1, 0.1, 3)
  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.24, 0.2), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Bakelite: dark, slightly translucent-looking phenolic with a fine mottle. */
export function bakelite(tint = '#2a211c', seed = 97, repeat: [number, number] = [1, 1]): TextureSet {
  const key = `bakelite:${tint}:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(128)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(32, seed)
  g.fillStyle = tint
  g.fillRect(0, 0, size, size)
  const img = g.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = 0.85 + n.fbm(x / size, y / size, 3, 12) * 0.35
      const i = (y * size + x) * 4
      img.data[i] *= k * 1.05
      img.data[i + 1] *= k
      img.data[i + 2] *= k * 0.98
    }
  }
  g.putImageData(img, 0, 0)
  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.34, 0.14), false, repeat),
  }
  cache.set(key, set)
  return set
}

/** Pressed-tin / painted steel ceiling panels. */
export function paintedSteel(tint = '#8e8a7e', seed = 101, repeat: [number, number] = [2, 2]): TextureSet {
  const key = `steel:${tint}:${seed}:${repeat.join()}:${RESOLUTION_SCALE}`
  const hit = cache.get(key)
  if (hit) return hit
  const size = res(256)
  const c = makeCanvas(size)
  const g = ctx2d(c)
  const n = new ValueNoise2D(48, seed)
  g.fillStyle = tint
  g.fillRect(0, 0, size, size)
  const img = g.getImageData(0, 0, size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = 0.86 + n.fbm(x / size, y / size, 4, 6) * 0.28
      const i = (y * size + x) * 4
      img.data[i] *= k
      img.data[i + 1] *= k
      img.data[i + 2] *= k * 0.99
    }
  }
  g.putImageData(img, 0, 0)
  speckle(g, size, seed + 4, 200, ['#6a6459', '#a09a8c'], 1.4)
  const set: TextureSet = {
    map: toTexture(c, true, repeat),
    normalMap: toTexture(normalFromCanvas(c, 0.4), false, repeat),
    roughnessMap: toTexture(greyscaleCanvas(c, 0.7, 0.16), false, repeat),
  }
  cache.set(key, set)
  return set
}

export function disposeTextureCaches(): void {
  for (const set of cache.values()) {
    set.map.dispose()
    set.normalMap?.dispose()
    set.roughnessMap?.dispose()
  }
  for (const t of soloCache.values()) t.dispose()
  cache.clear()
  soloCache.clear()
}

/**
 * One of the four process glyphs used by the entrance lock's rings, the ring
 * icons in the hall, and the enamel plates that appear in the last photograph.
 *
 * It lives here rather than in Hall.ts so the photograph can draw the same
 * artwork the lock uses. Two hand-drawn copies would drift, and the whole point
 * of putting the glyphs in the photograph is that they are the SAME marks.
 *
 * 0 shutter iris (撮影) / 1 an image emerging (現像) / 2 a bar (停止) / 3 sealed (定着)
 */
export function processIconCanvas(index: number): HTMLCanvasElement {
  const px = 192
  const c = makeCanvas(px, px)
  const g = ctx2d(c)
  g.fillStyle = '#b79a58'
  g.beginPath()
  g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#3a2e18'
  g.fillStyle = '#3a2e18'
  g.lineWidth = 7
  g.lineCap = 'round'
  const cx = px / 2
  const cy = px / 2
  const r = px * 0.28
  switch (index) {
    case 0: {
      // shutter iris: six overlapping blades
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        g.beginPath()
        g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        g.lineTo(cx + Math.cos(a + 1.05) * r, cy + Math.sin(a + 1.05) * r)
        g.stroke()
      }
      g.beginPath()
      g.arc(cx, cy, r * 0.3, 0, Math.PI * 2)
      g.fill()
      break
    }
    case 1: {
      // an image emerging: three tonal bars rising out of a tray line
      g.beginPath()
      g.moveTo(cx - r, cy + r * 0.72)
      g.lineTo(cx + r, cy + r * 0.72)
      g.stroke()
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = 0.35 + i * 0.3
        g.fillRect(cx - r * 0.66 + i * r * 0.52, cy + r * 0.5 - (i + 1) * r * 0.34, r * 0.34, (i + 1) * r * 0.34)
      }
      g.globalAlpha = 1
      break
    }
    case 2: {
      // stop: a single heavy bar across a circle
      g.beginPath()
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.stroke()
      g.lineWidth = 13
      g.beginPath()
      g.moveTo(cx - r * 0.72, cy)
      g.lineTo(cx + r * 0.72, cy)
      g.stroke()
      break
    }
    default: {
      // fix: a square sealed with a cross-hatched corner
      g.strokeRect(cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64)
      g.lineWidth = 5
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.moveTo(cx - r * 0.82 + i * r * 0.42, cy + r * 0.82)
        g.lineTo(cx + r * 0.82, cy - r * 0.82 + i * r * 0.42)
        g.stroke()
      }
      break
    }
  }
  return c
}

/** The four glyphs in work order, built once and reused. */
let processMarkCache: HTMLCanvasElement[] | null = null
export function processMarks(): HTMLCanvasElement[] {
  processMarkCache ??= [0, 1, 2, 3].map((i) => processIconCanvas(i))
  return processMarkCache
}
