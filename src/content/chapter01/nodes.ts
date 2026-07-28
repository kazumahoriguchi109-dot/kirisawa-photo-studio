import * as THREE from 'three'
import type { ViewpointSpec } from '../../systems/CameraRig'
import { AREA_NAME_JA, EYE_HEIGHT, type AreaId } from '../../world/Layout'

/**
 * Authored viewpoints. The player stands only here, so every frame in the game
 * was composed by hand. Links carry the floor marker the player clicks to move.
 */

export interface NodeLink {
  to: string
  /** World position of the floor marker. */
  marker: [number, number, number]
  label: string
  /** Flag that must be set before this way is open. */
  requires?: string
  /** Message shown when the way is closed. */
  blockedMessage?: string
}

export interface ViewNode {
  id: string
  area: AreaId
  label: string
  position: [number, number, number]
  yaw: number
  pitch?: number
  yawSpan?: number
  pitchRange?: [number, number]
  fov?: number
  links: NodeLink[]
}

const S = Math.PI / 2

export const NODES: ViewNode[] = [
  // ------------------------------------------------------------------- hall
  {
    id: 'hall_door',
    area: 'hall',
    label: '玄関',
    position: [-1.92, EYE_HEIGHT, 4.72],
    yaw: Math.PI - 0.26,
    fov: 60,
    links: [{ to: 'hall_center', marker: [-1.3, 0.02, 4.1], label: 'ホールの中ほど' }],
  },
  {
    id: 'hall_center',
    area: 'hall',
    label: 'ホール',
    position: [-1.25, EYE_HEIGHT, 4.02],
    yaw: 0,
    links: [
      { to: 'hall_door', marker: [-1.9, 0.02, 4.85], label: '玄関の戸' },
      { to: 'hall_counter', marker: [-0.35, 0.02, 3.95], label: '受付' },
      {
        to: 'studio_main',
        marker: [-1.8, 0.02, 3.2],
        label: '撮影室',
        requires: 'power_on',
        blockedMessage: '奥は暗い。足元が見えない。',
      },
    ],
  },
  {
    id: 'hall_counter',
    area: 'hall',
    label: '受付',
    position: [-0.3, EYE_HEIGHT, 3.98],
    yaw: 0,
    pitch: -0.16,
    links: [{ to: 'hall_center', marker: [-1.2, 0.02, 4.1], label: 'ホール' }],
  },

  // ----------------------------------------------------------------- studio
  {
    id: 'studio_main',
    area: 'studio',
    label: '撮影室',
    position: [0.15, EYE_HEIGHT + 0.02, 1.95],
    yaw: 0,
    links: [
      { to: 'hall_center', marker: [-1.8, 0.02, 2.5], label: '玄関ホール' },
      { to: 'studio_backdrop', marker: [-0.5, 0.02, -0.5], label: '背景幕の前' },
      { to: 'studio_camera', marker: [1.5, 0.02, 1.1], label: '大判カメラ' },
      { to: 'studio_west', marker: [-2.0, 0.02, -0.6], label: '西側の壁' },
      { to: 'studio_east', marker: [2.0, 0.02, -0.6], label: '東側の壁' },
    ],
  },
  {
    id: 'studio_backdrop',
    area: 'studio',
    label: '背景幕の前',
    position: [-0.5, EYE_HEIGHT, -0.35],
    yaw: 0,
    links: [{ to: 'studio_main', marker: [0.15, 0.02, 1.7], label: '撮影室の中ほど' }],
  },
  {
    id: 'studio_camera',
    area: 'studio',
    label: '大判カメラ',
    position: [1.42, EYE_HEIGHT, 1.18],
    yaw: -0.42,
    pitch: -0.06,
    links: [{ to: 'studio_main', marker: [0.3, 0.02, 1.8], label: '撮影室の中ほど' }],
  },
  {
    id: 'studio_west',
    area: 'studio',
    label: '西側の壁',
    position: [-1.95, EYE_HEIGHT, -0.55],
    yaw: S,
    links: [
      { to: 'studio_main', marker: [-0.4, 0.02, 1.4], label: '撮影室の中ほど' },
      {
        to: 'dark_entry',
        marker: [-3.0, 0.02, -1.4],
        label: '暗室',
        requires: 'darkroom_open',
        blockedMessage: '把手は回るが、錠が落ちたままだ。',
      },
    ],
  },
  {
    id: 'studio_east',
    area: 'studio',
    label: '東側の壁',
    position: [1.95, EYE_HEIGHT, -0.55],
    yaw: -S,
    links: [
      { to: 'studio_main', marker: [0.5, 0.02, 1.4], label: '撮影室の中ほど' },
      {
        to: 'office_desk',
        marker: [3.0, 0.02, -0.6],
        label: '事務室',
        requires: 'office_open',
        blockedMessage: 'すりガラスの向こうは暗い。錠がかかっている。',
      },
    ],
  },

  // --------------------------------------------------------------- darkroom
  {
    id: 'dark_entry',
    area: 'darkroom',
    label: '暗室の入口',
    position: [-3.85, EYE_HEIGHT, -1.3],
    yaw: S,
    links: [
      { to: 'studio_west', marker: [-2.9, 0.02, -1.4], label: '撮影室' },
      { to: 'dark_bench', marker: [-5.1, 0.02, -1.9], label: '作業台' },
      { to: 'dark_enlarger', marker: [-4.75, 0.02, -1.15], label: '引き伸ばし機' },
    ],
  },
  {
    id: 'dark_bench',
    area: 'darkroom',
    label: '作業台',
    position: [-5.15, EYE_HEIGHT, -1.5],
    yaw: 0,
    pitch: -0.34,
    links: [
      { to: 'dark_entry', marker: [-3.9, 0.02, -1.3], label: '入口' },
      { to: 'dark_enlarger', marker: [-4.75, 0.02, -1.1], label: '引き伸ばし機' },
    ],
  },
  {
    id: 'dark_enlarger',
    area: 'darkroom',
    label: '引き伸ばし機',
    position: [-4.72, EYE_HEIGHT, -1.15],
    yaw: S,
    pitch: -0.18,
    links: [
      { to: 'dark_entry', marker: [-3.9, 0.02, -1.3], label: '入口' },
      { to: 'dark_bench', marker: [-5.1, 0.02, -1.85], label: '作業台' },
    ],
  },

  // ----------------------------------------------------------------- office
  {
    id: 'office_desk',
    area: 'office',
    label: '事務机',
    position: [4.68, EYE_HEIGHT, -1.42],
    yaw: 0,
    pitch: -0.2,
    links: [
      { to: 'studio_east', marker: [3.35, 0.02, -0.6], label: '撮影室' },
      { to: 'office_safe', marker: [5.1, 0.02, -1.3], label: '金庫' },
      { to: 'office_south', marker: [4.7, 0.02, -0.35], label: '南側の壁' },
    ],
  },
  {
    id: 'office_safe',
    area: 'office',
    label: '金庫',
    position: [5.02, EYE_HEIGHT - 0.1, -1.3],
    yaw: -S,
    pitch: -0.22,
    links: [{ to: 'office_desk', marker: [4.7, 0.02, -1.5], label: '事務机' }],
  },
  {
    id: 'office_south',
    area: 'office',
    label: '南側の壁',
    position: [4.66, EYE_HEIGHT, -0.42],
    yaw: Math.PI,
    links: [{ to: 'office_desk', marker: [4.7, 0.02, -1.2], label: '事務机' }],
  },
]

export const NODE_MAP = new Map(NODES.map((n) => [n.id, n]))

export function nodeToSpec(node: ViewNode): ViewpointSpec {
  // A standing person can always turn round. Composition is carried by the
  // yaw the node arrives at, not by fencing the player in - and fencing them in
  // is how a way out ends up behind an invisible wall.
  const span = node.yawSpan ?? Math.PI
  return {
    position: new THREE.Vector3(...node.position),
    yaw: node.yaw,
    pitch: node.pitch ?? -0.03,
    yawRange: [node.yaw - span, node.yaw + span],
    // Wide enough down that a floor marker one step away is still in frame.
    pitchRange: node.pitchRange ?? [-0.95, 0.55],
    fov: node.fov ?? 57,
  }
}

export function areaLabelForNode(nodeId: string): string {
  const n = NODE_MAP.get(nodeId)
  if (!n) return ''
  return `${AREA_NAME_JA[n.area]}　${n.label}`
}
