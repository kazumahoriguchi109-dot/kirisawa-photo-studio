import * as THREE from 'three'
import { Ease, Timeline, damp } from '../core/Tween'

/**
 * Point-and-click camera.
 *
 * There is no free look. Every viewpoint is a fixed composition that the level
 * designer framed; the player turns to the next composition with the edge
 * arrows and pushes into close-ups by clicking things. The only motion the
 * camera makes on its own is a very small breathing sway, so a held frame reads
 * as a photograph someone is standing in rather than a frozen render.
 */

export interface ViewpointSpec {
  position: THREE.Vector3
  /** Facing in radians; 0 = -Z. */
  yaw: number
  pitch: number
  fov: number
}

export interface CloseupSpec {
  position: THREE.Vector3
  /** World point the camera looks at on arrival. */
  target: THREE.Vector3
  fov?: number
}

export type RigMode = 'viewpoint' | 'closeup' | 'cinematic'

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera

  private mode: RigMode = 'viewpoint'
  private transitioning = false

  private currentYaw = 0
  private currentPitch = 0
  private basePos = new THREE.Vector3()
  private targetFov = 56
  /** Extra offset used for handheld sway and impact shakes. */
  private swayPhase = Math.random() * 100
  private shake = 0
  private swayAmount = 1

  /** Viewpoint we return to when a close-up is exited. */
  private returnSpec: ViewpointSpec | null = null

  constructor(
    private readonly timeline: Timeline,
    aspect: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(56, aspect, 0.02, 60)
    this.camera.rotation.order = 'YXZ'
  }

  get currentMode(): RigMode {
    return this.mode
  }

  get isBusy(): boolean {
    return this.transitioning
  }

  setSwayAmount(v: number): void {
    this.swayAmount = v
  }

  /** Snap without animation - used when loading a save or starting a chapter. */
  applyViewpoint(spec: ViewpointSpec): void {
    // Also clears any transition still in flight. Without this, a turn that was
    // interrupted (a backgrounded tab pauses rAF, so its tween never resolves)
    // leaves the rig marked busy for the rest of the session and every
    // subsequent turn is silently refused.
    this.timeline.killByTag('camera')
    this.transitioning = false
    this.returnSpec = spec
    this.mode = 'viewpoint'
    this.basePos.copy(spec.position)
    this.currentYaw = spec.yaw
    this.currentPitch = spec.pitch
    this.targetFov = spec.fov
    this.camera.fov = spec.fov
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(spec.position)
    this.camera.rotation.set(spec.pitch, spec.yaw, 0)
  }

  /**
   * Turn to the next composition. Within a room this is a pure rotation about
   * the standing point, which is what makes the ring of four views read as one
   * person turning rather than four separate cameras cutting.
   */
  async turnTo(spec: ViewpointSpec, duration = 0.52): Promise<boolean> {
    if (this.transitioning) return false
    this.transitioning = true
    this.mode = 'viewpoint'

    const fromPos = this.camera.position.clone()
    const fromYaw = this.currentYaw
    const fromPitch = this.currentPitch
    const fromFov = this.camera.fov
    const dYaw = shortestAngle(fromYaw, spec.yaw)

    await this.timeline.to(
      duration,
      (t) => {
        this.camera.position.lerpVectors(fromPos, spec.position, t)
        this.currentYaw = fromYaw + dYaw * t
        this.currentPitch = fromPitch + (spec.pitch - fromPitch) * t
        this.camera.fov = fromFov + (spec.fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease: Ease.inOutCubic, tag: 'camera' },
    ).promise

    this.settle(spec)
    return true
  }

  /** Step through a doorway into another room: a longer move with a slight arc. */
  async moveTo(spec: ViewpointSpec, duration = 1.0): Promise<boolean> {
    if (this.transitioning) return false
    this.transitioning = true
    this.mode = 'viewpoint'

    const fromPos = this.camera.position.clone()
    const fromYaw = this.currentYaw
    const fromPitch = this.currentPitch
    const fromFov = this.camera.fov
    const dYaw = shortestAngle(fromYaw, spec.yaw)

    await this.timeline.to(
      duration,
      (t) => {
        // a shallow rise and fall, the way a footstep carries the head
        const arc = Math.sin(t * Math.PI) * 0.04
        this.camera.position.lerpVectors(fromPos, spec.position, t)
        this.camera.position.y += arc
        this.currentYaw = fromYaw + dYaw * t
        this.currentPitch = fromPitch + (spec.pitch - fromPitch) * t
        this.camera.fov = fromFov + (spec.fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease: Ease.inOutCubic, tag: 'camera' },
    ).promise

    this.settle(spec)
    return true
  }

  private settle(spec: ViewpointSpec): void {
    this.returnSpec = spec
    this.basePos.copy(spec.position)
    this.currentYaw = spec.yaw
    this.currentPitch = spec.pitch
    this.targetFov = spec.fov
    this.transitioning = false
  }

  async enterCloseup(spec: CloseupSpec, duration = 0.6): Promise<boolean> {
    if (this.transitioning) return false
    this.transitioning = true

    const fromPos = this.camera.position.clone()
    const fromYaw = this.currentYaw
    const fromPitch = this.currentPitch
    const fromFov = this.camera.fov
    const fov = spec.fov ?? 40

    const { yaw: toYaw, pitch: toPitch } = yawPitchTo(spec.position, spec.target)
    const dYaw = shortestAngle(fromYaw, toYaw)

    await this.timeline.to(
      duration,
      (t) => {
        this.camera.position.lerpVectors(fromPos, spec.position, t)
        this.currentYaw = fromYaw + dYaw * t
        this.currentPitch = fromPitch + (toPitch - fromPitch) * t
        this.camera.fov = fromFov + (fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease: Ease.camera, tag: 'camera' },
    ).promise

    this.mode = 'closeup'
    this.basePos.copy(spec.position)
    this.currentYaw = toYaw
    this.currentPitch = toPitch
    this.targetFov = fov
    this.transitioning = false
    return true
  }

  async exitCloseup(duration = 0.48): Promise<boolean> {
    if (!this.returnSpec || this.transitioning) return false
    const spec = this.returnSpec
    this.transitioning = true

    const fromPos = this.camera.position.clone()
    const fromYaw = this.currentYaw
    const fromPitch = this.currentPitch
    const fromFov = this.camera.fov
    const dYaw = shortestAngle(fromYaw, spec.yaw)

    await this.timeline.to(
      duration,
      (t) => {
        this.camera.position.lerpVectors(fromPos, spec.position, t)
        this.currentYaw = fromYaw + dYaw * t
        this.currentPitch = fromPitch + (spec.pitch - fromPitch) * t
        this.camera.fov = fromFov + (spec.fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease: Ease.inOutCubic, tag: 'camera' },
    ).promise

    this.mode = 'viewpoint'
    this.settle(spec)
    return true
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
    await this.timeline.to(
      duration,
      (t) => {
        this.camera.position.lerpVectors(fromPos, to.position, t)
        this.currentYaw = fromYaw + dYaw * t
        this.currentPitch = fromPitch + (pitch - fromPitch) * t
        this.camera.fov = fromFov + (fov - fromFov) * t
        this.camera.updateProjectionMatrix()
      },
      { ease, tag: 'camera' },
    ).promise
    this.basePos.copy(to.position)
    this.transitioning = false
  }

  nudgeShake(amount: number): void {
    this.shake = Math.max(this.shake, amount)
  }

  update(dt: number): void {
    this.swayPhase += dt
    const swayScale = this.swayAmount * (this.mode === 'closeup' ? 0.3 : 1)
    const swayY = Math.sin(this.swayPhase * 0.62) * 0.0018 * swayScale
    const swayX = Math.sin(this.swayPhase * 0.41 + 1.3) * 0.0022 * swayScale
    const breath = Math.sin(this.swayPhase * 0.9) * 0.0014 * swayScale

    if (this.shake > 0.0001) this.shake = Math.max(0, this.shake - dt * 1.8)
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
      Math.sin(this.swayPhase * 0.33) * 0.0012 * swayScale,
    )
  }

  /** Test hook: place the look direction exactly. */
  setLookForTest(yaw: number, pitch: number): void {
    this.currentYaw = yaw
    this.currentPitch = pitch
    this.camera.position.copy(this.basePos)
    this.camera.rotation.set(pitch, yaw, 0)
    this.camera.updateMatrixWorld(true)
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
