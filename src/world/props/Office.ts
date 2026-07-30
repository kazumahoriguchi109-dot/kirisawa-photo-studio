import * as THREE from 'three'
import { lathe, mesh, roundedBox, texturedBox } from '../Geo'
import type { MaterialLibrary } from '../Materials'
import { ROOM } from '../Layout'
import { chair, labelPlate, ledgerRow, loosePrint, phosphorMark, shelfUnit } from './Common'
import { photoTexture, unexposedPrintCanvas } from '../Photographs'
import { ctx2d, makeCanvas } from '../Textures'

/**
 * 事務室 - where the business of the studio was kept. The safe, the ledgers,
 * and the procedure manual that tells the player what order the work goes in.
 */

export interface OfficeProps {
  group: THREE.Group
  safe: THREE.Group
  safeDial: THREE.Group
  safeDoor: THREE.Group
  safeContents: THREE.Group
  manual: THREE.Mesh
  ledgerOpen: THREE.Mesh
  ledgerBlock: THREE.Mesh
  desk: THREE.Group
  /** Face-down print from the bottom drawer, shown once the desk is opened. */
  deskPrint: THREE.Mesh
  deskLamp: THREE.Group
  phosphor: THREE.Mesh
  letterInSafe: THREE.Mesh
  finalNegative: THREE.Group
}

const O = ROOM.office

export function buildOffice(mats: MaterialLibrary): OfficeProps {
  const group = new THREE.Group()
  group.name = 'props-office'

  // ------------------------------------------------------------------ desk
  const desk = new THREE.Group()
  let deskPrint!: THREE.Mesh
  const deskLamp = new THREE.Group()
  {
    const w = 1.5
    const d = 0.72
    const h = 0.74
    const top = mesh(roundedBox(w, 0.04, d, 0.006, 2, 1.6), mats.woodDark)
    top.position.y = h
    desk.add(top)
    // leather writing inlay
    const inlay = mesh(new THREE.PlaneGeometry(w - 0.24, d - 0.2), new THREE.MeshStandardMaterial({
      color: 0x4a3a2c,
      roughness: 0.82,
    }), { cast: false })
    inlay.rotation.x = -Math.PI / 2
    inlay.position.set(0, h + 0.021, 0)
    desk.add(inlay)
    // pedestals
    for (const s of [-1, 1]) {
      // Up to the underside of the top. At h - 0.06 the pedestals stopped at
      // 0.68 while the top's underside is 0.72, so the desk floated 4 cm.
      const ped = mesh(texturedBox(0.42, h - 0.02, d - 0.06, 1.6), mats.woodMid)
      ped.position.set(s * (w / 2 - 0.24), (h - 0.02) / 2, 0)
      desk.add(ped)
      for (let i = 0; i < 3; i++) {
        const face = mesh(roundedBox(0.38, 0.19, 0.018, 0.004, 2, 2.2), mats.woodDark, { cast: false })
        face.position.set(s * (w / 2 - 0.24), 0.14 + i * 0.21, d / 2 - 0.025)
        desk.add(face)
        const pull = mesh(new THREE.TorusGeometry(0.016, 0.003, 6, 14), mats.brass, { cast: false })
        pull.position.set(s * (w / 2 - 0.24), 0.14 + i * 0.21, d / 2 - 0.012)
        desk.add(pull)
      }
    }
    // The photograph out of the bottom drawer, face-down on the writing inlay.
    //
    // It had no mesh: the print was handed over on a SECOND click of the desk,
    // with nothing on screen between the two clicks to say a photograph existed
    // and no drawer animation to show the desk had been opened. The drawer does
    // not slide, so the print is set out on the desk rather than left in a
    // drawer the player cannot see into - and the line that opens it says so.
    deskPrint = loosePrint(
      photoTexture('desk-print-back', () => unexposedPrintCanvas({ width: 200, height: 260 })),
      0.11,
      0.145,
    )
    deskPrint.rotation.x = -Math.PI / 2
    deskPrint.rotation.z = -0.28
    deskPrint.position.set(0.24, h + 0.026, 0.1)
    deskPrint.visible = false
    desk.add(deskPrint)

    desk.position.set((O.x0 + O.x1) / 2 + 0.1, 0, O.z0 + 0.5)
    // Drawers toward the room. Turned through pi they faced the north wall
    // 0.076 away, so the side the player looks at from 事務机 was the back of
    // the desk and the drawer faces were pressed into plaster.
    desk.rotation.y = 0
    group.add(desk)

    // banker's lamp
    {
      const base = mesh(lathe([[0, 0], [0.07, 0], [0.072, 0.012], [0.03, 0.02], [0.016, 0.026], [0, 0.026]], 20), mats.brassDull)
      deskLamp.add(base)
      const stem = mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.2, 10), mats.brassDull)
      stem.position.y = 0.12
      deskLamp.add(stem)
      const shade = mesh(
        lathe([[0.0, 0.06], [0.05, 0.058], [0.09, 0.03], [0.095, 0], [0.092, 0], [0.088, 0.028], [0.048, 0.054], [0, 0.056]], 22),
        new THREE.MeshStandardMaterial({ color: 0x1e4133, roughness: 0.36, metalness: 0.1, side: THREE.DoubleSide }),
      )
      shade.position.y = 0.22
      shade.scale.set(1.5, 1, 1)
      deskLamp.add(shade)
      deskLamp.position.set(4.62, 0.78, O.z0 + 0.36)
      group.add(deskLamp)
    }

    // desk dressing: an ashtray, a rubber stamp, an inkpad, a pen rest
    const ashtray = mesh(lathe([[0, 0], [0.055, 0], [0.058, 0.008], [0.048, 0.018], [0.044, 0.006], [0, 0.006]], 20), new THREE.MeshPhysicalMaterial({
      color: 0x2d3a3f,
      roughness: 0.12,
      transmission: 0,
      transparent: true,
      opacity: 0.71,
    }))
    ashtray.position.set(5.16, 0.762, O.z0 + 0.68)
    group.add(ashtray)
    const stamp = mesh(lathe([[0, 0], [0.018, 0], [0.018, 0.03], [0.011, 0.036], [0.011, 0.06], [0.016, 0.064], [0, 0.066]], 14), mats.woodDark)
    stamp.position.set(4.98, 0.762, O.z0 + 0.4)
    group.add(stamp)

    const chairO = chair(mats, 0.46)
    chairO.position.set(4.66, 0, O.z0 + 1.35)
    // Facing the desk. chair() seats the sitter toward local +Z, and the desk
    // is at -Z of here, so the chair had its back to the only thing in reach.
    chairO.rotation.y = Math.PI + 0.25
    group.add(chairO)
  }

  // ------------------------------------------------- the appointment ledger
  const ledgerOpen = mesh(
    new THREE.PlaneGeometry(0.42, 0.3),
    new THREE.MeshStandardMaterial({
      map: (() => {
        const c = makeCanvas(560, 400)
        const g = ctx2d(c)
        g.fillStyle = '#ddd2b2'
        g.fillRect(0, 0, 560, 400)
        g.strokeStyle = 'rgba(70,58,40,0.28)'
        g.lineWidth = 1
        for (let i = 1; i < 12; i++) {
          g.beginPath()
          g.moveTo(24, 40 + i * 28)
          g.lineTo(536, 40 + i * 28)
          g.stroke()
        }
        g.beginPath()
        g.moveTo(280, 20)
        g.lineTo(280, 380)
        g.stroke()
        g.fillStyle = '#2a2117'
        g.font = '500 22px "Hiragino Mincho ProN", "Yu Mincho", serif'
        g.fillText('昭和六十年　十一月', 30, 32)
        g.font = '400 17px "Hiragino Mincho ProN", serif'
        const rows = [
          '三日　十時　佐久間様　七五三　済',
          '　　　十三時　東様　見合写真　済',
          '九日　十一時　小田様　結婚記念　済',
          '十日　九時　第二小学校　前撮　済',
          '十六日　十四時　橋本様　遺影　済',
          '二十日　休館　薬品入替',
          '二十三日　十時　灯　七歳　—',
          '二十四日以降　白紙',
        ]
        rows.forEach((r, i) => {
          g.fillStyle = i === 6 ? '#5a2a20' : '#2a2117'
          g.fillText(r, 30, 66 + i * 28)
        })
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        return t
      })(),
      roughness: 0.9,
    }),
    { cast: false },
  )
  ledgerOpen.rotation.x = -Math.PI / 2
  ledgerOpen.rotation.z = 0.06
  ledgerOpen.position.set(4.42, 0.822, O.z0 + 0.52)
  group.add(ledgerOpen)
  const ledgerBlock = mesh(texturedBox(0.44, 0.05, 0.32, 2), mats.paper, { cast: false })
  ledgerBlock.position.set(4.42, 0.795, O.z0 + 0.52)
  ledgerBlock.rotation.y = 0.06
  group.add(ledgerBlock)

  // ------------------------------------------------------------ the shelves
  {
    // Open face into the room, and short of the south wall.
    //
    // At -pi/2 the mouth pointed at the west wall 0.02 away and the plywood
    // back faced the room, so every spine label read into plaster. The unit is
    // 1.5 wide along world Z at this rotation, and centred at z1 - 0.5 it ran
    // from -0.45 to 1.05 through a south wall whose face is at 0.72.
    // Clear of the doorway, at the north end of the west wall.
    //
    // The unit is 1.5 along world Z, so centred at z1 - 1.28 it ran from -1.23
    // to 0.27 - across the whole of the office door's opening at -1.05..-0.15,
    // 0.10 behind the wall. Opening the door from the studio revealed a wall of
    // ledgers where the room should be, and the way through read as blocked.
    // Centred at z0 + 0.85 it runs -2.70..-1.20 and leaves the opening clear.
    const SHELF_Z = O.z0 + 0.85
    const shelf = shelfUnit(mats, 1.5, 1.9, 0.32, 4, true)
    shelf.position.set(O.x0 + 0.26, 0, SHELF_Z)
    shelf.rotation.y = Math.PI / 2
    group.add(shelf)
    for (let i = 0; i < 4; i++) {
      const row = ledgerRow(mats, 6 + i, 0.26)
      // Standing on the boards. shelfUnit's board tops are at 0.012 + 0.475i;
      // the rows sat at 0.045 + 0.475i and floated 33 mm on every shelf.
      row.position.set(O.x0 + 0.26, 0.012 + i * 0.475, SHELF_Z + (i % 2 ? 0.1 : -0.06))
      row.rotation.y = Math.PI / 2
      group.add(row)
    }
    // storage boxes on the top
    for (let i = 0; i < 2; i++) {
      const b = mesh(texturedBox(0.36, 0.2, 0.28, 1.6), new THREE.MeshStandardMaterial({
        color: 0x6b5c44,
        roughness: 0.86,
      }))
      b.position.set(O.x0 + 0.26, 1.94, SHELF_Z - 0.4 + i * 0.42)
      group.add(b)
    }
  }

  // ---------------------------------------------------- procedure manual
  const manual = mesh(
    new THREE.PlaneGeometry(0.36, 0.5),
    new THREE.MeshStandardMaterial({
      map: (() => {
        const c = makeCanvas(480, 660)
        const g = ctx2d(c)
        g.fillStyle = '#e0d5b6'
        g.fillRect(0, 0, 480, 660)
        // scorched along the bottom edge - it was in the building that night
        const grad = g.createLinearGradient(0, 520, 0, 660)
        grad.addColorStop(0, 'rgba(60,40,22,0)')
        grad.addColorStop(1, 'rgba(38,24,12,0.75)')
        g.fillStyle = grad
        g.fillRect(0, 0, 480, 660)
        g.fillStyle = '#241d13'
        g.font = '500 34px "Hiragino Mincho ProN", "Yu Mincho", serif'
        g.textAlign = 'center'
        g.fillText('暗室作業手順', 240, 62)
        g.font = '400 20px "Hiragino Mincho ProN", serif'
        g.textAlign = 'left'
        const lines = [
          '一、撮影　暗袋に入れ暗室へ運ぶ',
          '　　　　　明かりのある所を通らぬこと',
          '',
          '二、現像　現像液に浸す　液温二十度',
          '　　　　　ここで像が出る',
          '',
          '三、停止　停止液に移す　短く',
          '　　　　　飛ばすと像は止まらぬ',
          '',
          '四、定着　十分に浸す',
          '　　　　　ここで初めて光に耐える',
          '',
          '＊ バットは作業台の左から',
          '　 この一二三四の順に並べること',
          '　 並べ直したときはラベルも確かめよ',
          '　 ラベルだけを信じないこと',
        ]
        lines.forEach((l, i) => {
          g.fillStyle = i >= 12 ? '#4a3520' : '#241d13'
          g.fillText(l, 42, 118 + i * 30)
        })
        g.textAlign = 'right'
        g.fillStyle = 'rgba(36,29,19,0.7)'
        g.font = '400 22px "Hiragino Mincho ProN", serif'
        g.fillText('霧沢', 438, 618)
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        return t
      })(),
      roughness: 0.92,
    }),
    { cast: false },
  )
  manual.position.set(4.5, 1.48, O.z1 - 0.085)
  manual.rotation.y = Math.PI
  manual.name = 'procedure-manual'
  group.add(manual)
  {
    for (const [dx, dy] of [
      [-0.16, 0.23],
      [0.16, 0.23],
    ]) {
      const pin = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.014, 8), mats.brassDull, { cast: false })
      pin.rotation.x = Math.PI / 2
      pin.position.set(4.5 + dx, 1.48 + dy, O.z1 - 0.09)
      group.add(pin)
    }
  }

  // ------------------------------------------------------------------ safe
  const safe = new THREE.Group()
  const safeDial = new THREE.Group()
  const safeDoor = new THREE.Group()
  const safeContents = new THREE.Group()
  let letterInSafe!: THREE.Mesh
  const finalNegative = new THREE.Group()
  {
    const w = 0.62
    const h = 0.78
    const d = 0.52
    const bodyM = mesh(roundedBox(w, h, d, 0.014, 2, 1.4), new THREE.MeshStandardMaterial({
      color: 0x2f342f,
      roughness: 0.52,
      metalness: 0.5,
    }))
    bodyM.position.y = h / 2 + 0.06
    safe.add(bodyM)
    // cast plinth
    const plinth = mesh(texturedBox(w + 0.04, 0.06, d + 0.03, 2), mats.steelDark)
    plinth.position.y = 0.03
    safe.add(plinth)
    // gold pinstripe and the maker's name
    const stripe = labelPlate('金庫', 0.16, 0.05, {
      bg: '#2c312c',
      fg: '#c8a45e',
      font: '500 34px "Hiragino Mincho ProN", serif',
    })
    stripe.position.set(0, h - 0.02, d / 2 + 0.006)
    safe.add(stripe)

    // door
    const leaf = mesh(roundedBox(w - 0.06, h - 0.09, 0.05, 0.01, 2, 1.6), new THREE.MeshStandardMaterial({
      color: 0x363b35,
      roughness: 0.46,
      metalness: 0.55,
    }))
    leaf.position.set((w - 0.06) / 2, 0, 0)
    safeDoor.add(leaf)
    // dial
    {
      const boss = mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.02, 28), mats.brassDull)
      boss.rotation.x = Math.PI / 2
      boss.position.z = 0.028
      safeDial.add(boss)
      const face = mesh(new THREE.CircleGeometry(0.072, 40), new THREE.MeshStandardMaterial({
        map: (() => {
          const c = makeCanvas(320, 320)
          const g = ctx2d(c)
          g.fillStyle = '#1d211d'
          g.beginPath()
          g.arc(160, 160, 160, 0, Math.PI * 2)
          g.fill()
          g.strokeStyle = '#c8b184'
          g.fillStyle = '#e0cfa4'
          g.font = '500 22px "Hiragino Sans", sans-serif'
          g.textAlign = 'center'
          g.textBaseline = 'middle'
          for (let i = 0; i < 50; i++) {
            const a = (i / 50) * Math.PI * 2 - Math.PI / 2
            const long = i % 5 === 0
            g.lineWidth = long ? 2.4 : 1.2
            g.beginPath()
            g.moveTo(160 + Math.cos(a) * (long ? 118 : 128), 160 + Math.sin(a) * (long ? 118 : 128))
            g.lineTo(160 + Math.cos(a) * 140, 160 + Math.sin(a) * 140)
            g.stroke()
            if (i % 5 === 0) {
              g.fillText(String(i), 160 + Math.cos(a) * 100, 160 + Math.sin(a) * 100)
            }
          }
          const t = new THREE.CanvasTexture(c)
          t.colorSpace = THREE.SRGBColorSpace
          return t
        })(),
        roughness: 0.32,
        metalness: 0.4,
      }), { cast: false })
      face.position.z = 0.039
      safeDial.add(face)
      const grip = mesh(new THREE.TorusGeometry(0.074, 0.007, 8, 34), mats.brass, { cast: false })
      grip.position.z = 0.04
      safeDial.add(grip)
      // Seated on the door leaf. The leaf's outer face is at 0.275 in this
      // frame and the dial boss sat at 0.294..0.314 - a 19 mm gap of nothing
      // between the dial and the safe.
      safeDial.position.set((w - 0.06) / 2, 0.02, 0.007)
      safeDial.name = 'safe-dial'
      safeDoor.add(safeDial)
      // fixed index mark above the dial
      const idx = mesh(new THREE.ConeGeometry(0.008, 0.018, 3), mats.brass, { cast: false })
      idx.rotation.x = Math.PI / 2
      idx.rotation.z = Math.PI
      idx.position.set((w - 0.06) / 2, 0.116, 0.031)
      safeDoor.add(idx)
    }
    // handle
    {
      const hub = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 16), mats.brassDull)
      hub.rotation.x = Math.PI / 2
      hub.position.set((w - 0.06) / 2, -0.21, 0.04)
      safeDoor.add(hub)
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const spoke = mesh(roundedBox(0.018, 0.1, 0.018, 0.006, 2, 3), mats.brassDull)
        spoke.position.set((w - 0.06) / 2 + Math.cos(a) * 0.05, -0.21 + Math.sin(a) * 0.05, 0.052)
        spoke.rotation.z = a - Math.PI / 2
        safeDoor.add(spoke)
      }
    }
    safeDoor.position.set(-(w - 0.06) / 2 + 0.005, h / 2 + 0.06, d / 2 - 0.01)
    safe.add(safeDoor)

    // interior, revealed when the door swings
    {
      const cavity = mesh(texturedBox(w - 0.12, h - 0.16, d - 0.12, 2), new THREE.MeshStandardMaterial({
        color: 0x17130f,
        roughness: 0.95,
        side: THREE.BackSide,
      }), { cast: false })
      cavity.position.set(0, h / 2 + 0.06, -0.02)
      safeContents.add(cavity)
      const shelf = mesh(texturedBox(w - 0.14, 0.012, d - 0.14, 2), mats.steelDark, { cast: false })
      shelf.position.set(0, h / 2 + 0.06, -0.02)
      safeContents.add(shelf)

      // the handwritten note, folded once
      letterInSafe = mesh(
        new THREE.PlaneGeometry(0.2, 0.14),
        new THREE.MeshStandardMaterial({ color: 0xd9cba9, roughness: 0.9, side: THREE.DoubleSide }),
        { cast: false },
      )
      letterInSafe.rotation.x = -Math.PI / 2
      letterInSafe.rotation.z = 0.1
      letterInSafe.position.set(-0.06, h / 2 + 0.074, -0.03)
      safeContents.add(letterInSafe)

      // and the last negative, in its glassine sleeve
      const neg = mesh(
        new THREE.PlaneGeometry(0.13, 0.1),
        new THREE.MeshPhysicalMaterial({
          color: 0xb87a3d,
          roughness: 0.16,
          transmission: 0,
          transparent: true,
          opacity: 0.79,
          side: THREE.DoubleSide,
        }),
        { cast: false },
      )
      neg.rotation.x = -Math.PI / 2
      neg.rotation.z = -0.16
      finalNegative.add(neg)
      const sleeve = mesh(
        new THREE.PlaneGeometry(0.16, 0.13),
        new THREE.MeshStandardMaterial({ color: 0xd6d0bb, roughness: 0.92, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
        { cast: false },
      )
      sleeve.rotation.x = -Math.PI / 2
      sleeve.rotation.z = -0.16
      sleeve.position.y = -0.002
      finalNegative.add(sleeve)
      finalNegative.position.set(0.11, h / 2 + 0.076, 0.02)
      safeContents.add(finalNegative)

      // a small stack of banknotes he did not take with him
      const cash = mesh(texturedBox(0.14, 0.014, 0.07, 2.4), mats.paper, { cast: false })
      cash.position.set(0.02, h / 2 + 0.005, -0.06)
      safeContents.add(cash)

      // The fourth mount, face-down under the note.
      //
      // Blank, like the item it becomes. It used to be a full portrait of the
      // child - which is the one thing this object must not be: the sitting it
      // was cut for never happened, and a face here quietly undoes the ending.
      const print4 = loosePrint(
        photoTexture('safe-blank-mount', () => unexposedPrintCanvas({ width: 220, height: 290 })),
        0.13,
        0.17,
      )
      print4.rotation.x = -Math.PI / 2
      print4.rotation.z = 0.3
      print4.position.set(-0.09, h / 2 + 0.07, 0.06)
      safeContents.add(print4)

      safeContents.visible = false
      safe.add(safeContents)
    }

    safe.position.set(O.x1 - 0.42, 0, O.z0 + 1.5)
    safe.rotation.y = -Math.PI / 2
    group.add(safe)
  }

  // --------------------------------------------------------------- dressing
  {
    // a wall clock that still keeps time, and a framed licence
    const licence = mesh(
      new THREE.PlaneGeometry(0.26, 0.34),
      new THREE.MeshStandardMaterial({
        map: (() => {
          const c = makeCanvas(300, 400)
          const g = ctx2d(c)
          g.fillStyle = '#e3d8bb'
          g.fillRect(0, 0, 300, 400)
          g.strokeStyle = '#8d7a52'
          g.lineWidth = 4
          g.strokeRect(16, 16, 268, 368)
          g.fillStyle = '#2a2117'
          g.font = '500 26px "Hiragino Mincho ProN", serif'
          g.textAlign = 'center'
          g.fillText('営業許可証', 150, 84)
          g.font = '400 18px "Hiragino Mincho ProN", serif'
          g.fillText('霧沢写真館', 150, 150)
          g.fillText('霧沢　響一', 150, 196)
          g.fillText('昭和三十九年　開業', 150, 250)
          g.strokeStyle = '#8e2f26'
          g.lineWidth = 3
          g.beginPath()
          g.arc(215, 320, 32, 0, Math.PI * 2)
          g.stroke()
          g.fillStyle = 'rgba(142,47,38,0.85)'
          g.font = '500 20px "Hiragino Mincho ProN", serif'
          g.fillText('霧沢', 215, 328)
          const t = new THREE.CanvasTexture(c)
          t.colorSpace = THREE.SRGBColorSpace
          return t
        })(),
        roughness: 0.85,
      }),
      { cast: false },
    )
    licence.position.set(5.5, 1.62, O.z0 + 0.086)
    group.add(licence)

    // a coat stand in the corner, empty
    const stand = new THREE.Group()
    const pole = mesh(new THREE.CylinderGeometry(0.018, 0.024, 1.68, 12), mats.woodDark)
    pole.position.y = 0.84
    stand.add(pole)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const foot = mesh(texturedBox(0.03, 0.02, 0.3, 2), mats.woodDark, { cast: false })
      foot.position.set(Math.cos(a) * 0.13, 0.02, Math.sin(a) * 0.13)
      foot.rotation.y = -a
      stand.add(foot)
      const hook = mesh(lathe([[0.006, 0], [0.006, 0.03], [0.014, 0.04], [0, 0.044]], 8), mats.brassDull, { cast: false })
      hook.position.set(Math.cos(a) * 0.05, 1.62, Math.sin(a) * 0.05)
      hook.rotation.set(Math.PI / 2, 0, -a)
      stand.add(hook)
    }
    stand.position.set(O.x1 - 0.35, 0, O.z1 - 0.4)
    group.add(stand)

    // a metal wastepaper basket with a few crumpled sheets
    const basket = mesh(
      lathe([[0.1, 0], [0.105, 0.005], [0.12, 0.26], [0.115, 0.265], [0.1, 0.26], [0.095, 0.01], [0, 0.006]], 18),
      new THREE.MeshStandardMaterial({ color: 0x4c4f4a, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
    )
    basket.position.set(5.6, 0, O.z0 + 0.95)
    group.add(basket)
    for (let i = 0; i < 3; i++) {
      const ball = mesh(new THREE.IcosahedronGeometry(0.035, 0), mats.paper)
      ball.position.set(5.6 + (i - 1) * 0.035, 0.2 + i * 0.03, O.z0 + 0.95 + (i % 2 ? 0.03 : -0.03))
      ball.rotation.set(i, i * 2, i * 3)
      group.add(ball)
    }
  }

  const phosphor = phosphorMark('かえす', 0.2, 2.6)
  phosphor.position.set(4.9, 1.9, O.z0 + 0.086)
  group.add(phosphor)

  return {
    group,
    safe,
    safeDial,
    safeDoor,
    safeContents,
    manual,
    ledgerOpen,
    ledgerBlock,
    desk,
    deskPrint,
    deskLamp,
    phosphor,
    letterInSafe,
    finalNegative,
  }
}
