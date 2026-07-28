/**
 * Tiny time-based tween/scheduler. Every animation in the game routes through
 * this so that "reduced motion" can collapse durations globally, and so that
 * pausing the loop pauses all motion consistently.
 */

export type Easing = (t: number) => number

export const Ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** Camera moves: quick departure, long gentle settle. Reads as "authored". */
  camera: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  outElasticSoft: (t: number) => {
    if (t === 0 || t === 1) return t
    const p = 0.45
    return Math.pow(2, -11 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) * 0.6 + 1
  },
} satisfies Record<string, Easing>

interface TweenEntry {
  elapsed: number
  duration: number
  delay: number
  ease: Easing
  onUpdate: (v: number) => void
  onComplete?: () => void
  resolve: () => void
  killed: boolean
  tag?: string
}

export interface TweenHandle {
  /** Resolves when the tween finishes (or immediately if cancelled). */
  promise: Promise<void>
  cancel(): void
  /** Jump to the end value and finish. */
  finish(): void
}

export class Timeline {
  private entries: TweenEntry[] = []
  /** 0..1 multiplier applied to every duration. Reduced motion sets this near 0. */
  private motionScale = 1

  setMotionScale(scale: number): void {
    this.motionScale = Math.max(0.001, Math.min(1, scale))
  }

  getMotionScale(): number {
    return this.motionScale
  }

  to(
    duration: number,
    onUpdate: (v: number) => void,
    opts: { ease?: Easing; delay?: number; onComplete?: () => void; tag?: string } = {},
  ): TweenHandle {
    const scaled = Math.max(0.0001, duration * this.motionScale)
    let resolve!: () => void
    const promise = new Promise<void>((r) => {
      resolve = r
    })
    const entry: TweenEntry = {
      elapsed: 0,
      duration: scaled,
      delay: (opts.delay ?? 0) * this.motionScale,
      ease: opts.ease ?? Ease.inOutCubic,
      onUpdate,
      onComplete: opts.onComplete,
      resolve,
      killed: false,
      tag: opts.tag,
    }
    this.entries.push(entry)
    return {
      promise,
      cancel: () => {
        entry.killed = true
      },
      finish: () => {
        entry.elapsed = entry.duration + entry.delay
      },
    }
  }

  /** Simple awaitable delay that respects pause + motion scale. */
  wait(seconds: number): Promise<void> {
    return this.to(seconds, () => {}, { ease: Ease.linear }).promise
  }

  killByTag(tag: string): void {
    for (const e of this.entries) if (e.tag === tag) e.killed = true
  }

  update(dt: number): void {
    if (this.entries.length === 0) return
    const next: TweenEntry[] = []
    for (const e of this.entries) {
      if (e.killed) {
        e.resolve()
        continue
      }
      e.elapsed += dt
      const t = e.elapsed - e.delay
      if (t < 0) {
        next.push(e)
        continue
      }
      const p = Math.min(1, t / e.duration)
      e.onUpdate(e.ease(p))
      if (p >= 1) {
        e.onComplete?.()
        e.resolve()
      } else {
        next.push(e)
      }
    }
    this.entries = next
  }

  clear(): void {
    for (const e of this.entries) e.resolve()
    this.entries = []
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}
