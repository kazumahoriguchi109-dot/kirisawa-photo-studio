## 1. DEPENDENCY GRAPH

Notation: `NODE -> requires -> [NODES]`. `A_` area, `P` puzzle, `I_` item, `K_` knowledge flag, `S_` world state, `E_` ending. Where the brief left a source unspecified I have pinned one; those are marked **(PINNED — designer must ratify)**.

```
A_HALL              -> requires -> []                                  (start)
K_PHOTO85           -> requires -> [A_HALL]                            (1985 reception photo examined; auto-copied to 手帳)
I_FUSE              -> requires -> [A_HALL]                            (reception drawer)
P1_FUSEBOX          -> requires -> [A_HALL, I_FUSE]
S_POWER             -> requires -> [P1_FUSEBOX]
A_STUDIO            -> requires -> [S_POWER]                           (studio door has an electric latch; also unlit before)
P2_OBSERVE          -> requires -> [A_STUDIO, K_PHOTO85]
K_CLOCKGAP          -> requires -> [P2_OBSERVE]
K_BACKDROP_SHAFT    -> requires -> [P2_OBSERVE]
K_CHAIR             -> requires -> [P2_OBSERVE]
I_CRANK             -> requires -> [K_CLOCKGAP]                        (brass crank hung on the nail the clock left)
I_FRAME             -> requires -> [K_CHAIR]                           (broken loupe frame, slit in the chair cushion)
I_PRINT_C           -> requires -> [P2_OBSERVE]                        (behind the 1985 frame's mount board) (PINNED)
I_LENS              -> requires -> [A_STUDIO]                          (accessory drawer in the tripod column) (PINNED)
P5b_LOUPE           -> requires -> [I_FRAME, I_LENS]
I_LOUPE             -> requires -> [P5b_LOUPE]
P3_BACKDROP         -> requires -> [A_STUDIO, I_CRANK, K_BACKDROP_SHAFT]
S_CHRONICLE         -> requires -> [P3_BACKDROP]                       (chronicle wall exposed, 4 gaps)
P4_GROUNDGLASS      -> requires -> [A_STUDIO, S_CHRONICLE]
K_MIRRORTEXT        -> requires -> [P4_GROUNDGLASS]                    ("鍵は灯の下に")
I_PRINT_D           -> requires -> [P4_GROUNDGLASS]                    (film holder, reachable once the back is opened) (PINNED)
I_KEY_DARK          -> requires -> [K_MIRRORTEXT]                      (under the tungsten lamp base)
A_DARKROOM          -> requires -> [I_KEY_DARK]
I_KEY_OFFICE        -> requires -> [A_DARKROOM]                        (hook beside the safelight) (PINNED)
A_OFFICE            -> requires -> [I_KEY_OFFICE]
I_POWDER            -> requires -> [A_DARKROOM]
I_WATER             -> requires -> [A_DARKROOM]
P5a_DEVELOPER       -> requires -> [I_POWDER, I_WATER]
I_DEVELOPER         -> requires -> [P5a_DEVELOPER]
I_NEG_OLD           -> requires -> [A_DARKROOM]                        (sleeve pegged on the drying line)
I_PRINT_B           -> requires -> [A_DARKROOM]                        (drying line, face-away)
K_TRAYS             -> requires -> [A_DARKROOM]                        (tray glyphs + bench stain trail)
K_TIMER             -> requires -> [A_DARKROOM]                        (faceplate: 九〇 / 一〇 / 三〇〇 engraved in use-order)
P7a_SAFELIGHT       -> requires -> [A_DARKROOM, S_POWER]
S_RED               -> requires -> [P7a_SAFELIGHT]
P6_ENLARGER         -> requires -> [A_DARKROOM, I_NEG_OLD, I_LOUPE, S_RED]
K_SAFECOMBO         -> requires -> [P6_ENLARGER]
K_MANUAL            -> requires -> [A_OFFICE]                          (scorched procedure manual: 4 steps, first = iris glyph)
P6b_SAFE            -> requires -> [A_OFFICE, K_SAFECOMBO]
I_NEG_FINAL         -> requires -> [P6b_SAFE]
I_PRINT_A           -> requires -> [P6b_SAFE]
K_MARK_DEV          -> requires -> [S_RED, A_HALL]
K_MARK_STOP         -> requires -> [S_RED, A_STUDIO]
K_MARK_FIX          -> requires -> [S_RED, A_OFFICE]
P7b_MARKS           -> requires -> [K_MARK_DEV, K_MARK_STOP, K_MARK_FIX]
P8_LOCK             -> requires -> [A_HALL, K_TIMER, K_MANUAL, K_TRAYS, K_MARK_DEV, K_MARK_STOP]
TRUE_DEVELOP        -> requires -> [A_DARKROOM, I_NEG_FINAL, I_DEVELOPER, S_RED]
RESTORE_WALL        -> requires -> [S_CHRONICLE, I_PRINT_A, I_PRINT_B, I_PRINT_C, I_PRINT_D]
E_NORMAL            -> requires -> [P8_LOCK]
E_TRUE              -> requires -> [P8_LOCK, TRUE_DEVELOP]
E_HIDDEN            -> requires -> [P8_LOCK, TRUE_DEVELOP, P7b_MARKS, RESTORE_WALL]
```

**Valid topological order** (every edge above points strictly left→right in this list, which is the proof of acyclicity — a graph admitting a linear extension has no cycle):

`A_HALL, K_PHOTO85, I_FUSE, P1_FUSEBOX, S_POWER, A_STUDIO, P2_OBSERVE, K_CLOCKGAP, K_BACKDROP_SHAFT, K_CHAIR, I_CRANK, I_FRAME, I_PRINT_C, I_LENS, P5b_LOUPE, I_LOUPE, P3_BACKDROP, S_CHRONICLE, P4_GROUNDGLASS, I_PRINT_D, K_MIRRORTEXT, I_KEY_DARK, A_DARKROOM, I_POWDER, I_WATER, P5a_DEVELOPER, I_DEVELOPER, I_NEG_OLD, I_PRINT_B, K_TRAYS, K_TIMER, I_KEY_OFFICE, P7a_SAFELIGHT, S_RED, P6_ENLARGER, K_SAFECOMBO, A_OFFICE, K_MANUAL, P6b_SAFE, I_NEG_FINAL, I_PRINT_A, K_MARK_DEV, K_MARK_STOP, K_MARK_FIX, P7b_MARKS, TRUE_DEVELOP, RESTORE_WALL, P8_LOCK, E_HIDDEN`

Critical path length = 23 nodes (A_HALL → E_TRUE). Only one true bottleneck chain exists (P1→P2→P3→P4→A_DARKROOM→A_OFFICE); everything else is a side branch. **This is a structural risk, not a bug**: a player stuck on P4 has zero alternative work available. Recommend moving `I_KEY_OFFICE` to the studio's reception-side key board instead, so the office (and its manual, its ledgers, its phosphorescent mark) opens in parallel with the darkroom chain and a stuck player always has a second room to chew on.

Two deliberate near-cycles that must NOT be implemented as real cycles:
- **S_RED is required by P6 but S_RED reveals marks in rooms whose keys come from P6's downstream.** Resolved because `K_MARK_FIX` (office) is optional for P8. Do not make it mandatory or the graph cycles.
- **P4 reads the chronicle wall, which P3 exposes, and P3's crank comes from P2, which needs the 1985 photo that also hides I_PRINT_C.** No cycle, but I_PRINT_C must not be gated behind P3 or one appears.

---

## 2. SOFTLOCKS AND THEIR PROTECTION RULES

| # | Softlock | Exact protection rule |
|---|---|---|
| S1 | Fuse installed into the wrong socket / dropped, no second fuse exists | Fuse box close-up accepts the fuse only on the one dead socket; any other socket returns "既に生きている" and the item is **never removed from inventory until the target socket accepts it**. No drop verb exists anywhere in the game. |
| S2 | **Developer solution consumed on the wrong sheet** — the headline risk. Player develops a blank test sheet, TRUE ending dies | `I_DEVELOPER` is modelled as a *filled tray in the world*, not a consumable inventory item. Pouring it into the tray is a one-way world change; the tray then stays full for the rest of the game and can develop any number of sheets. Additionally: the develop action is only offered on hotspots whose `isNegative` flag is true. |
| S3 | Powdered developer poured out / distilled water drunk-equivalent wasted | `I_POWDER` and `I_WATER` have exactly one verb each: 「合わせる」. No standalone use. Combination is validated before either is decremented; a failed combination decrements nothing. |
| S4 | Crank left in another room; player is at the backdrop with no crank | Inventory is global and roomless. No "put down" verb. Key items cannot be un-equipped into the world. |
| S5 | **Backdrop lowered again**, hiding the chronicle wall and its mirror-writing | Cranking is bidirectional for feel, but `S_CHRONICLE` is a **sticky flag**: once true it never reverts, and the chronicle-wall hotspots (mirror text, 4 gaps, print restoration) remain active with the velvet at any height. Additionally clamp the crank so it cannot return below 20% — the velvet visibly cannot re-seat because the roll has jammed with age (diegetic, and audible: 軸が空回りする音). |
| S6 | Doors re-lock behind the player; key consumed on use | All four area unlocks are **permanent once opened**. Keys are consumed only into a 「使用済み」 archive section of the 手帳, never destroyed. There is no door-closing interaction. |
| S7 | **Safelight red mode makes the player unable to find the switch again** (red darkness, low contrast) | The safelight pull-cord hotspot renders with a dedicated emissive outline that is *brighter* under `S_RED` than under white light. Additionally `S_RED` is toggleable from any of the 4 areas via the 手帳's 「配電」 page, so the player is never trapped by geography. Red mode never disables movement or hotspot outlines. |
| S8 | Old negative removed from the enlarger and lost / re-inserted backwards | Negatives live in a dedicated 手帳 sleeve page and cannot be discarded. The enlarger carrier accepts a negative in one orientation only; a wrong-way insert snaps to correct with a small mechanical sound rather than producing an unreadable projection. |
| S9 | Safe dial locks out after N wrong attempts | **No lockout of any kind.** Wrong combinations produce a dead 「こつ、と鈍い手応え」 and reset the dial to 0. Attempts are unlimited and untimed. |
| S10 | Posing chair rotated back to the wall before the cushion is searched | Chair rotation is a state toggle, not a one-shot. The cushion slit hotspot is reachable in both orientations once `K_CHAIR` is set. |
| S11 | **Prints slotted into the wrong chronicle gaps and unrecoverable** | Each of the four gaps accepts only its correct print (matched by year printed on the reverse). A wrong print returns to inventory with 「寸法が合わない」. Correctly placed prints can still be lifted back out until the player leaves. |
| S12 | **The exit door opens and the run ends before TRUE/HIDDEN content is seen** | Solving P8 unlocks the door but does **not** open it. Opening requires a second, explicit interaction gated behind a confirmation overlay: 「扉を開ければ、この家に戻ることはできない。」 with 「開ける／まだ、やり残しがある」. The confirmation copy silently changes if `TRUE_DEVELOP` is false, adding 「金庫のフィルムは、まだ現像していない。」 — a spoiler-free but unmissable warning. |
| S13 | Final negative exposed to white light / developed in the wrong state, ruined | Attempting to develop while `S_RED` is false is **refused, not punished**: 「白い灯の下では駄目だ。」 The negative is never destroyed by any action. |
| S14 | Loupe assembled and then the lens or frame needed elsewhere | Neither component has a second use. Combination is irreversible and safe. |
| S15 | P8 rings jam / mechanism breaks after repeated wrong entries | The rings have no failure state and no attempt counter that gates progress. The only counter is a hidden `wrongAttempts` used to escalate the hint ladder (see §4). |
| S16 | **The 1985 photo is destroyed to retrieve I_PRINT_C**, removing the P2 reference | On first examination the photo is permanently copied into the 手帳 as a full-resolution, always-available page. Opening the frame's mount board removes it from the wall but not from the 手帳. Order-independent: the frame cannot even be opened before `P2_OBSERVE` completes. |
| S17 | Camera bellows / ground glass breakable, blocking P4 | No object in the game has a destroyed state. The view camera has exactly two interactions: 向きを変える and 覗く. |
| S18 | Player finishes P8 in the hall, then discovers the darkroom is now unreachable because of a scripted state change | No puzzle solution ever revokes an area, an item, a knowledge flag, or a hotspot. Assert this as a unit test: **for every state transition, the set of reachable nodes is monotonically non-decreasing.** This single invariant kills the whole class. |

---

## 3. UNFAIR DEDUCTIONS — MISSING CLUES AND WHERE TO PLACE THEM

| # | The unsupported leap | What the player provably does not hold | Prescribed clue and its exact location |
|---|---|---|---|
| U1 | P2: "this photograph is *this* room, and it is *old*" | No date, no confirmation of viewpoint | Print a caption on the mount board bottom edge: 「昭和六十年 春 霧沢写真館 一同」 with names 霧沢響一・霧沢灯 listed. Places the date, the building, **and the daughter's name in the first 90 seconds** — which U5 depends on. |
| U2 | P2: "I am supposed to compare, not just look" | Nothing tells the player comparison is the mechanic | The photo, when examined, docks as a **semi-transparent pinned card in the corner of the screen** that persists while free-looking in the studio. The affordance teaches itself. A one-line 手帳 note on pickup: 「同じ場所を、四十年前が写している。」 |
| U3 | P3: "the brass crank belongs to the backdrop shaft" | The crank is a bare object; nothing links it to the roll | Give the crank's square socket and the shaft's square boss **the same distinctive worn brass finish and identical cross-section**, and put a 1cm-deep circular rub-mark on the wall plaster around the shaft where a hand has swung the crank for years. On examining the shaft with the crank in inventory, the item icon pulses once. |
| U4 | P4: "the ground glass inverts the image" | Real photographers know; the player does not | **Mandatory harmless tutorial:** the camera starts aimed at the studio wall clock-nail area where a printed 「非常口」 exit placard hangs. The very first look through the ground glass shows that placard visibly reversed, and the 手帳 auto-writes 「すりガラスの像は、上下も左右も裏返る。」 The player learns the rule on text they already know the shape of, before it matters. |
| U5 | P4: mirror text 「鍵は灯の下に」 → "灯 means the studio lamp" | The pun on the daughter's name creates a genuine ambiguity | This is a *good* ambiguity only if both readings are known. U1 supplies the name. Then make the wrong reading harmless-but-rewarding: examining the chronicle photos of 灯 (the girl, cut out) yields a 手帳 memory entry. The right reading is disambiguated by a single wax drip trail on the floor leading to the tungsten lamp base — visible only after `S_CHRONICLE`. |
| U6 | P5: "the powder needs *distilled* water, not the tap" | Nothing forbids the sink | A yellowed handwritten tag wired to the tap: 「水道水厳禁 ― 硬度」. Attempting the tap gives a refusal, not a failure. |
| U7 | P6: "the enlarger needs the white light off" | Standard darkroom knowledge, not player knowledge | Stencilled on the enlarger column at eye height in the close-up: 「白色灯 消灯確認」. Plus: attempting projection under white light produces a washed-out, obviously-unreadable image rather than nothing — the failure teaches the fix. |
| U8 | P6: "a *loupe* held to a *projection* magnifies it" | Physically true, conceptually odd — you'd magnify a print, not a wall | Reframe the interaction: the enlarger's projection falls onto a **white enamel focusing easel** on the bench, not the bare wall. Loupes on easels are the actual, legible affordance, and the easel gives the projection a physical surface the player can bring a tool to. |
| U9 | P6→safe: "there is a safe worth a combination" | If the combination is learned before the office exists, the number is contextless | Two guards: (a) the projected photograph unmistakably shows a wall safe with its door swung open and a slip taped inside; (b) move `I_KEY_OFFICE` to the studio key board (see §1) so the office and its visible safe are known before P6 is solvable. |
| U10 | P7: "the marks continue into other rooms" | The safelight is a darkroom device; nothing suggests leaving | The **first** mark the player finds must be in the darkroom itself and must be a partial: a painted arrow with 「三」 beside it and no duration. 手帳 auto-note: 「刷毛を持った人は、この部屋を出ている。」 The count 三 also tells the player how many to look for. |
| U11 | P8: "the tray labels are lying to me" | The brief says they are rearranged, but the player has no way to know | Three independent tells, all in the darkroom close-up: (a) the wet bench has three **stencilled position numbers** under the trays that do not match the label sequence; (b) each tray's chemical staining ring is a different colour and the *bench* carries matching residue rings in a different arrangement; (c) the bench has a visible slope and drain trough, so the liquid path order is physically fixed regardless of where trays now sit. |
| U12 | P8: "these pictograms mean 撮影/現像/停止/定着" | Abstract glyphs with no legend | The office procedure manual's surviving page is the legend for exactly **one** glyph (the iris = 撮影, "工程その一"). The other three come from the phosphorescent marks, which pair glyph + duration. The timer supplies the duration ordering. No glyph is left unmapped by any path. |
| U13 | P8: "only four of the six ring icons are used here" | 水洗 and 乾燥 are legitimate steps | The manual's surviving page states 「当館は四工程」. Reinforced physically: the bench has three stain rings, not five, and the drying line is upstairs-adjacent — 水洗/乾燥 demonstrably happened elsewhere. |
| U14 | TRUE ending: "the safe negative is developable and I should" | The player may pocket it and leave | On pickup, the 手帳 writes a neutral observation in the contractor's voice: 「未現像のまま、四十年。」 That is a statement of fact, not an instruction — enough. |
| U15 | HIDDEN: "the four gaps want the four loose prints" | The connection between loose prints and wall gaps is implicit | Each gap in the chronicle wall retains a **paper tab with a pencilled year** at its lower edge; each loose print has the same year stamped on its reverse. The reverse is shown by default in the inventory close-up. |

---

## 4. BRUTE-FORCE HOLES

| Puzzle | Raw solution space | Verdict | Fix (no added tedium) |
|---|---|---|---|
| **P8 four rings** | 4 icons × 4 rings, permutation-only = **24**. Guessable in ~3 minutes. Worse: a photography-literate player knows the canonical order and solves it in one try with zero deduction. | **Critical** | Two changes. (a) **6 icons per ring, repeats permitted → 6⁴ = 1296** (add 水洗 and 乾燥 as legitimate-looking decoys). (b) **Replace the words with abstract pictograms** — 開いた虹彩絞り / 立ち上がる濃度階調 / 一本の遮断線 / 六角結晶 / 二重の波 / 洗濯挟み. This converts P8 from an *ordering* puzzle (which prior knowledge trivialises) into a *mapping* puzzle that even a professional photographer must read the room to solve. The canonical order survives thematically; the difficulty moves to the glyph legend. Feedback is **all-or-nothing**: no ring ever clicks, glows, or resists individually. |
| **Safe dial** | If 2 numbers × 0–20 = 441 → guessable | **High if under-specified** | Three numbers, 右/左/右, each 0–99, continuous rotation UI, no detents, **10⁶ space**. No per-number audible tell (this is the classic safecracking exploit — do not implement a "click" on a correct number). Wrong entry resets to 0 silently. |
| **P1 fuse box** | If the box has 4–6 sockets, trial insertion solves it | Low but real | One socket is visibly scorched black with a shattered glass tube still in it. This is not a puzzle and should not pretend to be; its purpose is the lighting change. Make it a one-click certainty. |
| **P2 three differences** | Click every object in the room; ~30 hotspots, all differences found in 2 minutes | **High** | See §5 — cost is applied to wrong clicks via *time and tone*, and the differences are made findable by design rather than by exhaustion. |
| **P3 crank socket** | Try the crank on every object | Low | Acceptable. The crank has exactly one valid target; wrong targets return a single-line refusal. No penalty needed — the puzzle's content is *finding* the crank, not aiming it. |
| **P5 combinations** | Inventory ~8 items → 28 pairs, combine-all solves both recipes | Moderate | Do not fight this — combinatorial spaces this small are not defensible and blocking them creates tedium. Instead **remove the guessing incentive**: only items with a visible 「組み合わせ可能」 corner mark can enter the combine slot (powder, water, frame, lens — four items, four pairs). The puzzle's content moves entirely to U6 (which water) and to acquisition. |
| **P6 dial reading** | None — reading, not guessing | Safe | — |
| **P7 marks** | None — searching, not guessing | Safe | Ensure the mark hotspots are not findable by clicking under white light. Their hotspots must be *disabled*, not merely invisible, when `S_RED` is false. |
| **P4 aiming** | ~6 aimable directions | Safe | Acceptable; the deduction is the inversion rule, not the aim. |

**Anti-frustration on P8 without weakening it:** track `wrongAttempts`. At 4, the 手帳 auto-writes 「皿の並びは、あてにならない。」 At 8, it writes 「タイマーの盤に、秒数が三つ彫ってある。」 At 12, the tier-3 hint unlocks in the hint menu. This is escalation, never a solution reveal, and never a lockout.

---

## 5. P2 — MAKING "FIND THREE DIFFERENCES" FAIR IN A 3D ROOM

**The core problem:** in a 2D spot-the-difference the search space is bounded by the image. In a node-based 3D room the player can look anywhere, at any distance, and cannot tell whether a difference is "an object that moved" or "an object rendered slightly differently at this LOD."

**Rules to implement:**

1. **Bound the search space to exactly the photograph's frame.** The 1985 photo was taken from one position. Place a floor node at precisely that position and mark it in-world (a taped cross on the floorboards, still there). Standing on any *other* node, the pinned photo card greys out and the 手帳 notes 「この角度では、比べられない。」 Standing on the correct node, the card snaps to full opacity and the free-look yaw/pitch limits **tighten to exactly the photograph's field of view**. The player is now comparing two images with the same frame. This is the single most important fix.

2. **All three differences must be resolvable at the node's viewing distance without zooming.** Test: render both the photo card and the live view at 1280×720 and confirm each difference is discriminable at ≥24 px. The clock disc is ~40 cm across; the backdrop is a full wall; the chair is a metre of silhouette. All three pass. Do not add a fourth, subtler difference "for depth."

3. **Difference class must be consistent and pre-taught.** All three differences are *things a person moved*: something removed (clock), something changed (backdrop), something turned (chair). Nothing is a lighting difference, a weathering difference, or a texture difference. State this rule to the player once, diegetically, via the 手帳 note on pickup: 「変わっているのは、人が手を触れたものだけだ。」 This eliminates the entire category of "is the dust different?" false leads.

4. **Wrong clicks — definition and feedback.** A wrong click is a click on any hotspot inside the photo's frame that is *identical* in both images. It is not punished and does not consume anything. It produces:
   - a short, specific, **non-generic** line of flavour text about that object (the portraits, the lamps, the tripod each have their own), and
   - the same object in the photo card briefly outlining in white, with the line 「これは、変わっていない。」
   
   The white-outline-on-the-card feedback is doing real work: it confirms the player is comparing correctly, teaches the comparison affordance, and rules that object out permanently (subsequently it renders with a faint slash mark in the card). Wrong clicks therefore *shrink the search space* — the player is never punished for method, only for aim. There is no wrong click outside the frame; those hotspots are simply inert while comparison mode is active.

5. **A correct click is two-stage.** Clicking a difference does not immediately award it. It opens the framed close-up: the nail and unfaded disc / the velvet's edge where the painted canvas is rolled behind it / the chair's back. The player must then perform one further physical act in the close-up — take the crank off the nail, note the second layer on the roll, rotate the chair. **The difference is only banked when the act is performed.** This prevents "I clicked it but nothing happened" and makes each difference a small scene rather than a checkbox.

6. **The player knows when they are done** via three layers, in increasing explicitness:
   - The 手帳 comparison page carries three empty ruled lines from the moment comparison begins. Each banked difference fills one line with a short handwritten note (「壁時計 ― 無い」). Three lines, visibly three, from the start. **The count is never hidden.**
   - The photo card itself gains a small tally in the corner: 「二／三」.
   - On the third, the comparison mode releases with a soft state change — the free-look limits open back up, the card unpins to the 手帳, and the room's ambience shifts by one degree (the rain outside gets one notch louder). No fanfare, no chime; the tone stays quiet.

7. **Do not gate P3 on completing all three.** Each difference yields its reward independently (crank / shaft knowledge / loupe frame). A player who finds two and moves on is not blocked from anything except the third's item. This removes the "I found two, I'm stuck, and I don't know it's this puzzle blocking me" failure state entirely.

---

## 6. PER-PUZZLE AUDIT TABLE

| | Purpose | Observable clue | Deduction chain | Correct feedback | Incorrect feedback | Persistent world change | Softlock protection |
|---|---|---|---|---|---|---|---|
| **P1 配電盤** | Teach the interaction grammar; deliver the first lighting change; establish that this building responds to the player | One socket scorched, tube shattered; reception drawer sits ajar with a cloth-wrapped tube visible | broken tube → identical spare → swap | Hard mechanical thunk, breaker hum, tungsten warm-up over 1.2 s room by room, rain sound gains reflections off newly lit surfaces | Non-dead sockets: 「これは生きている」; fuse stays in inventory | `S_POWER` permanently true; studio latch releases; all rooms gain their warm-light variant | Fuse never leaves inventory until accepted; no drop verb (S1) |
| **P2 観察** | Establish the 40-year gap as *evidence*, not atmosphere; distribute three items across one act of attention | Pinned 1985 photo with 1985 caption; taped floor cross at the original camera position | same frame, two dates → only human-moved things differ → three of them | Close-up opens; act performed; 手帳 line fills; tally increments | White outline on the card + 「これは、変わっていない」 + object-specific flavour; object gains a slash mark | Clock nail bare (crank taken); chair permanently rotated to face camera; velvet's second layer known | Each difference independently rewarding; nothing downstream requires all three (§5.7); photo copied to 手帳 (S16) |
| **P3 背景幕** | A physical, loud, mechanical set-piece; convert a wall into a document | Square brass boss on the roll shaft with a worn hand-swing arc rubbed into the plaster around it | crank has matching square socket → boss → turn | Motor groan, 40 years of dust falling through the light shafts, velvet rising over ~6 s, chronicle wall revealed with four white rectangles | Crank on any other object: 「合わない」 | `S_CHRONICLE` sticky-true; roll jams at 20% and can never reseat | Crank is inventory-global (S4); chronicle flag never reverts (S5) |
| **P4 ピントグラス** | Teach an optical rule, then immediately demand its use; the game's cleanest "aha" | Ground glass shows the 非常口 placard reversed on the very first look | ground glass inverts → the wall's pencil text is written reversed → it was meant to be read *here* | Text resolves and the 手帳 transcribes it in plain orientation | Aimed elsewhere: the ground glass shows that view, inverted, with nothing to read — informative, not a rejection | Camera orientation persists; film-holder back left open (yields print D) | Camera has no breakable state (S17); text stays readable forever |
| **P5 調合** | Two low-friction combines that gate the TRUE path and P6 respectively | Powder tin marked 現像剤（粉）; distilled-water bottle; tap tagged 水道水厳禁; broken loupe frame; loose lens with matching thread | powder is inert alone → needs water → not tap water | Developer: liquid poured into the enamel tray, surface settles, smell described in text. Loupe: barrel threads home with a small brass sound | Tap water: 「硬度が高い。使えない。」 Non-marked items refuse the combine slot | Tray permanently holds working developer; loupe permanently in inventory | Developer is a **world tray, not a consumable** (S2); components validated before decrement (S3) |
| **P6 引き伸ばし機** | Turn a photograph into an instrument of reading; deliver the safe combination | Negative sleeve pegged on the drying line; enlarger column stencilled 白色灯 消灯確認; white enamel easel below | negative + projection + magnification → the slip taped inside the safe door becomes legible | Projection sharpens under the loupe; three numbers transcribe into the 手帳 as 右三八 左〇七 右九一 | White light on: washed-out, obviously-unreadable projection (teaches the fix). Loupe absent: 「小さすぎる」 | Enlarger stays loaded and aligned; combination permanently in 手帳 | Negatives live in an undiscardable 手帳 sleeve; carrier self-corrects orientation (S8); safe has **no lockout** (S9) |
| **P7 安全灯** | The second building-wide state change; force re-traversal of solved rooms with new eyes | Pull-cord under a red glass shade; a partial mark in the darkroom itself reading 「三」 with no duration | red light reveals paint invisible under white → the painter walked the building → three marks total, in three rooms | Each mark fades up over ~0.8 s as the eye adjusts; 手帳 records glyph + seconds; darkroom tally 「一／三」→「三／三」 | Clicking a mark location under white light: hotspot is disabled, nothing happens (not a red herring — an absence) | `S_RED` toggleable forever from the 手帳 配電 page; found marks stay recorded | Pull-cord outline is *brighter* under red (S7); red mode never disables movement or outlines; third mark optional for P8 |
| **P8 四工程錠** | The exit; a test of whether the player learned this man's craft rather than photography in general | Four rings, six abstract pictograms each; three bench stain rings under stencilled position numbers that contradict the tray labels; sloped bench with drain; timer faceplate engraved 九〇/一〇/三〇〇 left-to-right; scorched manual page 「当館は四工程 ― その一」 beside the iris glyph | manual → 4 steps only, ring 1 = iris(撮影) → bench slope + stains → the wet three are contiguous and ordered → timer gives their *order* by duration → marks give duration↔glyph *identity* → full mapping | All four rings settle together with one deep detent; the four-ring bolt withdraws; door is **unlocked but not opened** | Nothing. No ring resists, glows, clicks, or gives partial confirmation. A single flat 「動かない」 and the rings hold their position for the next attempt | Door permanently unlocked; rings hold the correct configuration | No jam state, no attempt limit (S15); escalating 手帳 notes at 4/8/12 wrong attempts; **opening requires a second, confirmed interaction with a spoiler-free warning if the final negative is undeveloped** (S12) |

---

## 7. THREE-TIER HINT LADDER

Delivery rule: hints are the contractor's own thoughts, surfaced in the 手帳's 「気になること」 page. Tier N+1 unlocks only after Tier N has been read plus 90 seconds elapsed. No hint ever states the answer; Tier 3 always leaves at least one physical act to the player.

### P1 配電盤
- **一** 「玄関の天井灯は、さっきから一度も瞬いていない。壁の高いところ、配線が一本だけ壁紙の外へ這い出している。目で辿ってみるといい。」
- **二** 「切れているのは、たぶん一本だけだ。こういう建物は、同じものを必ず一組多く持っている。受付というのは、そういうものを仕舞っておく場所だ。」
- **三** 「引き出しの奥、布に巻かれた細いガラス管。台座が黒く焼けているほうと入れ替えてやれば、この家はもう一度だけ息を吸う。」

### P2 観察
- **一** 「受付に掛かった写真は、いま立っているこの部屋そのものだ。ただし、四十年前の。床板に、色褪せたテープの十字が残っている。」
- **二** 「同じ部屋が、二枚ある。違っているのは三つだけ。埃でも、傷でもない——人が手を触れて動かしたものだけが、変わる。」
- **三** 「写真を手元に留めたまま、ゆっくり見回せ。壁の円い日焼けと、そこに残った釘。絵の消えた背景。こちらを向いていたはずの椅子。気づいただけでは足りない、必ず触れて確かめること。」

### P3 背景幕
- **一** 「背景幕の右端、床から腰の高さのあたり。壁の漆喰に、円を描いて擦れた跡がある。誰かが毎日、同じ動きを繰り返した跡だ。」
- **二** 「軸の先が四角く出ている。同じ四角い穴を持ったものが、この部屋にひとつだけある——時計の消えた釘に、代わりに掛けられていたあれだ。」
- **三** 「差し込んで、ゆっくり回せ。モーターの唸りと一緒に、四十年分の埃が光の中を落ちてくる。幕の向こうに何があるかは、上がりきってから考えればいい。」

### P4 ピントグラス
- **一** 「大判カメラの後ろに回ってみろ。蛇腹はまだ生きているし、すりガラスはまだ像を結ぶ。」
- **二** 「一度覗けば分かる。あの硝子に映るものは、上下も左右も入れ替わっている。ならば——裏返しに書かれた字は、あそこでだけ正しく読める。」
- **三** 「カメラの向きを、あの壁へ。年表の隅、鉛筆の走り書きを硝子越しに読め。読めたら、その言葉が指している場所へ手を伸ばすだけだ。灯という字が、この家では二つの意味を持つことを忘れずに。」

### P5 調合
- **一** 「薬品棚の缶と、流しの脇の茶色い瓶。どちらも、そのままでは何の役にも立たない。壊れた枠と、転がったレンズも同じことだ。」
- **二** 「粉は水に溶いて、初めて薬になる。ただし——蛇口に針金で括りつけられた札が、何か言っている。読んでおいたほうがいい。」
- **三** 「持ち物の中で、二つを重ねろ。粉と、蒸留水。枠と、レンズ。溶いた液は琺瑯の皿へ。一度満たしてしまえば、皿は朝まで乾かない。」

### P6 引き伸ばし機
- **一** 「引き伸ばし機のキャリアに、ネガが一枚挟まったままだ。乾燥線に吊るされていたものと、同じ袋に入っていた。」
- **二** 「白い灯を消さないと、機械は何も返さない。柱に、そう書いた札が貼ってある。消してから、下の白い板を見ろ。」
- **三** 「板の上に映るのは、開いた金庫の前に立つ人影。扉の内側に、小さな紙が貼りつけてある。組み直したルーペを、投影に近づけろ。負と正が反転していることだけ、頭に入れておくこと。」

### P7 安全灯
- **一** 「暗室の壁、赤い硝子の笠がついた灯がある。紐が下がっている。この家の配電は、あの一本まで生きている。」
- **二** 「赤の下でしか浮かばない塗料がある。壁の隅にひとつ、もう見えているはずだ。その横の『三』という字は、数を数えている。」
- **三** 「赤いまま、部屋を移れ。玄関、撮影室、事務室。三つの印はそれぞれ、絵記号ひとつと秒数ひとつを、一組にして書いてある。白い灯の下では、いくら探しても何も無い。」

### P8 四工程錠
- **一** 「扉の四つの輪。刻まれているのは文字ではなく、絵記号だ。この家で毎日、順番どおりに繰り返されていた手順を指している。」
- **二** 「並べ替えられた現像皿を信じるな。台の下に彫られた番号と、皿が置かれていた染みの輪が食い違っている。信じていいのは、傾いた台を薬品が流れた向きと、タイマーの盤に彫られた三つの秒数の並びだけだ。」
- **三** 「事務室の焦げた手引きが、工程は四つだと、最初の一つは絞りの記号だと言っている。タイマーの盤が、残る三つの順序を秒数で並べている。赤い印が、その秒数に名前を与えている。六つのうち四つに絞り、左の輪から順に合わせろ。輪は、四つ全部が揃うまで何も応えない。」

---

**Two remaining recommendations outside the requested scope, flagged because they are cheap now and expensive later:**

1. Implement the monotonicity invariant (S18) as an automated assertion from the first commit — every state mutation must be checked to never shrink the reachable-node set. It is the only defence that scales as content is added.
2. `K_MARK_FIX` being optional for P8 is load-bearing for both the HIDDEN ending's distinctness and the graph's acyclicity. If the design later makes all three marks mandatory for P8, the HIDDEN condition collapses into the NORMAL path and the office/red-light dependency becomes circular. Ratify or reject this deliberately, not by drift.