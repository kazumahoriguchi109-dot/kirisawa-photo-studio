import * as THREE from 'three'
import type { ViewpointSpec } from '../../systems/CameraRig'
import { AREA_NAME_JA, EYE_HEIGHT, type AreaId } from '../../world/Layout'

/**
 * Authored viewpoints, point-and-click style.
 *
 * Each room is a ring of four fixed compositions. The player never steers a
 * camera: they turn to the next composition with the edge arrows, and step
 * through a doorway by clicking the doorway. Every frame in the game was
 * therefore framed on purpose, which is what separates a commercial escape
 * game from a free-look walkthrough.
 *
 * The four views in a ring sit at slightly different standing points rather
 * than one pivot. A room six metres wide cannot put its west and east walls in
 * the same frame from the middle, and shuffling half a metre between views
 * still reads as one person turning.
 */

export interface NodeExit {
  to: string
  label: string
  requires?: string
  blockedMessage?: string
}

export interface ViewNode {
  id: string
  area: AreaId
  label: string
  position: [number, number, number]
  yaw: number
  pitch?: number
  fov?: number
  left: string
  right: string
}

const S = Math.PI / 2
const E = EYE_HEIGHT

/**
 * `dir` fixes the facing; `at` is where the player stands for that view.
 * Ring order is n -> e -> s -> w, so the right-hand arrow turns clockwise.
 */
function ring(
  area: AreaId,
  views: Array<{
    dir: 'n' | 'e' | 's' | 'w'
    label: string
    at: [number, number, number]
    pitch?: number
    fov?: number
  }>,
): ViewNode[] {
  const YAW = { n: 0, e: -S, s: Math.PI, w: S }
  const order = views.map((v) => `${area}_${v.dir}`)
  return views.map((v, i) => ({
    id: `${area}_${v.dir}`,
    area,
    label: v.label,
    position: v.at,
    yaw: YAW[v.dir],
    pitch: v.pitch ?? -0.03,
    fov: v.fov ?? 58,
    left: order[(i - 1 + order.length) % order.length],
    right: order[(i + 1) % order.length],
  }))
}

export const NODES: ViewNode[] = [
  // ------------------------------------------------------------ 玄関ホール
  ...ring('hall', [
    { dir: 'n', label: '受付と通路', at: [-1.0, E, 4.95], pitch: -0.04 },
    { dir: 'e', label: '階段', at: [-0.95, E, 4.9], pitch: -0.02 },
    { dir: 's', label: '玄関の引き戸', at: [-1.32, E, 4.2], fov: 60, pitch: -0.06 },
    { dir: 'w', label: '配電盤の壁', at: [-1.55, E, 4.85] },
  ]),

  // -------------------------------------------------------------- 撮影室
  ...ring('studio', [
    { dir: 'n', label: '背景幕', at: [0.05, E + 0.02, 1.55], fov: 62, pitch: -0.02 },
    { dir: 'e', label: '肖像写真の壁', at: [0.7, E, 0.5], fov: 58 },
    { dir: 's', label: '玄関ホールへ', at: [-0.9, E, 0.9], fov: 60 },
    { dir: 'w', label: '暗室の扉', at: [-0.9, E, -0.1], fov: 58 },
  ]),

  // ---------------------------------------------------------------- 暗室
  ...ring('darkroom', [
    { dir: 'n', label: '作業台', at: [-5.05, E, -1.42], pitch: -0.28, fov: 58 },
    { dir: 'e', label: '扉と鍵板', at: [-4.4, E, -1.3], fov: 56 },
    { dir: 's', label: '薬品棚', at: [-4.5, E, -0.5], pitch: -0.05, fov: 56 },
    { dir: 'w', label: '引き伸ばし機', at: [-4.5, E, -1.15], pitch: -0.1, fov: 58 },
  ]),

  // -------------------------------------------------------------- 事務室
  ...ring('office', [
    { dir: 'n', label: '事務机', at: [4.62, E, -1.35], pitch: -0.2, fov: 58 },
    { dir: 'e', label: '金庫', at: [5.05, E - 0.06, -1.3], pitch: -0.24, fov: 54 },
    { dir: 's', label: '壁の貼り紙', at: [4.6, E, -0.55], fov: 56 },
    { dir: 'w', label: '撮影室へ', at: [4.3, E, -0.5], fov: 56 },
  ]),
]

export const NODE_MAP = new Map(NODES.map((n) => [n.id, n]))

/**
 * Doorways. Attached to the door geometry itself rather than a floor marker, so
 * the thing the player clicks to go somewhere is the opening they go through.
 */
export const EXITS: Record<string, NodeExit> = {
  hall_n: {
    to: 'studio_s',
    label: '撮影室への通路',
    requires: 'power_on',
    blockedMessage: '奥は暗い。足元が見えない。',
  },
  studio_s: { to: 'hall_n', label: '玄関ホールへの通路' },
  studio_w: {
    to: 'darkroom_e',
    label: '暗室の扉',
    requires: 'darkroom_open',
    blockedMessage: '把手は回るが、錠が落ちたままだ。',
  },
  darkroom_e: { to: 'studio_w', label: '撮影室へ戻る扉' },
  studio_e: {
    to: 'office_w',
    label: '事務室の扉',
    requires: 'office_open',
    blockedMessage: 'すりガラスの向こうは暗い。錠がかかっている。',
  },
  office_w: { to: 'studio_e', label: '撮影室へ戻る扉' },
}

export function nodeToSpec(node: ViewNode): ViewpointSpec {
  return {
    position: new THREE.Vector3(...node.position),
    yaw: node.yaw,
    pitch: node.pitch ?? -0.03,
    fov: node.fov ?? 58,
  }
}

export function areaLabelForNode(nodeId: string): string {
  const n = NODE_MAP.get(nodeId)
  if (!n) return ''
  return `${AREA_NAME_JA[n.area]}　${n.label}`
}

export function nodesInArea(area: AreaId): ViewNode[] {
  return NODES.filter((n) => n.area === area)
}
