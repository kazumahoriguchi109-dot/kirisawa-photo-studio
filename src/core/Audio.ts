import type { SettingsStore } from './Settings'
import type { WorldLighting } from '../state/GameState'

/**
 * All sound in the game is synthesised at runtime. No audio files ship.
 *
 * Structure: two buses (ambience, sfx) into a master gain with a gentle
 * limiter. The ambient bed is four crossfaded layers - rain on glass, a low
 * room tone, structural creak and, in the darkroom state, mains hum - so
 * throwing a switch changes what the building sounds like, not just how loud
 * it is.
 */

export type Cue =
  | 'hover'
  | 'select'
  | 'closeupIn'
  | 'closeupOut'
  | 'step'
  | 'drawer'
  | 'drawerClose'
  | 'latch'
  | 'keyTurn'
  | 'fuseSeat'
  | 'breaker'
  | 'ratchet'
  | 'motorStart'
  | 'motorStop'
  | 'slosh'
  | 'pour'
  | 'relay'
  | 'detent'
  | 'ringTurn'
  | 'wrong'
  | 'correct'
  | 'acquire'
  | 'combine'
  | 'paper'
  | 'bolt'
  | 'finalMech'
  | 'shimmer'
  | 'bell'
  | 'discovery'
  | 'reveal'
  | 'uiOpen'
  | 'uiClose'

interface Layer {
  gain: GainNode
  target: number
  nodes: AudioNode[]
}

const AMBIENCE_MIX: Record<WorldLighting, { rain: number; room: number; creak: number; hum: number; buzz: number }> = {
  blackout: { rain: 0.85, room: 0.5, creak: 0.5, hum: 0, buzz: 0 },
  tungsten: { rain: 0.45, room: 0.62, creak: 0.32, hum: 0.5, buzz: 0 },
  safelight: { rain: 0.3, room: 0.72, creak: 0.24, hum: 0.28, buzz: 0.7 },
  dawn: { rain: 0.16, room: 0.4, creak: 0.2, hum: 0.34, buzz: 0 },
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private ambienceBus!: GainNode
  private sfxBus!: GainNode
  private limiter!: DynamicsCompressorNode
  private layers = new Map<string, Layer>()
  private noiseBuffer: AudioBuffer | null = null
  private started = false
  private motorNodes: { osc: OscillatorNode; gain: GainNode } | null = null
  private lighting: WorldLighting = 'blackout'

  constructor(private readonly settings: SettingsStore) {
    settings.events.on('changed', () => this.applyVolumes())
  }

  get isReady(): boolean {
    return this.started
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async start(): Promise<void> {
    if (this.started) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume()
      return
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      if (this.ctx.state === 'suspended') await this.ctx.resume()
    } catch {
      return
    }
    const ctx = this.ctx

    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -8
    this.limiter.knee.value = 6
    this.limiter.ratio.value = 8
    this.limiter.attack.value = 0.004
    this.limiter.release.value = 0.18
    this.limiter.connect(ctx.destination)

    this.master = ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(this.limiter)

    this.ambienceBus = ctx.createGain()
    this.sfxBus = ctx.createGain()
    this.ambienceBus.connect(this.master)
    this.sfxBus.connect(this.master)

    this.noiseBuffer = this.makeNoiseBuffer(4)
    this.buildAmbience()
    this.applyVolumes()
    this.setLighting(this.lighting, true)
    this.started = true
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    // pink-ish noise: cheap one-pole filtered white
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = 0.985 * last + 0.015 * w
      data[i] = (w * 0.28 + last * 3.4) * 0.5
    }
    return buf
  }

  private noiseSource(loop = true): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource()
    s.buffer = this.noiseBuffer
    s.loop = loop
    return s
  }

  private addLayer(name: string, build: (out: GainNode) => AudioNode[]): void {
    const ctx = this.ctx!
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(this.ambienceBus)
    const nodes = build(gain)
    this.layers.set(name, { gain, target: 0, nodes })
  }

  private buildAmbience(): void {
    const ctx = this.ctx!

    // --- rain on the shopfront glass: bandpassed noise with a slow gust LFO
    this.addLayer('rain', (out) => {
      const src = this.noiseSource()
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 2100
      bp.Q.value = 0.55
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 620
      const gustGain = ctx.createGain()
      gustGain.gain.value = 0.7
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.062
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.28
      lfo.connect(lfoGain).connect(gustGain.gain)
      src.connect(bp).connect(hp).connect(gustGain).connect(out)
      src.start()
      lfo.start()
      return [src, bp, hp, gustGain, lfo, lfoGain]
    })

    // --- low room tone: two detuned sines plus a lowpassed noise floor
    this.addLayer('room', (out) => {
      const nodes: AudioNode[] = []
      for (const [f, g] of [
        [46, 0.16],
        [69, 0.075],
        [103, 0.03],
      ]) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f
        const gg = ctx.createGain()
        gg.gain.value = g
        o.connect(gg).connect(out)
        o.start()
        nodes.push(o, gg)
      }
      const src = this.noiseSource()
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 220
      const g2 = ctx.createGain()
      g2.gain.value = 0.5
      src.connect(lp).connect(g2).connect(out)
      src.start()
      nodes.push(src, lp, g2)
      return nodes
    })

    // --- structural creak: very slow randomised resonant bursts
    this.addLayer('creak', (out) => {
      const src = this.noiseSource()
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 330
      bp.Q.value = 9
      const g = ctx.createGain()
      g.gain.value = 0.0
      src.connect(bp).connect(g).connect(out)
      src.start()
      const schedule = () => {
        if (!this.ctx) return
        const t = this.ctx.currentTime + 3 + Math.random() * 12
        const dur = 0.7 + Math.random() * 1.9
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(0.4 + Math.random() * 0.5, t + dur * 0.45)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        bp.frequency.setValueAtTime(180 + Math.random() * 420, t)
        window.setTimeout(schedule, (t - this.ctx.currentTime + dur) * 1000)
      }
      schedule()
      return [src, bp, g]
    })

    // --- mains hum from the lighting circuit once the power is on
    this.addLayer('hum', (out) => {
      const nodes: AudioNode[] = []
      for (const [f, g] of [
        [50, 0.09],
        [100, 0.055],
        [150, 0.02],
      ]) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = f
        const gg = ctx.createGain()
        gg.gain.value = g
        o.connect(gg).connect(out)
        o.start()
        nodes.push(o, gg)
      }
      return nodes
    })

    // --- the safelight's transformer buzz: a narrow, slightly dirty 100 Hz
    this.addLayer('buzz', (out) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = 100
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 620
      bp.Q.value = 5
      const g = ctx.createGain()
      g.gain.value = 0.06
      o.connect(bp).connect(g).connect(out)
      o.start()
      return [o, bp, g]
    })
  }

  applyVolumes(): void {
    if (!this.started || !this.ctx) return
    const t = this.ctx.currentTime
    this.ambienceBus.gain.setTargetAtTime(this.settings.gain('ambience') * 0.55, t, 0.08)
    this.sfxBus.gain.setTargetAtTime(this.settings.gain('sfx') * 0.9, t, 0.05)
  }

  setLighting(state: WorldLighting, instant = false): void {
    this.lighting = state
    if (!this.started || !this.ctx) return
    const mix = AMBIENCE_MIX[state]
    const t = this.ctx.currentTime
    const tau = instant ? 0.01 : 1.4
    for (const [name, value] of Object.entries(mix)) {
      const layer = this.layers.get(name)
      if (!layer) continue
      layer.target = value
      layer.gain.gain.setTargetAtTime(value, t, tau)
    }
  }

  suspend(): void {
    void this.ctx?.suspend()
  }

  resume(): void {
    void this.ctx?.resume()
  }

  // -------------------------------------------------------------------- cues

  play(cue: Cue, opts: { gain?: number; detune?: number } = {}): void {
    if (!this.started || !this.ctx) return
    const g = opts.gain ?? 1
    const d = opts.detune ?? 0
    switch (cue) {
      case 'hover':
        this.blip(1480 + d, 0.016, 0.035 * g, 'sine')
        break
      case 'select':
        this.blip(880 + d, 0.05, 0.09 * g, 'triangle')
        this.noiseBurst(0.03, 2600, 6, 0.05 * g)
        break
      case 'uiOpen':
        this.blip(520, 0.08, 0.07 * g, 'sine')
        this.blip(780, 0.1, 0.045 * g, 'sine', 0.03)
        break
      case 'uiClose':
        this.blip(620, 0.07, 0.05 * g, 'sine')
        this.blip(410, 0.1, 0.04 * g, 'sine', 0.025)
        break
      case 'closeupIn':
        this.sweep(220, 620, 0.22, 0.09 * g)
        this.noiseBurst(0.06, 1400, 2, 0.05 * g)
        break
      case 'closeupOut':
        this.sweep(620, 240, 0.2, 0.07 * g)
        break
      case 'step':
        this.noiseBurst(0.11, 260, 1.6, 0.16 * g)
        this.blip(74, 0.09, 0.07 * g, 'sine')
        break
      case 'drawer':
        this.rub(0.42, 420, 0.13 * g)
        this.noiseBurst(0.05, 1100, 2, 0.05 * g, 0.4)
        break
      case 'drawerClose':
        this.rub(0.24, 340, 0.11 * g)
        this.thunk(110, 0.09, 0.16 * g, 0.24)
        break
      case 'latch':
        this.click(2300, 0.011, 0.2 * g)
        this.thunk(190, 0.05, 0.1 * g, 0.012)
        break
      case 'keyTurn':
        this.click(1700, 0.014, 0.13 * g)
        this.click(1400, 0.014, 0.15 * g, 0.13)
        this.thunk(150, 0.09, 0.17 * g, 0.2)
        break
      case 'fuseSeat':
        this.noiseBurst(0.04, 3200, 3, 0.09 * g)
        this.click(1150, 0.02, 0.18 * g, 0.03)
        break
      case 'breaker':
        this.thunk(90, 0.14, 0.34 * g, 0)
        this.click(900, 0.03, 0.24 * g, 0.02)
        this.noiseBurst(0.2, 700, 1.2, 0.1 * g, 0.03)
        break
      case 'ratchet':
        this.click(1900 + d, 0.008, 0.1 * g)
        break
      case 'motorStart':
        this.startMotor()
        break
      case 'motorStop':
        this.stopMotor()
        break
      case 'slosh':
        this.rub(0.5, 900, 0.1 * g, 'bandpass', 1.6)
        break
      case 'pour':
        this.rub(1.5, 1500, 0.12 * g, 'bandpass', 2.6)
        break
      case 'relay':
        this.click(1250, 0.016, 0.22 * g)
        this.thunk(140, 0.05, 0.12 * g, 0.014)
        break
      case 'detent':
        this.click(2600 + d, 0.007, 0.1 * g)
        break
      case 'ringTurn':
        this.click(1750 + d, 0.009, 0.13 * g)
        this.blip(320 + d, 0.04, 0.03 * g, 'triangle', 0.005)
        break
      case 'wrong':
        this.thunk(96, 0.13, 0.2 * g, 0)
        this.blip(146, 0.16, 0.07 * g, 'triangle', 0.04)
        break
      case 'correct':
        this.motif([0, 3, 7], 0.42, 0.1 * g)
        this.click(1900, 0.012, 0.12 * g)
        break
      case 'discovery':
        this.motif([0, 7, 12], 0.7, 0.085 * g)
        break
      case 'reveal':
        this.motif([0, 5, 7, 12], 1.15, 0.1 * g)
        this.noiseBurst(0.9, 3600, 0.7, 0.05 * g)
        break
      case 'acquire':
        this.blip(660, 0.06, 0.08 * g, 'triangle')
        this.blip(990, 0.09, 0.06 * g, 'sine', 0.055)
        break
      case 'combine':
        this.blip(494, 0.08, 0.07 * g, 'triangle')
        this.blip(740, 0.1, 0.06 * g, 'triangle', 0.07)
        this.blip(988, 0.16, 0.05 * g, 'sine', 0.14)
        break
      case 'paper':
        this.noiseBurst(0.24, 3800, 0.9, 0.075 * g)
        break
      case 'bolt':
        this.thunk(72, 0.22, 0.36 * g, 0)
        this.rub(0.3, 260, 0.14 * g)
        break
      case 'finalMech':
        this.thunk(64, 0.4, 0.4 * g, 0)
        for (let i = 0; i < 4; i++) this.click(760 - i * 90, 0.03, 0.2 * g, 0.13 * i)
        this.rub(1.1, 220, 0.16 * g)
        break
      case 'shimmer':
        this.motif([12, 19, 24], 1.4, 0.05 * g, 'sine')
        this.noiseBurst(1.2, 6200, 0.6, 0.035 * g)
        break
      case 'bell':
        this.bellTone(2093, 1.9, 0.13 * g)
        this.bellTone(3136, 1.4, 0.06 * g)
        break
    }
  }

  // ------------------------------------------------------------- primitives

  private env(node: GainNode, peak: number, attack: number, decay: number, at: number): void {
    const t = this.ctx!.currentTime + at
    node.gain.cancelScheduledValues(t)
    node.gain.setValueAtTime(0.0001, t)
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private blip(freq: number, dur: number, peak: number, type: OscillatorType = 'sine', at = 0): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    o.connect(g).connect(this.sfxBus)
    this.env(g, peak, 0.004, dur, at)
    o.start(ctx.currentTime + at)
    o.stop(ctx.currentTime + at + dur + 0.06)
  }

  private click(freq: number, dur: number, peak: number, at = 0): void {
    const ctx = this.ctx!
    const src = this.noiseSource(false)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq
    bp.Q.value = 3.2
    const g = ctx.createGain()
    src.connect(bp).connect(g).connect(this.sfxBus)
    this.env(g, peak, 0.001, dur, at)
    src.start(ctx.currentTime + at)
    src.stop(ctx.currentTime + at + dur + 0.05)
  }

  private noiseBurst(dur: number, cutoff: number, q: number, peak: number, at = 0): void {
    const ctx = this.ctx!
    const src = this.noiseSource(false)
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = cutoff
    f.Q.value = q
    const g = ctx.createGain()
    src.connect(f).connect(g).connect(this.sfxBus)
    this.env(g, peak, 0.008, dur, at)
    src.start(ctx.currentTime + at)
    src.stop(ctx.currentTime + at + dur + 0.08)
  }

  private thunk(freq: number, dur: number, peak: number, at: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    const t = ctx.currentTime + at
    o.frequency.setValueAtTime(freq * 1.9, t)
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + dur)
    const g = ctx.createGain()
    o.connect(g).connect(this.sfxBus)
    this.env(g, peak, 0.003, dur, at)
    o.start(t)
    o.stop(t + dur + 0.08)
  }

  /** Sustained friction: wood in wood, liquid, a hand on metal. */
  private rub(dur: number, cutoff: number, peak: number, type: BiquadFilterType = 'lowpass', q = 1): void {
    const ctx = this.ctx!
    const src = this.noiseSource(false)
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(cutoff * 0.6, ctx.currentTime)
    f.frequency.linearRampToValueAtTime(cutoff, ctx.currentTime + dur * 0.5)
    f.frequency.linearRampToValueAtTime(cutoff * 0.5, ctx.currentTime + dur)
    f.Q.value = q
    const g = ctx.createGain()
    src.connect(f).connect(g).connect(this.sfxBus)
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.22)
    g.gain.linearRampToValueAtTime(peak * 0.8, t + dur * 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.start(t)
    src.stop(t + dur + 0.06)
  }

  private sweep(from: number, to: number, dur: number, peak: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(from, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + dur)
    const g = ctx.createGain()
    o.connect(g).connect(this.sfxBus)
    this.env(g, peak, 0.01, dur, 0)
    o.start()
    o.stop(ctx.currentTime + dur + 0.1)
  }

  private bellTone(freq: number, dur: number, peak: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = freq
    const g = ctx.createGain()
    o.connect(g).connect(this.sfxBus)
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.start()
    o.stop(t + dur + 0.1)
  }

  /**
   * The discovery motif: a rising perfect fifth resolving up an octave, voiced
   * on two soft triangle partials with a long tail. Rooted at 174.61 Hz (F3) so
   * it sits under the room tone rather than on top of it.
   */
  private motif(degrees: number[], dur: number, peak: number, type: OscillatorType = 'triangle'): void {
    const ctx = this.ctx!
    const root = 174.61
    degrees.forEach((d, i) => {
      const f = root * Math.pow(2, d / 12)
      const at = i * (dur / (degrees.length + 1.2))
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const partial = ctx.createOscillator()
      partial.type = 'sine'
      partial.frequency.value = f * 2.01
      const g = ctx.createGain()
      const gp = ctx.createGain()
      gp.gain.value = 0.28
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 2400
      o.connect(g)
      partial.connect(gp).connect(g)
      g.connect(lp).connect(this.sfxBus)
      const t = ctx.currentTime + at
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.start(t)
      partial.start(t)
      o.stop(t + dur + 0.1)
      partial.stop(t + dur + 0.1)
    })
  }

  private startMotor(): void {
    if (this.motorNodes || !this.ctx) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 62
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 380
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    osc.connect(lp).connect(gain).connect(this.sfxBus)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.25)
    osc.frequency.setValueAtTime(48, ctx.currentTime)
    osc.frequency.linearRampToValueAtTime(64, ctx.currentTime + 0.5)
    this.motorNodes = { osc, gain }
  }

  private stopMotor(): void {
    if (!this.motorNodes || !this.ctx) return
    const { osc, gain } = this.motorNodes
    const t = this.ctx.currentTime
    osc.frequency.linearRampToValueAtTime(34, t + 0.3)
    gain.gain.setTargetAtTime(0.0001, t, 0.12)
    osc.stop(t + 0.7)
    this.motorNodes = null
  }

  /** Forty seconds of escape, scheduled up front. */
  playEscapeSequence(): void {
    if (!this.started || !this.ctx) return
    this.play('finalMech')
    window.setTimeout(() => this.play('bolt'), 1400)
    window.setTimeout(() => this.play('reveal'), 2100)
    window.setTimeout(() => this.motif([0, 7, 12, 19], 3.4, 0.075), 3400)
    window.setTimeout(() => this.motif([-5, 2, 7, 14], 4.2, 0.06), 8000)
  }
}
