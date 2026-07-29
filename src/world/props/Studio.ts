import * as THREE from 'three'
import { boxAt, extrude, lathe, mesh, roundedBox, texturedBox } from '../Geo'
import type { MaterialLibrary } from '../Materials'
import { OPENINGS, ROOM } from '../Layout'
import { chair, dustMotes, framedPhoto, labelPlate, loosePrint, phosphorMark } from './Common'
import {
  groupPhotoCanvas,
  photoTexture,
  portraitCanvas,
} from '../Photographs'
import { ctx2d, makeCanvas } from '../Textures'

/**
 * 撮影室 - the hero room. The backdrop roll is the set piece; the view camera
 * is the tool; the chronicle wall behind the velvet is the payload.
 */

export interface StudioProps {
  group: THREE.Group
  /** The velvet curtain; its scale.y is driven by the crank puzzle. */
  backdropCloth: THREE.Mesh
  backdropRoll: THREE.Group
  /** Hex socket on the roll shaft that accepts the crank. */
  crankSocket: THREE.Group
  /** The crank once fitted, so it can be animated turning. */
  crankFitted: THREE.Group
  chronicleWall: THREE.Group
  /** Four empty slots, in chronological order. */
  chronicleSlots: THREE.Group[]
  mirrorText: THREE.Mesh
  posingChair: THREE.Group
  chairCushion: THREE.Mesh
  viewCamera: THREE.Group
  groundGlass: THREE.Mesh
  cameraBellows: THREE.Mesh
  tripodDrawer: THREE.Group
  lensInDrawer: THREE.Group
  clockGhost: THREE.Group
  crankOnNail: THREE.Group
  portraitWall: THREE.Group
  lampStands: THREE.Group[]
  keyLampBase: THREE.Group
  darkroomKey: THREE.Group
  phosphor: THREE.Mesh
  dust: THREE.Points
}

const S = ROOM.studio
const WALL_N = S.z0 + 0.08 // inner face of the north wall
const WALL_E = S.x1 - 0.08

export function buildStudio(mats: MaterialLibrary): StudioProps {
  const group = new THREE.Group()
  group.name = 'props-studio'

  // ================================================== chronicle wall (hidden)
  const chronicleWall = new THREE.Group()
  const chronicleSlots: THREE.Group[] = []
  {
    // a plywood panel screwed to the plaster, edge-beaded
    const panelW = 3.9
    const panelH = 2.05
    const panel = mesh(texturedBox(panelW, panelH, 0.022, 1.5), mats.woodDark, { cast: false })
    panel.position.set(-0.6, 1.42, WALL_N + 0.012)
    chronicleWall.add(panel)
    for (const [w, h, x, y] of [
      [panelW + 0.04, 0.03, -0.6, 1.42 + panelH / 2],
      [panelW + 0.04, 0.03, -0.6, 1.42 - panelH / 2],
    ] as Array<[number, number, number, number]>) {
      const b = mesh(texturedBox(w, h, 0.032, 2), mats.woodTrim, { cast: false })
      b.position.set(x, y, WALL_N + 0.018)
      chronicleWall.add(b)
    }

    // the chronicle itself: three rows of prints, oldest at the left
    const cols = 7
    const rows = 3
    const cw = 0.44
    const ch = 0.56
    const x0 = -0.6 - ((cols - 1) * cw) / 2
    const y0 = 1.42 + ((rows - 1) * ch) / 2
    // slots the four removed prints came out of
    const missing = new Set(['1,1', '2,1', '4,1', '5,2'])
    let variant = 11
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * cw
        const y = y0 - r * ch
        const key = `${c},${r}`
        if (missing.has(key)) {
          const slot = new THREE.Group()
          // the unfaded rectangle a removed print leaves behind
          const ghost = mesh(
            new THREE.PlaneGeometry(cw * 0.78, ch * 0.78),
            new THREE.MeshStandardMaterial({ color: 0x8d7a58, roughness: 0.9 }),
            { cast: false },
          )
          ghost.position.set(0, 0, 0.001)
          slot.add(ghost)
          // four picture pins still in place
          for (const [px, py] of [
            [-cw * 0.36, ch * 0.36],
            [cw * 0.36, ch * 0.36],
            [-cw * 0.36, -ch * 0.36],
            [cw * 0.36, -ch * 0.36],
          ]) {
            const pin = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.012, 6), mats.brassDull, { cast: false })
            pin.rotation.x = Math.PI / 2
            pin.position.set(px, py, 0.006)
            slot.add(pin)
          }
          const year = ['一歳', '四歳', '七歳', '——'][chronicleSlots.length]
          const cap = labelPlate(year, 0.11, 0.026, {
            bg: '#8b7a58',
            fg: '#efe4c6',
            font: '500 26px "Hiragino Mincho ProN", serif',
          })
          cap.position.set(0, -ch * 0.44, 0.003)
          slot.add(cap)
          slot.position.set(x, y, WALL_N + 0.024)
          slot.name = `chronicle-slot-${chronicleSlots.length}`
          chronicleWall.add(slot)
          chronicleSlots.push(slot)
        } else {
          const isGroup = (c + r) % 3 === 2
          const tex = isGroup
            ? photoTexture(`chron-g-${variant}`, () =>
                groupPhotoCanvas(4 + (variant % 2), (variant % 4) - 1, { width: 300, height: 220, seed: 900 + variant }),
              )
            : photoTexture(`chron-p-${variant}`, () => portraitCanvas(variant, { width: 210, height: 280 }))
          const p = framedPhoto(mats, tex, cw * 0.76, ch * 0.76, { frame: 0.014, depth: 0.018, glass: false })
          p.position.set(x, y, WALL_N + 0.03)
          p.rotation.z = ((variant * 37) % 11) * 0.0016 - 0.008
          chronicleWall.add(p)
          variant++
        }
      }
    }

    // Kyoichi's pencil note, written mirror-reversed on the panel edge board.
    const mirrorCanvas = makeCanvas(1024, 256)
    {
      const g = ctx2d(mirrorCanvas)
      g.clearRect(0, 0, 1024, 256)
      // Written the right way up, then set on the wall upside down - which is
      // exactly what a view camera's ground glass turns back into legible text.
      g.save()
      g.translate(1024, 256)
      g.rotate(Math.PI)
      g.fillStyle = 'rgba(46,38,28,0.72)'
      g.font = '400 60px "Hiragino Mincho ProN", "Yu Mincho", serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('この壁だけは残す', 512, 66)
      g.font = '400 76px "Hiragino Mincho ProN", "Yu Mincho", serif'
      g.fillStyle = 'rgba(40,32,22,0.8)'
      g.fillText('鍵は灯の下に', 512, 168)
      g.restore()
    }
    const mt = new THREE.CanvasTexture(mirrorCanvas)
    mt.colorSpace = THREE.SRGBColorSpace
    const mirrorText = mesh(
      new THREE.PlaneGeometry(1.5, 0.375),
      new THREE.MeshStandardMaterial({ map: mt, transparent: true, roughness: 0.95 }),
      { cast: false },
    )
    mirrorText.position.set(-0.6, 0.5, WALL_N + 0.026)
    mirrorText.name = 'mirror-text'
    chronicleWall.add(mirrorText)

    // a hand-lettered heading
    const heading = labelPlate('霧沢家　記録', 0.5, 0.075, {
      bg: '#6f5f42',
      fg: '#f0e5c8',
      font: '500 44px "Hiragino Mincho ProN", serif',
    })
    heading.position.set(-0.6, 2.36, WALL_N + 0.026)
    chronicleWall.add(heading)

    group.add(chronicleWall)
    ;(chronicleWall as THREE.Object3D).userData.mirrorText = mirrorText
  }
  const mirrorText = chronicleWall.userData.mirrorText as THREE.Mesh

  // ======================================================== backdrop assembly
  const backdropRoll = new THREE.Group()
  const crankSocket = new THREE.Group()
  const crankFitted = new THREE.Group()
  let backdropCloth!: THREE.Mesh
  {
    const rollY = 2.62
    const rollLen = 4.2
    const rollX = -0.6

    // brackets
    for (const s of [-1, 1]) {
      const arm = mesh(texturedBox(0.07, 0.36, 0.11, 2), mats.steelDark)
      arm.position.set(rollX + (s * rollLen) / 2 + s * 0.09, rollY + 0.12, WALL_N + 0.09)
      backdropRoll.add(arm)
      const plateM = mesh(texturedBox(0.13, 0.13, 0.02, 2.4), mats.steelDark, { cast: false })
      plateM.position.set(rollX + (s * rollLen) / 2 + s * 0.09, rollY + 0.28, WALL_N + 0.012)
      backdropRoll.add(plateM)
    }

    const tube = mesh(new THREE.CylinderGeometry(0.062, 0.062, rollLen, 22), mats.steelDark)
    tube.rotation.z = Math.PI / 2
    tube.position.set(rollX, rollY, WALL_N + 0.1)
    backdropRoll.add(tube)
    // the rolled-up surplus of cloth on the tube
    const wrap = mesh(new THREE.CylinderGeometry(0.09, 0.09, rollLen - 0.1, 22), mats.velvet, { cast: false })
    wrap.rotation.z = Math.PI / 2
    wrap.position.copy(tube.position)
    backdropRoll.add(wrap)

    // hex socket on the right-hand end of the shaft
    {
      const boss = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 6), mats.brassDull)
      boss.rotation.z = Math.PI / 2
      crankSocket.add(boss)
      const hole = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.056, 6), new THREE.MeshStandardMaterial({
        color: 0x131110,
        roughness: 0.9,
      }), { cast: false })
      hole.rotation.z = Math.PI / 2
      crankSocket.add(hole)
      crankSocket.position.set(rollX + rollLen / 2 + 0.055, rollY, WALL_N + 0.1)
      crankSocket.name = 'crank-socket'
      backdropRoll.add(crankSocket)
    }

    // the crank once fitted (hidden until the puzzle accepts it)
    {
      const shaft = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), mats.brass)
      shaft.rotation.z = Math.PI / 2
      crankFitted.add(shaft)
      const arm = mesh(roundedBox(0.02, 0.17, 0.02, 0.006, 2, 3), mats.brass)
      arm.position.set(0.06, 0.07, 0)
      crankFitted.add(arm)
      const grip = mesh(lathe([[0.017, 0], [0.019, 0.02], [0.017, 0.06], [0, 0.062]], 12), mats.woodDark)
      grip.rotation.z = Math.PI / 2
      grip.position.set(0.075, 0.15, 0)
      crankFitted.add(grip)
      crankFitted.position.set(rollX + rollLen / 2 + 0.11, rollY, WALL_N + 0.1)
      crankFitted.visible = false
      backdropRoll.add(crankFitted)
    }

    // the velvet itself. Anchored at the top; scaling Y raises it.
    const clothH = 2.62
    const clothGeo = new THREE.PlaneGeometry(4.0, clothH, 14, 18)
    {
      // give it weight: a slow horizontal wave plus a sweep at the floor
      const pos = clothGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        const t = (y + clothH / 2) / clothH // 0 bottom, 1 top
        const wave = Math.sin(x * 2.1) * 0.012 + Math.sin(x * 5.3 + 1.1) * 0.006
        const sweep = Math.pow(1 - t, 3) * 0.34
        pos.setZ(i, wave * (0.35 + t * 0.65) + sweep)
      }
      pos.needsUpdate = true
      clothGeo.computeVertexNormals()
      clothGeo.translate(0, -clothH / 2, 0) // pivot at the top edge
    }
    backdropCloth = mesh(clothGeo, mats.velvet, { cast: true, receive: true })
    backdropCloth.material = mats.velvet.clone()
    ;(backdropCloth.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
    backdropCloth.position.set(rollX, rollY - 0.05, WALL_N + 0.16)
    backdropCloth.name = 'backdrop-cloth'
    backdropRoll.add(backdropCloth)

    group.add(backdropRoll)
  }

  // ============================================================ posing chair
  const posingChair = chair(mats, 0.45)
  posingChair.position.set(-0.62, 0, -1.42)
  // turned to face the wall - one of the three differences from the 1985 print
  posingChair.rotation.y = Math.PI * 0.98
  group.add(posingChair)
  const chairCushion = posingChair.getObjectByName('cushion') as THREE.Mesh

  // ============================================================= view camera
  const viewCamera = new THREE.Group()
  const tripodDrawer = new THREE.Group()
  const lensInDrawer = new THREE.Group()
  let groundGlass!: THREE.Mesh
  let cameraBellows!: THREE.Mesh
  {
    // --- tripod: three splayed legs and a column
    const legLen = 1.24
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4
      const leg = new THREE.Group()
      const upper = mesh(texturedBox(0.036, legLen * 0.6, 0.03, 2), mats.woodDark)
      upper.position.y = -legLen * 0.3
      leg.add(upper)
      const lower = mesh(texturedBox(0.026, legLen * 0.55, 0.022, 2), mats.woodDark)
      lower.position.y = -legLen * 0.78
      leg.add(lower)
      const collar = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 10), mats.brassDull, { cast: false })
      collar.position.y = -legLen * 0.58
      leg.add(collar)
      const foot = mesh(new THREE.ConeGeometry(0.018, 0.05, 8), mats.steelDark, { cast: false })
      foot.position.y = -legLen * 1.045
      foot.rotation.x = Math.PI
      leg.add(foot)
      leg.position.set(Math.cos(a) * 0.055, legLen, Math.sin(a) * 0.055)
      leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3)
      viewCamera.add(leg)
    }
    const column = mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.34, 14), mats.woodDark)
    column.position.y = 1.22
    viewCamera.add(column)
    const head = mesh(roundedBox(0.17, 0.06, 0.15, 0.01, 2, 2), mats.steelDark)
    head.position.y = 1.4
    viewCamera.add(head)

    // --- accessory case, banded to the front of the tripod column
    //
    // The drawer used to be described as "built into the column" and was
    // 0.15 x 0.09 x 0.15 - a box wider and deeper than the 0.10 column it was
    // supposed to live inside, sliding out of thin air with no carcase behind
    // it. It is now what it would really be: a small wooden accessory case
    // bracketed to the front of the column by two steel bands, with the drawer
    // running in it.
    const CASE_W = 0.19
    const CASE_H = 0.13
    const CASE_D = 0.16
    // Back plate sits against the front of the column (radius 0.05 at this
    // height), so the case hangs off it rather than through it.
    const CASE_Z = 0.05 + CASE_D / 2
    const CASE_FRONT = CASE_Z + CASE_D / 2
    {
      const t = 0.01
      const carcase = new THREE.Group()
      const plate = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
        const m = mesh(texturedBox(w, h, d, 2), mats.woodDark)
        m.position.set(x, y, z)
        carcase.add(m)
      }
      plate(CASE_W, t, CASE_D, 0, CASE_H / 2 - t / 2, 0)
      plate(CASE_W, t, CASE_D, 0, -CASE_H / 2 + t / 2, 0)
      plate(t, CASE_H - t * 2, CASE_D, -CASE_W / 2 + t / 2, 0, 0)
      plate(t, CASE_H - t * 2, CASE_D, CASE_W / 2 - t / 2, 0, 0)
      plate(CASE_W, CASE_H, t, 0, 0, -CASE_D / 2 + t / 2)
      carcase.position.set(0, 1.22, CASE_Z)
      viewCamera.add(carcase)
      // The two bands that hold it on, passing round the column.
      for (const by of [0.042, -0.042]) {
        const band = mesh(new THREE.TorusGeometry(0.052, 0.005, 6, 18), mats.steelDark, { cast: false })
        band.rotation.x = Math.PI / 2
        band.position.set(0, 1.22 + by, 0.012)
        viewCamera.add(band)
      }
    }
    {
      const face = mesh(roundedBox(0.15, 0.09, 0.016, 0.005, 2, 2.4), mats.woodMid)
      tripodDrawer.add(face)
      // Sized to run inside the case: 0.13 deep in a 0.16 carcase.
      const inner = new THREE.Group()
      inner.add(boxAt(mats.woodMid, 0.14, 0.008, 0.13, 0, -0.04, -0.073))
      inner.add(boxAt(mats.woodMid, 0.14, 0.07, 0.008, 0, 0, -0.134))
      inner.add(boxAt(mats.woodMid, 0.008, 0.07, 0.13, -0.07, 0, -0.073))
      inner.add(boxAt(mats.woodMid, 0.008, 0.07, 0.13, 0.07, 0, -0.073))
      tripodDrawer.add(inner)
      const pull = mesh(new THREE.TorusGeometry(0.014, 0.0032, 6, 14), mats.brass, { cast: false })
      pull.position.z = 0.012
      tripodDrawer.add(pull)

      // a loose uncoated lens element resting inside
      const el = mesh(
        lathe(
          [
            [0, 0.006],
            [0.014, 0.0055],
            [0.022, 0.0035],
            [0.026, 0],
            [0.022, -0.0035],
            [0.014, -0.0055],
            [0, -0.006],
          ],
          20,
        ),
        new THREE.MeshPhysicalMaterial({
          color: 0xe8f0ea,
          roughness: 0.02,
          metalness: 0,
          transmission: 0,
          ior: 1.62,
          transparent: true,
          opacity: 0.46,
        }),
      )
      el.rotation.x = Math.PI / 2
      lensInDrawer.add(el)
      const rim = mesh(new THREE.TorusGeometry(0.026, 0.0022, 6, 20), mats.brassDull, { cast: false })
      lensInDrawer.add(rim)
      lensInDrawer.position.set(0.012, -0.03, -0.06)
      lensInDrawer.rotation.x = -0.2
      tripodDrawer.add(lensInDrawer)

      // Shut, the face is flush with the mouth of the case.
      const closedZ = CASE_FRONT - 0.008
      tripodDrawer.position.set(0, 1.22, closedZ)
      tripodDrawer.userData.closedZ = closedZ
      tripodDrawer.userData.openZ = closedZ + 0.115
      viewCamera.add(tripodDrawer)
    }

    // --- the camera: rear standard, bellows, front standard, lens
    const rear = mesh(roundedBox(0.28, 0.3, 0.045, 0.008, 2, 2), mats.cameraBody)
    rear.position.set(0, 1.6, 0.11)
    viewCamera.add(rear)

    // ground glass in the rear standard, with a dark cloth hood
    groundGlass = mesh(
      new THREE.PlaneGeometry(0.2, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xb9bfb6,
        roughness: 0.85,
        metalness: 0,
        emissive: 0x14181a,
        emissiveIntensity: 1,
      }),
      { cast: false, receive: false },
    )
    groundGlass.position.set(0, 1.6, 0.135)
    groundGlass.name = 'ground-glass'
    viewCamera.add(groundGlass)
    {
      const hood = mesh(
        extrude(
          [
            [-0.16, -0.17],
            [0.16, -0.17],
            [0.16, 0.17],
            [-0.16, 0.17],
          ],
          0.02,
          { density: 2 },
        ),
        new THREE.MeshStandardMaterial({ color: 0x1a1715, roughness: 0.95, side: THREE.DoubleSide }),
        { cast: true },
      )
      hood.position.set(0, 1.6, 0.15)
      viewCamera.add(hood)
    }

    // bellows: a tapered accordion made from stacked rings
    {
      const rings: THREE.Vector2[] = []
      const segs = 16
      for (let i = 0; i <= segs; i++) {
        const t = i / segs
        const base = 0.13 - t * 0.048
        rings.push(new THREE.Vector2(base + (i % 2 ? 0.012 : 0), t * 0.26))
      }
      const geo = new THREE.LatheGeometry(rings, 4, Math.PI / 4)
      geo.computeVertexNormals()
      cameraBellows = mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0x171513, roughness: 0.92, side: THREE.DoubleSide }),
      )
      cameraBellows.rotation.x = Math.PI / 2
      cameraBellows.position.set(0, 1.6, 0.09)
      cameraBellows.scale.set(1, 1, 1)
      viewCamera.add(cameraBellows)
    }

    const front = mesh(roundedBox(0.19, 0.2, 0.035, 0.006, 2, 2), mats.cameraBody)
    front.position.set(0, 1.6, -0.17)
    viewCamera.add(front)
    const barrel = mesh(
      lathe(
        [
          [0, 0],
          [0.044, 0],
          [0.044, 0.03],
          [0.05, 0.034],
          [0.05, 0.052],
          [0.04, 0.058],
          [0, 0.058],
        ],
        20,
      ),
      mats.chrome,
    )
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 1.6, -0.2)
    viewCamera.add(barrel)
    const glass = mesh(new THREE.CircleGeometry(0.04, 24), new THREE.MeshPhysicalMaterial({
      color: 0x2c3a34,
      roughness: 0.04,
      metalness: 0.1,
      transmission: 0,
      transparent: true,
      opacity: 0.67,
    }), { cast: false })
    glass.rotation.y = Math.PI
    glass.position.set(0, 1.6, -0.262)
    viewCamera.add(glass)

    // focusing rail and knobs
    const rail = mesh(texturedBox(0.05, 0.02, 0.44, 2), mats.steelDark, { cast: false })
    rail.position.set(0, 1.44, -0.03)
    viewCamera.add(rail)
    for (const z of [0.06, -0.14]) {
      const knob = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 16), mats.brass)
      knob.rotation.z = Math.PI / 2
      knob.position.set(0.06, 1.45, z)
      viewCamera.add(knob)
    }

    viewCamera.position.set(1.18, 0, 0.52)
    viewCamera.rotation.y = 0.1
    group.add(viewCamera)
  }

  // ========================================================== portrait wall
  const portraitWall = new THREE.Group()
  {
    const specs: Array<[number, number, number, number, number]> = [
      // x(z along east wall), y, w, h, variant
      [-2.2, 1.86, 0.3, 0.4, 1],
      [-1.72, 1.9, 0.26, 0.34, 2],
      [-2.05, 1.34, 0.42, 0.3, 3],
      [-1.44, 1.36, 0.3, 0.4, 4],
      [-2.34, 0.88, 0.26, 0.34, 5],
      [-1.78, 0.86, 0.34, 0.26, 6],
      [1.62, 1.82, 0.44, 0.32, 7],
      [1.7, 1.28, 0.3, 0.4, 8],
      [2.16, 1.74, 0.26, 0.34, 9],
    ]
    for (const [z, y, w, h, v] of specs) {
      const isGroup = v % 3 === 0
      const tex = isGroup
        ? photoTexture(`pw-g-${v}`, () => groupPhotoCanvas(5, v % 5, { width: 340, height: 240, seed: 500 + v }))
        : photoTexture(`pw-p-${v}`, () => portraitCanvas(v, { width: 220, height: 290 }))
      const f = framedPhoto(mats, tex, w, h, { frame: 0.022, depth: 0.026 })
      f.position.set(WALL_E, y, z)
      f.rotation.y = -Math.PI / 2
      f.rotation.z = ((v * 13) % 7) * 0.002 - 0.006
      portraitWall.add(f)
    }
    group.add(portraitWall)
  }

  // ================================================ the missing wall clock
  const clockGhost = new THREE.Group()
  const crankOnNail = new THREE.Group()
  {
    // an unfaded disc of wallpaper where a clock hung for thirty years
    const c = makeCanvas(256, 256)
    const g = ctx2d(c)
    g.clearRect(0, 0, 256, 256)
    const grad = g.createRadialGradient(128, 128, 96, 128, 128, 124)
    grad.addColorStop(0, 'rgba(206,194,168,0.42)')
    grad.addColorStop(0.82, 'rgba(206,194,168,0.34)')
    grad.addColorStop(1, 'rgba(206,194,168,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(128, 128, 124, 0, Math.PI * 2)
    g.fill()
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    const disc = mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.96 }),
      { cast: false },
    )
    disc.rotation.y = -Math.PI / 2
    clockGhost.add(disc)

    // the nail is still there
    const nail = mesh(new THREE.CylinderGeometry(0.0035, 0.0028, 0.03, 8), mats.steelDark, { cast: true })
    nail.rotation.z = Math.PI / 2
    nail.position.set(-0.014, 0.115, 0)
    clockGhost.add(nail)

    // and the brass crank hangs on it
    {
      const shaft = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10), mats.brass)
      shaft.rotation.z = Math.PI / 2
      crankOnNail.add(shaft)
      const arm = mesh(roundedBox(0.02, 0.17, 0.02, 0.006, 2, 3), mats.brass)
      arm.position.set(0.055, -0.075, 0)
      crankOnNail.add(arm)
      const grip = mesh(lathe([[0.017, 0], [0.019, 0.02], [0.017, 0.06], [0, 0.062]], 12), mats.woodDark)
      grip.rotation.z = Math.PI / 2
      grip.position.set(0.07, -0.155, 0)
      crankOnNail.add(grip)
      const eye = mesh(new THREE.TorusGeometry(0.011, 0.003, 6, 14), mats.brass, { cast: false })
      eye.position.set(-0.014, 0.108, 0)
      eye.rotation.y = Math.PI / 2
      crankOnNail.add(eye)
      crankOnNail.rotation.y = -Math.PI / 2
      crankOnNail.position.set(-0.02, 0.0, 0)
      clockGhost.add(crankOnNail)
    }

    clockGhost.position.set(WALL_E - 0.002, 2.34, (OPENINGS.officeDoor.z0 + OPENINGS.officeDoor.z1) / 2)
    group.add(clockGhost)

    // the door plate below it, exactly as in the 1985 print
    const doorPlate = labelPlate('事務室', 0.16, 0.05, {
      bg: '#7d6f52',
      fg: '#f0e6cc',
      font: '500 34px "Hiragino Mincho ProN", serif',
    })
    doorPlate.rotation.y = -Math.PI / 2
    doorPlate.position.set(WALL_E - 0.002, 2.1, (OPENINGS.officeDoor.z0 + OPENINGS.officeDoor.z1) / 2)
    group.add(doorPlate)

    const darkPlate = labelPlate('暗室　開扉厳禁', 0.22, 0.05, {
      bg: '#5c3a33',
      fg: '#f0dcd0',
      font: '500 30px "Hiragino Mincho ProN", serif',
    })
    darkPlate.rotation.y = Math.PI / 2
    darkPlate.position.set(S.x0 + 0.082, 2.16, (OPENINGS.darkroomDoor.z0 + OPENINGS.darkroomDoor.z1) / 2)
    group.add(darkPlate)
  }

  // ============================================================ studio lamps
  const lampStands: THREE.Group[] = []
  const keyLampBase = new THREE.Group()
  const darkroomKey = new THREE.Group()
  {
    const specs: Array<[number, number, number, number]> = [
      [-2.2, 1.5, 2.5, 0.5],
      [2.3, 1.2, 2.35, -0.6],
      [0.35, 2.28, 1.95, 0.0],
    ]
    specs.forEach(([x, z, h, rot], i) => {
      const stand = new THREE.Group()
      // three-leg base
      for (let l = 0; l < 3; l++) {
        const a = (l / 3) * Math.PI * 2 + 0.7
        const leg = mesh(texturedBox(0.028, 0.02, 0.42, 2), mats.steelDark)
        leg.position.set(Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2)
        leg.rotation.y = -a
        stand.add(leg)
        const castor = mesh(new THREE.SphereGeometry(0.022, 10, 8), mats.rubber, { cast: false })
        castor.position.set(Math.cos(a) * 0.39, 0.022, Math.sin(a) * 0.39)
        stand.add(castor)
      }
      const hub = mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.08, 14), mats.steelDark)
      hub.position.y = 0.04
      stand.add(hub)
      const post = mesh(new THREE.CylinderGeometry(0.019, 0.024, h - 0.1, 12), mats.steelDark)
      post.position.y = (h - 0.1) / 2 + 0.06
      stand.add(post)
      const clamp = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), mats.brassDull, { cast: false })
      clamp.position.y = h * 0.62
      stand.add(clamp)

      // reflector umbrella, opened toward the backdrop
      const umb = mesh(
        lathe(
          [
            [0.0, 0],
            [0.09, -0.03],
            [0.2, -0.09],
            [0.31, -0.2],
            [0.33, -0.24],
            [0.325, -0.245],
            [0.19, -0.1],
            [0.085, -0.04],
            [0, -0.012],
          ],
          20,
        ),
        new THREE.MeshStandardMaterial({ color: 0xd7cdb6, roughness: 0.62, side: THREE.DoubleSide }),
      )
      umb.position.y = h
      umb.rotation.x = Math.PI + 0.55
      umb.rotation.y = rot
      stand.add(umb)

      const socket = mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.07, 12), mats.bakelite)
      socket.position.y = h - 0.02
      stand.add(socket)

      stand.position.set(x, 0, z)
      stand.rotation.y = rot
      group.add(stand)
      lampStands.push(stand)

      // the key light's base is where the darkroom key was left
      if (i === 0) {
        keyLampBase.position.set(x, 0, z)
        group.add(keyLampBase)
        const ring = mesh(new THREE.TorusGeometry(0.021, 0.0032, 8, 20), mats.brassDull)
        ring.rotation.x = -Math.PI / 2
        darkroomKey.add(ring)
        const shank = mesh(texturedBox(0.008, 0.004, 0.052, 3), mats.brassDull)
        shank.position.set(0, 0, 0.04)
        darkroomKey.add(shank)
        const bit = mesh(texturedBox(0.016, 0.004, 0.012, 3), mats.brassDull)
        bit.position.set(0.006, 0, 0.06)
        darkroomKey.add(bit)
        const tag = mesh(new THREE.PlaneGeometry(0.036, 0.024), mats.paper, { cast: false })
        tag.rotation.x = -Math.PI / 2
        tag.position.set(-0.03, 0.001, -0.012)
        darkroomKey.add(tag)
        darkroomKey.position.set(x + 0.06, 0.012, z + 0.04)
        darkroomKey.rotation.y = 0.6
        group.add(darkroomKey)
      }
    })
  }

  // ============================================================ dressing
  {
    // a reflector board leaning against the west wall
    const board = mesh(texturedBox(0.9, 1.3, 0.03, 1.2), new THREE.MeshStandardMaterial({
      color: 0xcfc6ae,
      roughness: 0.7,
    }))
    board.position.set(S.x0 + 0.34, 0.66, 1.5)
    board.rotation.set(0, Math.PI / 2, 0.16)
    group.add(board)

    // a posing table with a vase
    const table = new THREE.Group()
    for (const [x, z] of [
      [-0.12, -0.1],
      [0.12, -0.1],
      [-0.12, 0.1],
      [0.12, 0.1],
    ]) {
      const l = mesh(lathe([[0.014, 0], [0.018, 0.05], [0.012, 0.4], [0.016, 0.62], [0, 0.62]], 10), mats.woodDark)
      l.position.set(x, 0, z)
      table.add(l)
    }
    const ttop = mesh(lathe([[0.19, 0], [0.19, 0.018], [0.175, 0.024], [0, 0.024]], 22), mats.woodDark)
    ttop.position.y = 0.62
    table.add(ttop)
    table.position.set(0.42, 0, -1.9)
    group.add(table)
    const vase = mesh(
      lathe([[0, 0], [0.05, 0], [0.055, 0.04], [0.038, 0.13], [0.045, 0.19], [0.038, 0.2], [0.03, 0.19], [0.03, 0.13], [0.046, 0.05], [0.042, 0.005], [0, 0.004]], 20),
      new THREE.MeshStandardMaterial({ color: 0x35424a, roughness: 0.3, metalness: 0.05 }),
    )
    vase.position.set(0.42, 0.644, -1.9)
    group.add(vase)

    // cables snaking to the lamp stands
    for (const [x0, z0, x1, z1] of [
      [-2.2, 1.5, -3.0, 2.4],
      [2.3, 1.2, 3.0, 2.3],
    ] as Array<[number, number, number, number]>) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 12; i++) {
        const t = i / 12
        pts.push(
          new THREE.Vector3(
            x0 + (x1 - x0) * t + Math.sin(t * 6) * 0.07,
            // Lying on the boards, not floating a centimetre over them: the
            // tube radius is 0.007, so its axis belongs at that height.
            0.007,
            z0 + (z1 - z0) * t + Math.cos(t * 5) * 0.09,
          ),
        )
      }
      const curve = new THREE.CatmullRomCurve3(pts)
      const cable = mesh(new THREE.TubeGeometry(curve, 40, 0.007, 6, false), mats.rubber, { cast: false })
      group.add(cable)
    }

    // a stack of film holders on a low crate
    const crate = mesh(texturedBox(0.44, 0.3, 0.32, 1.6), mats.woodMid)
    crate.position.set(2.5, 0.15, -1.7)
    group.add(crate)
    for (let i = 0; i < 3; i++) {
      const holder = mesh(roundedBox(0.26, 0.02, 0.21, 0.004, 2, 2.4), mats.cameraBody)
      holder.position.set(2.5, 0.31 + i * 0.022, -1.7)
      holder.rotation.y = i * 0.04
      group.add(holder)
    }

    // a print left on the floor under the chair, face down
    const stray = loosePrint(
      photoTexture('stray-print', () => portraitCanvas(21, { width: 200, height: 260, age: 0.5 })),
      0.14,
      0.18,
    )
    stray.rotation.set(-Math.PI / 2, 0, 0.7)
    stray.position.set(-1.15, 0.004, -1.05)
    group.add(stray)
  }

  // ============================================== phosphorescent mark + dust
  const phosphor = phosphorMark('を', 0.26)
  phosphor.rotation.y = Math.PI / 2
  phosphor.position.set(S.x0 + 0.085, 1.42, 0.9)
  group.add(phosphor)

  const dust = dustMotes(240, new THREE.Vector3(5.6, 3.2, 4.6), 17)
  dust.position.set(0, 0.2, 0)
  group.add(dust)

  return {
    group,
    backdropCloth,
    backdropRoll,
    crankSocket,
    crankFitted,
    chronicleWall,
    chronicleSlots,
    mirrorText,
    posingChair,
    chairCushion,
    viewCamera,
    groundGlass,
    cameraBellows,
    tripodDrawer,
    lensInDrawer,
    clockGhost,
    crankOnNail,
    portraitWall,
    lampStands,
    keyLampBase,
    darkroomKey,
    phosphor,
    dust,
  }
}
