import * as THREE from 'three'
import { ValueNoise2D, mulberry32 } from './Noise'
import { ctx2d, makeCanvas } from './Textures'

/**
 * Original photographic imagery, painted procedurally.
 *
 * These are not photographs of anything real: they are tonal compositions -
 * silhouettes, falloff, grain, foxing - assembled to read as gelatin-silver
 * prints from a small Japanese portrait studio. Everything is generated here,
 * so nothing in the game depends on third-party imagery.
 */

export interface PhotoOptions {
  width?: number
  height?: number
  /** 0 = neutral grey, 1 = full warm sepia */
  sepia?: number
  /** white border width in pixels, 0 for borderless */
  border?: number
  seed?: number
  /** 0..1, how faded/low-contrast the print is */
  age?: number
}

type G = CanvasRenderingContext2D

function toneCurve(g: G, w: number, h: number, sepia: number, age: number, seed: number): void {
  const img = g.getImageData(0, 0, w, h)
  const n = new ValueNoise2D(48, seed)
  const rnd = mulberry32(seed + 17)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let l = (img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114) / 255
      // print curve: lift the blacks, roll off the highlights
      l = 0.06 + Math.pow(l, 1.05) * 0.88
      l = l * (1 - age * 0.28) + age * 0.2
      // silver grain
      const grain = (rnd() - 0.5) * 0.055 + (n.fbm(x / w, y / h, 2, 60) - 0.5) * 0.05
      l = Math.max(0, Math.min(1, l + grain))
      // sepia split-tone: warm the midtones, cool the deepest shadows slightly
      const r = l * (1 + sepia * 0.20)
      const gg = l * (1 + sepia * 0.045)
      const b = l * (1 - sepia * 0.16)
      img.data[i] = Math.min(255, r * 255)
      img.data[i + 1] = Math.min(255, gg * 255)
      img.data[i + 2] = Math.min(255, b * 255)
    }
  }
  g.putImageData(img, 0, 0)
}

function vignette(g: G, w: number, h: number, strength = 0.55): void {
  const grad = g.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.18, w / 2, h / 2, Math.max(w, h) * 0.72)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, `rgba(0,0,0,${strength})`)
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
}

function foxing(g: G, w: number, h: number, seed: number, amount = 10): void {
  const rnd = mulberry32(seed + 303)
  for (let i = 0; i < amount; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = 2 + rnd() * 9
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(128,96,58,${0.10 + rnd() * 0.14})`)
    grad.addColorStop(1, 'rgba(128,96,58,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
}

/** Head-and-shoulders silhouette rendered with soft studio falloff. */
function figure(
  g: G,
  cx: number,
  baseY: number,
  scale: number,
  opts: { key?: number; hair?: 'short' | 'bob' | 'up'; light?: number; erased?: boolean } = {},
): void {
  const key = opts.key ?? 0.62
  const light = opts.light ?? 1
  if (opts.erased) {
    // A neat rectangle of backdrop where a person used to be: someone cut them
    // out of the print and patched it. Deliberately readable, never subtle.
    g.save()
    g.fillStyle = 'rgba(212,203,182,0.93)'
    g.fillRect(cx - scale * 0.52, baseY - scale * 2.05, scale * 1.04, scale * 2.1)
    g.strokeStyle = 'rgba(120,104,78,0.6)'
    g.lineWidth = 1.1
    g.setLineDash([4, 3])
    g.strokeRect(cx - scale * 0.52, baseY - scale * 2.05, scale * 1.04, scale * 2.1)
    g.restore()
    return
  }

  const headR = scale * 0.3
  const headY = baseY - scale * 1.66
  const L = (v: number) => `rgb(${Math.round(v * light)},${Math.round(v * light * 0.97)},${Math.round(v * light * 0.92)})`

  g.save()

  // shoulders: a studio sitter is photographed slightly turned, so the two
  // sides are never symmetrical
  const lean = (opts.key ?? 0.6) > 0.6 ? 1 : -1
  const torso = g.createLinearGradient(cx - scale * 0.9, 0, cx + scale * 0.9, 0)
  torso.addColorStop(0, L(26 * key))
  torso.addColorStop(0.38, L(74 * key))
  torso.addColorStop(0.72, L(40 * key))
  torso.addColorStop(1, L(20 * key))
  g.fillStyle = torso
  g.beginPath()
  g.moveTo(cx - scale * 0.82, baseY)
  g.quadraticCurveTo(cx - scale * 0.7, baseY - scale * 0.78, cx - scale * 0.3 + lean * 0.03 * scale, baseY - scale * 1.18)
  g.quadraticCurveTo(cx, baseY - scale * 1.3, cx + scale * 0.3 + lean * 0.03 * scale, baseY - scale * 1.18)
  g.quadraticCurveTo(cx + scale * 0.7, baseY - scale * 0.78, cx + scale * 0.82, baseY)
  g.closePath()
  g.fill()

  // a pale collar catches the key light - the one bright edge on the body
  g.strokeStyle = L(150)
  g.lineWidth = Math.max(1, scale * 0.035)
  g.beginPath()
  g.moveTo(cx - scale * 0.2, baseY - scale * 1.14)
  g.quadraticCurveTo(cx, baseY - scale * 1.02, cx + scale * 0.2, baseY - scale * 1.14)
  g.stroke()

  // neck, in shadow under the jaw
  g.fillStyle = L(96)
  g.fillRect(cx - scale * 0.1, headY + headR * 0.55, scale * 0.2, scale * 0.34)

  // face: a vertical oval, lit from camera left with a real falloff to the jaw
  const face = g.createRadialGradient(
    cx - headR * 0.4,
    headY - headR * 0.34,
    headR * 0.1,
    cx,
    headY + headR * 0.15,
    headR * 1.55,
  )
  face.addColorStop(0, L(232))
  face.addColorStop(0.42, L(196))
  face.addColorStop(0.78, L(132))
  face.addColorStop(1, L(70))
  g.fillStyle = face
  g.beginPath()
  g.ellipse(cx, headY, headR * 0.76, headR * 1.02, 0, 0, Math.PI * 2)
  g.fill()

  // hair: a cap that stops at the brow, plus a temple on the shadow side, so
  // the head reads as a head rather than a dome
  g.fillStyle = L(30)
  g.beginPath()
  if (opts.hair === 'bob') {
    g.ellipse(cx, headY - headR * 0.24, headR * 0.94, headR * 0.86, 0, Math.PI * 1.02, Math.PI * 1.98)
    g.fill()
    g.beginPath()
    g.ellipse(cx - headR * 0.82, headY + headR * 0.16, headR * 0.24, headR * 0.72, 0, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.ellipse(cx + headR * 0.82, headY + headR * 0.16, headR * 0.24, headR * 0.72, 0, 0, Math.PI * 2)
  } else if (opts.hair === 'up') {
    g.ellipse(cx, headY - headR * 0.5, headR * 0.86, headR * 0.5, 0, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.ellipse(cx + headR * 0.5, headY - headR * 0.92, headR * 0.3, headR * 0.26, 0, 0, Math.PI * 2)
  } else {
    g.ellipse(cx, headY - headR * 0.34, headR * 0.82, headR * 0.62, 0, Math.PI * 1.04, Math.PI * 1.96)
    g.fill()
    g.beginPath()
    g.ellipse(cx - headR * 0.7, headY - headR * 0.18, headR * 0.2, headR * 0.42, 0, 0, Math.PI * 2)
  }
  g.fill()

  // the shadow the sitter throws onto the backdrop, down and to the right
  g.globalAlpha = 0.18
  g.fillStyle = '#000'
  g.beginPath()
  g.ellipse(cx + scale * 0.5, baseY - scale * 0.5, scale * 0.55, scale * 0.7, 0.12, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1

  g.restore()
}

/** Soft studio backdrop wash used behind every portrait. */
function backdrop(g: G, w: number, h: number, light = 1): void {
  const grad = g.createRadialGradient(w * 0.45, h * 0.34, h * 0.06, w * 0.5, h * 0.5, Math.max(w, h) * 0.8)
  grad.addColorStop(0, `rgb(${168 * light | 0},${162 * light | 0},${150 * light | 0})`)
  grad.addColorStop(0.55, `rgb(${104 * light | 0},${100 * light | 0},${92 * light | 0})`)
  grad.addColorStop(1, `rgb(${38 * light | 0},${36 * light | 0},${34 * light | 0})`)
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
}

function withBorder(
  width: number,
  height: number,
  border: number,
  paint: (g: G, w: number, h: number) => void,
): HTMLCanvasElement {
  const c = makeCanvas(width, height)
  const g = ctx2d(c)
  // gelatin-silver mounts yellow; they are never paper-white
  g.fillStyle = '#cdc2a4'
  g.fillRect(0, 0, width, height)
  const iw = width - border * 2
  const ih = height - border * 2
  g.save()
  g.beginPath()
  g.rect(border, border, iw, ih)
  g.clip()
  g.translate(border, border)
  paint(g, iw, ih)
  g.restore()
  // print sits slightly proud of the mount
  g.strokeStyle = 'rgba(90,78,58,0.35)'
  g.lineWidth = 1
  g.strokeRect(border + 0.5, border + 0.5, iw - 1, ih - 1)
  return c
}

// ---------------------------------------------------------------------------
// Named photographs used by the game
// ---------------------------------------------------------------------------

/** A studio portrait. `variant` shifts pose/hair so the wall reads as many sitters. */
/**
 * A sheet of printing paper that was cut, mounted and dated for a sitting that
 * never happened. Deliberately empty: the fourth gap in the chronicle wall is
 * the point of the story, and a portrait printed there would mean the
 * photograph had been taken after all.
 */
export function unexposedPrintCanvas(opts: PhotoOptions = {}): HTMLCanvasElement {
  const w = opts.width ?? 256
  const h = opts.height ?? 340
  const border = opts.border ?? 14
  const rnd = mulberry32(opts.seed ?? 4231)
  return withBorder(w, h, border, (g, iw, ih) => {
    // unexposed paper, developed anyway: an even, slightly warm base fog
    g.fillStyle = '#e6dcc4'
    g.fillRect(0, 0, iw, ih)
    for (let i = 0; i < 900; i++) {
      const x = rnd() * iw
      const y = rnd() * ih
      g.fillStyle = `rgba(150,132,100,${0.02 + rnd() * 0.05})`
      g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2)
    }
    // the faint darker band along one edge where it lay against the others
    const grad = g.createLinearGradient(0, 0, iw * 0.35, 0)
    grad.addColorStop(0, 'rgba(120,102,74,0.22)')
    grad.addColorStop(1, 'rgba(120,102,74,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, iw * 0.35, ih)
  })
}

export function portraitCanvas(variant: number, opts: PhotoOptions = {}): HTMLCanvasElement {
  const w = opts.width ?? 256
  const h = opts.height ?? 340
  const border = opts.border ?? 14
  const seed = opts.seed ?? 1000 + variant * 7
  const rnd = mulberry32(seed)
  const hairs = ['short', 'bob', 'up'] as const
  return withBorder(w, h, border, (g, iw, ih) => {
    backdrop(g, iw, ih, 0.94 + rnd() * 0.12)
    const n = variant % 3 === 2 ? 2 : 1
    if (n === 1) {
      figure(g, iw * 0.5, ih * 0.98, ih * 0.42, {
        hair: hairs[variant % hairs.length],
        key: 0.55 + rnd() * 0.25,
      })
    } else {
      figure(g, iw * 0.34, ih * 0.99, ih * 0.38, { hair: 'short', key: 0.6 })
      figure(g, iw * 0.68, ih * 0.99, ih * 0.34, { hair: 'bob', key: 0.5 })
    }
    vignette(g, iw, ih, 0.5)
    toneCurve(g, iw, ih, opts.sepia ?? 0.55, opts.age ?? 0.28, seed)
    foxing(g, iw, ih, seed, 7)
  })
}

/**
 * A group photograph in which one figure has been cut out and patched.
 * `erasedIndex` is which figure is missing; -1 for an intact print.
 */
export function groupPhotoCanvas(
  count: number,
  erasedIndex: number,
  opts: PhotoOptions = {},
): HTMLCanvasElement {
  const w = opts.width ?? 420
  const h = opts.height ?? 280
  const border = opts.border ?? 12
  const seed = opts.seed ?? 2200 + count * 13 + erasedIndex * 3
  const rnd = mulberry32(seed)
  return withBorder(w, h, border, (g, iw, ih) => {
    backdrop(g, iw, ih, 1)
    const step = iw / (count + 1)
    for (let i = 0; i < count; i++) {
      const scale = ih * (0.31 + rnd() * 0.05)
      figure(g, step * (i + 1), ih * 0.99, scale, {
        hair: (['short', 'bob', 'up'] as const)[(i + count) % 3],
        key: 0.48 + rnd() * 0.3,
        erased: i === erasedIndex,
      })
    }
    vignette(g, iw, ih, 0.46)
    toneCurve(g, iw, ih, opts.sepia ?? 0.5, opts.age ?? 0.3, seed)
    foxing(g, iw, ih, seed, 9)
  })
}

export interface StudioRecordOptions extends PhotoOptions {
  /** Draw the room as it was in 1985 (true) or as it stands tonight (false). */
  past: boolean
  /** Render the safe with a readable dial - only for the enlarger projection. */
  showSafeDial?: boolean
  dialValue?: number
}

/**
 * The archival photograph of the studio interior, used by the observation
 * puzzle. The three differences from the present-day room are, deliberately,
 * large silhouette-level changes rather than pixel details:
 *   1. a round wall clock hangs above the door plate (gone tonight)
 *   2. the backdrop carries a painted landscape (plain velvet tonight)
 *   3. the posing chair faces the camera (turned to the wall tonight)
 */
export function studioRecordCanvas(opts: StudioRecordOptions): HTMLCanvasElement {
  const w = opts.width ?? 512
  const h = opts.height ?? 360
  const border = opts.border ?? 16
  const seed = opts.seed ?? (opts.past ? 3301 : 3407)
  return withBorder(w, h, border, (g, iw, ih) => {
    // room shell
    const wall = g.createLinearGradient(0, 0, 0, ih)
    wall.addColorStop(0, '#8b8478')
    wall.addColorStop(0.62, '#6d675c')
    wall.addColorStop(1, '#403b34')
    g.fillStyle = wall
    g.fillRect(0, 0, iw, ih)

    // floor line
    g.fillStyle = '#4a443b'
    g.fillRect(0, ih * 0.74, iw, ih * 0.26)
    g.strokeStyle = 'rgba(20,18,15,0.5)'
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(0, ih * 0.74)
    g.lineTo(iw, ih * 0.74)
    g.stroke()

    // the backdrop roll on the left two thirds
    g.fillStyle = '#57525c'
    g.fillRect(iw * 0.06, ih * 0.10, iw * 0.56, ih * 0.66)
    if (opts.past) {
      // painted landscape backdrop: a horizon band and a soft tree mass
      const sky = g.createLinearGradient(0, ih * 0.10, 0, ih * 0.55)
      sky.addColorStop(0, '#9d968a')
      sky.addColorStop(1, '#6f6a60')
      g.fillStyle = sky
      g.fillRect(iw * 0.06, ih * 0.10, iw * 0.56, ih * 0.45)
      g.fillStyle = '#3f3a33'
      g.beginPath()
      g.ellipse(iw * 0.22, ih * 0.46, iw * 0.09, ih * 0.13, 0, 0, Math.PI * 2)
      g.ellipse(iw * 0.31, ih * 0.5, iw * 0.07, ih * 0.1, 0, 0, Math.PI * 2)
      g.fill()
      g.fillRect(iw * 0.215, ih * 0.46, iw * 0.012, ih * 0.14)
      g.fillStyle = '#4b463e'
      g.fillRect(iw * 0.06, ih * 0.55, iw * 0.56, ih * 0.21)
    }

    // posing chair
    g.save()
    g.translate(iw * 0.34, ih * 0.78)
    g.fillStyle = '#2e2823'
    if (opts.past) {
      // facing the camera: seat plus a visible back panel
      g.fillRect(-iw * 0.045, -ih * 0.10, iw * 0.09, ih * 0.02)
      g.fillRect(-iw * 0.042, -ih * 0.26, iw * 0.084, ih * 0.17)
      g.fillRect(-iw * 0.04, -ih * 0.09, iw * 0.008, ih * 0.09)
      g.fillRect(iw * 0.032, -ih * 0.09, iw * 0.008, ih * 0.09)
    } else {
      // turned away: a narrow edge-on profile
      g.fillRect(-iw * 0.012, -ih * 0.10, iw * 0.05, ih * 0.02)
      g.fillRect(-iw * 0.012, -ih * 0.26, iw * 0.014, ih * 0.17)
      g.fillRect(-iw * 0.008, -ih * 0.09, iw * 0.006, ih * 0.09)
      g.fillRect(iw * 0.026, -ih * 0.09, iw * 0.006, ih * 0.09)
    }
    g.restore()

    // the view camera on its stand, right of frame
    g.save()
    g.translate(iw * 0.79, ih * 0.52)
    g.fillStyle = '#26221f'
    g.fillRect(-iw * 0.07, -ih * 0.10, iw * 0.14, ih * 0.17)
    g.fillRect(-iw * 0.012, ih * 0.07, iw * 0.024, ih * 0.2)
    g.beginPath()
    g.moveTo(-iw * 0.05, ih * 0.27)
    g.lineTo(iw * 0.05, ih * 0.27)
    g.lineTo(0, ih * 0.1)
    g.closePath()
    g.fill()
    g.restore()

    // door plate on the right wall, with the clock above it in the archive shot
    g.fillStyle = '#514a41'
    g.fillRect(iw * 0.68, ih * 0.16, iw * 0.09, ih * 0.06)
    if (opts.past) {
      g.fillStyle = '#cfc7b4'
      g.beginPath()
      g.arc(iw * 0.725, ih * 0.085, ih * 0.045, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = '#2b2620'
      g.lineWidth = 1.6
      g.stroke()
      g.beginPath()
      g.moveTo(iw * 0.725, ih * 0.085)
      g.lineTo(iw * 0.725, ih * 0.055)
      g.moveTo(iw * 0.725, ih * 0.085)
      g.lineTo(iw * 0.752, ih * 0.093)
      g.stroke()
    } else {
      // only the nail and a clean, unfaded disc of wallpaper remain
      g.fillStyle = 'rgba(190,182,166,0.45)'
      g.beginPath()
      g.arc(iw * 0.725, ih * 0.085, ih * 0.045, 0, Math.PI * 2)
      g.fill()
    }

    if (opts.showSafeDial) {
      // The office is through the door on the right of frame, so the safe is
      // caught at the right edge. The dial is drawn on the same 50 divisions as
      // the real one in the office, with numerals, so it can genuinely be read
      // rather than merely asserted.
      const cx = iw * 0.9
      const cy = ih * 0.6
      const r = ih * 0.085
      g.fillStyle = '#1d1a17'
      g.fillRect(iw * 0.79, ih * 0.44, iw * 0.2, ih * 0.32)
      g.strokeStyle = '#cfc093'
      g.lineWidth = 1.6
      g.beginPath()
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.stroke()
      g.fillStyle = '#cfc093'
      g.font = `600 ${Math.round(r * 0.34)}px "Hiragino Sans", sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      for (let i = 0; i < 50; i += 5) {
        const ta = (i / 50) * Math.PI * 2 - Math.PI / 2
        g.beginPath()
        g.moveTo(cx + Math.cos(ta) * r * 0.82, cy + Math.sin(ta) * r * 0.82)
        g.lineTo(cx + Math.cos(ta) * r, cy + Math.sin(ta) * r)
        g.stroke()
        if (i % 10 === 0) {
          g.fillText(String(i), cx + Math.cos(ta) * r * 0.62, cy + Math.sin(ta) * r * 0.62)
        }
      }
      const a = ((opts.dialValue ?? 0) / 50) * Math.PI * 2 - Math.PI / 2
      g.lineWidth = 2.4
      g.beginPath()
      g.moveTo(cx, cy)
      g.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9)
      g.stroke()
      // the fixed index mark at twelve o'clock
      g.beginPath()
      g.moveTo(cx, cy - r * 1.05)
      g.lineTo(cx - r * 0.09, cy - r * 1.24)
      g.lineTo(cx + r * 0.09, cy - r * 1.24)
      g.closePath()
      g.fill()
    }

    vignette(g, iw, ih, 0.44)
    toneCurve(g, iw, ih, opts.sepia ?? 0.42, opts.age ?? (opts.past ? 0.34 : 0.1), seed)
    if (opts.past) foxing(g, iw, ih, seed, 12)
  })
}

/**
 * The final negative, developed: the darkroom bench with the tipped bottle.
 *
 * `marks` are the four process glyphs, in the order the lock wants them. They
 * are the enamel plates screwed to the wall over the bench, and the photograph
 * happens to have caught them - which is the only place in the building that
 * says which glyph means which step, and in what order. Without it the entrance
 * lock asks the player to invent the mapping.
 */
export function lastFrameCanvas(
  opts: PhotoOptions & { marks?: HTMLCanvasElement[] } = {},
): HTMLCanvasElement {
  const w = opts.width ?? 460
  const h = opts.height ?? 340
  const border = opts.border ?? 14
  const seed = opts.seed ?? 5501
  const marks = opts.marks ?? []
  return withBorder(w, h, border, (g, iw, ih) => {
    const wall = g.createLinearGradient(0, 0, 0, ih)
    wall.addColorStop(0, '#4c4640')
    wall.addColorStop(1, '#221f1b')
    g.fillStyle = wall
    g.fillRect(0, 0, iw, ih)

    // the safelight, a small bright disc high on the left
    const lamp = g.createRadialGradient(iw * 0.16, ih * 0.16, 0, iw * 0.16, ih * 0.16, ih * 0.34)
    lamp.addColorStop(0, 'rgba(255,246,228,0.95)')
    lamp.addColorStop(0.25, 'rgba(206,190,160,0.35)')
    lamp.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = lamp
    g.fillRect(0, 0, iw, ih)

    // The four enamel process plates, screwed to the wall over the bench in the
    // order the work is done. Drawn before the bench so the bench edge can crop
    // them the way a real frame would.
    if (marks.length) {
      const size = ih * 0.185
      const gap = size * 0.34
      const total = marks.length * size + (marks.length - 1) * gap
      const x0 = iw * 0.5 - total / 2
      const y = ih * 0.31
      g.save()
      // a dark board they are mounted on
      g.fillStyle = 'rgba(20,18,15,0.55)'
      g.fillRect(x0 - gap, y - gap * 0.8, total + gap * 2, size + gap * 1.6)
      marks.forEach((m, i) => {
        g.globalAlpha = 0.94
        g.drawImage(m, x0 + i * (size + gap), y, size, size)
      })
      g.restore()
    }

    // bench
    g.fillStyle = '#5b5148'
    g.fillRect(0, ih * 0.62, iw, ih * 0.1)
    g.fillStyle = '#332e29'
    g.fillRect(0, ih * 0.72, iw, ih * 0.28)

    // three trays in a row
    for (let i = 0; i < 3; i++) {
      g.fillStyle = '#c9c3b6'
      g.beginPath()
      g.ellipse(iw * (0.26 + i * 0.22), ih * 0.63, iw * 0.085, ih * 0.032, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#6d6659'
      g.beginPath()
      g.ellipse(iw * (0.26 + i * 0.22), ih * 0.632, iw * 0.072, ih * 0.024, 0, 0, Math.PI * 2)
      g.fill()
    }

    // the tipped bottle at the bench edge, and the dark spill running off it -
    // the reason the studio burned, recorded by accident
    g.save()
    g.translate(iw * 0.8, ih * 0.6)
    g.rotate(1.15)
    g.fillStyle = '#1a1714'
    g.fillRect(-iw * 0.028, -ih * 0.09, iw * 0.056, ih * 0.1)
    g.fillRect(-iw * 0.012, -ih * 0.115, iw * 0.024, ih * 0.03)
    g.restore()
    const spill = g.createLinearGradient(iw * 0.7, ih * 0.66, iw * 0.86, ih * 0.78)
    spill.addColorStop(0, 'rgba(12,10,8,0.85)')
    spill.addColorStop(1, 'rgba(12,10,8,0)')
    g.fillStyle = spill
    g.beginPath()
    g.ellipse(iw * 0.78, ih * 0.7, iw * 0.13, ih * 0.05, 0.2, 0, Math.PI * 2)
    g.fill()

    // a hand at the frame edge, reaching but out of time
    g.fillStyle = 'rgba(196,183,164,0.9)'
    g.beginPath()
    g.ellipse(iw * 0.96, ih * 0.5, iw * 0.05, ih * 0.045, -0.5, 0, Math.PI * 2)
    g.fill()

    vignette(g, iw, ih, 0.6)
    toneCurve(g, iw, ih, opts.sepia ?? 0.3, opts.age ?? 0.12, seed)
  })
}

/** A negative strip: tonally inverted, on an orange-brown film base. */
export function negativeCanvas(source: HTMLCanvasElement, opts: { base?: string } = {}): HTMLCanvasElement {
  const c = makeCanvas(source.width, source.height)
  const g = ctx2d(c)
  g.drawImage(source, 0, 0)
  const img = g.getImageData(0, 0, c.width, c.height)
  for (let i = 0; i < img.data.length; i += 4) {
    const l = 255 - (img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114)
    img.data[i] = Math.min(255, l * 0.92 + 46)
    img.data[i + 1] = Math.min(255, l * 0.72 + 24)
    img.data[i + 2] = Math.min(255, l * 0.5 + 10)
  }
  g.putImageData(img, 0, 0)
  if (opts.base) {
    g.globalCompositeOperation = 'multiply'
    g.fillStyle = opts.base
    g.fillRect(0, 0, c.width, c.height)
    g.globalCompositeOperation = 'source-over'
  }
  return c
}

const photoTextureCache = new Map<string, THREE.CanvasTexture>()

export function photoTexture(key: string, make: () => HTMLCanvasElement): THREE.CanvasTexture {
  const hit = photoTextureCache.get(key)
  if (hit) return hit
  const t = new THREE.CanvasTexture(make())
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  photoTextureCache.set(key, t)
  return t
}

export function clearPhotoTextures(): void {
  for (const t of photoTextureCache.values()) t.dispose()
  photoTextureCache.clear()
}
