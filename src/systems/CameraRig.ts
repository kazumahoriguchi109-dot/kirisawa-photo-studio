import * as THREE from 'three'
import { Ease, Timeline, clamp, damp } from '../core/Tween'

/**
 * Node-based first-person camera.
 *
 * The player stands at authored viewpoints and looks around within limits that
 * the level designer chose, then pushes in to framed close-ups. This is how the
 * genre actually works, and it buys three things a free-roam camera cannot:
 * every frame is composed, no wall is ever seen from a bad angle, and close
 * inspection can be given its own focal length.
 */

export interface ViewpointSpec {
  position: THREE.Vector3
  /** Facing in radians; 0 = -Z. */
  yaw: number
  pitch: number
  yawRange: [number, number]
  pitchRange: [number, number]
  fov: number
}

export interface CloseupSpec {
  position: THREE.Vector3
  /** World point the camera looks at on arrival. */
  target: THREE.Vector3
  fov?: number
  /** Look freedom while in the close-up, radians around the arrival direction. */
  yawSpan?: number
  pitchSpan?: number
}

export type RigMode = 'viewpoint' | 'closeup' | 'cinematic'

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera

  private mode: RigMode = 'viewpoint'
  private transitioning = false

  private targetYaw = 0
  private targetPitch = 0
  private currentYaw = 0
  private currentPitch = 0
  private yawRange: [number, number] = [-Math.PI, Math.PI]
  private pitchRange: [number, number] = [-0.6, 0.6]
  private basePos = new THREE.Vector3()
  private targetFov = 55
  /** Extra offset used for handheld sway and impact shakes. */
  private swayPhase = Math.random() * 100
  private shake = 0
  private swayAmount = 1

  /** Viewpoint we return to when a close-up is exited. */
  private returnSpec: ViewpointSpec | null = null

  private sensitivity = 1
  private invert = false

  constructor(
    private readonly timeline: Timeline,
    aspect: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.02, 60)
    this.camera.rotation.order = 'YXZ'
  }

  get currentMode(): RigMode {
    return this.mode
  }

  get isBusy(): boolean {
    return this.transitioning
  }

  setSensitivity(v: number, invert: boolean): void {
    this.sensitivity = v
    this.invert = invert
  }

  setSwayAmount(v: number): void {
    this.swayAmount = v
  }

  /** Snap without animation - used when loading a save or starting a chapter. */
  applyViewpoint(spec: ViewpointSpec): void {
    this.returnSpec = spec
    this.mode = 'viewpoint'
    this.basePos.copy(spec.position)
    this.yawRange = spec.yawRange
    this.pitchRange = spec.pitchRange
    this.currentYaw = this.targetYaw = spec.yaw
    this.currentPitch = this.targetPitch = spec.pitch
    this.targetFov = spec.fov
    this.camera.fov = spec.fov
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(spec.position)
    this.camera.rotation.set(spec.pitch, spec.yaw, 0)
  }

  /** Walk to another viewpoint. Resolves when the move finishes. */
  async moveTo(spec: ViewpointSpec, duration = 0.95): Promise<void> {
    if (this.transitioning) return
    this.transitioning = true
    this.mode = 'viewpoint'
    this.returnSpec = spec

    const fromPos = this.camera.position.clone()
    const fromYaw = this.currentYaw
    const fromPitch = this.currentPitch
    const fromFov = this.camera.fov

    // Take the short way around the circle.
    const dYaw = shortestAngle(fromYaw, spec.yaw)

    // Widen the limits during the move so the tween is never clamped mid-flight.
    this.yawRange = [-Math.PI * 2, Math.PI * 2]
    this.pitchRange = [-1.2, 1.2]

    await this.timeline.to(
      duration,
      (t) => {
        // A slight arc on the vertical keeps it from feeling like a dolly on rails.
        const arc = Math.sin(t * Math.PI) * 0.045
        this.camera.position.lerpVectors(fromPos, spec.position, t)
        this.camera.position.y += arc
        this.currentYaw = this.targetYaw = fromYaw + dYaw * t
        this.currentPitch = this.targetPitch = fromPitch + (spec.pitch - fromPitch) * t
        this.camera.fov = fromFov + (spec.fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease: Ease.inOutCubic, tag: 'camera' },
    ).promise

    this.basePos.copy(spec.position)
    this.yawRange = spec.yawRange
    this.pitchRange = spec.pitchRange
    this.currentYaw = this.targetYaw = spec.yaw
    this.currentPitch = this.targetPitch = spec.pitch
    this.targetFov = spec.fov
    this.transitioning = false
  }

  async enterCloseup(spec: CloseupSpec, duration = 0.62): Promise<void> {
    if (this.transitioning) return
    this.transitioning = true

    const fromPos = this.camera.position.clone()
    const fromYaw = this.currentYaw
    const fromPitch = this.currentPitch
    const fromFov = this.camera.fov
    const fov = spec.fov ?? 40

    const { yaw: toYaw, pitch: toPitch } = yawPitchTo(spec.position, spec.target)
    const dYaw = shortestAngle(fromYaw, toYaw)

    this.yawRange = [-Math.PI * 2, Math.PI * 2]
    this.pitchRange = [-1.4, 1.4]

    await this.timeline.to(
      duration,
      (t) => {
        this.camera.position.lerpVectors(fromPos, spec.position, t)
        this.currentYaw = this.targetYaw = fromYaw + dYaw * t
        this.currentPitch = this.targetPitch = fromPitch + (toPitch - fromPitch) * t
        this.camera.fov = fromFov + (fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease: Ease.camera, tag: 'camera' },
    ).promise

    this.mode = 'closeup'
    this.basePos.copy(spec.position)
    const yawSpan = spec.yawSpan ?? 0.16
    const pitchSpan = spec.pitchSpan ?? 0.12
    this.yawRange = [toYaw - yawSpan, toYaw + yawSpan]
    this.pitchRange = [toPitch - pitchSpan, toPitch + pitchSpan]
    this.currentYaw = this.targetYaw = toYaw
    this.currentPitch = this.targetPitch = toPitch
    this.targetFov = fov
    this.transitioning = false
  }

  async exitCloseup(duration = 0.5): Promise<void> {
    if (!this.returnSpec) return
    if (this.transitioning) return
    const spec = this.returnSpec
    this.transitioning = true

    const fromPos = this.camera.position.clone()
    const fromYaw = this.currentYaw
    const fromPitch = this.currentPitch
    const fromFov = this.camera.fov
    const dYaw = shortestAngle(fromYaw, spec.yaw)

    this.yawRange = [-Math.PI * 2, Math.PI * 2]
    this.pitchRange = [-1.4, 1.4]

    await this.timeline.to(
      duration,
      (t) => {
        this.camera.position.lerpVectors(fromPos, spec.position, t)
        this.currentYaw = this.targetYaw = fromYaw + dYaw * t
        this.currentPitch = this.targetPitch = fromPitch + (spec.pitch - fromPitch) * t
        this.camera.fov = fromFov + (spec.fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease: Ease.inOutCubic, tag: 'camera' },
    ).promise

    this.mode = 'viewpoint'
    this.basePos.copy(spec.position)
    this.yawRange = spec.yawRange
    this.pitchRange = spec.pitchRange
    this.currentYaw = this.targetYaw = spec.yaw
    this.currentPitch = this.targetPitch = spec.pitch
    this.targetFov = spec.fov
    this.transitioning = false
  }

  /** Free-form cinematic move used by the ending sequence. */
  async cinematic(
    to: { position: THREE.Vector3; target: THREE.Vector3; fov?: number },
    duration: number,
    ease = Ease.inOutSine,
  ): Promise<void> {
    this.mode = 'cinematic'
    this.transitioning = true
    const fromPos = this.camera.position.clone()
    const fromYaw = this.currentYaw
    const fromPitch = this.currentPitch
    const fromFov = this.camera.fov
    const { yaw, pitch } = yawPitchTo(to.position, to.target)
    const dYaw = shortestAngle(fromYaw, yaw)
    const fov = to.fov ?? fromFov
    this.yawRange = [-Math.PI * 4, Math.PI * 4]
    this.pitchRange = [-1.5, 1.5]
    await this.timeline.to(
      duration,
      (t) => {
        this.camera.position.lerpVectors(fromPos, to.position, t)
        this.currentYaw = this.targetYaw = fromYaw + dYaw * t
        this.currentPitch = this.targetPitch = fromPitch + (pitch - fromPitch) * t
        this.camera.fov = fromFov + (fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease, tag: 'camera' },
    ).promise
    this.basePos.copy(to.position)
    this.transitioning = false
  }

  /** Drag input, in pixels. */
  look(dx: number, dy: number): void {
    if (this.transitioning) return
    const k = 0.0026 * this.sensitivity
    this.targetYaw = clamp(this.targetYaw - dx * k, this.yawRange[0], this.yawRange[1])
    const dyy = this.invert ? -dy : dy
    this.targetPitch = clamp(this.targetPitch - dyy * k, this.pitchRange[0], this.pitchRange[1])
  }

  /** Keyboard look, in radians per second, already multiplied by dt. */
  lookBy(dyaw: number, dpitch: number): void {
    if (this.transitioning) return
    this.targetYaw = clamp(this.targetYaw + dyaw, this.yawRange[0], this.yawRange[1])
    this.targetPitch = clamp(this.targetPitch + dpitch, this.pitchRange[0], this.pitchRange[1])
  }

  /** How far the player has looked from the centre of the allowed range, 0..1. */
  lookProgress(): number {
    const span = this.yawRange[1] - this.yawRange[0]
    if (span <= 0.0001) return 0.5
    return (this.currentYaw - this.yawRange[0]) / span
  }

  nudgeShake(amount: number): void {
    this.shake = Math.max(this.shake, amount)
  }

  update(dt: number): void {
    this.currentYaw = damp(this.currentYaw, this.targetYaw, 14, dt)
    this.currentPitch = damp(this.currentPitch, this.targetPitch, 14, dt)

    this.swayPhase += dt
    const swayScale = this.swayAmount * (this.mode === 'closeup' ? 0.35 : 1)
    const swayY = Math.sin(this.swayPhase * 0.62) * 0.0022 * swayScale
    const swayX = Math.sin(this.swayPhase * 0.41 + 1.3) * 0.0028 * swayScale
    const breath = Math.sin(this.swayPhase * 0.9) * 0.0016 * swayScale

    if (this.shake > 0.0001) {
      this.shake = Math.max(0, this.shake - dt * 1.8)
    }
    const s = this.shake * this.swayAmount
    const shakeX = s > 0 ? (Math.random() - 0.5) * s * 0.02 : 0
    const shakeY = s > 0 ? (Math.random() - 0.5) * s * 0.02 : 0

    if (!this.transitioning) {
      this.camera.position.set(this.basePos.x, this.basePos.y + breath, this.basePos.z)
      if (Math.abs(this.camera.fov - this.targetFov) > 0.01) {
        this.camera.fov = damp(this.camera.fov, this.targetFov, 10, dt)
        this.camera.updateProjectionMatrix()
      }
    }

    this.camera.rotation.set(
      this.currentPitch + swayY + shakeY,
      this.currentYaw + swayX + shakeX,
      Math.sin(this.swayPhase * 0.33) * 0.0016 * swayScale,
    )
  }

  /** Test hook: place the look direction exactly, bypassing damping. */
  setLookForTest(yaw: number, pitch: number): void {
    this.currentYaw = this.targetYaw = yaw
    this.currentPitch = this.targetPitch = pitch
    this.camera.position.copy(this.basePos)
    this.camera.rotation.set(pitch, yaw, 0)
    this.camera.updateMatrixWorld(true)
  }

  /** Zoom used by the wheel inside close-ups. */
  zoom(delta: number, min = 22, max = 46): void {
    if (this.mode !== 'closeup') return
    this.targetFov = clamp(this.targetFov + delta * 0.012, min, max)
  }

  get returnViewpoint(): ViewpointSpec | null {
    return this.returnSpec
  }
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function yawPitchTo(from: THREE.Vector3, to: THREE.Vector3): { yaw: number; pitch: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const yaw = Math.atan2(-dx, -dz)
  const horiz = Math.hypot(dx, dz)
  const pitch = Math.atan2(dy, horiz)
  return { yaw, pitch }
}
