import * as THREE from 'three'
import {
  agedBrass,
  agedPlaster,
  bakelite,
  crinkleEnamel,
  enamel,
  frostedGlass,
  paintedSteel,
  stainedWood,
  terrazzo,
  velvetCloth,
  wornLinoleum,
  yellowedPaper,
  type TextureSet,
} from './Textures'

/**
 * The material language of the building. Deliberately narrow: seven or eight
 * real surfaces, reused everywhere, so the room reads as one built set rather
 * than a pile of unrelated objects.
 */

function fromSet(
  set: TextureSet,
  params: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  // Only pass the maps this set actually has. Handing three an explicit
  // `normalMap: undefined` is not the same as omitting it - it warns on every
  // such material at startup.
  const p: THREE.MeshStandardMaterialParameters = { map: set.map, ...params }
  if (set.normalMap) p.normalMap = set.normalMap
  if (set.roughnessMap) p.roughnessMap = set.roughnessMap
  return new THREE.MeshStandardMaterial(p)
}

export interface MaterialLibrary {
  plasterWall: THREE.MeshStandardMaterial
  plasterWallStudio: THREE.MeshStandardMaterial
  plasterWallDark: THREE.MeshStandardMaterial
  ceiling: THREE.MeshStandardMaterial
  floorHall: THREE.MeshStandardMaterial
  floorStudio: THREE.MeshStandardMaterial
  floorDark: THREE.MeshStandardMaterial
  woodDark: THREE.MeshStandardMaterial
  woodMid: THREE.MeshStandardMaterial
  woodTrim: THREE.MeshStandardMaterial
  brass: THREE.MeshStandardMaterial
  brassDull: THREE.MeshStandardMaterial
  steelDark: THREE.MeshStandardMaterial
  cameraBody: THREE.MeshStandardMaterial
  leather: THREE.MeshStandardMaterial
  velvet: THREE.MeshStandardMaterial
  velvetRed: THREE.MeshStandardMaterial
  paper: THREE.MeshStandardMaterial
  paperBright: THREE.MeshStandardMaterial
  glassFrosted: THREE.MeshBasicMaterial
  /** Frosted glass without the wire mesh, for small door lights. */
  glassDoorLight: THREE.MeshBasicMaterial
  glassClear: THREE.MeshPhysicalMaterial
  enamelTray: THREE.MeshStandardMaterial
  bakelite: THREE.MeshStandardMaterial
  rubber: THREE.MeshStandardMaterial
  chrome: THREE.MeshStandardMaterial
  filmBase: THREE.MeshPhysicalMaterial
  lampGlass: THREE.MeshStandardMaterial
  safelightGlass: THREE.MeshStandardMaterial
}

let library: MaterialLibrary | null = null

export function buildMaterials(): MaterialLibrary {
  if (library) return library

  const plaster = agedPlaster('#9a8e79', 11, [1, 1])
  const plasterStudio = agedPlaster('#8d8676', 19, [1, 1])
  const plasterDark = agedPlaster('#6a6355', 29, [1, 1])
  const woodDarkSet = stainedWood('#3f2c20', 23, [1, 1])
  const woodMidSet = stainedWood('#5a4130', 37, [1, 1])
  const woodTrimSet = stainedWood('#33241a', 43, [1, 1])
  const brassSet = agedBrass(53, [1, 1])
  const crinkleSet = crinkleEnamel(61, [1, 1])
  const velvetSet = velvetCloth('#2b2e37', 67, [1, 1])
  const velvetRedSet = velvetCloth('#43201f', 73, [1, 1])
  const paperSet = yellowedPaper(71, [1, 1])
  const enamelSet = enamel('#e2ded2', 89, [1, 1])
  const bakeliteSet = bakelite('#241d19', 97, [1, 1])
  const steelSet = paintedSteel('#6f6b62', 101, [1, 1])

  library = {
    plasterWall: fromSet(plaster, { roughness: 0.95, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6) }),
    plasterWallStudio: fromSet(plasterStudio, {
      roughness: 0.96,
      metalness: 0,
      normalScale: new THREE.Vector2(0.55, 0.55),
    }),
    plasterWallDark: fromSet(plasterDark, {
      roughness: 0.97,
      metalness: 0,
      normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    ceiling: fromSet(paintedSteel('#6f6c60', 103, [1, 1]), { roughness: 0.9, metalness: 0.05 }),
    floorHall: fromSet(terrazzo(47, [1, 1]), { roughness: 0.5, metalness: 0.02 }),
    floorStudio: fromSet(wornLinoleum(31, [1, 1]), { roughness: 0.55, metalness: 0.02 }),
    floorDark: fromSet(wornLinoleum(59, [1, 1]), { roughness: 0.68, metalness: 0.02, color: 0x8a8478 }),
    woodDark: fromSet(woodDarkSet, { roughness: 0.62, metalness: 0.02 }),
    woodMid: fromSet(woodMidSet, { roughness: 0.66, metalness: 0.02 }),
    woodTrim: fromSet(woodTrimSet, { roughness: 0.58, metalness: 0.02 }),
    brass: fromSet(brassSet, { roughness: 0.34, metalness: 0.92 }),
    brassDull: fromSet(brassSet, { roughness: 0.58, metalness: 0.8, color: 0xa89a78 }),
    steelDark: fromSet(steelSet, { roughness: 0.55, metalness: 0.55, color: 0x5c5952 }),
    cameraBody: fromSet(crinkleSet, {
      roughness: 0.78,
      metalness: 0.18,
      normalScale: new THREE.Vector2(0.9, 0.9),
    }),
    leather: new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.86, metalness: 0.02 }),
    velvet: fromSet(velvetSet, { roughness: 0.99, metalness: 0 }),
    velvetRed: fromSet(velvetRedSet, { roughness: 0.98, metalness: 0 }),
    paper: fromSet(paperSet, { roughness: 0.92, metalness: 0 }),
    paperBright: fromSet(paperSet, { roughness: 0.88, metalness: 0, color: 0xf2ece0 }),
    // Frosted glass is authored rather than simulated: a soft emissive panel
    // whose brightness we control directly, so the shopfront can never blow out
    // when a light happens to sit behind it.
    // Frosted glass is unlit on purpose. A real frosted pane is a diffuser: its
    // brightness is set by what is behind it, not by the room. Making it an
    // authored constant is both truer and the only way to stop a lamp sitting
    // half a metre behind it from clipping the whole panel to white.
    glassFrosted: new THREE.MeshBasicMaterial({
      map: frostedGlass(83, [1, 1], true),
      color: 0x6a5c48,
      transparent: true,
      opacity: 0.97,
      side: THREE.DoubleSide,
    }),
    glassDoorLight: new THREE.MeshBasicMaterial({
      map: frostedGlass(97, [1, 1], false),
      color: 0x6f6047,
      transparent: true,
      opacity: 0.97,
      side: THREE.DoubleSide,
    }),
    glassClear: new THREE.MeshPhysicalMaterial({
      color: 0xdfe6e6,
      roughness: 0.06,
      metalness: 0,
      transmission: 0.94,
      thickness: 0.01,
      ior: 1.52,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
    enamelTray: fromSet(enamelSet, { roughness: 0.24, metalness: 0.04 }),
    bakelite: fromSet(bakeliteSet, { roughness: 0.36, metalness: 0.05 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1917, roughness: 0.95, metalness: 0 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.22, metalness: 0.95 }),
    filmBase: new THREE.MeshPhysicalMaterial({
      color: 0xc98a4a,
      roughness: 0.18,
      metalness: 0,
      transmission: 0.55,
      thickness: 0.002,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    }),
    lampGlass: new THREE.MeshStandardMaterial({
      color: 0xfff2d4,
      roughness: 0.3,
      metalness: 0,
      emissive: 0xffd9a0,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.85,
    }),
    safelightGlass: new THREE.MeshStandardMaterial({
      color: 0x7a1f16,
      roughness: 0.42,
      metalness: 0,
      emissive: 0xff2b18,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.92,
    }),
  }
  return library
}

export function disposeMaterials(): void {
  if (!library) return
  for (const m of Object.values(library) as THREE.Material[]) m.dispose()
  library = null
}

/** Flat, unlit material used for UI-ish elements inside the 3D scene. */
export function makeUnlit(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  })
}
