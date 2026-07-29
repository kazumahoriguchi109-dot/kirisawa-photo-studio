import * as THREE from 'three'
import { lathe, mesh, roundedBox, texturedBox } from '../Geo'
import type { MaterialLibrary } from '../Materials'
import { OPENINGS, ROOM } from '../Layout'
import { bottle, labelPlate, liquid, loosePrint, phosphorMark, shelfUnit, tray } from './Common'
import {
  negativeCanvas,
  photoTexture,
  portraitCanvas,
  studioRecordCanvas,
  unexposedPrintCanvas,
} from '../Photographs'
import { ctx2d, makeCanvas } from '../Textures'

/**
 * 暗室 - the working heart of the building. Low ceiling, wet bench, one red
 * lamp. Everything in here is a tool that still works.
 */

export interface DarkroomProps {
  group: THREE.Group
  /** Four enamel trays, currently in the wrong order on the bench. */
  trays: THREE.Group[]
  trayLabels: THREE.Mesh[]
  /** Liquid surface in the developer tray, hidden until it is mixed. */
  developerLiquid: THREE.Mesh
  enlarger: THREE.Group
  enlargerHead: THREE.Group
  enlargerLampGlow: THREE.Mesh
  /** The wall the enlarger throws its image onto. */
  projectionScreen: THREE.Mesh
  negativeCarrier: THREE.Group
  safelight: THREE.Group
  safelightSwitch: THREE.Group
  chemShelf: THREE.Group
  powderTin: THREE.Group
  waterBottle: THREE.Group
  dryingLine: THREE.Group
  negativeSleeve: THREE.Group
  officeKey: THREE.Group
  underBenchStore: THREE.Group
  /** Face-down print inside it, shown once the shelf has been opened. */
  understorePrint: THREE.Mesh
  timer: THREE.Group
  clock: THREE.Group
  phosphor: THREE.Mesh
  developedPrint: THREE.Mesh
  printPeg: THREE.Group
}

const D = ROOM.darkroom
const BENCH_Y = 0.92

export function buildDarkroom(mats: MaterialLibrary): DarkroomProps {
  const group = new THREE.Group()
  group.name = 'props-darkroom'
  let underBenchStore!: THREE.Group
  let understorePrint!: THREE.Mesh

  // ------------------------------------------------------------- wet bench
  {
    const bw = 2.9
    const bd = 0.62
    const cx = -4.95
    const cz = D.z0 + 0.42
    const topM = mesh(texturedBox(bw, 0.045, bd, 1.6), mats.woodMid)
    topM.position.set(cx, BENCH_Y, cz)
    group.add(topM)
    // zinc lining, stained
    const zinc = mesh(texturedBox(bw - 0.04, 0.006, bd - 0.04, 2.4), new THREE.MeshStandardMaterial({
      color: 0x8b8f8c,
      roughness: 0.44,
      metalness: 0.5,
    }), { cast: false })
    zinc.position.set(cx, BENCH_Y + 0.026, cz)
    group.add(zinc)
    for (const x of [cx - bw / 2 + 0.08, cx, cx + bw / 2 - 0.08]) {
      const leg = mesh(texturedBox(0.06, BENCH_Y - 0.02, 0.06, 2), mats.woodDark)
      leg.position.set(x, (BENCH_Y - 0.02) / 2, cz + bd / 2 - 0.08)
      group.add(leg)
      const leg2 = leg.clone()
      leg2.position.z = cz - bd / 2 + 0.08
      group.add(leg2)
    }
    const rail = mesh(texturedBox(bw - 0.1, 0.08, 0.024, 2), mats.woodDark, { cast: false })
    rail.position.set(cx, 0.28, cz + bd / 2 - 0.08)
    group.add(rail)
    // under-bench storage
    underBenchStore = shelfUnit(mats, 0.86, 0.72, 0.5, 2, true)
    underBenchStore.position.set(cx + 0.9, 0.06, cz)
    group.add(underBenchStore)
    // The photograph that is in there, face-down on the middle shelf.
    //
    // It had no mesh at all: the print was handed over on a SECOND click of the
    // shelf, with nothing on screen between the two clicks to say a photograph
    // was there. After a reload there was no way to tell the shelf had already
    // been opened, and the take read as re-examining furniture.
    understorePrint = loosePrint(
      photoTexture('understore-print-back', () => unexposedPrintCanvas({ width: 200, height: 260 })),
      0.11,
      0.145,
    )
    understorePrint.rotation.x = -Math.PI / 2
    understorePrint.rotation.z = 0.22
    understorePrint.position.set(cx + 0.98, 0.44, cz + 0.06)
    understorePrint.visible = false
    group.add(understorePrint)
  }

  // -------------------------------------------------------------- the trays
  const trays: THREE.Group[] = []
  const trayLabels: THREE.Mesh[] = []
  let developerLiquid!: THREE.Mesh
  {
    // Physically they sit left to right, but someone has moved them. The label
    // on each tray is the truth; their positions are not.
    // Someone has shuffled them. The labels are the truth; the positions lie.
    const order = ['現像', '定着', '水洗', '停止']
    const startX = -6.22
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Group()
      const body = tray(mats, 0.42, 0.34, 0.07)
      t.add(body)
      const lab = labelPlate(order[i], 0.16, 0.045, {
        bg: '#e2ded2',
        fg: '#2a231a',
        font: '500 34px "Hiragino Mincho ProN", serif',
      })
      lab.rotation.x = -Math.PI / 2
      lab.position.set(0, 0.081, 0.12)
      t.add(lab)
      trayLabels.push(lab)
      // residue of dried chemistry in three of them
      if (i !== 0) {
        const dried = liquid(0.38, 0.3, i === 1 ? 0x6b6350 : 0x4b4a40, 0.55)
        dried.position.y = 0.012
        t.add(dried)
      } else {
        developerLiquid = liquid(0.38, 0.3, 0x4a4636, 0.9)
        developerLiquid.position.y = 0.038
        developerLiquid.visible = false
        t.add(developerLiquid)
      }
      t.position.set(startX + i * 0.5, BENCH_Y + 0.03, D.z0 + 0.42)
      t.rotation.y = (i % 2 ? 1 : -1) * 0.02
      t.name = `tray-${i}`
      group.add(t)
      trays.push(t)
    }

    // print tongs, one per tray, resting on the bench rail
    for (let i = 0; i < 3; i++) {
      const tong = new THREE.Group()
      for (const s of [-1, 1]) {
        const arm = mesh(texturedBox(0.006, 0.006, 0.19, 3), new THREE.MeshStandardMaterial({
          color: i === 0 ? 0x9a3b2c : i === 1 ? 0x2f4a33 : 0x3a3f52,
          roughness: 0.6,
        }))
        arm.position.set(s * 0.008, 0, 0)
        arm.rotation.x = s * 0.06
        tong.add(arm)
      }
      tong.position.set(-6.05 + i * 0.5, BENCH_Y + 0.06, D.z0 + 0.76)
      tong.rotation.y = 0.3 + i * 0.2
      group.add(tong)
    }
  }

  // ---------------------------------------------------------------- enlarger
  const enlarger = new THREE.Group()
  const enlargerHead = new THREE.Group()
  const negativeCarrier = new THREE.Group()
  let enlargerLampGlow!: THREE.Mesh
  {
    // A horizontal-projection enlarger: the head is rotated off the column so
    // big prints could be made against the wall. That is why it can throw an
    // image the player can walk up to.
    const base = mesh(roundedBox(0.5, 0.05, 0.42, 0.008, 2, 1.8), mats.woodDark)
    base.position.set(0, 0.025, 0)
    enlarger.add(base)
    const column = mesh(texturedBox(0.05, 1.12, 0.07, 2), mats.steelDark)
    column.position.set(-0.18, 0.6, -0.14)
    enlarger.add(column)
    const collar = mesh(roundedBox(0.11, 0.09, 0.12, 0.008, 2, 2.4), mats.steelDark)
    collar.position.set(-0.18, 0.86, -0.06)
    enlarger.add(collar)
    const knob = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.016, 16), mats.bakelite)
    knob.rotation.z = Math.PI / 2
    knob.position.set(-0.25, 0.86, -0.06)
    enlarger.add(knob)
    // The spindle it turns. The knob's inner face was at -0.242 and the collar's
    // outer face at -0.235, so the height wheel hung in the air beside the
    // casting it is supposed to drive.
    const spindle = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 10), mats.steelDark, {
      cast: false,
    })
    spindle.rotation.z = Math.PI / 2
    spindle.position.set(-0.213, 0.86, -0.06)
    enlarger.add(spindle)
    // The cast arm from the collar out to the head. Without it the head hung
    // 0.18 to the side of the collar and 0.12 in front of it with clear air in
    // between - the lamphouse floating unsupported beside its own column.
    const armCast = mesh(roundedBox(0.22, 0.052, 0.16, 0.008, 2, 2.4), mats.steelDark)
    armCast.position.set(-0.08, 0.86, -0.01)
    enlarger.add(armCast)

    // head: lamphouse, condenser, negative stage, lens
    const lamphouse = mesh(
      lathe(
        [
          [0, 0],
          [0.085, 0.002],
          [0.095, 0.03],
          [0.095, 0.16],
          [0.07, 0.19],
          [0, 0.19],
        ],
        20,
      ),
      mats.cameraBody,
    )
    lamphouse.rotation.x = Math.PI / 2
    lamphouse.position.set(0, 0, -0.12)
    enlargerHead.add(lamphouse)
    const vent = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), mats.steelDark, { cast: false })
    vent.position.set(0, 0.1, -0.24)
    enlargerHead.add(vent)

    const stage = mesh(roundedBox(0.19, 0.03, 0.16, 0.004, 2, 2.4), mats.cameraBody)
    stage.position.set(0, 0, 0.02)
    enlargerHead.add(stage)
    // the negative carrier drawer that slides into the stage
    {
      const frame = mesh(roundedBox(0.16, 0.016, 0.13, 0.003, 2, 3), mats.steelDark)
      negativeCarrier.add(frame)
      const window = mesh(new THREE.PlaneGeometry(0.075, 0.06), new THREE.MeshBasicMaterial({ color: 0x000000 }), {
        cast: false,
        receive: false,
      })
      window.rotation.x = -Math.PI / 2
      window.position.y = 0.009
      window.name = 'carrier-window'
      negativeCarrier.add(window)
      negativeCarrier.position.set(0, 0, 0.02)
      enlargerHead.add(negativeCarrier)
    }

    const bellows = mesh(
      (() => {
        const pts: THREE.Vector2[] = []
        for (let i = 0; i <= 10; i++) {
          const t = i / 10
          pts.push(new THREE.Vector2(0.062 - t * 0.016 + (i % 2 ? 0.008 : 0), t * 0.11))
        }
        const g = new THREE.LatheGeometry(pts, 4, Math.PI / 4)
        g.computeVertexNormals()
        return g
      })(),
      new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.94, side: THREE.DoubleSide }),
    )
    bellows.rotation.x = -Math.PI / 2
    bellows.position.set(0, 0, 0.04)
    enlargerHead.add(bellows)

    const lensBarrel = mesh(
      lathe([[0, 0], [0.034, 0], [0.034, 0.026], [0.038, 0.03], [0.038, 0.048], [0, 0.05]], 18),
      mats.chrome,
    )
    lensBarrel.rotation.x = -Math.PI / 2
    lensBarrel.position.set(0, 0, 0.16)
    enlargerHead.add(lensBarrel)

    enlargerLampGlow = mesh(
      new THREE.SphereGeometry(0.03, 12, 10),
      new THREE.MeshStandardMaterial({
        color: 0x2a2620,
        emissive: 0xfff2d8,
        emissiveIntensity: 0,
        roughness: 0.4,
      }),
      { cast: false, receive: false },
    )
    enlargerLampGlow.position.set(0, 0, -0.1)
    enlargerHead.add(enlargerLampGlow)

    // The head is swung a quarter turn off the column so the image lands on the
    // west wall instead of the baseboard - how you make a print bigger than the
    // bench in a room this small.
    enlargerHead.position.set(0, 0.86, 0.06)
    enlargerHead.rotation.y = -Math.PI / 2
    enlarger.add(enlargerHead)

    // mains flex to a wall socket
    const flex = mesh(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.2, 0.95, -0.2),
        new THREE.Vector3(-0.34, 0.6, -0.3),
        new THREE.Vector3(-0.36, 0.06, -0.34),
      ]),
      16,
      0.006,
      6,
      false,
    ), mats.rubber, { cast: false })
    enlarger.add(flex)

    enlarger.position.set(-5.62, BENCH_Y * 0 + 0.0, -1.15)
    // stands on its own bench
    const eb = mesh(texturedBox(0.9, 0.78, 0.6, 1.6), mats.woodMid)
    eb.position.set(-5.62, 0.39, -1.15)
    group.add(eb)
    enlarger.position.y = 0.78
    group.add(enlarger)
  }

  // the wall the enlarger points at, given a faintly brighter patch of paint
  const projectionScreen = mesh(
    new THREE.PlaneGeometry(1.5, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    { cast: false, receive: false },
  )
  projectionScreen.position.set(D.x0 + 0.09, 1.42, -1.15)
  projectionScreen.rotation.y = Math.PI / 2
  projectionScreen.name = 'projection-screen'
  group.add(projectionScreen)
  {
    const patch = mesh(
      new THREE.PlaneGeometry(1.7, 1.3),
      new THREE.MeshStandardMaterial({ color: 0xc8bda6, roughness: 0.95 }),
      { cast: false },
    )
    patch.position.set(D.x0 + 0.087, 1.42, -1.15)
    patch.rotation.y = Math.PI / 2
    group.add(patch)
  }

  // ------------------------------------------------------------- safelight
  const safelight = new THREE.Group()
  {
    const bodyM = mesh(
      lathe([[0, 0], [0.07, 0], [0.082, 0.04], [0.082, 0.1], [0.05, 0.12], [0, 0.12]], 18),
      mats.steelDark,
    )
    bodyM.rotation.x = -Math.PI / 2
    safelight.add(bodyM)
    const lens = mesh(new THREE.CircleGeometry(0.068, 22), mats.safelightGlass.clone(), { cast: false })
    lens.position.z = 0.006
    lens.name = 'safelight-lens'
    safelight.add(lens)
    const bracket = mesh(texturedBox(0.05, 0.12, 0.02, 3), mats.steelDark, { cast: false })
    bracket.position.set(0, 0.09, -0.08)
    safelight.add(bracket)
    safelight.position.set(-5.0, 2.06, D.z0 + 0.1)
    group.add(safelight)
  }

  const safelightSwitch = new THREE.Group()
  {
    const box = mesh(roundedBox(0.1, 0.15, 0.05, 0.008, 2, 3), mats.bakelite)
    safelightSwitch.add(box)
    // A throw lever on a pivot, not a chip of red glued to the front.
    //
    // It was a 3 cm block sitting at z = 0.03 on a case whose front face is at
    // 0.025, so half of it was inside the case and about 2 cm of red tip stood
    // out - and the game rotated that block about its own centre, which spins
    // it on the spot instead of swinging it. A player told to find a lever with
    // a red handle was looking for something with a handle.
    const red = new THREE.MeshStandardMaterial({ color: 0xb4432f, roughness: 0.42 })
    const boss = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.036, 12), mats.brassDull)
    boss.rotation.z = Math.PI / 2
    boss.position.set(0, 0.048, 0.032)
    safelightSwitch.add(boss)

    // The animated node is the pivot itself, so the game's rotation.x swings the
    // arm about the boss. The arm inside it is pre-tilted out of the case, which
    // is what keeps both ends of the throw clear of the plate.
    const lever = new THREE.Group()
    lever.position.set(0, 0.048, 0.032)
    lever.rotation.x = 0.5
    lever.name = 'lever'
    const swing = new THREE.Group()
    swing.rotation.x = -0.6
    const armLen = 0.085
    const arm = mesh(roundedBox(0.024, armLen, 0.024, 0.006, 2, 4), red)
    arm.position.y = -armLen / 2
    swing.add(arm)
    const ball = mesh(new THREE.SphereGeometry(0.017, 14, 10), red)
    ball.position.y = -armLen - 0.006
    swing.add(ball)
    lever.add(swing)
    safelightSwitch.add(lever)
    const lab = labelPlate('安全灯', 0.09, 0.03, {
      bg: '#3a2a24',
      fg: '#e8d2c8',
      font: '500 30px "Hiragino Mincho ProN", serif',
    })
    lab.position.set(0, 0.055, 0.026)
    safelightSwitch.add(lab)
    // Faces into the room. Turned the other way the box, the lever and the
    // label all grew toward +x - which here is the inside of a 16 cm wall whose
    // room-side face is at -3.28, so nine tenths of the safelight lever was
    // buried in masonry. It is a switch the player has to find and pull.
    safelightSwitch.position.set(D.x1 - 0.12, 1.42, OPENINGS.darkroomDoor.z1 + 0.24)
    safelightSwitch.rotation.y = -Math.PI / 2
    group.add(safelightSwitch)
  }

  // ---------------------------------------------------------- chemical shelf
  const chemShelf = shelfUnit(mats, 1.5, 0.92, 0.26, 3, true)
  chemShelf.position.set(-4.4, 1.24, D.z1 - 0.13)
  chemShelf.rotation.y = Math.PI
  group.add(chemShelf)

  // Top face of the shelf the chemicals stand on, derived from the unit rather
  // than guessed. Everything on this shelf was placed at y = 1.50-1.55 against
  // a board whose surface is at 1.5587, so the bottles were sunk a centimetre
  // into it and the developer tin - the one the puzzle needs - stood with half
  // its height inside the plank.
  const CHEM_SHELF_Y = 1.24 + 0.92 / 3 + 0.024 / 2

  const powderTin = new THREE.Group()
  const waterBottle = bottle(mats, 0.24, 0.05, '蒸留水', 0x2e3a42)
  {
    // brown bottles in a neat row, one space empty at the right-hand end
    const names = ['定着', '停止', '硬膜', '調色', '減力']
    names.forEach((n, i) => {
      const b = bottle(mats, 0.17 + (i % 2) * 0.03, 0.037, n)
      b.position.set(-5.02 + i * 0.14, CHEM_SHELF_Y, D.z1 - 0.2)
      group.add(b)
    })

    // the powdered developer tin
    const canBody = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 22), new THREE.MeshStandardMaterial({
      color: 0x8d6a3f,
      roughness: 0.6,
      metalness: 0.35,
    }))
    canBody.position.y = 0.065
    powderTin.add(canBody)
    const lid = mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.012, 22), mats.steelDark)
    lid.position.y = 0.135
    powderTin.add(lid)
    const wrap = mesh(
      new THREE.CylinderGeometry(0.0555, 0.0555, 0.1, 24, 1, true),
      new THREE.MeshStandardMaterial({
        map: (() => {
          const c = makeCanvas(512, 256)
          const g = ctx2d(c)
          g.fillStyle = '#d9caa4'
          g.fillRect(0, 0, 512, 256)
          g.fillStyle = '#2a2117'
          g.font = '600 64px "Hiragino Mincho ProN", serif'
          g.textAlign = 'center'
          g.fillText('現像剤', 256, 108)
          g.font = '400 30px "Hiragino Sans", sans-serif'
          g.fillStyle = 'rgba(42,33,23,0.7)'
          g.fillText('粉末　一リットル用', 256, 158)
          g.strokeStyle = 'rgba(42,33,23,0.4)'
          g.lineWidth = 3
          g.strokeRect(24, 26, 464, 204)
          const t2 = new THREE.CanvasTexture(c)
          t2.colorSpace = THREE.SRGBColorSpace
          return t2
        })(),
        roughness: 0.72,
        side: THREE.DoubleSide,
      }),
      { cast: false },
    )
    wrap.position.y = 0.065
    powderTin.add(wrap)
    powderTin.position.set(-3.92, CHEM_SHELF_Y, D.z1 - 0.2)
    group.add(powderTin)

    waterBottle.position.set(-4.2, CHEM_SHELF_Y, D.z1 - 0.2)
    group.add(waterBottle)

    // a graduated measuring cylinder and a stirring rod
    const cyl = mesh(
      lathe([[0, 0], [0.035, 0], [0.035, 0.005], [0.028, 0.012], [0.028, 0.2], [0.032, 0.21], [0, 0.212]], 20),
      new THREE.MeshPhysicalMaterial({
        color: 0xdfe6e6,
        roughness: 0.05,
        transmission: 0,
        transparent: true,
        opacity: 0.4,
      }),
    )
    cyl.position.set(-4.62, BENCH_Y + 0.03, D.z0 + 0.62)
    group.add(cyl)
  }

  // ------------------------------------------------------------ drying line
  const dryingLine = new THREE.Group()
  const printPeg = new THREE.Group()
  let developedPrint!: THREE.Mesh
  {
    const y = 1.94
    const z = -0.72
    const line = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 3.0, 6), new THREE.MeshStandardMaterial({
      color: 0xa89d84,
      roughness: 0.9,
    }), { cast: false })
    line.rotation.z = Math.PI / 2
    line.position.set(-4.95, y, z)
    dryingLine.add(line)
    for (let i = 0; i < 6; i++) {
      const peg = new THREE.Group()
      for (const s of [-1, 1]) {
        const half = mesh(texturedBox(0.008, 0.05, 0.012, 3), mats.woodMid, { cast: false })
        half.position.set(0, -0.018, s * 0.006)
        peg.add(half)
      }
      const spring = mesh(new THREE.TorusGeometry(0.006, 0.0016, 5, 10), mats.brassDull, { cast: false })
      spring.rotation.y = Math.PI / 2
      peg.add(spring)
      peg.position.set(-6.2 + i * 0.5, y, z)
      // two of them are stained where a print hung too long
      dryingLine.add(peg)
      if (i === 4) {
        printPeg.position.copy(peg.position)
      }
    }
    group.add(dryingLine)

    // the final print, hung once it has been developed
    developedPrint = loosePrint(
      photoTexture('last-frame-print', () => {
        // built lazily by the puzzle system; placeholder tone until then
        const c = makeCanvas(4, 4)
        const g = ctx2d(c)
        g.fillStyle = '#0a0a0a'
        g.fillRect(0, 0, 4, 4)
        return c
      }),
      0.26,
      0.2,
    )
    developedPrint.position.set(-4.2, y - 0.12, z)
    developedPrint.visible = false
    group.add(developedPrint)
    printPeg.position.set(-4.2, y, z)
    group.add(printPeg)
  }

  // ----------------------------------------------------------- negative sleeve
  const negativeSleeve = new THREE.Group()
  {
    const sleeve = mesh(
      new THREE.PlaneGeometry(0.16, 0.11),
      new THREE.MeshPhysicalMaterial({
        map: photoTexture('neg-old', () =>
          negativeCanvas(studioRecordCanvas({ past: true, showSafeDial: true, dialValue: 27, width: 420, height: 300, border: 0 })),
        ),
        roughness: 0.18,
        transmission: 0,
        transparent: true,
        opacity: 0.80,
        side: THREE.DoubleSide,
      }),
      { cast: false },
    )
    negativeSleeve.add(sleeve)
    const glassine = mesh(
      new THREE.PlaneGeometry(0.19, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xd8d2bd, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      { cast: false },
    )
    glassine.position.z = -0.001
    negativeSleeve.add(glassine)
    negativeSleeve.position.set(-5.7, 1.82, -0.72)
    negativeSleeve.rotation.set(0.06, 0, 0.04)
    group.add(negativeSleeve)
  }

  // -------------------------------------------------------------- office key
  const officeKey = new THREE.Group()
  {
    const board = mesh(texturedBox(0.16, 0.2, 0.016, 2.4), mats.woodDark, { cast: false })
    officeKey.add(board)
    for (let i = 0; i < 3; i++) {
      const hook = mesh(lathe([[0.004, 0], [0.004, 0.02], [0.009, 0.028], [0, 0.03]], 8), mats.brassDull, { cast: false })
      hook.rotation.x = Math.PI / 2
      hook.position.set(-0.045 + i * 0.045, -0.03, 0.012)
      officeKey.add(hook)
    }
    const key = new THREE.Group()
    const ring = mesh(new THREE.TorusGeometry(0.016, 0.0026, 8, 18), mats.brass)
    key.add(ring)
    const shank = mesh(texturedBox(0.006, 0.042, 0.004, 3), mats.brass)
    shank.position.y = -0.034
    key.add(shank)
    const bit = mesh(texturedBox(0.014, 0.012, 0.004, 3), mats.brass)
    bit.position.set(0.005, -0.05, 0)
    key.add(bit)
    const tag = mesh(new THREE.PlaneGeometry(0.03, 0.02), mats.paper, { cast: false })
    tag.position.set(0.022, 0.006, 0.002)
    key.add(tag)
    key.position.set(0.0, -0.055, 0.024)
    key.name = 'office-key'
    officeKey.add(key)
    officeKey.position.set(D.x1 - 0.12, 1.46, OPENINGS.darkroomDoor.z0 - 0.28)
    officeKey.rotation.y = -Math.PI / 2
    group.add(officeKey)
  }

  // ------------------------------------------------------ timer and clock
  const timer = new THREE.Group()
  {
    const bodyM = mesh(roundedBox(0.15, 0.15, 0.06, 0.012, 2, 2.6), mats.bakelite)
    timer.add(bodyM)
    const face = mesh(new THREE.CircleGeometry(0.058, 30), new THREE.MeshStandardMaterial({
      map: (() => {
        const c = makeCanvas(256, 256)
        const g = ctx2d(c)
        g.fillStyle = '#e6dcc2'
        g.beginPath()
        g.arc(128, 128, 128, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#2a2117'
        g.fillStyle = '#2a2117'
        g.lineWidth = 2
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2
          const r0 = i % 5 === 0 ? 100 : 110
          g.beginPath()
          g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0)
          g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118)
          g.stroke()
        }
        g.font = '500 22px "Hiragino Sans", sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        // The engraved working times, in the order they are used. This is the
        // second half of the four-step clue.
        g.fillText('現像 九〇秒', 128, 78)
        g.fillText('停止 一〇秒', 128, 128)
        g.fillText('定着 三〇〇秒', 128, 178)
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        return t
      })(),
      roughness: 0.5,
    }), { cast: false })
    face.position.z = 0.031
    timer.add(face)
    const bezel = mesh(new THREE.TorusGeometry(0.06, 0.006, 8, 30), mats.chrome, { cast: false })
    bezel.position.z = 0.031
    timer.add(bezel)
    const dialKnob = mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.02, 16), mats.bakelite)
    dialKnob.rotation.x = Math.PI / 2
    dialKnob.position.set(0, -0.09, 0.01)
    timer.add(dialKnob)
    timer.position.set(-5.62, 1.46, D.z0 + 0.09)
    group.add(timer)
  }

  const clock = new THREE.Group()
  {
    const case_ = mesh(lathe([[0, 0], [0.09, 0], [0.095, 0.02], [0.095, 0.05], [0, 0.05]], 24), mats.bakelite)
    case_.rotation.x = -Math.PI / 2
    clock.add(case_)
    const face = mesh(new THREE.CircleGeometry(0.082, 30), new THREE.MeshStandardMaterial({
      map: (() => {
        const c = makeCanvas(256, 256)
        const g = ctx2d(c)
        g.fillStyle = '#ddd5c0'
        g.beginPath()
        g.arc(128, 128, 128, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#221c14'
        g.font = '500 26px "Hiragino Sans", sans-serif'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        for (let i = 1; i <= 12; i++) {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2
          g.fillText(String(i), 128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98)
        }
        g.strokeStyle = '#221c14'
        g.lineWidth = 6
        g.beginPath()
        g.moveTo(128, 128)
        g.lineTo(128, 60)
        g.stroke()
        g.lineWidth = 4
        g.beginPath()
        g.moveTo(128, 128)
        g.lineTo(190, 128)
        g.stroke()
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        return t
      })(),
      roughness: 0.48,
    }), { cast: false })
    face.position.z = 0.026
    clock.add(face)
    const second = mesh(texturedBox(0.002, 0.07, 0.002, 6), new THREE.MeshStandardMaterial({ color: 0x8e2f26 }), {
      cast: false,
    })
    second.position.set(0, 0.035, 0.028)
    second.name = 'second-hand'
    clock.add(second)
    clock.position.set(-4.3, 1.98, D.z0 + 0.09)
    group.add(clock)
  }

  // ------------------------------------------------------------- dressing
  {
    // Blackout curtain, pushed to the far side of the door.
    //
    // Hung at z1 + 0.1 it spanned z1 - 0.2 to z1 + 0.4 at x = D.x1 - 0.14, which
    // is two centimetres in front of the safelight switch at z1 + 0.24. The
    // switch the player is told to look for - "a lever with a red handle beside
    // the darkroom door" - was behind a black curtain the whole time.
    const curtain = mesh(
      (() => {
        const g = new THREE.PlaneGeometry(0.22, 2.0, 6, 4)
        const pos = g.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 12) * 0.03)
        pos.needsUpdate = true
        g.computeVertexNormals()
        return g
      })(),
      new THREE.MeshStandardMaterial({ color: 0x14120f, roughness: 0.98, side: THREE.DoubleSide }),
    )
    // Between the jamb and the key board, which ends at z0 - 0.20.
    curtain.position.set(D.x1 - 0.14, 1.02, OPENINGS.darkroomDoor.z0 - 0.05)
    curtain.rotation.y = Math.PI / 2
    group.add(curtain)

    // a deep sink at the far end
    const sink = mesh(texturedBox(0.62, 0.28, 0.5, 1.8), new THREE.MeshStandardMaterial({
      color: 0x9aa09c,
      roughness: 0.34,
      metalness: 0.4,
    }))
    sink.position.set(D.x0 + 0.42, BENCH_Y - 0.1, D.z0 + 0.42)
    group.add(sink)
    const tap = mesh(new THREE.TorusGeometry(0.07, 0.008, 8, 18, Math.PI), mats.chrome)
    tap.position.set(D.x0 + 0.42, BENCH_Y + 0.28, D.z0 + 0.2)
    tap.rotation.y = Math.PI / 2
    group.add(tap)
    const riser = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 10), mats.chrome, { cast: false })
    riser.position.set(D.x0 + 0.42, BENCH_Y + 0.15, D.z0 + 0.13)
    group.add(riser)

    // print washer, print paper boxes
    const boxStack = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const b = mesh(texturedBox(0.3, 0.055, 0.24, 2), new THREE.MeshStandardMaterial({
        color: i === 1 ? 0xc9b98f : 0x3a3c42,
        roughness: 0.78,
      }))
      b.position.set(0, i * 0.058, 0)
      b.rotation.y = i * 0.05
      boxStack.add(b)
    }
    boxStack.position.set(-3.72, BENCH_Y + 0.06, D.z0 + 0.42)
    group.add(boxStack)

    // a stool
    const stool = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const l = mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.62, 8), mats.woodDark)
      l.position.set(Math.cos(a) * 0.14, 0.31, Math.sin(a) * 0.14)
      l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12)
      stool.add(l)
    }
    const seat = mesh(lathe([[0, 0], [0.17, 0], [0.17, 0.03], [0.14, 0.036], [0, 0.036]], 20), mats.woodDark)
    seat.position.y = 0.62
    stool.add(seat)
    stool.position.set(-4.6, 0, -1.35)
    group.add(stool)

    // pinned test strips on the wall above the bench
    for (let i = 0; i < 4; i++) {
      const strip = loosePrint(
        photoTexture(`test-strip-${i}`, () => portraitCanvas(30 + i, { width: 90, height: 200, age: 0.4 + i * 0.12 })),
        0.06,
        0.13,
      )
      // Moved clear of the timer. The row ran to x = -5.70 and the timer's case
      // starts at -5.72, so the last strip and the dial were inside each other
      // on the wall above the bench - the one place in the room the player
      // stands and reads.
      strip.position.set(-6.28 + i * 0.13, 1.52, D.z0 + 0.085)
      strip.rotation.z = (i % 2 ? 1 : -1) * 0.04
      group.add(strip)
    }
  }

  // Not part of the three-mark sequence: this one is Kyoichi warning himself
  // that the trays on the bench are no longer in working order.
  const phosphor = phosphorMark('順は台に非ず　書に在り', 0.16, 5.5)
  phosphor.position.set(-5.3, 1.36, D.z0 + 0.085)
  group.add(phosphor)

  return {
    group,
    trays,
    trayLabels,
    developerLiquid,
    enlarger,
    enlargerHead,
    enlargerLampGlow,
    projectionScreen,
    negativeCarrier,
    safelight,
    safelightSwitch,
    chemShelf,
    powderTin,
    waterBottle,
    dryingLine,
    negativeSleeve,
    officeKey,
    underBenchStore,
    understorePrint,
    timer,
    clock,
    phosphor,
    developedPrint,
    printPeg,
  }
}
