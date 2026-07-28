import * as THREE from 'three'
import type { WorldLighting } from '../state/GameState'
import { ROOM } from './Layout'
import { damp } from '../core/Tween'
import type { MaterialLibrary } from './Materials'

/**
 * The lighting rig, and the four states the building can be in.
 *
 * Each state is a full set of target intensities; the rig damps toward the
 * active set every frame, so throwing the breaker or the safelight switch is a
 * continuous change rather than a cut. Only two lights ever cast shadows at
 * once - that is the whole shadow budget, spent where the composition needs it.
 */

interface Rigged {
  light: THREE.Light
  targets: Record<WorldLighting, number>
  current: number
  /** Optional emissive mesh driven in step with the light. */
  bulb?: THREE.Mesh
  bulbScale?: number
}

export interface FogState {
  color: number
  density: number
  exposure: number
  redShift: number
  ambientColor: number
  ambientIntensity: number
}

export const LIGHT_STATES: Record<WorldLighting, FogState> = {
  blackout: {
    color: 0x0a1018,
    density: 0.040,
    exposure: 1.05,
    redShift: 0,
    ambientColor: 0x3f5876,
    ambientIntensity: 0.42,
  },
  tungsten: {
    color: 0x1b1710,
    density: 0.026,
    exposure: 0.95,
    redShift: 0,
    ambientColor: 0x4a3a28,
    ambientIntensity: 0.20,
  },
  safelight: {
    color: 0x170606,
    density: 0.048,
    exposure: 1.02,
    redShift: 0.7,
    ambientColor: 0x59180e,
    ambientIntensity: 0.5,
  },
  dawn: {
    color: 0x1f1a16,
    density: 0.022,
    exposure: 0.98,
    redShift: 0,
    ambientColor: 0x584a3a,
    ambientIntensity: 0.26,
  },
}

export class LightingRig {
  readonly root = new THREE.Group()
  private rigged: Rigged[] = []
  private ambient: THREE.HemisphereLight
  private state: WorldLighting = 'blackout'
  private fog: THREE.FogExp2
  private ambTarget = new THREE.Color()
  /** Practical fixtures whose emissive follows their light. */
  private materials: MaterialLibrary

  constructor(scene: THREE.Scene, mats: MaterialLibrary) {
    this.materials = mats
    this.root.name = 'lighting'
    scene.add(this.root)

    this.fog = new THREE.FogExp2(LIGHT_STATES.blackout.color, LIGHT_STATES.blackout.density)
    scene.fog = this.fog

    this.ambient = new THREE.HemisphereLight(0x2a3d55, 0x17130f, 0.5)
    this.root.add(this.ambient)

    this.build()
    this.snapTo('blackout')
    // Record the authored map sizes so the quality profile can scale relative
    // to them instead of flattening every light to one number.
    this.root.traverse((o) => {
      const l = o as THREE.Light & { shadow?: THREE.LightShadow }
      if (l.shadow?.mapSize) l.userData.authoredShadowSize = l.shadow.mapSize.x
    })
  }

  private add(light: THREE.Light, targets: Record<WorldLighting, number>, bulb?: THREE.Mesh): Rigged {
    this.root.add(light)
    const r: Rigged = { light, targets, current: 0, bulb, bulbScale: 1 }
    this.rigged.push(r)
    light.intensity = 0
    return r
  }

  private build(): void {
    const H = ROOM.hall
    const S = ROOM.studio
    const D = ROOM.darkroom
    const O = ROOM.office

    // --- moonlight and streetlight through the shopfront -------------------
    const moon = new THREE.DirectionalLight(0x8fb4e6, 1)
    moon.position.set(-2.4, 6.2, 11.5)
    moon.target.position.set(-1.4, 0.6, 4.2)
    moon.castShadow = true
    moon.shadow.mapSize.setScalar(2048)
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 22
    moon.shadow.camera.left = -6
    moon.shadow.camera.right = 6
    moon.shadow.camera.top = 6
    moon.shadow.camera.bottom = -6
    moon.shadow.bias = -0.0009
    moon.shadow.normalBias = 0.03
    this.root.add(moon.target)
    this.add(moon, { blackout: 1.15, tungsten: 0.28, safelight: 0.06, dawn: 0.4 })

    // The lamp itself, outside the glass. It lights the shopfront from the
    // street side, which is why the window reads as a lit panel and not a hole.
    const street = new THREE.PointLight(0xffb765, 1, 9.5, 2)
    street.position.set(-0.4, 2.0, 7.15)
    this.add(street, { blackout: 2.0, tungsten: 0.9, safelight: 0.3, dawn: 1.7 })

    // What actually gets through the frosted glass: a soft, wide, much weaker
    // pool inside the hall. Without this the exit door faces away from every
    // light in the building and reads as a black rectangle.
    const spill = new THREE.PointLight(0xf6c78d, 1, 5.2, 1.35)
    spill.position.set(-1.4, 1.2, 4.95)
    this.add(spill, { blackout: 3.1, tungsten: 1.1, safelight: 0.3, dawn: 2.3 })

    // A low warm bounce off the terrazzo by the entrance. Without it the whole
    // lower third of the door composition falls to unreadable black.
    const hallFloor = new THREE.PointLight(0xffc48a, 1, 6.5, 1.15)
    hallFloor.position.set(-1.35, 0.42, 4.6)
    this.add(hallFloor, { blackout: 1.5, tungsten: 3.2, safelight: 0.5, dawn: 2.6 })

    // --- hall pendant -------------------------------------------------------
    const pendantBulb = this.makeBulb(0xffd9a0, 0.035)
    pendantBulb.position.set(-1.3, H.ceiling - 0.44, 4.5)
    this.root.add(pendantBulb)
    const pendant = new THREE.PointLight(0xffc98a, 1, 8.5, 2)
    pendant.position.copy(pendantBulb.position)
    pendant.castShadow = true
    pendant.shadow.mapSize.setScalar(1024)
    pendant.shadow.bias = -0.0016
    pendant.shadow.normalBias = 0.04
    pendant.shadow.camera.near = 0.1
    pendant.shadow.camera.far = 10
    this.add(pendant, { blackout: 0, tungsten: 34, safelight: 0, dawn: 21 }, pendantBulb)

    // --- studio key and fill -----------------------------------------------
    const keyBulb = this.makeBulb(0xfff0cf, 0.05)
    keyBulb.position.set(-2.2, 2.5, 1.5)
    this.root.add(keyBulb)
    const key = new THREE.SpotLight(0xffd7a2, 1, 11, Math.PI * 0.34, 0.62, 1.7)
    key.position.copy(keyBulb.position)
    key.target.position.set(0.1, 1.0, -1.6)
    key.castShadow = true
    key.shadow.mapSize.setScalar(2048)
    key.shadow.bias = -0.0011
    key.shadow.normalBias = 0.026
    key.shadow.camera.near = 0.4
    key.shadow.camera.far = 14
    this.root.add(key.target)
    this.add(key, { blackout: 0, tungsten: 68, safelight: 0, dawn: 40 }, keyBulb)

    const fillBulb = this.makeBulb(0xfff0cf, 0.045)
    fillBulb.position.set(2.3, 2.35, 1.2)
    this.root.add(fillBulb)
    const fill = new THREE.SpotLight(0xffcf9b, 1, 10, Math.PI * 0.38, 0.7, 1.8)
    fill.position.copy(fillBulb.position)
    fill.target.position.set(-0.4, 1.1, -1.8)
    this.root.add(fill.target)
    this.add(fill, { blackout: 0, tungsten: 30, safelight: 0, dawn: 17 }, fillBulb)

    // a soft bounce so the tall studio ceiling is never a black void
    const bounce = new THREE.PointLight(0xc9a273, 1, 9, 2.2)
    bounce.position.set(0, 2.9, -0.4)
    this.add(bounce, { blackout: 0.8, tungsten: 13, safelight: 0, dawn: 9.5 })

    // --- darkroom -----------------------------------------------------------
    const dkBulb = this.makeBulb(0xffe6bd, 0.03)
    dkBulb.position.set((D.x0 + D.x1) / 2, D.ceiling - 0.28, (D.z0 + D.z1) / 2)
    this.root.add(dkBulb)
    const dk = new THREE.PointLight(0xffdcae, 1, 7, 2)
    dk.position.copy(dkBulb.position)
    this.add(dk, { blackout: 0, tungsten: 22, safelight: 0, dawn: 13 }, dkBulb)

    const safeBulb = this.makeSafeBulb()
    safeBulb.position.set(-5.0, 2.1, -2.62)
    this.root.add(safeBulb)
    const safe = new THREE.PointLight(0xff3a1e, 1, 9, 1.5)
    safe.position.set(-5.0, 2.05, -2.5)
    this.add(safe, { blackout: 0, tungsten: 0, safelight: 8.5, dawn: 0 }, safeBulb)

    // --- office -------------------------------------------------------------
    const officeBulb = this.makeBulb(0xffe0b0, 0.03)
    officeBulb.position.set((O.x0 + O.x1) / 2, O.ceiling - 0.3, (O.z0 + O.z1) / 2 - 0.2)
    this.root.add(officeBulb)
    const office = new THREE.PointLight(0xffd39a, 1, 7.5, 2)
    office.position.copy(officeBulb.position)
    this.add(office, { blackout: 0, tungsten: 25, safelight: 0, dawn: 15 }, officeBulb)

    const deskLamp = new THREE.PointLight(0xffc078, 1, 3.2, 2.2)
    deskLamp.position.set(4.6, 1.02, -2.1)
    this.add(deskLamp, { blackout: 0, tungsten: 9.5, safelight: 0, dawn: 5.5 })

    // --- safelight service circuit ------------------------------------------
    // Kyoichi wired red service lamps through the whole building so wet prints
    // could be carried between rooms. They are what makes the safelight state a
    // building-wide event rather than a darkroom-only one.
    const serviceSpots: Array<[number, number, number]> = [
      [(H.x0 + H.x1) / 2 - 0.4, 2.35, 4.2],
      [0.0, 2.7, 0.4],
      [(O.x0 + O.x1) / 2, 2.4, -1.2],
    ]
    for (const [x, y, z] of serviceSpots) {
      const b = this.makeSafeBulb(0.026)
      b.position.set(x, y, z)
      this.root.add(b)
      const l = new THREE.PointLight(0xff3218, 1, 9, 1.6)
      l.position.set(x, y - 0.04, z)
      this.add(l, { blackout: 0, tungsten: 0, safelight: 6, dawn: 0 }, b)
    }

    // --- dawn through the opened door ---------------------------------------
    const dawn = new THREE.SpotLight(0xffca8a, 1, 16, Math.PI * 0.3, 0.55, 1.3)
    dawn.position.set(-1.85, 2.4, 8.6)
    dawn.target.position.set(-1.2, 0.4, 2.4)
    this.root.add(dawn.target)
    this.add(dawn, { blackout: 0, tungsten: 0, safelight: 0, dawn: 140 })

    void S
  }

  private makeBulb(color: number, radius: number): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x2a2620,
        emissive: color,
        emissiveIntensity: 0,
        roughness: 0.4,
      }),
    )
    m.castShadow = false
    m.receiveShadow = false
    m.name = 'bulb'
    return m
  }

  private makeSafeBulb(radius = 0.032): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 10),
      this.materials.safelightGlass.clone(),
    )
    m.castShadow = false
    m.receiveShadow = false
    m.name = 'safebulb'
    return m
  }

  get current(): WorldLighting {
    return this.state
  }

  setState(state: WorldLighting): void {
    this.state = state
  }

  snapTo(state: WorldLighting): void {
    this.state = state
    for (const r of this.rigged) {
      r.current = r.targets[state]
      r.light.intensity = r.current
      this.applyBulb(r)
    }
    const s = LIGHT_STATES[state]
    this.fog.color.setHex(s.color)
    this.fog.density = s.density
    this.ambient.color.setHex(s.ambientColor)
    this.ambient.intensity = s.ambientIntensity
    this.ambTarget.setHex(s.ambientColor)
  }

  private applyBulb(r: Rigged): void {
    if (!r.bulb) return
    const mat = r.bulb.material as THREE.MeshStandardMaterial
    const max = Math.max(...Object.values(r.targets))
    const k = max > 0 ? r.current / max : 0
    mat.emissiveIntensity = k * (r.bulb.name === 'safebulb' ? 2.6 : 2.2)
    mat.needsUpdate = false
  }

  /** Exposure / grade values the render stack should be damped toward. */
  targetGrade(): FogState {
    return LIGHT_STATES[this.state]
  }

  update(dt: number): void {
    const s = LIGHT_STATES[this.state]
    for (const r of this.rigged) {
      const target = r.targets[this.state]
      if (Math.abs(r.current - target) > 0.001) {
        r.current = damp(r.current, target, 3.4, dt)
        r.light.intensity = r.current
        this.applyBulb(r)
      }
    }
    this.fog.color.lerp(new THREE.Color(s.color), 1 - Math.exp(-3 * dt))
    this.fog.density = damp(this.fog.density, s.density, 3, dt)
    this.ambient.color.lerp(new THREE.Color(s.ambientColor), 1 - Math.exp(-3 * dt))
    this.ambient.intensity = damp(this.ambient.intensity, s.ambientIntensity, 3, dt)
  }

  /** Used by the enlarger: a temporary projector light in the darkroom. */
  makeProjector(): THREE.SpotLight {
    const p = new THREE.SpotLight(0xfff3e0, 0, 5, Math.PI * 0.11, 0.35, 1.4)
    this.root.add(p)
    this.root.add(p.target)
    return p
  }
}
