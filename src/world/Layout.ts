/**
 * The floor plan, in metres, in one place.
 * Props, viewpoints, hotspots and lights all read from here so that moving a
 * wall never leaves an object floating in space.
 */

export interface RoomBounds {
  x0: number
  x1: number
  z0: number
  z1: number
  ceiling: number
}

export const ROOM = {
  studio: { x0: -3.2, x1: 3.2, z0: -2.8, z1: 2.8, ceiling: 3.5 },
  hall: { x0: -3.2, x1: 0.6, z0: 2.8, z1: 6.4, ceiling: 2.9 },
  darkroom: { x0: -6.6, x1: -3.2, z0: -2.8, z1: 0.4, ceiling: 2.6 },
  office: { x0: 3.2, x1: 6.2, z0: -2.8, z1: 0.8, ceiling: 2.9 },
} as const satisfies Record<string, RoomBounds>

export type AreaId = keyof typeof ROOM

export const AREA_NAME_JA: Record<AreaId, string> = {
  studio: '撮影室',
  hall: '玄関ホール',
  darkroom: '暗室',
  office: '事務室',
}

export const WALL_THICKNESS = 0.16
export const EXTERIOR_THICKNESS = 0.26

/** Door and archway openings, expressed in world coordinates. */
export const OPENINGS = {
  /** Studio <-> Hall: an open archway, no door leaf. */
  hallArch: { x0: -2.6, x1: -1.0, z: 2.8, top: 2.2 },
  /** Studio <-> Darkroom: a light-tight door on the west wall. */
  darkroomDoor: { z0: -1.85, z1: -0.95, x: -3.2, top: 2.02 },
  /** Studio <-> Office: a glazed office door on the east wall. */
  officeDoor: { z0: -1.05, z1: -0.15, x: 3.2, top: 2.02 },
  /** The way out, in the hall's south wall. */
  exitDoor: { x0: -2.52, x1: -1.12, z: 6.4, top: 2.18 },
  /** Shopfront glazing beside the exit door. */
  shopWindow: { x0: -0.72, x1: 0.32, z: 6.4, bottom: 0.92, top: 2.16 },
} as const

export const EYE_HEIGHT = 1.56
