# 写真収集パズル 実装監査

対象：`a5d4b56` / v1.5.0（`main`、公開版と同一）
**コードは変更していない。** 本書は現状把握のみ。

---

## 1. 写真収集システムの全体像

年代記の壁（撮影室・背景幕の裏）に四つの空枠がある。館内に散った四枚を集めて枠に戻すと
`hidden_restore` が解け、隠しエンディングの三条件のうち一つを満たす。

隠しエンディングの成立条件（`Chapter01.chooseEnding()`）:

```
last_developed        最後のネガを現像した
restored_* × 4        四枚すべてを枠に戻した   ← 本パズル
mark_hall/studio/office  赤い文字を三つ見つけた
```

三つすべてが揃わなければ `true`、`last_developed` も無ければ `normal` になる。
**写真収集は隠しエンディング専用**で、通常・真エンディングには一切影響しない。

構成要素は四種類:

| 要素 | 実体 |
|---|---|
| 収集品 | `ITEMS` の4定義（`items.ts`） |
| 世界の実体 | 各部屋の `THREE.Mesh`（`Hall.ts` / `Darkroom.ts` / `Office.ts`） |
| 取得口 | `Chapter01` のホットスポット4つ |
| 収集UI | **専用UIは無い**。`覚え書き` に `clue_photo_tally` として1行入るだけ |

---

## 2. 全写真の一覧

### 2-1. 基本情報

| # | 内部ID | 表示名 | 期待される場所 | 取得トリガ |
|---|---|---|---|---|
| 1 | `print_1` | 写真　一歳 | 玄関ホール・受付の額の台紙の裏 | `cu:record:back` を**2回**押す |
| 2 | `print_4` | 写真　四歳 | 暗室・作業台の下の棚 | `dark:understore` を**2回**押す |
| 3 | `print_7` | 写真　七歳 | 事務室・事務机の抽斗の底 | `office:desk` を**2回**押す |
| 4 | `print_last_slot` | 写真　四枚目の台紙 | 事務室・金庫の中 | `cu:safe:contents` を1回押す |

補足：`print_last`（最後の一枚）は**年代記の壁とは無関係**の別アイテム。真エンディング用で、
`CHRONICLE_PRINT_IDS` には含まれない。混同しやすいので明記する。

### 2-2. 前提条件と到達性

| # | 前提条件 | 実在 | 到達可能 | 進行必須 | エンディング必須 | 持ち物に出る | 収集UIに出る |
|---|---|:-:|:-:|---|---|:-:|---|
| 1 | **`p2_observe` 解決済み** | ○ | **条件付き** | 否 | 隠しのみ | ○ | 条件付き |
| 2 | なし（部屋に入れれば可） | ○ | ○ | 否 | 隠しのみ | ○ | 条件付き |
| 3 | なし（部屋に入れれば可） | ○ | ○ | 否 | 隠しのみ | ○ | 条件付き |
| 4 | 金庫の開錠 | ○ | ○ | 否 | 隠しのみ | ○ | 条件付き |

**四枚とも実装され、シーンに存在し、複製もなく、登録漏れもない。**
問題は到達までの経路と、それが伝わっていない点にある。

### 2-3. 設計と実装の対照

| Photo | Intended Location | Actual Implementation | Reachable | Hint Correct | Notes |
|---|---|---|---|:-:|---|
| `print_1` 一歳 | 受付の額 | `cu:record:back`（`Chapter01.ts:887`）。`visible:` が `isSolved('p2_observe')` を要求 | **条件付き** | **不完全** | ヒントは場所のみ正しい。**前提条件を一切書いていない** |
| `print_4` 四歳 | 暗室の棚 | `dark:understore`（`Chapter01.ts:2005`）。ゲートなし | ○ | ○ | 2クリック必要 |
| `print_7` 七歳 | 事務机 | `office:desk`（`Chapter01.ts:2763`）。ゲートなし | ○ | ○ | 2クリック必要 |
| `print_last_slot` 四枚目 | 金庫 | `takeSafeContents()`（`Chapter01.ts:2936`）。一括付与 | ○ | ○ | 4点まとめて渡される |

---

## 3. 進行依存グラフ

```
                        ┌─ hall:record を調べる ──→ saw_1985
                        │
  print_1 が取得可能になるまで:
        saw_1985 ──┬──→ diff_clock    (撮影室 壁の丸い跡)
                   ├──→ diff_backdrop (背景幕／巻き上げでも可)
                   └──→ diff_chair    (写場の椅子の座面)
                             ↓ 三つ揃う
                        p2_observe 解決
                             ↓
                    cu:record:back が出現
                             ↓ 1回目
                        mount_lifted（写真が見える）
                             ↓ 2回目
                        print_1 入手

  print_4:  暗室に入る → dark:understore ×2 → print_4
  print_7:  事務室に入る → office:desk ×2 → print_7
  print_last_slot: 金庫 27 → 開錠 → cu:safe:contents → print_last_slot

  四枚 → cu:chronicle:slot0..3 に selectedItem で使用 → restored_* ×4
                             ↓
                     hidden_restore 解決
                             ↓
   last_developed + restored×4 + mark×3 → 隠しエンディング
```

**枠は順不同**（`slot0..3` は `CHRONICLE_PRINT_IDS[i]` と一対一。違う写真を挿すと
`FEEDBACK.photoWrongSlot` で拒否）。ヒント3の「左から一歳、四歳、七歳」は正しいが、
順番に置く必要はなく、対応さえ合っていればよい。

---

## 4. 実装のトレース

### `print_1`（写真　一歳）

| 段階 | 所在 |
|---|---|
| アイテム定義 | `items.ts:705` `makeChroniclePrint('print_1', ...)` |
| 世界の実体 | `Hall.ts` `mountPrint`（`HallProps.mountPrint`） |
| 表示制御 | `Chapter01.ts:175` `mountPrint.visible = mount_lifted && !hasItem('print_1')` |
| 前段ホットスポット | `Chapter01.ts` `hall:record` → `cu_record` 近接、`saw_1985` を立てる |
| **取得ホットスポット** | `Chapter01.ts:887` `cu:record:back` |
| **可視条件** | `Chapter01.ts:896` `isSolved('p2_observe') && !hasItem('print_1')` |
| 取得ロジック | `Chapter01.ts:897-919` 1回目 `mount_lifted`、2回目 `grant('print_1', …)` |
| 持ち物登録 | `grant()` → `state.addItem` |
| 収集UI更新 | `Chapter01.ts:916` `refreshPhotoTally()` |
| 壁への設置 | `Chapter01.ts:1334` `cu:chronicle:slot0` |
| エンディング | `Chapter01.ts:1091` `restored_print_1` |
| ヒント参照 | `hints.ts` `hidden_restore` ステップ2「受付の額」 |

### `print_4`（写真　四歳）

| 段階 | 所在 |
|---|---|
| アイテム定義 | `items.ts:706` |
| 世界の実体 | `Darkroom.ts` `understorePrint` |
| 表示制御 | `Chapter01.ts:176` |
| 取得ホットスポット | `Chapter01.ts:2005` `dark:understore`（scope `darkroom_n`、可視条件なし） |
| 取得ロジック | `Chapter01.ts:2023-2036` 1回目 `understore_open`、2回目 `grant` |
| 収集UI更新 | `Chapter01.ts:2035` |
| 壁への設置 | `cu:chronicle:slot1` |
| ヒント参照 | `hidden_restore` ステップ2「暗室の棚」 |

### `print_7`（写真　七歳）

| 段階 | 所在 |
|---|---|
| アイテム定義 | `items.ts:707` |
| 世界の実体 | `Office.ts` `deskPrint` |
| 表示制御 | `Chapter01.ts:177` |
| 取得ホットスポット | `Chapter01.ts:2763` `office:desk`（scope `office_n`、可視条件なし） |
| 取得ロジック | `Chapter01.ts:2773-2788` 1回目 `desk_open`、2回目 `grant` |
| 収集UI更新 | `Chapter01.ts:2787` |
| 壁への設置 | `cu:chronicle:slot2` |
| ヒント参照 | `hidden_restore` ステップ2「事務机」 |

### `print_last_slot`（写真　四枚目の台紙）

| 段階 | 所在 |
|---|---|
| アイテム定義 | `items.ts:712` |
| 世界の実体 | `Office.ts` 金庫内。`safeContents` として一括表示 |
| 取得ホットスポット | `cu:safe:contents`（`safe_open` で可視） |
| 取得ロジック | `Chapter01.ts:2936` `takeSafeContents()`。4点を順に `grant` |
| 収集UI更新 | `Chapter01.ts:2971` |
| 壁への設置 | `cu:chronicle:slot3` |
| ヒント参照 | `hidden_restore` ステップ2「金庫」 |

---

## 5. 実測による検証

デバッグ経路で実機に問い合わせた結果（`a5d4b56`）:

**実験1 ― `p2_observe` 未解決で `print_1` を取ろうとする**

```
p2_solved:            false
backHotspotVisible:   false
act('cu:record:back'): hotspot cu:record:back is not visible right now
gotPrint1:            false
```

**実験2 ― 同じく `p2_observe` 未解決のまま、他の3枚を取る**

```
p2_solved:        false
print_4:          true   ← 取れる
print_7:          true   ← 取れる
print_last_slot:  true   ← 取れる
```

**実験3 ― 3枚所持した状態で収集カウンタを確認（背景幕は未巻き上げ）**

```
chronicle_open:    false
tallyClueExists:   false   ← カウンタが存在しない
hiddenHintActive:  true    ← ヒントは既に出ている
```

---

## 6. 壊れている実装・設計上の欠陥

### 欠陥A（最重要）― `print_1` だけが隠れた前提条件を持つ

`cu:record:back` の `visible:` が `isSolved('p2_observe')` を要求する。
`p2_observe` は**三つの違いをすべて見つけて初めて解ける**謎で、しかも各違いは
`markDifference()` 冒頭（`Chapter01.ts:1521`）で `saw_1985` を要求する。

つまり `print_1` に到達するまでの実際の鎖は：

```
受付の額を調べる → 撮影室で時計の跡 → 背景幕 → 椅子 → p2_observe 解決
→ 受付へ戻る → 台紙を起こす → もう一度押す → 入手
```

**8手**かかる。他の3枚は「部屋に入って2回押す」だけ。
`print_1` だけが構造的に別物でありながら、ヒントは四枚を同列に並べている。

**プレイヤーから見た症状**：ヒントの指示どおり受付の額を調べても、
台紙のホットスポットが**存在しない**。名札も出ない。「そこには何も無い」としか見えない。
ブラインドテストで中級者が 0/4、4体目のテスターが 3/4 で終わったのは、これで説明がつく。

### 欠陥B ― 収集カウンタが背景幕を巻き上げるまで存在しない

`refreshPhotoTally()`（`Chapter01.ts:2551`）の先頭:

```ts
if (!s.flag('chronicle_open')) return
```

`chronicle_open` は背景幕を巻き上げて年代記の壁を露出させたときに立つ。
それ以前に写真を取っても、`覚え書き` に `年代記の写真を集める　N／四` は**一行も出ない**。

一方 `hidden_restore` のヒントは `chronicle_open` を待たずに出る（実験3で確認）。
**「四枚集めろ」と言われているのに、何枚持っているかを確認する手段が無い**時間帯が存在する。

### 欠陥C ― 収集専用UIが無い

写真の所持状況は `覚え書き` の1行（`clue_photo_tally`）だけ。
持ち物パネルでは他のアイテムと混在し、「四枚のうち何枚か」は分からない。
題名に `N／四` は入るが、**欠陥Bの時間帯には存在しない**。

### 欠陥D ― 「2クリックで取る」が全4箇所で共通の落とし穴

`print_1` `print_4` `print_7` はいずれも1回目で容器を開け、2回目で取る。
ラベルと動詞は2回目に変わる（`棚の奥の写真`／`手に取る`）が、
ブラインドテスターは繰り返し1回目で立ち去った。前回の改稿で
1回目の文末に「手に取れる。」を追加済みだが、**効果は未検証**。

### 該当しなかったもの

- 写真が**シーンに存在しない** → 該当なし。4枚とも `visible` 制御付きで実体がある
- **複製** → なし。`CHRONICLE_PRINT_IDS` は4件、重複なし
- **登録漏れ／未スポーン** → なし。全4枚が `grant()` を持つ
- **ヒントのみに存在する写真** → なし。4枚すべて実装済み
- **進行によるブロック** → `print_1` の欠陥Aのみ。ただし詰みではない（後から解決可能）

---

## 7. ヒントの検証

`hints.ts` `hidden_restore`（謎14「壁の四つの空白」）:

| 段 | 現行文 | 判定 |
|---|---|---|
| 着眼点 | 背景幕の裏の年代記には、写真を抜き取った跡が四つある。 | **正しい** |
| つながり | 写真は館内に分けて隠されている。受付の額、暗室の棚、事務机、金庫を調べる。 | **場所は4つとも正しい。ただし `print_1` の前提条件が欠落** |
| 次の操作 | 四枚を集め、年代記の空白へ戻す。左から一歳、四歳、七歳、最後に残った一枚の順に置く。 | **正しい**（順序は任意だが対応は正しい） |

### 判定の内訳

- **ヒントは正しいか** → 場所については**正しい**。四枚とも実装と一致
- **実装が間違っているか** → 間違いではない。`p2_observe` ゲートは
  「観察の謎を解いた者だけが台紙の異常に気づく」という**意図的な設計**と読める
  （コード注釈にもその趣旨がある）
- **設計変更にヒントが追随していないか** → **これが該当**。
  ヒントは四枚を等価に扱っており、一枚だけが別の謎の解決を要求する構造を反映していない
- **必要な手がかりが削除されたか** → されていない。`clue_diff_*` は残っている
- **場所が変わったか** → 変わっていない

**結論：ヒントの誤りは「場所の間違い」ではなく「前提条件の不記載」。**

---

## 8. 修正候補（方針のみ・実装しない）

優先度順。いずれも**実装していない**。

### 高 ― 欠陥A への対処（三案のうち一つ）

- **A-1: ゲートを外す**
  `cu:record:back` の `visible:` から `isSolved('p2_observe')` を削り、
  `saw_1985` のみに緩める。他3枚と同じ「見つけたら取れる」に揃う。
  観察の謎の価値は下がるが、収集パズルは四枚とも等価になる。
- **A-2: ヒントに前提を書く**
  `hidden_restore` のステップ2に「受付の額は、写真との違いを三つ見つけてから」を足す。
  実装は無変更で、謎の設計も保たれる。**最小の変更**。
- **A-3: 拒否文を用意する**
  ゲートは残したまま、未解決時に額を調べると
  「台紙の様子までは気が回らない。まず、この部屋と写真を見比べること」を返す。
  ホットスポットが無いという**無反応状態を解消**する。

推奨は **A-2 + A-3 の併用**。謎を弱めず、無反応も消える。

### 中 ― 欠陥B への対処

`refreshPhotoTally()` の `chronicle_open` early-return を、
「壁を見つけていれば `N／四` 、まだなら『抜き取られた写真を N 枚持っている』」の
二段構えにする。ヒントが出ている以上、カウンタも出ているべき。

### 中 ― 欠陥C への対処

持ち物パネルで年代記の四枚をまとめて見せる（章別グループ、または `N／四` バッジ）。
専用UIを新設せず、既存パネル内で完結させるのが安全。

### 低 ― 欠陥D の検証

「手に取れる。」追加後の効果が未検証。次回のブラインドテストで
2クリック取得が伝わるかを確認する。伝わらなければ、1クリック取得への変更を検討。

### 低 ― 用語の整理

`print_last`（最後の一枚・真END用）と `print_last_slot`（四枚目の台紙・収集用）が
名前で紛らわしい。内部IDのみの問題でプレイヤーには出ないが、保守上の危険。
