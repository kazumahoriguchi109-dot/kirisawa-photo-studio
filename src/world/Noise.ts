/**
 * Deterministic noise utilities for procedural texture generation.
 * Seeded so that every playthrough sees the identical room.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Tileable value noise on an integer lattice. */
export class ValueNoise2D {
  private readonly grid: Float32Array
  constructor(
    private readonly size: number,
    seed: number,
  ) {
    const rnd = mulberry32(seed)
    this.grid = new Float32Array(size * size)
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = rnd()
  }

  private at(x: number, y: number): number {
    const s = this.size
    const xi = ((x % s) + s) % s
    const yi = ((y % s) + s) % s
    return this.grid[yi * s + xi]
  }

  sample(x: number, y: number): number {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    // smoothstep interpolation keeps it free of lattice creases
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    const a = this.at(x0, y0)
    const b = this.at(x0 + 1, y0)
    const c = this.at(x0, y0 + 1)
    const d = this.at(x0 + 1, y0 + 1)
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy
  }

  /** Fractal Brownian motion. `freq` is in lattice cells across the sample space. */
  fbm(x: number, y: number, octaves = 4, freq = 4, gain = 0.5, lacunarity = 2): number {
    let amp = 1
    let sum = 0
    let norm = 0
    let f = freq
    for (let o = 0; o < octaves; o++) {
      sum += this.sample(x * f, y * f) * amp
      norm += amp
      amp *= gain
      f *= lacunarity
    }
    return sum / norm
  }
}

/** Tileable ridged noise, good for fabric weave and brushed metal. */
export function ridged(n: number): number {
  return 1 - Math.abs(n * 2 - 1)
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a)
  const pb = hexToRgb(b)
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t)
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t)
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t)
  return `rgb(${r},${g},${bl})`
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  )
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
