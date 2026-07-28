import * as THREE from 'three'
import { EXTERIOR_THICKNESS, OPENINGS, ROOM, WALL_THICKNESS } from './Layout'
import {
  boxAt,
  buildWall,
  ceilingSlab,
  floorSlab,
  mesh,
  texturedBox,
  trimRun,
  type Opening,
} from './Geo'
import type { MaterialLibrary } from './Materials'
import { ValueNoise2D, mulberry32 } from './Noise'
import { ctx2d, makeCanvas } from './Textures'

/**
 * The shell: floors, ceilings, walls, trim, door frames and the world outside
 * the shopfront. Everything that never moves and never reacts.
 */

export interface BuildingRefs {
  root: THREE.Group
  /** The leaf of the exit door, so the ending can swing it. */
  exitDoorLeaf: THREE.Group
  darkroomDoorLeaf: THREE.Group
  officeDoorLeaf: THREE.Group
  /** Warm glow plane outside the shopfront, brightened at dawn. */
  streetGlow: THREE.Mesh
  rain: THREE.Points
}

export function buildBuilding(mats: MaterialLibrary): BuildingRefs {
  const root = new THREE.Group()
  root.name = 'building'

  // ------------------------------------------------------------------ floors
  root.add(floorSlab(mats.floorStudio, ROOM.studio.x0, ROOM.studio.z0, ROOM.studio.x1, ROOM.studio.z1, 0))
  root.add(floorSlab(mats.floorHall, ROOM.hall.x0, ROOM.hall.z0, ROOM.hall.x1, ROOM.hall.z1, 0))
  root.add(floorSlab(mats.floorDark, ROOM.darkroom.x0, ROOM.darkroom.z0, ROOM.darkroom.x1, ROOM.darkroom.z1, 0))
  root.add(floorSlab(mats.woodMid, ROOM.office.x0, ROOM.office.z0, ROOM.office.x1, ROOM.office.z1, 0))

  // ---------------------------------------------------------------- ceilings
  root.add(
    ceilingSlab(mats.ceiling, ROOM.studio.x0, ROOM.studio.z0, ROOM.studio.x1, ROOM.studio.z1, ROOM.studio.ceiling),
  )
  root.add(ceilingSlab(mats.ceiling, ROOM.hall.x0, ROOM.hall.z0, ROOM.hall.x1, ROOM.hall.z1, ROOM.hall.ceiling))
  root.add(
    ceilingSlab(
      mats.plasterWallDark,
      ROOM.darkroom.x0,
      ROOM.darkroom.z0,
      ROOM.darkroom.x1,
      ROOM.darkroom.z1,
      ROOM.darkroom.ceiling,
    ),
  )
  root.add(ceilingSlab(mats.ceiling, ROOM.office.x0, ROOM.office.z0, ROOM.office.x1, ROOM.office.z1, ROOM.office.ceiling))

  // ------------------------------------------------------------------- walls
  const S = ROOM.studio

  // Studio north wall - the chronicle wall lives on this face.
  root.add(buildWall(S.x0, S.z0, S.x1, S.z0, S.ceiling, WALL_THICKNESS, mats.plasterWallStudio, [], { name: 'studio-n' }))

  // Studio south wall, with the archway through to the hall.
  {
    const len = S.x1 - S.x0
    const o: Opening = {
      from: OPENINGS.hallArch.x0 - S.x0,
      to: OPENINGS.hallArch.x1 - S.x0,
      bottom: 0,
      top: OPENINGS.hallArch.top,
    }
    void len
    root.add(
      buildWall(S.x0, S.z1, S.x1, S.z1, S.ceiling, WALL_THICKNESS, mats.plasterWallStudio, [o], { name: 'studio-s' }),
    )
  }

  // Studio west wall, with the darkroom doorway.
  {
    const o: Opening = {
      from: OPENINGS.darkroomDoor.z0 - S.z0,
      to: OPENINGS.darkroomDoor.z1 - S.z0,
      bottom: 0,
      top: OPENINGS.darkroomDoor.top,
    }
    root.add(
      buildWall(S.x0, S.z0, S.x0, S.z1, S.ceiling, WALL_THICKNESS, mats.plasterWallStudio, [o], { name: 'studio-w' }),
    )
  }

  // Studio east wall, with the office doorway.
  {
    const o: Opening = {
      from: OPENINGS.officeDoor.z0 - S.z0,
      to: OPENINGS.officeDoor.z1 - S.z0,
      bottom: 0,
      top: OPENINGS.officeDoor.top,
    }
    root.add(
      buildWall(S.x1, S.z0, S.x1, S.z1, S.ceiling, WALL_THICKNESS, mats.plasterWallStudio, [o], { name: 'studio-e' }),
    )
  }

  // Hall: west, east, and the glazed shopfront to the south.
  const H = ROOM.hall
  root.add(buildWall(H.x0, H.z0, H.x0, H.z1, H.ceiling, WALL_THICKNESS, mats.plasterWall, [], { name: 'hall-w' }))
  root.add(buildWall(H.x1, H.z0, H.x1, H.z1, H.ceiling, WALL_THICKNESS, mats.plasterWall, [], { name: 'hall-e' }))
  {
    const doorOpening: Opening = {
      from: OPENINGS.exitDoor.x0 - H.x0,
      to: OPENINGS.exitDoor.x1 - H.x0,
      bottom: 0,
      top: OPENINGS.exitDoor.top,
    }
    const winOpening: Opening = {
      from: OPENINGS.shopWindow.x0 - H.x0,
      to: OPENINGS.shopWindow.x1 - H.x0,
      bottom: OPENINGS.shopWindow.bottom,
      top: OPENINGS.shopWindow.top,
    }
    root.add(
      buildWall(H.x0, H.z1, H.x1, H.z1, H.ceiling, EXTERIOR_THICKNESS, mats.plasterWall, [doorOpening, winOpening], {
        name: 'hall-s',
      }),
    )
  }

  // Darkroom: three sides (the fourth is the studio's west wall).
  const D = ROOM.darkroom
  root.add(buildWall(D.x0, D.z0, D.x1, D.z0, D.ceiling, WALL_THICKNESS, mats.plasterWallDark, [], { name: 'dark-n' }))
  root.add(buildWall(D.x0, D.z1, D.x1, D.z1, D.ceiling, WALL_THICKNESS, mats.plasterWallDark, [], { name: 'dark-s' }))
  root.add(buildWall(D.x0, D.z0, D.x0, D.z1, D.ceiling, EXTERIOR_THICKNESS, mats.plasterWallDark, [], { name: 'dark-w' }))

  // Office: three sides.
  const O = ROOM.office
  root.add(buildWall(O.x0, O.z0, O.x1, O.z0, O.ceiling, WALL_THICKNESS, mats.plasterWall, [], { name: 'office-n' }))
  root.add(buildWall(O.x0, O.z1, O.x1, O.z1, O.ceiling, WALL_THICKNESS, mats.plasterWall, [], { name: 'office-s' }))
  root.add(buildWall(O.x1, O.z0, O.x1, O.z1, O.ceiling, EXTERIOR_THICKNESS, mats.plasterWall, [], { name: 'office-e' }))

  // -------------------------------------------------------------------- trim
  addSkirting(root, mats)
  addPictureRail(root, mats)

  // ------------------------------------------------------------- door frames
  addArchTrim(root, mats)

  const darkroomDoorLeaf = makeDoorLeaf(mats, 0.9, 2.0, 'darkroom')
  darkroomDoorLeaf.position.set(
    OPENINGS.darkroomDoor.x,
    0,
    (OPENINGS.darkroomDoor.z0 + OPENINGS.darkroomDoor.z1) / 2,
  )
  // hinge on the north edge, opens into the darkroom
  darkroomDoorLeaf.rotation.y = Math.PI / 2
  root.add(darkroomDoorLeaf)

  const officeDoorLeaf = makeDoorLeaf(mats, 0.9, 2.0, 'office', true)
  officeDoorLeaf.position.set(OPENINGS.officeDoor.x, 0, (OPENINGS.officeDoor.z0 + OPENINGS.officeDoor.z1) / 2)
  officeDoorLeaf.rotation.y = -Math.PI / 2
  root.add(officeDoorLeaf)

  const exitDoorLeaf = makeExitDoor(mats)
  exitDoorLeaf.position.set(OPENINGS.exitDoor.x0, 0, OPENINGS.exitDoor.z - 0.02)
  root.add(exitDoorLeaf)

  // ------------------------------------------------------- shopfront glazing
  {
    const w = OPENINGS.shopWindow.x1 - OPENINGS.shopWindow.x0
    const h = OPENINGS.shopWindow.top - OPENINGS.shopWindow.bottom
    const glass = mesh(new THREE.PlaneGeometry(w, h), mats.glassFrosted, { cast: false, receive: false })
    glass.position.set(
      (OPENINGS.shopWindow.x0 + OPENINGS.shopWindow.x1) / 2,
      (OPENINGS.shopWindow.bottom + OPENINGS.shopWindow.top) / 2,
      OPENINGS.shopWindow.z - 0.02,
    )
    root.add(glass)
    // painted studio name, reversed because we read it from inside
    const sign = mesh(new THREE.PlaneGeometry(w * 0.86, h * 0.3), makeShopSignMaterial(), {
      cast: false,
      receive: false,
    })
    sign.position.set(glass.position.x, OPENINGS.shopWindow.top - h * 0.26, OPENINGS.shopWindow.z - 0.035)
    root.add(sign)
    // mullions
    for (const t of [0.34, 0.68]) {
      root.add(
        boxAt(
          mats.woodDark,
          0.035,
          h,
          0.05,
          OPENINGS.shopWindow.x0 + w * t,
          (OPENINGS.shopWindow.bottom + OPENINGS.shopWindow.top) / 2,
          OPENINGS.shopWindow.z - 0.03,
          { cast: false },
        ),
      )
    }
  }

  // ------------------------------------------------------------ outside world
  const { streetGlow, rain } = buildOutside(root)

  return { root, exitDoorLeaf, darkroomDoorLeaf, officeDoorLeaf, streetGlow, rain }
}

// ---------------------------------------------------------------------------

function addSkirting(root: THREE.Group, mats: MaterialLibrary): void {
  const h = 0.13
  const d = 0.022
  const runs: Array<[number, number, number, number, number]> = [
    // studio
    [ROOM.studio.x0, ROOM.studio.z0 + 0.09, ROOM.studio.x1, ROOM.studio.z0 + 0.09, 0],
    [ROOM.studio.x0 + 0.09, ROOM.studio.z0, ROOM.studio.x0 + 0.09, ROOM.studio.z1, 0],
    [ROOM.studio.x1 - 0.09, ROOM.studio.z0, ROOM.studio.x1 - 0.09, ROOM.studio.z1, 0],
    [ROOM.studio.x0, ROOM.studio.z1 - 0.09, ROOM.studio.x1, ROOM.studio.z1 - 0.09, 0],
    // hall
    [ROOM.hall.x0 + 0.09, ROOM.hall.z0, ROOM.hall.x0 + 0.09, ROOM.hall.z1, 0],
    [ROOM.hall.x1 - 0.09, ROOM.hall.z0, ROOM.hall.x1 - 0.09, ROOM.hall.z1, 0],
    [ROOM.hall.x0, ROOM.hall.z1 - 0.14, ROOM.hall.x1, ROOM.hall.z1 - 0.14, 0],
    // office
    [ROOM.office.x0, ROOM.office.z0 + 0.09, ROOM.office.x1, ROOM.office.z0 + 0.09, 0],
    [ROOM.office.x1 - 0.09, ROOM.office.z0, ROOM.office.x1 - 0.09, ROOM.office.z1, 0],
    [ROOM.office.x0, ROOM.office.z1 - 0.09, ROOM.office.x1, ROOM.office.z1 - 0.09, 0],
  ]
  for (const [x1, z1, x2, z2] of runs) {
    root.add(trimRun(mats.woodTrim, x1, z1, x2, z2, 0, h, d))
  }
}

function addPictureRail(root: THREE.Group, mats: MaterialLibrary): void {
  // A rail at 2.35 m in the studio only - it gives the tall room a horizon and
  // is what the chronicle panels visually hang from.
  const y = 2.34
  root.add(trimRun(mats.woodTrim, ROOM.studio.x0, ROOM.studio.z0 + 0.09, ROOM.studio.x1, ROOM.studio.z0 + 0.09, y, 0.05, 0.03))
  root.add(trimRun(mats.woodTrim, ROOM.studio.x1 - 0.09, ROOM.studio.z0, ROOM.studio.x1 - 0.09, ROOM.studio.z1, y, 0.05, 0.03))
  root.add(trimRun(mats.woodTrim, ROOM.studio.x0 + 0.09, ROOM.studio.z0, ROOM.studio.x0 + 0.09, ROOM.studio.z1, y, 0.05, 0.03))
}

function addArchTrim(root: THREE.Group, mats: MaterialLibrary): void {
  const a = OPENINGS.hallArch
  const w = a.x1 - a.x0
  // jambs
  for (const x of [a.x0, a.x1]) {
    root.add(boxAt(mats.woodDark, 0.06, a.top + 0.06, WALL_THICKNESS + 0.05, x, (a.top + 0.06) / 2, a.z, { cast: false }))
  }
  root.add(boxAt(mats.woodDark, w + 0.12, 0.07, WALL_THICKNESS + 0.05, (a.x0 + a.x1) / 2, a.top + 0.025, a.z, { cast: false }))

  // door casings for the two side rooms
  const dd = OPENINGS.darkroomDoor
  for (const z of [dd.z0, dd.z1]) {
    root.add(boxAt(mats.woodDark, WALL_THICKNESS + 0.05, dd.top + 0.06, 0.055, dd.x, (dd.top + 0.06) / 2, z, { cast: false }))
  }
  root.add(
    boxAt(mats.woodDark, WALL_THICKNESS + 0.05, 0.06, dd.z1 - dd.z0 + 0.11, dd.x, dd.top + 0.03, (dd.z0 + dd.z1) / 2, {
      cast: false,
    }),
  )

  const od = OPENINGS.officeDoor
  for (const z of [od.z0, od.z1]) {
    root.add(boxAt(mats.woodDark, WALL_THICKNESS + 0.05, od.top + 0.06, 0.055, od.x, (od.top + 0.06) / 2, z, { cast: false }))
  }
  root.add(
    boxAt(mats.woodDark, WALL_THICKNESS + 0.05, 0.06, od.z1 - od.z0 + 0.11, od.x, od.top + 0.03, (od.z0 + od.z1) / 2, {
      cast: false,
    }),
  )

  const ed = OPENINGS.exitDoor
  for (const x of [ed.x0 - 0.03, ed.x1 + 0.03]) {
    root.add(boxAt(mats.woodDark, 0.07, ed.top + 0.08, EXTERIOR_THICKNESS + 0.04, x, (ed.top + 0.08) / 2, ed.z, { cast: false }))
  }
  root.add(
    boxAt(mats.woodDark, ed.x1 - ed.x0 + 0.14, 0.08, EXTERIOR_THICKNESS + 0.04, (ed.x0 + ed.x1) / 2, ed.top + 0.04, ed.z, {
      cast: false,
    }),
  )
}

/** A panelled interior door. The pivot sits at the hinge edge. */
function makeDoorLeaf(
  mats: MaterialLibrary,
  width: number,
  height: number,
  name: string,
  glazed = false,
): THREE.Group {
  const g = new THREE.Group()
  g.name = `door-${name}`
  const t = 0.042

  const slab = mesh(texturedBox(width, height, t, 0.7), mats.woodDark)
  slab.position.set(width / 2, height / 2, 0)
  g.add(slab)

  // raised panels
  const panels: Array<[number, number, number, number]> = glazed
    ? [[0.5, 1.44, 0.62, 0.78]]
    : [
        [0.5, 1.46, 0.62, 0.72],
        [0.5, 0.58, 0.62, 0.72],
      ]
  for (const [cx, cy, pw, ph] of panels) {
    if (glazed) {
      const glass = mesh(new THREE.PlaneGeometry(pw, ph), mats.glassFrosted, { cast: false, receive: false })
      glass.position.set(width * cx, cy, t / 2 + 0.002)
      g.add(glass)
      const glass2 = glass.clone()
      glass2.position.z = -t / 2 - 0.002
      glass2.rotation.y = Math.PI
      g.add(glass2)
      // beading
      for (const s of [1, -1]) {
        const bead = mesh(texturedBox(pw + 0.05, ph + 0.05, 0.014, 1.2), mats.woodTrim, { cast: false })
        bead.position.set(width * cx, cy, s * (t / 2 + 0.006))
        g.add(bead)
      }
    } else {
      for (const s of [1, -1]) {
        const p = mesh(texturedBox(pw, ph, 0.012, 1.0), mats.woodTrim, { cast: false })
        p.position.set(width * cx, cy, s * (t / 2 + 0.004))
        g.add(p)
      }
    }
  }

  // handle and escutcheon on both faces
  for (const s of [1, -1]) {
    const rose = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 16), mats.brass, { cast: false })
    rose.rotation.x = Math.PI / 2
    rose.position.set(width - 0.09, 1.02, s * (t / 2 + 0.006))
    g.add(rose)
    const knob = mesh(new THREE.SphereGeometry(0.032, 18, 14), mats.brass)
    knob.scale.set(1, 1, 0.85)
    knob.position.set(width - 0.09, 1.02, s * (t / 2 + 0.038))
    g.add(knob)
  }

  // hinges
  for (const y of [0.28, height - 0.28]) {
    const hinge = mesh(texturedBox(0.03, 0.1, t + 0.01, 2), mats.brassDull, { cast: false })
    hinge.position.set(0.02, y, 0)
    g.add(hinge)
  }

  return g
}

/** The way out: a heavy timber door carrying the four-ring lock plate. */
function makeExitDoor(mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  g.name = 'door-exit'
  const width = OPENINGS.exitDoor.x1 - OPENINGS.exitDoor.x0
  const height = OPENINGS.exitDoor.top
  const t = 0.055

  const slab = mesh(texturedBox(width, height, t, 0.7), mats.woodDark)
  slab.position.set(width / 2, height / 2, 0)
  g.add(slab)

  // a small frosted light at head height, the only thing the street reaches
  const glass = mesh(new THREE.PlaneGeometry(width * 0.56, 0.34), mats.glassFrosted, { cast: false, receive: false })
  glass.position.set(width / 2, height - 0.42, -t / 2 - 0.003)
  g.add(glass)
  const bead = mesh(texturedBox(width * 0.62, 0.4, 0.016, 1.4), mats.woodTrim, { cast: false })
  bead.position.set(width / 2, height - 0.42, -t / 2 - 0.008)
  g.add(bead)

  // lower panel
  const panel = mesh(texturedBox(width * 0.72, 0.62, 0.014, 1.0), mats.woodTrim, { cast: false })
  panel.position.set(width / 2, 0.52, -t / 2 - 0.007)
  g.add(panel)

  // three heavy hinges on the left jamb
  for (const y of [0.3, height / 2, height - 0.3]) {
    const hinge = mesh(texturedBox(0.04, 0.13, t + 0.012, 2), mats.brassDull, { cast: false })
    hinge.position.set(0.025, y, 0)
    g.add(hinge)
  }

  return g
}

function makeShopSignMaterial(): THREE.MeshBasicMaterial {
  const c = makeCanvas(512, 160)
  const g = ctx2d(c)
  g.clearRect(0, 0, 512, 160)
  // Painted from the street side, so from inside we read it mirrored.
  g.save()
  g.translate(512, 0)
  g.scale(-1, 1)
  g.fillStyle = 'rgba(24,22,20,0.86)'
  g.font = '600 64px "Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('霧沢写真館', 256, 62)
  g.font = '400 26px "Hiragino Sans", "Yu Gothic", sans-serif'
  g.fillStyle = 'rgba(24,22,20,0.6)'
  g.fillText('K I R I S A W A   S T U D I O', 256, 118)
  g.restore()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, depthWrite: false })
}

/**
 * Everything beyond the shopfront: a wet pavement, the opposite building, a
 * sodium streetlamp, and rain. It exists only to give the frosted glass
 * something to be lit by, but without it the hall reads as a sealed box.
 */
function buildOutside(root: THREE.Group): { streetGlow: THREE.Mesh; rain: THREE.Points } {
  const outside = new THREE.Group()
  outside.name = 'outside'

  // backdrop: opposite building wall in near-silhouette
  const backdropCanvas = makeCanvas(512, 512)
  {
    const g = ctx2d(backdropCanvas)
    const grad = g.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, '#0d1119')
    grad.addColorStop(0.62, '#141a24')
    grad.addColorStop(1, '#1b212b')
    g.fillStyle = grad
    g.fillRect(0, 0, 512, 512)
    const rnd = mulberry32(9)
    // a few lit windows far away
    for (let i = 0; i < 14; i++) {
      const x = 30 + rnd() * 452
      const y = 40 + rnd() * 300
      g.fillStyle = `rgba(${180 + rnd() * 60},${150 + rnd() * 50},${100 + rnd() * 40},${0.1 + rnd() * 0.25})`
      g.fillRect(x, y, 16 + rnd() * 14, 22 + rnd() * 12)
    }
    const n = new ValueNoise2D(48, 21)
    const img = g.getImageData(0, 0, 512, 512)
    for (let i = 0; i < 512 * 512; i++) {
      const k = 0.85 + n.fbm((i % 512) / 512, Math.floor(i / 512) / 512, 3, 6) * 0.3
      img.data[i * 4] *= k
      img.data[i * 4 + 1] *= k
      img.data[i * 4 + 2] *= k
    }
    g.putImageData(img, 0, 0)
  }
  const backTex = new THREE.CanvasTexture(backdropCanvas)
  backTex.colorSpace = THREE.SRGBColorSpace
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 9),
    new THREE.MeshBasicMaterial({ map: backTex }),
  )
  backdrop.position.set(-1.0, 3.0, 12.4)
  backdrop.rotation.y = Math.PI
  outside.add(backdrop)

  // wet pavement catching the lamp
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
    new THREE.MeshBasicMaterial({ color: 0x11151b }),
  )
  road.rotation.x = -Math.PI / 2
  road.position.set(-1.0, -0.02, 9.4)
  outside.add(road)

  // the streetlamp's pool of light, faked as an additive plane
  const glowCanvas = makeCanvas(256, 256)
  {
    const g = ctx2d(glowCanvas)
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,214,150,0.75)')
    grad.addColorStop(0.35, 'rgba(226,168,96,0.24)')
    grad.addColorStop(1, 'rgba(226,168,96,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
  }
  const glowTex = new THREE.CanvasTexture(glowCanvas)
  glowTex.colorSpace = THREE.SRGBColorSpace
  const streetGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.2,
    }),
  )
  streetGlow.position.set(-1.9, 2.3, 9.4)
  streetGlow.rotation.y = Math.PI
  outside.add(streetGlow)

  // rain, as a scrolling point cloud confined to the street volume
  const count = 900
  const positions = new Float32Array(count * 3)
  const speeds = new Float32Array(count)
  const rnd = mulberry32(4242)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = -1.0 + (rnd() - 0.5) * 12
    positions[i * 3 + 1] = rnd() * 7
    positions[i * 3 + 2] = 6.9 + rnd() * 5.5
    speeds[i] = 5.5 + rnd() * 4.5
  }
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  rainGeo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
  const rain = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({
      color: 0x9fb4c8,
      size: 0.02,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  )
  rain.name = 'rain'
  rain.frustumCulled = false
  outside.add(rain)

  root.add(outside)
  return { streetGlow, rain }
}

/** Advance the rain. Called every frame from the world update. */
export function updateRain(rain: THREE.Points, dt: number): void {
  const pos = rain.geometry.attributes.position as THREE.BufferAttribute
  const spd = rain.geometry.attributes.aSpeed as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i) - spd.getX(i) * dt
    if (y < 0) y += 7
    pos.setY(i, y)
  }
  pos.needsUpdate = true
}
