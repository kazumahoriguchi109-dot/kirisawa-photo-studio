# 霧沢写真館 ― 最後の一枚 / VISUAL DIRECTION GUIDE
**3D Environment & Lighting — procedural implementation spec v1.0**

---

## 0. GLOBAL RENDERER BASELINE

```js
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
camera = new THREE.PerspectiveCamera(48, w/h, 0.05, 60);   // 48° ≈ 40mm still lens
```

Scene units = metres. World origin at the Hall floor centre. Floor y=0, all ceilings flat-slab.
**Fog is `FogExp2` in every state** — linear fog reads as a grey wash on close interiors.
All lighting-state transitions are a 1.2 s ease (`t*t*(3-2t)`) lerp over: exposure, fog colour, fog density, every light's colour and intensity, and the two emissive material colours (safelight glass, tungsten filament). Never hard-cut except the fuse blowing.

---

## 1. THE FOUR LIGHTING STATES

Colour temperature logic: the building has **three light sources that never mix cleanly** — sodium-ish 1985 tungsten (2700–3000K), moonlight filtered through rain and frosted wire glass (7000K, desaturated blue-green not blue-purple), and safelight amber-red (~620nm). Dawn is the only state where the outside wins.

### STATE A — 停電 / BLACKOUT + MOONLIGHT (opening state)
Player enters here. The room must be *legible but frightening in its emptiness*, not black.

| Parameter | Value |
|---|---|
| `toneMappingExposure` | `0.62` |
| Fog | `FogExp2(0x0B1016, 0.075)` |
| Hemisphere | sky `0x2A3A4E`, ground `0x0A0C10`, intensity `0.32` |
| Ambient | `0x141C26`, intensity `0.18` |
| Key (moon, DirectionalLight) | `0x9FB6C9`, intensity `0.85` |
| Bounce fill (PointLight, no shadow) | `0x1E2A38`, intensity `0.25`, distance `6`, decay `2` |
| Practical fixture | frosted shopfront glass + streetlamp beyond; a single sodium `0xFFB86B` @ 0.4 through the door glass only |

Rule: no surface renders below `#05070A` on screen. Deep shadow keeps a **blue-green tint**, never neutral black — pure black on a web canvas looks like a missing texture.

### STATE B — 通電 / TUNGSTEN INTERIOR (after P1 fuse)
The moment the game "turns on." This transition is the single biggest wow beat in the first ten minutes: exposure ramps up, fog drops, colour swings 3000K warm, dust becomes visible in the beams.

| Parameter | Value |
|---|---|
| `toneMappingExposure` | `1.06` |
| Fog | `FogExp2(0x1E1710, 0.030)` |
| Hemisphere | sky `0x4A3A2A`, ground `0x1A130C`, intensity `0.42` |
| Ambient | `0x2A2018`, intensity `0.22` |
| Moon key (retained, reduced) | `0x8FA8BC`, intensity `0.30` — cold rim survives on window-side edges so the room isn't monochrome amber |
| Practical fixtures | Hall: two bare ceiling globes. Studio: 2× tungsten studio lamps + 1 fluorescent that *fails to strike* (see detail #7). Darkroom: bulkhead lamp. Office: green glass desk lamp + ceiling fluorescent. |

The warm/cold split is the whole look. Any frame should read **amber core, teal edges**.

### STATE C — 安全灯 / DARKROOM SAFELIGHT (P7, building-wide)
Monochromatic by design. This is the state where the player *cannot* judge colour, which is exactly why the phosphorescent marks become the only saturated non-red thing on screen (cyan-green `#9BFFC4`) and read instantly.

| Parameter | Value |
|---|---|
| `toneMappingExposure` | `0.78` |
| Fog | `FogExp2(0x2A0806, 0.055)` |
| Hemisphere | sky `0x3A0C08`, ground `0x140403`, intensity `0.38` |
| Ambient | `0x2E0A07`, intensity `0.30` |
| Safelight key (PointLight per room) | `0xFF2E14`, intensity `2.2`, distance `7.5`, decay `2` |
| Moon key | `0x5A7A8E`, intensity `0.12` — barely there, keeps windows from going flat red |
| Phosphor materials | `MeshBasicMaterial` emissive-look `0x9BFFC4`, `toneMapped:false`, additive blend, opacity animated `0.55→0.9` on a 3.5 s sine |

Under state C, force every material's saturation down in shader terms by simply *not fighting it* — red light on a desaturated palette does this for free. Do **not** apply a red post-filter; light the scene red instead. A post-filter reddens the UI and looks like a cheap overlay.

### STATE D — 夜明けの扉 / DAWN AT THE OPENED DOOR (ending)
Only ever seen for ~8 seconds, through one doorway. Overexpose deliberately.

| Parameter | Value |
|---|---|
| `toneMappingExposure` | `1.34` (ramps to `1.62` over 4 s as the door swings) |
| Fog | `FogExp2(0x8FA0A8, 0.020)` — thins to `0.012` |
| Hemisphere | sky `0xBFCBD2`, ground `0x453A32`, intensity `0.75` |
| Ambient | `0x6A6A66`, intensity `0.40` |
| Dawn key (DirectionalLight through door) | `0xFFE3C0`, intensity `2.6`, casts shadow, shadow bias `-0.0006` |
| Doorway god-ray plane | additive quad, `0xFFEBD2`, opacity `0.22`, faces camera, 2.4 × 3.0 m |
| Practical | the open exit door; rain has stopped, wet pavement outside reflecting sky |

Rain audio/visual stops **before** the door opens, not with it — the silence lands first.

---

## 2. AREAS, DIMENSIONS, VIEWPOINTS

Eye height **1.62 m** everywhere. Yaw 0 = −Z. Yaw limits are given as (min, max) in degrees relative to the viewpoint's home yaw; pitch is globally clamped **−38° … +30°**. Every viewpoint below is composed so that **foreground occludes the bottom 15–25% of frame** — this is the single cheapest trick for depth and the one web prototypes always skip.

### 玄関ホール / HALL — 5.4 × 4.2 m, ceiling 2.75 m
Floor: terrazzo. Walls: aged plaster to 1.05 m dado rail, dark stained wood wainscot below. Shopfront (frosted wire glass, 3.2 × 1.9 m) on the +Z wall with the exit door centred.

- **H1 「入口」** pos `(0, 1.62, 1.5)`, home yaw `180°`, limits `(-75°, +75°)`
  FG: reception counter corner cutting lower-left, an abandoned umbrella stand lower-right. MG: reception counter with bell, ledger, the 1985 framed photo above it, the unfaded clock disc + nail. BG: dark doorway to Studio, coat rack silhouetted against it.
- **H2 「受付前」** pos `(-1.4, 1.62, -0.6)`, home yaw `95°`, limits `(-60°, +60°)`
  FG: counter top edge, brass bell, key hook board. MG: fuse box on wall, drawer bank. BG: shopfront glass, rain streaks, streetlamp bloom.
- **H3 「扉の前」** pos `(0, 1.62, 1.05)`, home yaw `0°`, limits `(-40°, +40°)`
  FG: door threshold brass strip, doormat. MG: the four-ring lock at 1.15 m height, door furniture. BG: frosted glass panels, moving rain shadow.

### 撮影室 / STUDIO — 6.8 × 5.6 m, ceiling 3.40 m (tallest room, sells the "real studio")
Floor: worn linoleum, seam every 1.82 m. Backdrop roll spans the full 6.8 m of the −Z wall at 3.05 m.

- **S1 「入口」** pos `(0, 1.62, 2.4)`, home yaw `180°`, limits `(-85°, +85°)`
  FG: a light stand leg and sandbag cutting lower-left third. MG: view camera on tripod, dead centre, three-quarter to camera. BG: velvet backdrop wall, posing chair turned away at frame right.
- **S2 「カメラの脇」** pos `(-1.2, 1.62, 0.2)`, home yaw `150°`, limits `(-70°, +70°)`
  FG: bellows and lens board huge in the left foreground, out of the main read. MG: posing chair + the portrait wall. BG: backdrop roll mechanism and crank socket up high.
- **S3 「壁際」** pos `(2.3, 1.62, -1.0)`, home yaw `260°`, limits `(-65°, +65°)`
  FG: framed portrait edges raking away in perspective. MG: the chronicle wall (post-P3) with its four gaps. BG: studio lamps, dust in the beam.

### 暗室 / DARKROOM — 3.2 × 2.6 m, ceiling 2.45 m (deliberately cramped)
Floor: sealed concrete with a drain. Walls painted matte black to 1.6 m, aged plaster above. A light-trap curtain at the entry.

- **D1 「入口」** pos `(0, 1.62, 0.95)`, home yaw `180°`, limits `(-55°, +55°)`
  FG: hanging light-trap curtain edge, left third. MG: wet bench with three enamel trays, tongs. BG: drying line with 6 pegged prints, safelight fixture above.
- **D2 「引き伸ばし機」** pos `(-0.85, 1.62, -0.3)`, home yaw `90°`, limits `(-50°, +50°)`
  FG: chemical bottles on the bench edge, amber glass. MG: enlarger column and head, focus knob. BG: projection wall, the timer, chemical shelf.
- **D3 「流し」** pos `(0.8, 1.62, -0.5)`, home yaw `210°`, limits `(-45°, +45°)`
  FG: tray lip and a floating print in fixer. MG: tray labels (rearranged — P8 clue). BG: drain, wet floor sheen, hose coil.

### 事務室 / OFFICE — 4.0 × 3.6 m, ceiling 2.60 m
Floor: dark stained wood strip. Walls: aged plaster, one wall entirely filing shelves.

- **O1 「入口」** pos `(0, 1.62, 1.4)`, home yaw `180°`, limits `(-70°, +70°)`
  FG: doorframe jamb hard left. MG: desk with green glass lamp, black bakelite telephone, ledgers. BG: filing shelf wall, wall safe partially hidden behind a hung calendar.
- **O2 「机」** pos `(-0.5, 1.62, -0.4)`, home yaw `210°`, limits `(-60°, +60°)`
  FG: desk surface filling the bottom 25% — blotter, ashtray, pen tray. MG: safe dial at eye level. BG: window with rain, cold moon rim on the sill.
- **O3 「棚」** pos `(1.2, 1.62, 0.3)`, home yaw `290°`, limits `(-50°, +50°)`
  FG: a leaning stack of ledgers. MG: shelf rows with box files, spine labels. BG: corner, procedure manual on a hook, wall clock (still working, wrong time).

---

## 3. PROP MANIFEST

Notation: `Box(w,h,d)`, `Cyl(rTop,rBot,h,seg)`, `Lathe([...])`, `Extrude(shape,depth)`, `Torus(r,tube,rSeg,tSeg)`, `Plane(w,h)`. Materials reference §4.

### 玄関ホール (18)
| # | Prop | Recipe | Dims (m) | Material |
|---|---|---|---|---|
|1|受付カウンター|Box body + Box top with 0.03 overhang + Extrude beaded front panel|1.80×1.05×0.62|M_WOOD_DARK / M_LINO top|
|2|カウンターベル|Lathe base `[(0,0),(0.045,0),(0.045,0.008),(0.02,0.012)]` + Sphere(0.035) hemisphere + Cyl plunger|0.09×0.07|M_BRASS|
|3|四連リング錠 (exit lock)|4× Torus(0.055,0.014,32,24) coaxial on Cyl shaft, each with 4 Extrude icon glyph insets|0.12×0.30|M_BRASS + M_ENAMEL_BLK|
|4|玄関扉|Box frame 4 members + Plane frosted panel + Extrude kick panel|0.92×2.05×0.05|M_WOOD_DARK / M_GLASS_WIRE|
|5|配電盤 (fuse box)|Box housing + hinged Box door + 6× Cyl porcelain fuse holders + 2 Box knife switches|0.34×0.44×0.11|M_STEEL_PAINT|
|6|ヒューズ (spare)|Cyl(0.011,0.011,0.038) + 2 brass end caps|0.04|M_GLASS/M_BRASS|
|7|コート掛け|Cyl column(0.035) + 4 Lathe hook arms + 3-leg Extrude base|0.42×1.78|M_WOOD_DARK|
|8|傘立て|Cyl(0.13,0.11,0.52,20) open top, 0.008 wall via inner inverted Cyl|0.26×0.52|M_ENAMEL_WHT (chipped)|
|9|折れた蛇の目傘|Cyl shaft + 8 thin Box ribs + partial Lathe canopy, one rib bent|0.30×0.88|M_FABRIC/M_STEEL_PAINT|
|10|1985年の額装写真|Extrude ogee frame profile + Plane canvas print + Plane glass (0.02 opacity white)|0.42×0.34×0.03|M_WOOD_DARK / M_PAPER_YEL|
|11|時計の跡 (unfaded disc)|Circle(0.14) decal plane, offset 0.001 from wall + Cyl nail (0.002×0.018)|0.28|M_PLASTER (brighter variant)|
|12|下駄箱 / key hook board|Box back + 12 Cyl pegs + 7 Extrude tags|0.55×0.40×0.03|M_WOOD_DARK/M_BRASS|
|13|来客名簿|Box block + 40 stacked Plane pages (only 8 modelled, rest a striped texture edge)|0.21×0.03×0.30|M_PAPER_YEL|
|14|黒電話 (wall, secondary)|Lathe body + Torus handset cradle + Cyl dial + coiled TubeGeometry cord|0.22×0.14|M_BAKELITE|
|15|天井球 ×2|Sphere(0.09) + Lathe socket + Cyl stem|0.18|M_GLASS_MILK/M_BRASS|
|16|靴拭きマット|Box(0.60,0.015,0.40) with high-frequency bristle normal texture|0.60×0.40|M_FABRIC_COARSE|
|17|営業時間札 (hanging sign, flipped to 休)|Plane + 2 Cyl chain links via small Torus chain|0.16×0.24|M_WOOD_DARK|
|18|1985年の壁掛けカレンダー跡 + pin|2 Plane rectangles slightly brighter + Cyl pin|0.24×0.34|M_PLASTER|

### 撮影室 (19)
| # | Prop | Recipe | Dims | Material |
|---|---|---|---|---|
|1|大判ビューカメラ 本体|2× Box standards + accordion bellows: custom BufferGeometry, 14 pleats, each a scaled quad ring, lofted 0.36 m|0.28×0.30×0.42|M_ENAMEL_BLK/M_WOOD_DARK|
|2|レンズボード + レンズ|Box board + Lathe barrel `[(0,0),(0.032,0),(0.038,0.012),(0.034,0.030),(0.030,0.042)]` + 2 Circle glass|0.09×0.09|M_BRASS/M_GLASS|
|3|木製三脚|3× tapered Box legs (2-stage, brass collars) + Lathe head + Cyl crank|0.70 spread ×1.45|M_WOOD_DARK/M_BRASS|
|4|ピントグラス + 冠布|Plane ground glass (frosted shader) + cloth: PlaneGeometry 12×12 segments displaced by simplex noise, draped|0.13×0.10 / cloth 0.9×0.7|M_GLASS_GRND/M_VELVET|
|5|背景幕ロール|Cyl(0.075,0.075,6.6,24) + 2 Lathe end caps + hanging velvet Plane 24×8 seg with catenary sag|6.6 span|M_STEEL_PAINT/M_VELVET|
|6|真鍮クランク|Cyl shaft + Box arm + Lathe knob + square Extrude socket|0.14×0.09|M_BRASS|
|7|ポージングチェア|Lathe turned legs ×4 + Extrude curved back splat + Box seat + Torus armrests|0.52×0.48×0.94|M_WOOD_DARK/M_VELVET|
|8|タングステン投光器 ×2|Lathe reflector bowl `[(0,0),(0.05,0.02),(0.14,0.10),(0.17,0.13)]` + 4 Box barn doors on hinges + Sphere bulb + filament as thin TubeGeometry|0.34 dia|M_STEEL_PAINT/M_GLASS|
|9|ライトスタンド ×2|3-stage Cyl telescoping column + 3 Box tripod legs + Cyl knuckle knobs|0.55×2.05|M_STEEL_PAINT|
|10|サンドバッグ ×2|Sphere scaled (1,0.45,0.7) + noise displacement + Extrude handle strap|0.34×0.12|M_FABRIC_COARSE|
|11|レフ板|Box(1.0,0.7,0.015) with a crinkled-foil canvas texture, one corner bent (vertex offset)|1.0×0.7|M_REFLECTOR|
|12|肖像画の壁 (14 frames)|14× Extrude profile frames, 4 profile variants, 3 sizes, hung with 1–3° random tilt|0.22–0.55|M_WOOD_DARK/M_PAPER_YEL|
|13|年代記パネル (chronicle)|Plane 5.8×2.2 with 31 photo quads as a single canvas texture + 4 Box "gap" recesses|5.8×2.2|M_PAPER_YEL/M_PLASTER|
|14|レリーズケーブル|TubeGeometry along a CatmullRom of 8 points, hanging|0.75|M_FABRIC/M_BRASS|
|15|フィルムホルダー ×4|Box(0.14,0.008,0.18) + Extrude dark slide tab + Extrude label|0.14×0.18|M_ENAMEL_BLK/M_PAPER_YEL|
|16|木製脚立|2 Box A-frames + 4 Box steps + Torus hinge + chain|0.46×1.30|M_WOOD_DARK|
|17|ポーズ台 (posing platform)|Box(1.2,0.12,0.9) + Extrude edge moulding|1.2×0.9|M_WOOD_DARK/M_FABRIC|
|18|扇風機 (period, off)|Lathe motor housing + Torus cage rendered as 24 radial Cyl wires + 3 Extrude twisted blades|0.30 dia|M_STEEL_PAINT/M_BAKELITE|
|19|壁の電源盤 + 布巻きコード|Box outlet plate + TubeGeometry cloth cord snaking to each lamp, taped to floor with Box tape strips|—|M_BAKELITE/M_FABRIC|

### 暗室 (17)
| # | Prop | Recipe | Dims | Material |
|---|---|---|---|---|
|1|引き伸ばし機 支柱|Box column with Extrude dovetail track + Cyl counterweight|0.09×1.05|M_ENAMEL_BLK|
|2|引き伸ばし機 ヘッド|Box lamphouse + Lathe condenser housing + Lathe lens + red filter on a swing arm|0.24×0.30|M_ENAMEL_BLK/M_GLASS|
|3|引き伸ばし機 ベースボード|Box(0.42,0.024,0.50) + Extrude edge scale markings|0.42×0.50|M_WOOD_DARK|
|4|ホーロー現像バット ×3|Extrude rounded-rect shape, depth 0.06, with a 0.004 inner wall + rolled rim Torus|0.32×0.25×0.06|M_ENAMEL_WHT|
|5|バットのラベル ×3|Plane decals 0.09×0.03, peeling corner (2-vertex lift)|0.09×0.03|M_PAPER_YEL|
|6|薬品瓶 ×6|Lathe amber bottle `[(0,0),(0.035,0),(0.038,0.02),(0.036,0.11),(0.014,0.13),(0.016,0.15)]` + Cyl bakelite cap|0.08×0.16|M_GLASS_AMBER/M_BAKELITE|
|7|安全灯|Box housing + Lathe dome + red glass Circle emissive + Cyl swivel bracket|0.16×0.20|M_STEEL_PAINT/M_GLASS_RED|
|8|乾燥ライン + 洗濯挟み|CatmullRom TubeGeometry with sag + 6× (2 Box jaws + Cyl spring)|1.9 span|M_FABRIC/M_WOOD_DARK|
|9|吊るされたプリント ×6|Plane 0.12×0.16, 8×10 segments, gentle curl via vertex sine|0.12×0.16|M_PAPER_PHOTO|
|10|暗室タイマー|Lathe bezel + Circle dial face + 2 Box hands + Cyl bakelite base|0.11 dia|M_BAKELITE/M_GLASS|
|11|ウェットベンチ|Box top with a 0.02 raised lip Extrude + 4 Cyl steel legs + Box lower shelf|1.6×0.85×0.60|M_STEEL_PAINT/M_LINO|
|12|トング ×3|2 thin Box arms + Torus pivot, splayed differently each|0.28|M_BAKELITE|
|13|薬品棚|Box back + 3 Box shelves + Extrude lip rails|1.0×0.9×0.20|M_WOOD_DARK|
|14|遮光カーテン|Plane 20×14 segments, catenary + noise fold displacement, doubled sided|1.0×2.2|M_VELVET (blackout variant)|
|15|印画紙の箱|Box(0.28,0.06,0.36) + Extrude lid lip + printed canvas label|0.28×0.36|M_CARD|
|16|排水口 + 濡れ床|Cyl recess + Torus grate ring + 8 Box bars; floor patch with roughness 0.12 puddle mask|0.11 dia|M_STEEL_PAINT|
|17|メスシリンダー ×2|Lathe cylinder with graduation decal + spout lip|0.05×0.22|M_GLASS|

### 事務室 (17)
| # | Prop | Recipe | Dims | Material |
|---|---|---|---|---|
|1|事務机|Box top + 2 Box pedestals + 6 Extrude drawer fronts + Lathe pulls + Extrude apron|1.4×0.72×0.70|M_WOOD_DARK/M_LINO|
|2|壁金庫|Box body + Box door with Extrude bevel + Lathe dial (0.10) + Extrude spoke handle + Torus hinge|0.44×0.44×0.30|M_STEEL_PAINT/M_BRASS|
|3|金庫ダイヤル目盛|Circle with 100 tick canvas texture + engraved index Extrude|0.10 dia|M_BRASS|
|4|緑ガラスのデスクランプ|Lathe shade `[(0.06,0),(0.11,0.02),(0.115,0.05),(0.10,0.055)]` + Cyl brass column + Lathe base + Cyl pull chain|0.24×0.36|M_GLASS_GREEN/M_BRASS|
|5|黒電話|Lathe body + handset (2 Lathe ends + Box bar) + Cyl finger dial with 10 Extrude holes + TubeGeometry coil cord (helix, 22 turns)|0.24×0.16|M_BAKELITE|
|6|予約台帳 ×5|Box + Extrude spine + canvas cloth-grain texture + Plane label|0.22×0.05×0.31|M_CARD/M_PAPER_YEL|
|7|書類棚|Box carcass + 5 Box shelves + 18 Box box-files with individually rotated lean|1.8×2.1×0.36|M_WOOD_DARK/M_CARD|
|8|作業手順書 (procedure manual)|Box + Extrude ring binder: 3 Torus half-rings + Plane pages|0.24×0.30|M_CARD/M_PAPER_YEL|
|9|回転椅子|Lathe 5-star base + 5 Cyl casters + Cyl gas column + Extrude curved seat + Extrude back|0.58×0.92|M_WOOD_DARK/M_VELVET|
|10|灰皿 + 吸い殻|Lathe glass bowl with 3 Extrude notches + 3 Cyl stubs|0.12 dia|M_GLASS/M_PAPER|
|11|デスクブロッター|Box(0.55,0.006,0.38) + 4 Extrude leather corners|0.55×0.38|M_LEATHER/M_PAPER_YEL|
|12|ゴム印セット|6× (Cyl handle + Box rubber face) in an Extrude rack|0.14×0.08|M_WOOD_DARK/M_RUBBER|
|13|そろばん|Box frame + 13 Cyl rods + 65 Lathe beads (biconic profile)|0.34×0.14|M_WOOD_DARK|
|14|壁掛け時計 (working)|Lathe bezel + Circle face + 3 Box hands + Cyl pendulum case|0.26 dia|M_WOOD_DARK/M_GLASS|
|15|1985年カレンダー|Plane + Cyl top wire + 2 Extrude staple bars, curled bottom corner|0.30×0.44|M_PAPER_YEL|
|16|急須と湯呑 ×2|Lathe teapot + Torus handle + TubeGeometry spout + 2 Lathe cups|0.14 / 0.06|M_CERAMIC|
|17|窓 + 桟|Box frame + 6 Plane panes + Extrude sill + 2 Box latch|1.1×1.3|M_WOOD_DARK/M_GLASS|

---

## 4. MATERIAL SPEC TABLE

All `MeshStandardMaterial` unless noted. Textures generated once at boot into an atlas of `CanvasTexture`s; every one gets `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` and appropriate `repeat` + `RepeatWrapping`. **Every material gets a roughnessMap derived from its albedo canvas** (cheap: reuse the same canvas, adjust `roughness` scalar) — uniform roughness is the #1 tell of a prototype.

| Name | Base hex | Rough | Metal | Canvas recipe |
|---|---|---|---|---|
| **M_PLASTER** | `#B9AE9C` | 0.92 | 0.0 | 1024². Base fill, then 3 octaves value-noise (scale 4/16/64, amp 0.10/0.05/0.025) multiplied. 40 elongated blotch ellipses at 0.06 alpha `#8A7B66` for damp staining, concentrated toward the floor line via a vertical gradient mask. 6 hairline cracks: random-walk `lineTo` polylines, 1px, `#6E6152`, with 2px `#C9BFAF` highlight offset 1px up. Normal map from a Sobel of the luminance, strength 0.6. |
| **M_WOOD_DARK** | `#3A2A1E` | 0.55 | 0.0 | 1024×512. 60 grain bands: sine-warped vertical stripes, `x' = x + 14*sin(y*0.012 + seed)`, alternating `#2E2016`/`#4A3625` at 0.5 alpha. 8 knots: concentric ellipse rings with 1.6 aspect. Overlay a 0.12-alpha vertical gradient (darker at bottom = grime). Clear-coat wear: 200 random 1×6px scratches `#6A5340` alpha 0.15 along the grain only. |
| **M_LINO** | `#8C7F6E` | 0.42 | 0.0 | 1024². Fine speckle: 90 000 single pixels in 4 tones (`#7A6E5E`,`#9B8E7B`,`#6B6153`,`#A79A86`). Overlay 3 seam lines at 341 px spacing, 2px `#5F564A`. **Wear paths**: radial-gradient soft ellipses at doorways and in front of the camera position, multiply-blended at 0.25 alpha with `#B8AC98` (worn lighter) and roughness there dropped to 0.22 — polished by feet. 12 dark scuff arcs. |
| **M_TERRAZZO** | `#A79E92` | 0.30 | 0.0 | 1024². Base `#A79E92`. 2500 chips: random convex polygons 4–14 px, colours `#6D6459`,`#D8D2C6`,`#3E4A44`,`#8A6F5C`, each with a 0.5px darker outline. Then a global 0.06-alpha noise for polish variation. Roughness map: chips 0.18, matrix 0.34 — different stones polish differently, this is what makes terrazzo read. |
| **M_BRASS** | `#B08D4F` | 0.34 | 0.92 | 512². Base, then 5-octave noise at 0.08 amp for cast variation. **Tarnish**: 30 soft dark-green blobs `#4E5A3C` alpha 0.30 pooled in what would be crevices — bake this via a vertical gradient so it collects low. Fingerprint smears on handles: 8 elongated soft ellipses, roughness +0.25 locally. Roughness map essential: polished contact areas 0.18, tarnished 0.55. |
| **M_ENAMEL_BLK** | `#131316` | 0.62 | 0.15 | 512². Crinkle finish: Worley/cellular noise, 64 cells, take the distance field, `pow(d,0.6)`, map to `#0E0E10`–`#232328`. Normal map from that field, **strength 1.4** — the crinkle must catch a specular ridge or the camera looks like a black box. Edge wear: 3px lighter `#4A4640` strokes along the UV borders. |
| **M_VELVET** | `#2A1F26` | 0.98 | 0.0 | 512². Nearly flat; the look comes from the *shader*, not the texture. Add a custom `onBeforeCompile` Fresnel rim: `vec3 sheen = vec3(0.42,0.34,0.40) * pow(1.0 - dot(N,V), 2.4);` added to outgoing light. Texture supplies only a soft 3-octave nap variation at 0.05 amp plus vertical drape darkening. Velvet without a sheen term reads as grey felt. |
| **M_PAPER_YEL** | `#D9CBA6` | 0.88 | 0.0 | 1024². Base, then a radial gradient `#C4AF83` from edges inward (foxing/age darkens edges first). 60 foxing spots: soft brown `#9A7B4E` circles r=2–7 at 0.18 alpha. Fibre: 3000 1px `#EFE4C6` and `#C0B08A` dashes at random angles. Fold creases where relevant: 1px `#B3A17C` line + 1px `#EDE3C8` highlight. |
| **M_GLASS_WIRE** (frosted wire glass, `MeshPhysicalMaterial`) | `#C7D2D6` | 0.55 | 0.0 | `transmission:0.86, thickness:0.012, ior:1.5, roughness:0.55` + 512² map: reeded texture = vertical sine stripes 0.08 amp, plus the **wire mesh**: a 26 px grid of 1px `#8E9A9E` lines rotated 0° (chicken-wire look). Also feed the same grid into `roughnessMap` so the wire stays sharper than the glass. |
| **M_ENAMEL_WHT** | `#E4E2DA` | 0.24 | 0.0 | 512². Base near-white, subtle blue-grey `#D2D6D4` gradient in the pan bottom. **Chips**: 14 irregular blobs 3–9 px filled `#2B2B2E` (the steel showing) with a 1px rust `#7A4A2C` halo, clustered on rims. Chemical staining in the tray floor: 3 soft brown-purple `#6B4A52` amorphous washes at 0.20 alpha. |
| **M_BAKELITE** | `#241C18` | 0.38 | 0.0 | 512². Marbled: 4 layers of stretched turbulence noise mixing `#1A1310`/`#33261F`/`#0F0B09`, warped by `sin(y*0.03)`. Mould seam: 2 vertical 1px `#443329` lines at u=0.25/0.75. Polish: roughness map with contact areas (dial, handset grip) at 0.22, rest 0.42. |
| **M_STEEL_PAINT** | `#4E5450` | 0.68 | 0.25 | 512². Base grey-green industrial. **Orange-peel** in the paint: fine cellular noise, 0.04 amp, into the normal map. Chips on every edge: 40 irregular 2–6 px `#6E5B49` shapes with a 1px `#8A5A34` rust ring, and rust streaks running downward from each — 3 px vertical gradient tails, `#7A4A2A` at 0.25 alpha. |

Supporting: **M_GLASS_AMBER** `#8A5A1E` transmission 0.72 rough 0.28; **M_GLASS_RED** (safelight) `MeshBasicMaterial` `#FF2A10`, toneMapped false when lit; **M_GLASS_GREEN** (desk lamp shade) `#1E4A32` transmission 0.55, backside emissive `#7FE0A8` at 0.35 when on; **M_PAPER_PHOTO** `#CFC9BC` rough 0.34 with a deliberate gelatin sheen (roughness 0.30 on the image area, 0.75 on the border); **M_FABRIC_COARSE** `#5A5044` rough 0.95 with a 3px woven checker normal; **M_CARD** `#8E7C60` rough 0.94; **M_CERAMIC** `#DCD8CE` rough 0.20 with fine crazing lines; **M_LEATHER** `#4A3428` rough 0.65 with cellular pebble normal; **M_REFLECTOR** `#D8D4CC` rough 0.28 metal 0.6 with a crumpled-foil normal.

---

## 5. LIGHTING RIGS

Shadow budget: **maximum 3 shadow-casting lights alive at any time**, `mapSize 1024` for the key, `512` for others, `shadow.camera.near 0.15`, `far` set tight per light, `shadow.bias -0.0008`, `shadow.normalBias 0.02`. Anything else is `castShadow=false`. Non-shadow fills do the heavy lifting.

### STATE A rig (blackout)
| Light | Type | Colour | Int | Pos | Dist/Decay | Shadow | Motivated by |
|---|---|---|---|---|---|---|---|
| Moon | Directional | `#9FB6C9` | 0.85 | `(-6, 7, 9)` → target `(0,1,0)` | — | yes, 1024, cam ±7 | moonlight through shopfront |
| Street sodium | Spot | `#FFB86B` | 1.4 | `(1.2, 2.6, 5.5)` | dist 9, decay 2, angle 0.6, penumbra 0.8 | no | streetlamp beyond the glass |
| Window bounce | Rect-ish Point | `#1E2A38` | 0.25 | `(0, 1.2, 2.2)` | 6 / 2 | no | light off the terrazzo |
| Rain caster | Directional | `#7F98AC` | 0.30, animated | same as moon | — | yes (shares moon map) | drives moving rain shadows |

### STATE B rig (tungsten) — per room
**Hall:** 2× PointLight `#FFC489` int 1.6, pos `(±1.4, 2.55, 0)`, dist 6.5, decay 2, one casts shadow (1024). Fixture: bare globes with an emissive `#FFD9A8` sphere and a tiny `SpriteMaterial` bloom flare.
**Studio:** 2× SpotLight `#FFB870` int 3.2, pos `(-2.2, 2.5, 1.4)` and `(2.4, 2.6, 1.0)`, angle 0.52, penumbra 0.45, dist 11, decay 2, **left one casts shadow (1024)**. Fixture: the two tungsten floods with barn doors — set `spot.angle` to actually match the barn-door aperture so the pool on the floor lines up with the fixture's mouth. Add 1× PointLight `#FFD0A0` int 0.5 dist 4 inside the lamp housing so the reflector bowl self-illuminates. Plus the failed fluorescent: PointLight `#C8E4FF` int 0.0→0.9 flickering (see detail #7), never shadowed.
**Darkroom:** 1× PointLight `#FFCE9E` int 1.1, pos `(0, 2.25, 0)`, dist 4, decay 2, shadow 512. Fixture: caged bulkhead lamp; add the cage's own bar shadows by making the cage geometry a shadow caster — free, dramatic, striped.
**Office:** 1× PointLight `#FFDCA8` int 1.8 dist 2.4 decay 2 at `(-0.5, 0.94, -0.4)` under the green shade — the shade clips it so it pools on the desk, shadow 512. 1× PointLight `#DCE8F0` int 0.55 dist 5 at ceiling for the fluorescent. The desk lamp's cone edge should land exactly on the safe dial: that's how you point the player without a UI arrow.

### STATE C rig (safelight)
Per room: 1× PointLight `#FF2E14` int 2.2, dist 7.5, decay 2, mounted at the safelight fixture position (Darkroom `(0.4,2.0,-1.0)`; the other rooms get a "borrowed" one at ceiling centre, justified by the building's shared safelight circuit — say so in a note the player can find). **Only the Darkroom's casts a shadow.** Add per room a `#FF6A3A` int 0.35 dist 3 non-shadow fill at floor level to keep lower surfaces from crushing. All tungsten lights off. Moon at 0.12. Phosphor marks are additive `MeshBasicMaterial`, not lights — but each gets one tiny PointLight `#7FFFC0` int 0.10 dist 0.5 so it *feels* like it glows onto its wall.

### STATE D rig (dawn)
Directional `#FFE3C0` int 2.6, pos `(0, 3.5, 11)`, target the door threshold, shadow 2048, `camera.left/right ±3`, `top/bottom ±3.5`, bias `-0.0006`. Plus an area-fill PointLight `#EFE0CC` int 1.1 dist 8 just outside the door. Interior tungsten drops to 0.35 so the outside wins decisively. The god-ray quad and 3 dust sprites drift through the doorway.

---

## 6. POST-PROCESSING CHAIN

Order, `EffectComposer`:
1. **RenderPass**
2. **UnrealBloomPass** — `strength 0.34`, `radius 0.62`, `threshold 0.86`. State overrides: A `0.22/0.70/0.90`, C `0.28/0.55/0.78`, D `0.62/0.75/0.70`. Threshold is high on purpose: only practical fixtures, the safelight glass and the phosphor marks bloom.
3. **Custom ShaderPass "GrainVignetteCA"** (one pass, three effects — cheaper and avoids stacking):
   - Chromatic aberration: radial, `amount = 0.0016` at edges, 0 at centre, `pow(r,2.2)`. Sample R at `uv + dir*a`, B at `uv - dir*a`.
   - Vignette: `v = smoothstep(0.92, 0.28, length(uv-0.5)*1.42)`, `mix(0.55, 1.0, v)` — strength 0.45 in A/C, 0.30 in B, 0.20 in D.
   - Film grain: `hash(uv * resolution + time)`, amplitude `0.030` in A/C, `0.018` in B, `0.012` in D. **Grain is luminance-only** (`col += (n-0.5)*amp`, applied to all channels equally) — coloured grain looks like a bug.
4. **SMAAPass** (or `antialias:true` + no SMAA on low-end; detect via `renderer.capabilities.isWebGL2` + a frame-time probe).

Additionally, a **subtle per-state LUT via a 3×3 colour matrix** in the same shader pass: State B lifts blacks toward `#12100C` and pulls highlights toward `#FFF2DE`; State A lifts blacks toward `#0B1016`. A true lifted-black filmic curve beats any amount of extra bloom.

### DO NOT — and why
- **No SSAO/GTAO.** On a mostly-diffuse interior at 60 fps in a browser it costs 4–7 ms and produces the dark-halo-around-everything look. Bake the same read into the albedo canvases (see detail #3) and into small dark contact quads.
- **No screen-space reflections.** They will smear and swim on the wet darkroom floor, which is exactly where the player looks closely. Use a cheap `MeshStandardMaterial` with low roughness + envMap instead.
- **No default `THREE.PMREMGenerator` on a bright HDRI.** It'll wash the interior with a neutral studio ambience that kills the state contrast. Generate the env map from a tiny 64×32 canvas painted with *this state's* sky/ground colours, re-baked on state change.
- **No motion blur, no depth of field on the free-look camera.** Node-based free-look with DOF makes players feel their eyes are broken. DOF *is* allowed inside framed close-ups (P4 ground glass, P6 loupe), where it's diegetic.
- **No `MeshBasicMaterial` for anything but emissive glass and the phosphor marks.** Unlit props are instantly visible as "not part of the scene."
- **No lens flares, no anamorphic streaks.** Wrong lens language for 1985 Japan interior; it reads as a Unity asset-store demo.
- **No `toneMapping = NoToneMapping`.** Untonemapped highlights clip to flat white and destroy the tungsten globes.
- **No fog colour that differs from the dominant light colour.** Mismatch reads as a grey rectangle at the far wall.
- **No shadow map above 2048, ever.** And never 4 shadow lights — the frame cost isn't the problem, the *shadow acne* on procedural geometry with no lightmap UVs is.
- **No bloom threshold below 0.8.** Low threshold blooms the walls and everything turns to milk.

---

## 7. TWELVE AUTHORED DETAILS

1. **Rain on the frosted glass, procedurally animated.** A second `CanvasTexture` on the shopfront updated at 20 fps: 40 droplets with gravity, each leaving a fading trail that *retains* clarity (lower roughness in the trail). Feed it into `roughnessMap` only, not albedo — the glass doesn't get darker, it gets locally clear. The streetlamp behind it smears accordingly.
2. **Moving rain shadow on the Hall floor.** Animate the moon directional's shadow by putting a slowly scrolling alpha-tested plane (the rain-streak canvas) between it and the room. Costs nothing, and the Hall floor comes alive.
3. **Baked contact darkening in every albedo canvas.** Where a prop meets the floor or wall, draw a 12–20 px soft dark gradient into *that surface's* canvas. Plus a 0.6 m soft dark `Circle` decal quad (multiply blend, opacity 0.35) under every large prop. This is 90% of what AO would have given you, for 0 ms.
4. **Every hung frame is 1–3° off level, and no two by the same amount.** Store a per-object seeded random. Perfectly level frames are the loudest "this is a game engine" signal in the medium.
5. **Dust motes only in light shafts.** 400-point `Points` cloud, confined to a box around each spot cone, `size 0.012`, `sizeAttenuation`, additive, opacity 0.30, drifting on a slow curl-noise. In State A there are none; in State B the studio floods make them visible; in C they're red. Their appearance at fuse-restore is a beat in itself.
6. **The floor wear paths match where the player actually stands.** Bake the lino/terrazzo wear ellipses at the exact viewpoint coordinates and between them. Forty years of a photographer walking camera→darkroom is a story told by a texture.
7. **The fluorescent that won't strike.** In the Studio, one ceiling fluorescent flickers on fuse-restore: intensity follows a scripted array `[0.9, 0, 0.7, 0, 0, 0.85, 0.1, 0, 0]` at 60 ms steps, then settles at 0.0 and stays dead, with a faint `#C8E4FF` glow at one tube end only. It never works again. Nothing depends on it. It's atmosphere with a memory.
8. **Interrupted mid-gesture staging.** A teacup with a dried ring in it, half-drunk. A ledger open to a date with the pen still lying in the gutter, uncapped, nib dried. A film holder with its dark slide half-pulled. One of the studio lamp's barn doors left open, the others closed. No prop is neatly parallel to anything.
9. **The unfaded clock disc has a nail with a scratch below it.** Not just a bright circle — a 4 cm vertical hairline scratch where the clock swung when the wall was knocked. Cheap detail that implies an event.
10. **The velvet backdrop hangs with a real catenary and a hem crease.** Sag the plane's vertices with `cosh`, add a horizontal fold line 0.4 m from the bottom where it's been rolled for decades, permanently pressed. When the crank raises it, the crease travels up with it.
11. **Warm/cold separation on every silhouette.** In State B, ensure at least one cold rim light grazes each major prop's window-facing edge. Rig it as a single low-intensity `#8FA8BC` directional; it makes procedural geometry read as *volumes* rather than flat-shaded shapes and is the difference between "3D scene" and "photograph."
12. **Sound-motivated micro-motion.** The drying-line prints sway 0.5° on a 6 s cycle. The hanging bulb in the Hall has a 0.3° pendulum on a 4.2 s cycle with a lagged shadow. The whole building is faintly, imperceptibly moving; a completely static interior reads as dead geometry, not a dark room.

---

## 8. TEN AMATEUR TELLS AND THEIR FIXES

1. **Every surface at the same roughness.** → Ship a roughnessMap for every single material; vary contact/wear areas by ±0.25. This alone is the largest quality jump available.
2. **Perfectly sharp 90° corners everywhere.** → Every prop edge that catches light gets a chamfer. Cheapest method: build boxes from a rounded-rect `ExtrudeGeometry` with `bevelEnabled:true, bevelSize:0.004, bevelThickness:0.004, bevelSegments:2`. Real edges catch a specular highlight; hard edges disappear.
3. **Objects floating or intersecting the floor.** → Snap every prop to `y = floorY + boundingBox.min` offset at construction, then add the contact decal from detail #3. A 2 mm gap under a cabinet destroys an otherwise good frame.
4. **Textures at one repeat scale, tiling visibly.** → Set `repeat` from real-world dimensions (`texel ≈ 1.5 mm`), and break tiling by overlaying a second large-scale, low-frequency noise texture (repeat 1,1) as a multiply via `onBeforeCompile`. Never let a 1024 texture cover 6 m unbroken.
4b. *(corollary)* **UVs unmapped on lathes/extrudes.** → Always call `geometry.computeVertexNormals()` and hand-assign UVs for lathes by arc-length, or the label on the amber bottle will smear.
5. **Empty ceilings and empty floors.** → Every viewpoint's yaw/pitch limits must be verified against the ceiling: if a player can look up, there must be a fixture, a stain, a beam, a cord run. Studio ceiling gets exposed joists + cloth cords; Darkroom gets the drying line and pipe run.
6. **One flat ambient light doing all the work.** → Ambient never above 0.42 and never neutral grey. Every state's ambient is tinted to its dominant light. If the scene reads without any punctual lights, the ambient is too high.
7. **Props at "nice" round positions and rotations.** → Post-process the whole scene graph at boot: for every non-structural prop, `rotation.y += (rand()-0.5)*0.09`, `position += (rand()-0.5)*0.015` on x/z. Grid alignment is invisible until you break it, then obvious.
8. **Uniform prop scale — everything roughly hand-sized.** → Deliberately include objects across three orders of magnitude in the same frame: the 6.6 m backdrop roll, the 1.45 m tripod, the 0.09 m bell, the 0.011 m fuse. Scale contrast is what makes a space feel real.
9. **Bloom and emissive standing in for lighting.** → Emissive is for the *fixture's own glass* only; the illumination must come from a real light at the fixture's position. If you delete the bloom pass and the scene goes dark, the lighting is fake.
10. **No colour separation — a single-hue scene.** → Enforce the two-temperature rule everywhere (§7 detail 11). Sample any final frame: it should contain both a hue below 4000K and above 6000K somewhere, except State C, which is deliberately monochromatic and therefore lands as a shock. Monochrome must be a choice you make once, not the default you fall into.