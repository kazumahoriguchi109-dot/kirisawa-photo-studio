import * as THREE from 'three'
import type { ItemDef, HiddenDetail } from '../content/chapter01/items'
import type { MaterialLibrary } from '../world/Materials'
import { clamp, damp } from '../core/Tween'

/**
 * The item inspector.
 *
 * A second, tiny WebGL context inside the inventory panel. Items are lit by
 * their own three-point rig so a brass key reads as brass no matter what the
 * room is doing. Hidden details are found by physically turning the object to
 * face a direction - never by clicking a marker.
 */

export interface InspectorEvents {
  onDetailFound(item: ItemDef, detail: HiddenDetail): void
}

export class Inspector {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(34, 1, 0.01, 12)
  private pivot = new THREE.Group()
  private current: ItemDef | null = null
  private model: THREE.Object3D | null = null

  private yaw = 0.5
  private pitch = 0.2
  private targetYaw = 0.5
  private targetPitch = 0.2
  private zoom = 0
  private targetZoom = 0
  private baseRadius = 0.2
  private spin = 0

  private foundIds = new Set<string>()
  private heldItems = new Set<string>()
  private running = false
  private raf = 0

  constructor(
    private readonly mats: MaterialLibrary,
    private readonly events: InspectorEvents,
  ) {
    this.canvas = document.createElement('canvas')
    this.scene.add(this.pivot)

    const key = new THREE.DirectionalLight(0xfff0da, 3.2)
    key.position.set(0.6, 0.9, 1.1)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x9fb6cf, 1.1)
    fill.position.set(-1.0, 0.2, 0.5)
    this.scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffd9a8, 1.6)
    rim.position.set(-0.4, 0.6, -1.2)
    this.scene.add(rim)
    this.scene.add(new THREE.HemisphereLight(0x50556a, 0x1a1611, 0.7))
  }

  private ensureRenderer(): THREE.WebGLRenderer | null {
    if (this.renderer) return this.renderer
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      this.renderer.toneMappingExposure = 1.05
      this.renderer.setClearColor(0x000000, 0)
    } catch {
      this.renderer = null
    }
    return this.renderer
  }

  setHeldItems(ids: string[]): void {
    this.heldItems = new Set(ids)
  }

  show(item: ItemDef, alreadyFound: string[]): void {
    this.current = item
    this.foundIds = new Set(alreadyFound)
    if (this.model) {
      this.pivot.remove(this.model)
      disposeTree(this.model)
    }
    this.model = item.build(this.mats)
    this.pivot.add(this.model)
    this.baseRadius = item.viewRadius
    this.yaw = this.targetYaw = 0.55
    this.pitch = this.targetPitch = 0.22
    this.zoom = this.targetZoom = 0
    this.spin = 0
    this.start()
  }

  clear(): void {
    this.stop()
    if (this.model) {
      this.pivot.remove(this.model)
      disposeTree(this.model)
      this.model = null
    }
    this.current = null
  }

  rotate(dx: number, dy: number): void {
    this.targetYaw -= dx * 0.008
    this.targetPitch = clamp(this.targetPitch - dy * 0.008, -1.35, 1.35)
    this.spin = 0
  }

  zoomBy(delta: number): void {
    this.targetZoom = clamp(this.targetZoom + delta, 0, 1)
  }

  /** Flip the item end over end - the fastest way to look at the back. */
  flip(): void {
    this.targetYaw += Math.PI
    this.spin = 0
  }

  private start(): void {
    if (this.running) return
    this.running = true
    let last = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      this.update(dt)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private update(dt: number): void {
    const renderer = this.ensureRenderer()
    if (!renderer || !this.model) return

    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    if (this.canvas.width !== w * devicePixelRatio || this.canvas.height !== h * devicePixelRatio) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.setSize(w, h, false)
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }

    // idle drift so the object never looks frozen
    this.spin += dt
    const idle = this.spin > 2.4 ? Math.sin((this.spin - 2.4) * 0.35) * 0.09 : 0

    this.yaw = damp(this.yaw, this.targetYaw + idle, 9, dt)
    this.pitch = damp(this.pitch, this.targetPitch, 9, dt)
    this.zoom = damp(this.zoom, this.targetZoom, 8, dt)

    this.pivot.rotation.set(this.pitch, this.yaw, 0)

    const radius = this.baseRadius * (2.9 - this.zoom * 1.55)
    this.camera.position.set(0, 0, radius)
    this.camera.lookAt(0, 0, 0)

    this.checkDetails()
    renderer.render(this.scene, this.camera)
  }

  /**
   * A detail is found when the direction it is written on has been turned to
   * face the viewer, closely enough and (if it is small) closely enough zoomed.
   */
  private checkDetails(): void {
    const item = this.current
    if (!item?.details) return
    const viewDir = new THREE.Vector3(0, 0, 1)
    for (const d of item.details) {
      if (this.foundIds.has(d.id)) continue
      if (d.requiresItem && !this.heldItems.has(d.requiresItem)) continue
      if (d.minZoom !== undefined && this.zoom < d.minZoom) continue
      const local = new THREE.Vector3(...d.facing).normalize()
      const world = local.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0))
      if (world.dot(viewDir) >= (d.tolerance ?? 0.86)) {
        this.foundIds.add(d.id)
        this.events.onDetailFound(item, d)
      }
    }
  }

  /** Which details of the current item are still undiscovered but reachable. */
  pendingDetailHint(): string | null {
    const item = this.current
    if (!item?.details) return null
    for (const d of item.details) {
      if (this.foundIds.has(d.id)) continue
      if (d.requiresItem && !this.heldItems.has(d.requiresItem)) continue
      if (d.minZoom !== undefined && this.zoom < d.minZoom) return '近づいて見る'
      return '向きを変えてみる'
    }
    return null
  }

  dispose(): void {
    this.stop()
    this.clear()
    this.renderer?.dispose()
    this.renderer = null
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
  })
}
