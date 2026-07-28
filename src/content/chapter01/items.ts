import * as THREE from 'three'
import { lathe, mesh, roundedBox, texturedBox } from '../../world/Geo'
import type { MaterialLibrary } from '../../world/Materials'
import { ctx2d, makeCanvas } from '../../world/Textures'
import {
  lastFrameCanvas,
  negativeCanvas,
  photoTexture,
  portraitCanvas,
  studioRecordCanvas,
  unexposedPrintCanvas,
} from '../../world/Photographs'
import { makeFuse } from '../../world/props/Hall'

/**
 * Data-driven items.
 *
 * Each item builds its own small 3D model for the inspector. Hidden details are
 * defined as a direction in the item's local space: the player finds them by
 * actually turning the object to face that way, not by clicking a hotspot.
 */

export type ItemCategory = 'tool' | 'key' | 'material' | 'document' | 'record'

export interface HiddenDetail {
  id: string
  /** Unit direction, in item local space, that must face the viewer. */
  facing: [number, number, number]
  /** How closely it must face; 1 = exact, 0.86 is a comfortable tolerance. */
  tolerance?: number
  /** Minimum zoom (0 = far, 1 = closest) before the detail can be made out. */
  minZoom?: number
  /** Item that must be held for the detail to be legible at all. */
  requiresItem?: string
  title: string
  text: string
  /** Written into the clue book when found. */
  clue?: { id: string; title: string; body: string; source: string }
}

export interface ItemDef {
  id: string
  name: string
  desc: string
  category: ItemCategory
  /** Radius the inspector frames the object at. */
  viewRadius: number
  build(mats: MaterialLibrary): THREE.Object3D
  details?: HiddenDetail[]
  /** Documents this item opens when read. */
  document?: string
  /** True if the item is kept as a memento after use rather than destroyed. */
  keepAfterUse?: boolean
}

function paperTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w = 512, h = 512): THREE.CanvasTexture {
  const c = makeCanvas(w, h)
  const g = ctx2d(c)
  g.fillStyle = '#ddd1b0'
  g.fillRect(0, 0, w, h)
  draw(g, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** A flat card-like item: front and back can carry different artwork. */
function card(front: THREE.Texture, back: THREE.Texture, w: number, h: number, thickness = 0.0016): THREE.Group {
  const g = new THREE.Group()
  const f = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: front, roughness: 0.62 }), {
    cast: false,
  })
  f.position.z = thickness / 2
  g.add(f)
  const b = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: back, roughness: 0.72 }), {
    cast: false,
  })
  b.position.z = -thickness / 2
  b.rotation.y = Math.PI
  g.add(b)
  const edge = mesh(texturedBox(w, h, thickness, 2), new THREE.MeshStandardMaterial({ color: 0xcfc3a4, roughness: 0.8 }), {
    cast: false,
  })
  g.add(edge)
  return g
}

export const ITEMS: Record<string, ItemDef> = {
  // ------------------------------------------------------------------ tools
  spare_fuse: {
    id: 'spare_fuse',
    name: '予備のヒューズ',
    desc: '磁器の胴に金属の帽子。受付の抽斗に、紙の袋ごと仕舞ってあった。中の細い線は、まだ切れていない。',
    category: 'tool',
    viewRadius: 0.09,
    build: (mats) => {
      const g = new THREE.Group()
      const f = makeFuse(mats, 0x9a4f33)
      f.scale.setScalar(2.2)
      g.add(f)
      return g
    },
    details: [
      {
        id: 'fuse_rating',
        facing: [0, 1, 0],
        tolerance: 0.82,
        title: '胴の刻印',
        text: '磁器の腹に「一五アンペア」と焼き付けてある。配電盤の切れたものと同じ数字だ。',
      },
    ],
  },

  crank: {
    id: 'crank',
    name: '真鍮のクランク',
    desc: '六角の軸に木の握り。撮影室の壁、時計のあった跡の釘に掛かっていた。握りの塗りだけが、手のかたちに剥げている。',
    category: 'tool',
    viewRadius: 0.16,
    keepAfterUse: true,
    build: (mats) => {
      const g = new THREE.Group()
      const shaft = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6), mats.brass)
      shaft.rotation.z = Math.PI / 2
      g.add(shaft)
      const arm = mesh(roundedBox(0.02, 0.17, 0.02, 0.006, 2, 3), mats.brass)
      arm.position.set(0.055, -0.075, 0)
      g.add(arm)
      const grip = mesh(lathe([[0.017, 0], [0.019, 0.02], [0.017, 0.06], [0, 0.062]], 14), mats.woodDark)
      grip.rotation.z = Math.PI / 2
      grip.position.set(0.07, -0.155, 0)
      g.add(grip)
      // maker's stamp on the underside of the arm
      const stamp = mesh(
        new THREE.PlaneGeometry(0.016, 0.05),
        new THREE.MeshStandardMaterial({
          map: paperTexture((x, w, h) => {
            x.clearRect(0, 0, w, h)
            x.fillStyle = 'rgba(90,72,32,0.9)'
            x.font = '600 150px "Hiragino Mincho ProN", serif'
            x.textAlign = 'center'
            x.textBaseline = 'middle'
            x.save()
            x.translate(w / 2, h / 2)
            x.rotate(Math.PI / 2)
            x.fillText('霧沢', 0, 0)
            x.restore()
          }, 128, 384),
          transparent: true,
          roughness: 0.5,
          metalness: 0.4,
        }),
        { cast: false },
      )
      stamp.position.set(0.055, -0.075, -0.0105)
      stamp.rotation.y = Math.PI
      g.add(stamp)
      return g
    },
    details: [
      {
        id: 'crank_stamp',
        facing: [0, 0, -1],
        tolerance: 0.88,
        title: '腕の裏の刻印',
        text: '腕の裏側に「霧沢」と刻んである。買ったものではなく、この館のために作らせたものだ。',
      },
    ],
  },

  key_darkroom: {
    id: 'key_darkroom',
    name: '暗室の鍵',
    desc: '古い真鍮の鍵。撮影灯の台座の脇、床すれすれのところに落ちていた。紙の札が一枚、糸で結んである。',
    category: 'key',
    viewRadius: 0.1,
    keepAfterUse: true,
    build: (mats) => {
      const g = new THREE.Group()
      const ring = mesh(new THREE.TorusGeometry(0.021, 0.0034, 10, 24), mats.brassDull)
      g.add(ring)
      const shank = mesh(texturedBox(0.007, 0.058, 0.005, 3), mats.brassDull)
      shank.position.y = -0.048
      g.add(shank)
      const bit = mesh(texturedBox(0.017, 0.014, 0.005, 3), mats.brassDull)
      bit.position.set(0.006, -0.07, 0)
      g.add(bit)
      const tag = mesh(
        new THREE.PlaneGeometry(0.032, 0.024),
        new THREE.MeshStandardMaterial({
          map: paperTexture((x, w, h) => {
            x.fillStyle = '#2a2117'
            x.font = '500 130px "Hiragino Mincho ProN", serif'
            x.textAlign = 'center'
            x.textBaseline = 'middle'
            x.fillText('暗', w / 2, h / 2)
          }, 256, 192),
          roughness: 0.9,
          side: THREE.DoubleSide,
        }),
        { cast: false },
      )
      tag.position.set(0.03, 0.012, 0)
      g.add(tag)
      return g
    },
    details: [
      {
        id: 'key_tag',
        facing: [0, 0, 1],
        tolerance: 0.9,
        title: '紙の札',
        text: '札に「暗」の一字。裏は白紙のまま。鍵と札を結ぶ糸の色だけが、まだ褪せていない。',
      },
    ],
  },

  key_office: {
    id: 'key_office',
    name: '事務室の鍵',
    desc: '暗室の鍵板に一本だけ掛かっていた。歯の減り方が浅い。あまり使われないまま四十年が経っている。',
    category: 'key',
    viewRadius: 0.09,
    keepAfterUse: true,
    build: (mats) => {
      const g = new THREE.Group()
      const ring = mesh(new THREE.TorusGeometry(0.018, 0.003, 10, 24), mats.brass)
      g.add(ring)
      const shank = mesh(texturedBox(0.006, 0.05, 0.0045, 3), mats.brass)
      shank.position.y = -0.042
      g.add(shank)
      const bit = mesh(texturedBox(0.014, 0.012, 0.0045, 3), mats.brass)
      bit.position.set(0.005, -0.061, 0)
      g.add(bit)
      return g
    },
  },

  loupe_frame: {
    id: 'loupe_frame',
    name: '壊れたルーペの枠',
    desc: '真鍮の枠だけが残っている。玉の入っていた溝に、埃がきれいに一周ぶん積もっている。椅子の座面の裂け目から出てきた。',
    category: 'material',
    viewRadius: 0.08,
    build: (mats) => {
      const g = new THREE.Group()
      const ring = mesh(lathe([[0.026, 0], [0.032, 0], [0.032, 0.012], [0.026, 0.012]], 26), mats.brassDull)
      g.add(ring)
      const handle = mesh(lathe([[0.006, 0], [0.008, 0.01], [0.007, 0.045], [0.01, 0.055], [0, 0.056]], 12), mats.woodDark)
      handle.rotation.z = Math.PI
      handle.position.set(0, -0.04, 0.006)
      g.add(handle)
      const neck = mesh(texturedBox(0.008, 0.016, 0.008, 3), mats.brassDull)
      neck.position.set(0, -0.032, 0.006)
      g.add(neck)
      return g
    },
  },

  lens: {
    id: 'lens',
    name: '凸レンズ',
    desc: '三脚の柱の小抽斗に、布に包まれて入っていた。片面だけ強く膨らんでいる。指で押さえた跡が、油のかたちで残っている。',
    category: 'material',
    viewRadius: 0.07,
    build: () => {
      const g = new THREE.Group()
      const el = mesh(
        lathe(
          [
            [0, 0.007],
            [0.014, 0.0064],
            [0.022, 0.0042],
            [0.026, 0],
            [0.022, -0.0042],
            [0.014, -0.0064],
            [0, -0.007],
          ],
          26,
        ),
        new THREE.MeshPhysicalMaterial({
          color: 0xe8f2ec,
          roughness: 0.015,
          metalness: 0,
          transmission: 0.97,
          thickness: 0.012,
          ior: 1.62,
          transparent: true,
          opacity: 0.6,
        }),
      )
      el.rotation.x = Math.PI / 2
      g.add(el)
      return g
    },
  },

  loupe: {
    id: 'loupe',
    name: 'ルーペ',
    desc: '枠に玉を落とし込んで、締め輪で留めた。覗くと、細かい字が三倍になる。ネガを見るには、これがいる。',
    category: 'tool',
    viewRadius: 0.085,
    keepAfterUse: true,
    build: (mats) => {
      const g = new THREE.Group()
      const ring = mesh(lathe([[0.026, 0], [0.032, 0], [0.032, 0.012], [0.026, 0.012]], 26), mats.brassDull)
      g.add(ring)
      const el = mesh(
        lathe(
          [
            [0, 0.007],
            [0.014, 0.0064],
            [0.024, 0.0042],
            [0.027, 0],
            [0.024, -0.0042],
            [0.014, -0.0064],
            [0, -0.007],
          ],
          26,
        ),
        new THREE.MeshPhysicalMaterial({
          color: 0xe8f2ec,
          roughness: 0.015,
          transmission: 0.97,
          thickness: 0.012,
          ior: 1.62,
          transparent: true,
          opacity: 0.6,
        }),
      )
      el.rotation.x = Math.PI / 2
      el.position.z = 0.006
      g.add(el)
      const handle = mesh(lathe([[0.006, 0], [0.008, 0.01], [0.007, 0.045], [0.01, 0.055], [0, 0.056]], 12), mats.woodDark)
      handle.rotation.z = Math.PI
      handle.position.set(0, -0.04, 0.006)
      g.add(handle)
      const neck = mesh(texturedBox(0.008, 0.016, 0.008, 3), mats.brassDull)
      neck.position.set(0, -0.032, 0.006)
      g.add(neck)
      const engrave = mesh(
        new THREE.PlaneGeometry(0.03, 0.01),
        new THREE.MeshStandardMaterial({
          map: paperTexture((x, w, h) => {
            x.clearRect(0, 0, w, h)
            x.fillStyle = 'rgba(60,48,20,0.85)'
            x.font = '600 92px "Hiragino Sans", sans-serif'
            x.textAlign = 'center'
            x.textBaseline = 'middle'
            x.fillText('×3', w / 2, h / 2)
          }, 256, 96),
          transparent: true,
          roughness: 0.4,
          metalness: 0.5,
        }),
        { cast: false },
      )
      engrave.position.set(0, 0.0, -0.007)
      engrave.rotation.y = Math.PI
      g.add(engrave)
      return g
    },
    details: [
      {
        id: 'loupe_mag',
        facing: [0, 0, -1],
        tolerance: 0.9,
        title: '枠の裏',
        text: '枠の裏に「×3」。三倍。ネガの粒まで見るには足りるが、それ以上には向かない。',
      },
    ],
  },

  powder: {
    id: 'powder',
    name: '粉末現像剤',
    desc: '一リットル用と印刷された缶。振ると、乾いた音が中で移動する。封は切ってあるが、湿気は入っていない。',
    category: 'material',
    viewRadius: 0.12,
    build: (mats) => {
      const g = new THREE.Group()
      const body = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 24), new THREE.MeshStandardMaterial({
        color: 0x8d6a3f,
        roughness: 0.6,
        metalness: 0.35,
      }))
      g.add(body)
      const lid = mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.012, 24), mats.steelDark)
      lid.position.y = 0.07
      g.add(lid)
      const wrap = mesh(
        new THREE.CylinderGeometry(0.0555, 0.0555, 0.1, 26, 1, true),
        new THREE.MeshStandardMaterial({
          map: paperTexture((x, w, h) => {
            x.fillStyle = '#d9caa4'
            x.fillRect(0, 0, w, h)
            x.fillStyle = '#2a2117'
            x.font = '600 78px "Hiragino Mincho ProN", serif'
            x.textAlign = 'center'
            x.fillText('現像剤', w / 2, h * 0.44)
            x.font = '400 34px "Hiragino Sans", sans-serif'
            x.fillStyle = 'rgba(42,33,23,0.7)'
            x.fillText('粉末　一リットル用', w / 2, h * 0.62)
            x.strokeStyle = 'rgba(42,33,23,0.4)'
            x.lineWidth = 4
            x.strokeRect(24, 26, w - 48, h - 52)
          }, 512, 256),
          roughness: 0.72,
          side: THREE.DoubleSide,
        }),
        { cast: false },
      )
      g.add(wrap)
      return g
    },
    details: [
      {
        id: 'powder_instr',
        facing: [0, -1, 0],
        tolerance: 0.86,
        title: '缶の底',
        text: '底に小さく「水一リットルに全量。二十度。撹拌のこと」。粉のままでは何もできない、という意味でもある。',
      },
    ],
  },

  distilled_water: {
    id: 'distilled_water',
    name: '蒸留水',
    desc: '薬品棚の一本。栓はまだ固く、中身は減っていない。ラベルの角が、湿気で一度ふくらんで、そのまま乾いている。',
    category: 'material',
    viewRadius: 0.16,
    build: (mats) => {
      const g = new THREE.Group()
      const glass = mesh(
        lathe(
          [
            [0, 0],
            [0.05, 0],
            [0.05, 0.15],
            [0.038, 0.18],
            [0.017, 0.205],
            [0.016, 0.23],
            [0.019, 0.235],
            [0.019, 0.24],
            [0, 0.24],
          ],
          22,
        ),
        new THREE.MeshPhysicalMaterial({
          color: 0x2e3a42,
          roughness: 0.2,
          transmission: 0.6,
          thickness: 0.03,
          ior: 1.5,
          transparent: true,
          opacity: 0.9,
        }),
      )
      glass.position.y = -0.12
      g.add(glass)
      const cap = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 18), mats.bakelite)
      cap.position.y = 0.13
      g.add(cap)
      const label = mesh(
        new THREE.CylinderGeometry(0.0505, 0.0505, 0.09, 22, 1, true, -0.95, 1.9),
        new THREE.MeshStandardMaterial({
          map: paperTexture((x, w, h) => {
            x.fillStyle = '#ddd0ac'
            x.fillRect(0, 0, w, h)
            x.strokeStyle = 'rgba(60,48,30,0.5)'
            x.lineWidth = 5
            x.strokeRect(18, 18, w - 36, h - 36)
            x.fillStyle = '#241d13'
            x.font = '600 76px "Hiragino Mincho ProN", serif'
            x.textAlign = 'center'
            x.textBaseline = 'middle'
            x.fillText('蒸留水', w / 2, h * 0.44)
            x.font = '400 32px "Hiragino Sans", sans-serif'
            x.fillStyle = 'rgba(36,29,19,0.6)'
            x.fillText('霧沢写真館', w / 2, h * 0.72)
          }, 360, 240),
          roughness: 0.88,
          side: THREE.DoubleSide,
        }),
        { cast: false },
      )
      label.position.y = -0.04
      g.add(label)
      return g
    },
  },

  developer: {
    id: 'developer',
    name: '現像液',
    desc: '粉を蒸留水で溶いた。琥珀色。瓶の腹を透かすと、まだ細かい粒が回っている。バットに移せば使える。',
    category: 'material',
    viewRadius: 0.16,
    build: (mats) => {
      const g = new THREE.Group()
      const glass = mesh(
        lathe(
          [
            [0, 0],
            [0.05, 0],
            [0.05, 0.15],
            [0.038, 0.18],
            [0.017, 0.205],
            [0.016, 0.23],
            [0.019, 0.235],
            [0.019, 0.24],
            [0, 0.24],
          ],
          22,
        ),
        new THREE.MeshPhysicalMaterial({
          color: 0x6b5a2e,
          roughness: 0.16,
          transmission: 0.45,
          thickness: 0.04,
          ior: 1.5,
          transparent: true,
          opacity: 0.95,
        }),
      )
      glass.position.y = -0.12
      g.add(glass)
      const cap = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 18), mats.bakelite)
      cap.position.y = 0.13
      g.add(cap)
      const tape = mesh(
        new THREE.CylinderGeometry(0.0505, 0.0505, 0.05, 22, 1, true, -0.95, 1.9),
        new THREE.MeshStandardMaterial({
          map: paperTexture((x, w, h) => {
            x.fillStyle = '#e2dcc6'
            x.fillRect(0, 0, w, h)
            x.fillStyle = '#2a2117'
            x.font = '500 82px "Hiragino Mincho ProN", serif'
            x.textAlign = 'center'
            x.textBaseline = 'middle'
            x.fillText('現像液', w / 2, h / 2)
          }, 360, 160),
          roughness: 0.9,
          side: THREE.DoubleSide,
        }),
        { cast: false },
      )
      tape.position.y = -0.02
      g.add(tape)
      return g
    },
  },

  // -------------------------------------------------------------- negatives
  negative_old: {
    id: 'negative_old',
    name: '古いネガ',
    desc: '乾燥ロープに挟まれたまま残っていた一枚。透かすと、撮影室らしい部屋が明暗の逆で写っている。細かいところは肉眼では読めない。',
    category: 'record',
    viewRadius: 0.14,
    build: () => {
      const front = photoTexture('item-neg-old', () =>
        negativeCanvas(
          studioRecordCanvas({ past: true, showSafeDial: true, dialValue: 27, width: 420, height: 300, border: 0 }),
        ),
      )
      const g = card(front, front, 0.17, 0.12, 0.0008)
      return g
    },
    details: [
      {
        id: 'neg_dial',
        facing: [0, 0, 1],
        tolerance: 0.93,
        minZoom: 0.6,
        requiresItem: 'loupe',
        title: 'ネガの左下',
        text: 'ルーペを当てる。事務室の金庫が写り込んでいる。環の指す位置が読める——二十七。',
      },
    ],
  },

  negative_last: {
    id: 'negative_last',
    name: '最後のネガ',
    desc: '金庫の底に、包んだまま入っていた。まだ現像されていない。光に透かしても、何も見えない。四十年ぶん、何も起きていない一枚。',
    category: 'record',
    viewRadius: 0.13,
    details: [
      {
        id: 'neg_last_date',
        facing: [0, 0, -1],
        tolerance: 0.9,
        title: '袋の隅',
        text: '袋の隅に鉛筆。六〇・一一・二三　二二時四〇分。予約の十時から、半日以上あとの時刻だ。',
      },
    ],
    build: () => {
      const t = photoTexture('item-neg-last', () => {
        const c = makeCanvas(420, 300)
        const g = ctx2d(c)
        const grad = g.createLinearGradient(0, 0, 420, 300)
        grad.addColorStop(0, '#7a4a20')
        grad.addColorStop(0.5, '#8d5a28')
        grad.addColorStop(1, '#6d3f1c')
        g.fillStyle = grad
        g.fillRect(0, 0, 420, 300)
        for (let i = 0; i < 3000; i++) {
          g.fillStyle = `rgba(255,220,170,${Math.random() * 0.05})`
          g.fillRect(Math.random() * 420, Math.random() * 300, 1, 1)
        }
        return c
      })
      return card(t, t, 0.16, 0.115, 0.0008)
    },
  },

  print_last: {
    id: 'print_last',
    name: '最後の一枚',
    desc: '今夜、現像した。暗室の作業台と、倒れた薬品の瓶と、床に広がっていく液。端に石油ストーブの脚。人は写っていない。',
    category: 'record',
    viewRadius: 0.2,
    build: () => {
      const front = photoTexture('item-print-last', () => lastFrameCanvas({ width: 460, height: 340 }))
      const back = photoTexture('item-print-last-back', () => makeBackCanvas('', ''))
      return card(front, back, 0.24, 0.18)
    },
    details: [
      {
        id: 'print_back',
        facing: [0, 0, -1],
        tolerance: 0.9,
        title: '写真の裏',
        text: '裏はまだ白い。日付を書く者が、四十年いなかった。',
      },
    ],
  },

  // ------------------------------------------------------- chronicle prints
  print_1: makeChroniclePrint('print_1', '写真　一歳', '一歳の誕生日。抱かれているので、顔は半分だけ写っている。裏に「五四・七・一」。', 3, '五四・七・一'),
  print_4: makeChroniclePrint('print_4', '写真　四歳', '椅子には座らず、椅子の脚につかまって立っている。裏に「五七・七・三」。', 8, '五七・七・三'),
  print_7: makeChroniclePrint('print_7', '写真　七歳', '正面。背景幕は絵のほう。笑うのが早すぎて、目がすこし閉じかけている。裏に「六〇・七・二」。', 13, '六〇・七・二'),
  // The fourth print is blank on purpose. The sitting it was cut for never
  // happened, so there is no portrait to print: what the father left in the
  // safe is a mount he had already trimmed, dated and set aside for a boy who
  // did not come. A portrait here would quietly undo the whole ending.
  print_last_slot: {
    id: 'print_last_slot',
    name: '写真　四枚目',
    desc: '金庫の底に、包んで仕舞ってあった。台紙は切って日付まで入っているのに、像が出ていない。焼かれないまま四十年、ここにいた。',
    category: 'record',
    viewRadius: 0.19,
    keepAfterUse: true,
    build: () => {
      const front = photoTexture('item-print_last_slot', () =>
        unexposedPrintCanvas({ width: 230, height: 300 }),
      )
      const back = photoTexture('item-print_last_slot-back', () =>
        makeBackCanvas('六〇・一一・二三', ''),
      )
      return card(front, back, 0.17, 0.22)
    },
    details: [
      {
        id: 'print_last_slot_back',
        facing: [0, 0, -1],
        tolerance: 0.9,
        title: '写真の裏',
        text: '裏に鉛筆で日付だけ。「六〇・一一・二三」。名前は書いていない。撮る前に、書いてあったのだ。',
      },
    ],
  },

  // --------------------------------------------------------------- documents
  note_kyoichi: {
    id: 'note_kyoichi',
    name: '手記',
    desc: '金庫の中にあった。日付は昭和六十年十一月二十三日、夜。折り目に、一度も開かれた形跡がない。',
    category: 'document',
    viewRadius: 0.2,
    document: 'doc_note',
    build: () => {
      const t = paperTexture((g, w, h) => {
        g.fillStyle = 'rgba(60,48,30,0.28)'
        g.font = '22px "Hiragino Mincho ProN", serif'
        for (let i = 0; i < 16; i++) {
          g.fillText('〜〜〜〜〜〜〜〜〜〜〜〜〜', 46, 90 + i * 26)
        }
        g.strokeStyle = 'rgba(120,100,70,0.35)'
        g.beginPath()
        g.moveTo(0, h * 0.5)
        g.lineTo(w, h * 0.5)
        g.stroke()
      }, 420, 560)
      return card(t, t, 0.19, 0.25)
    },
  },

  letter_akari: {
    id: 'letter_akari',
    name: '出されなかった手紙',
    desc: '表に「灯へ」とだけ。宛先も切手もない。封をされないまま、四十年、金庫の底にあった。',
    category: 'document',
    viewRadius: 0.2,
    document: 'doc_letter',
    build: () => {
      const t = paperTexture((g, _w, h) => {
        g.fillStyle = '#2a2117'
        g.font = '46px "Hiragino Mincho ProN", serif'
        g.fillText('灯　へ', 60, 110)
        g.fillStyle = 'rgba(60,48,30,0.26)'
        g.font = '20px "Hiragino Mincho ProN", serif'
        for (let i = 0; i < 12; i++) {
          g.fillText('〜〜〜〜〜〜〜〜〜〜〜', 60, 180 + i * 28)
        }
        void h
      }, 420, 560)
      return card(t, t, 0.19, 0.25)
    },
  },
}

function makeBackCanvas(line1: string, line2: string): HTMLCanvasElement {
  const c = makeCanvas(460, 340)
  const g = ctx2d(c)
  g.fillStyle = '#e6ddc4'
  g.fillRect(0, 0, 460, 340)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(140,116,72,${Math.random() * 0.06})`
    g.fillRect(Math.random() * 460, Math.random() * 340, 2, 2)
  }
  g.fillStyle = 'rgba(52,42,28,0.8)'
  g.font = '30px "Hiragino Mincho ProN", serif'
  g.fillText(line1, 46, 92)
  if (line2) g.fillText(line2, 46, 140)
  return c
}

function makeChroniclePrint(
  id: string,
  name: string,
  desc: string,
  variant: number,
  backDate: string,
): ItemDef {
  return {
    id,
    name,
    desc,
    category: 'record',
    viewRadius: 0.19,
    keepAfterUse: true,
    build: () => {
      const front = photoTexture(`item-${id}`, () => portraitCanvas(variant, { width: 230, height: 300, age: 0.24 }))
      const back = photoTexture(`item-${id}-back`, () => makeBackCanvas(backDate, ''))
      return card(front, back, 0.17, 0.22)
    },
    details: [
      {
        id: `${id}_back`,
        facing: [0, 0, -1],
        tolerance: 0.9,
        title: '写真の裏',
        text: `裏に鉛筆で日付だけ。「${backDate}」。名前は書いていない。`,
      },
    ],
  }
}

export const CHRONICLE_PRINT_IDS = ['print_1', 'print_4', 'print_7', 'print_last_slot'] as const

/** Recipes. Order-independent: either item may be the one selected. */
export interface Recipe {
  a: string
  b: string
  result: string
  consume: string[]
  message: string
}

export const RECIPES: Recipe[] = [
  {
    a: 'powder',
    b: 'distilled_water',
    result: 'developer',
    consume: ['powder', 'distilled_water'],
    message: '粉を蒸留水に落として、瓶ごと回す。琥珀色になるまで、思ったより時間がかかる。',
  },
  {
    a: 'loupe_frame',
    b: 'lens',
    result: 'loupe',
    consume: ['loupe_frame', 'lens'],
    message: '玉を溝に落として、締め輪を指で回す。最後の四半回転だけ、指の腹に手応えがある。',
  },
]

export function findRecipe(x: string, y: string): Recipe | undefined {
  return RECIPES.find((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x))
}
