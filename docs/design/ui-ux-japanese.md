# 霧沢写真館 ― 最後の一枚 / UI・インタラクション設計書 (DOM Overlay Spec)

---

## 0. レイヤ構成と z-index

```css
:root{
  --z-canvas:0;      /* WebGL */
  --z-vignette:10;   /* 画面周辺減光・レンズ汚れ（pointer-events:none） */
  --z-world-ui:20;   /* 3D追従ラベル（動詞チップ・気づきリング） */
  --z-hud:30;        /* 道具箱タブ・手帳タブ */
  --z-panel:40;      /* 近接視・アイテム観察・設定 */
  --z-modal:50;      /* 確認ダイアログ */
  --z-transition:60; /* シャッター幕・章タイトル */
  --z-cursor:70;     /* レティクル */
}
```
`#overlay{position:fixed;inset:0;z-index:var(--z-hud);pointer-events:none}` — 各パネルが個別に `pointer-events:auto`。WebGLキャンバスは常に入力を受けるので、パネル表示中は `#overlay[data-modal]` に `pointer-events:auto` を付けて背面をブロックする。

---

## 1. タイトル画面

### 1.1 背景処理
実景そのもの。**店の内側から見た磨りガラスのショーウィンドウ**を Three.js でそのままレンダリングし、DOM は最小限に重ねる。カメラは玄関ホールの実ノード位置から `fov 42`、ゆっくり `y` 方向に ±0.6° / 24秒 の呼吸パン（`prefers-reduced-motion` で停止）。ガラス越しに雨、外の街灯が滲む。室内は電源前なので月光のみ（`#8FA6B8` 系）。DOM側は上に以下だけを重ねる：

```css
#title-bg-grade{
  position:fixed; inset:0; z-index:var(--z-vignette); pointer-events:none;
  background:
    radial-gradient(120% 90% at 50% 42%, rgba(0,0,0,0) 38%, rgba(8,7,6,.62) 100%),
    linear-gradient(180deg, rgba(20,26,32,.30) 0%, rgba(0,0,0,0) 30%, rgba(10,8,6,.38) 100%);
  mix-blend-mode:multiply;
}
/* 雨滴のガラス汚れ：起動時に canvas で1枚描いて dataURL 化して敷く */
#title-grain{position:fixed;inset:0;background-image:var(--tex-glass);opacity:.22;mix-blend-mode:soft-light}
```

### 1.2 タイトルロックアップ（縦書き）
右3分の1に縦組み。明朝の縦組みは日本語ゲームのタイトルとして最も格が出る。

```html
<div id="title-lockup" aria-label="霧沢写真館 最後の一枚">
  <h1 class="t-main">霧沢写真館</h1>
  <span class="t-rule" aria-hidden="true"></span>
  <p class="t-sub">最後の一枚</p>
</div>
```

```css
#title-lockup{
  position:absolute; right:clamp(40px,7vw,132px); top:50%; transform:translateY(-50%);
  writing-mode:vertical-rl; text-orientation:mixed;
  display:flex; flex-direction:row; align-items:flex-start; gap:clamp(18px,1.6vw,30px);
  font-family:var(--f-mincho);
  font-feature-settings:"vpal" 1,"vkna" 1;
}
.t-main{
  font-size:clamp(46px,4.6vw,88px);
  font-weight:400;                     /* 明朝は太らせない */
  letter-spacing:.14em;
  line-height:1;
  color:#F2EBDC;
  text-shadow:
    0 1px 0 rgba(255,246,230,.32),     /* 上ハイライト＝活版の紙押さえ */
    0 -1px 0 rgba(28,22,16,.55),
    0 0 26px rgba(232,178,106,.16),    /* タングステンの残り香 */
    0 10px 40px rgba(0,0,0,.55);
}
.t-rule{ width:1px; align-self:stretch;
  background:linear-gradient(180deg,rgba(180,146,78,0) 0%,#B4924E 22%,#D8BC7C 50%,#B4924E 78%,rgba(180,146,78,0) 100%);
  box-shadow:0 0 8px rgba(216,188,124,.25);
}
.t-sub{
  font-size:clamp(18px,1.75vw,34px); letter-spacing:.42em; line-height:1;
  color:#D6C9B0; margin-block-start:.6em;
}
```
`最後の一枚` の字間 `.42em` は縦組みで最後の1字の後にも余白が付くので `margin-block-end:-.42em` で視覚的な下端を揃える。

登場アニメーション：`.t-main` は 1文字ずつ `<span>` 分割し、`clip-path:inset(0 0 100% 0)` → `inset(0)` を 340ms `cubic-bezier(.22,.61,.36,1)`、stagger 70ms、上から下へ。`.t-sub` は 520ms 遅延でフェードのみ。総尺 1.35s。

### 1.3 メニュー
左下、横組み・左揃え・縦積み。文言は確定：

| 表示 | 条件 |
|---|---|
| `はじめから` | 常時 |
| `つづきから` | セーブ有り時のみ。無い場合は非表示（グレーアウトさせない） |
| `設定` | 常時 |
| `あそびかた` | 常時 |
| `制作について` | 常時 |
| `おわる` | 全画面/スタンドアロン起動時のみ |

サブ行（`つづきから` のみ）：`第三章・暗室 ― 4時間12分` を `.menu-meta` で 13px / `--ink-on-dark-2`。

```css
#title-menu{position:absolute; left:clamp(36px,6vw,120px); bottom:clamp(56px,9vh,120px);
  display:flex; flex-direction:column; gap:6px; font-family:var(--f-gothic);}
.menu-item{
  position:relative; padding:10px 4px 10px 26px; background:none; border:0;
  font-size:clamp(17px,1.15vw,21px); letter-spacing:.16em; line-height:1.4;
  color:#CFC4B2; cursor:pointer; transition:color .18s ease, letter-spacing .22s ease;
}
.menu-item::before{ /* 選択インジケータ：真鍮の短い罫 */
  content:""; position:absolute; left:0; top:50%; width:0; height:1px; transform:translateY(-50%);
  background:linear-gradient(90deg,#D8BC7C,#B4924E); transition:width .22s cubic-bezier(.22,.61,.36,1);
}
.menu-item:hover,.menu-item:focus-visible{color:#F4EDDF; letter-spacing:.2em; outline:none}
.menu-item:hover::before,.menu-item:focus-visible::before{width:16px}
.menu-item:active{color:#E8B26A}
```
ホバー音：`WebAudio` で 1400Hz / 18ms / -26dB の極小クリック。決定音：フィルムアドバンスの「カチ」（ノイズバースト 30ms + 帯域 900Hz）。

右下に `v1.0 ／ 音量は 設定 から変えられます` を 12px `--ink-on-dark-3` で置く（初回起動時のみ 8秒表示）。

### 1.4 ホールへの遷移（`はじめから`）
物語がカメラの話なので**シャッター幕**で繋ぐ。フォーカルプレーンシャッターの2枚幕を DOM で再現。

```css
.shutter-leaf{position:fixed;left:0;right:0;height:52%;z-index:var(--z-transition);
  background:linear-gradient(180deg,#0B0908,#141110);
  box-shadow:0 0 0 1px rgba(180,146,78,.10);}
.leaf-top{top:0;transform:translateY(-100%)}
.leaf-bottom{bottom:0;transform:translateY(100%)}
@keyframes leafInTop{to{transform:translateY(0)}}
@keyframes leafInBottom{to{transform:translateY(0)}}
@keyframes leafOutTop{to{transform:translateY(-100%)}}
@keyframes leafOutBottom{to{transform:translateY(100%)}}
```
シーケンス（合計 1.32s）：
1. `0ms` メニューとロックアップが 180ms でフェード＋`translateY(6px)`。
2. `200ms` 幕が閉じる `animation:leafInTop 220ms cubic-bezier(.4,0,.2,1)`（下幕は 30ms 遅らせて実機の走行を模す）。
3. `420ms` 全黒保持。裏で玄関ホールのカメラ位置へ瞬間移動＋1フレーム描画。
4. `540ms` 「カシャ」（機械音：低域クリック 40ms ＋ バネの 180Hz 減衰）。
5. `560ms` 幕が開く `340ms`。露光のように中央から明るくなるので、`#exposure` を `filter:brightness(2.2)` → `brightness(1)` で 480ms かけて戻す。
6. `900ms` 章タイトルカードを左下に縦書きで表示：`一 ／ 玄関ホール` — 2.4秒表示、フェードアウト 600ms。同時に雨音のローパスが開く。

`prefers-reduced-motion` 時は幕アニメを廃し、`opacity` の 260ms クロスフェード＋章タイトルのみ。

---

## 2. 日本語タイポグラフィ体系（システムフォントのみ）

### 2.1 フォントスタック
```css
:root{
  --f-mincho:"Hiragino Mincho ProN","Hiragino Mincho Pro","Yu Mincho","YuMincho",
             "Noto Serif JP","Source Han Serif JP","MS PMincho","Songti SC",serif;
  --f-gothic:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic Medium","Yu Gothic",
             "YuGothic","Noto Sans JP","Source Han Sans JP","Meiryo","MS PGothic",
             system-ui,sans-serif;
  --f-num:ui-monospace,"SF Mono","Menlo","Consolas","Yu Gothic",monospace; /* 番号錠・時計・数値 */
}
```
- **明朝**：タイトル、章カード、物語文（回想・手紙・最後の一枚のモノローグ）、写真の台紙に書かれた文字。
- **ゴシック**：メニュー、設定、動詞ラベル、道具箱、ヒント本文、システムメッセージ。
- Windows の Yu Mincho は細く白ちゃけるので、明朝を使う DOM には `-webkit-text-stroke:0.012em currentColor` を当てず、代わりに `text-shadow:0 0 .5px currentColor`（Windows 判定時のみ `html.win` クラスで付与）。

### 2.2 スケール（1920px基準・`--ui-scale` で全体倍率）
```css
:root{
  --ui-scale:1;                       /* 設定「UIの大きさ」 0.9 / 1 / 1.15 / 1.3 */
  --fs-hero:  calc(clamp(46px,4.6vw,88px) * var(--ui-scale));
  --fs-h1:    calc(clamp(24px,1.9vw,34px) * var(--ui-scale));  /* 章タイトル・パネル見出し */
  --fs-h2:    calc(clamp(18px,1.35vw,24px) * var(--ui-scale)); /* 設定セクション・アイテム名 */
  --fs-body:  calc(clamp(15px,1.02vw,18px) * var(--ui-scale)); /* 本文・説明 */
  --fs-verb:  calc(clamp(13px,0.92vw,16px) * var(--ui-scale)); /* 動詞ラベル */
  --fs-meta:  calc(clamp(12px,0.80vw,14px) * var(--ui-scale)); /* 補助・単位 */
  --fs-micro: calc(clamp(11px,0.70vw,12px) * var(--ui-scale));
}
```

### 2.3 行間・字間の規約
| 用途 | line-height | letter-spacing | 最大行長 |
|---|---|---|---|
| 明朝 物語文 | `2.0` | `.06em` | `26em`（≒26字） |
| ゴシック 本文/説明 | `1.85` | `.04em` | `30em` |
| 見出し h1/h2 | `1.5` | `.10em` | — |
| 動詞ラベル | `1` | `.14em` | — |
| ボタン | `1.4` | `.12em` | — |
| 数値（`--f-num`） | `1.4` | `.02em` | — |

日本語は行長 `ch` ではなく `em` で決める（全角＝1em）。`max-inline-size:26em` を明朝本文に直接指定。

### 2.4 禁則・折返しの基本クラス
```css
.jp{
  font-family:var(--f-gothic);
  font-size:var(--fs-body);
  line-height:1.85;
  letter-spacing:.04em;

  /* 禁則：ブラウザ標準の日本語禁則を最も厳格に */
  line-break:strict;        /* 小書き仮名・長音符も行頭禁止に */
  word-break:normal;        /* break-all は絶対に使わない */
  overflow-wrap:normal;     /* 既定は禁則優先。URL類だけ例外クラス */
  text-wrap:pretty;         /* 最終行1字の孤立を軽減（対応ブラウザ） */
  hanging-punctuation:allow-end;   /* 句読点のぶら下げ（対応時） */
  text-spacing-trim:trim-start;    /* 行頭の約物アキ詰め（対応時） */
  font-feature-settings:"palt" 0;  /* 本文はベタ組み。palt は見出しのみ */
  font-kerning:none;
  text-align:start;         /* justify は日本語で字間が暴れるので不可 */
  white-space:normal;
}
.jp--mincho{font-family:var(--f-mincho); line-height:2.0; letter-spacing:.06em;}
.jp--heading{
  font-feature-settings:"palt" 1; letter-spacing:.10em;
  word-break:auto-phrase;   /* Chromium：文節で折る。非対応は normal にフォールバック */
  text-wrap:balance;
}
/* 例外：長い英数字・型番・URL・ファイル名が入りうる箇所だけ */
.jp--latin-safe{ overflow-wrap:anywhere; }
/* 絶対に折りたくない語（人名・アイテム名・数値+単位） */
.nobr{ white-space:nowrap; }
/* 数字は等幅・タブラー */
.num{ font-family:var(--f-num); font-variant-numeric:tabular-nums lining-nums; letter-spacing:.02em; }
```

追加規約（実装ルール）:
1. **`word-break:break-all` / `break-word` はプロジェクト全体で禁止**。lint で検出する。
2. アイテム名・人名（霧沢響一 / 霧沢灯）は `<span class="nobr">` で包む。
3. 数値＋単位（`1/125秒`、`f/5.6`、`20℃`、`第三章`）は `<span class="nobr">` ＋ 数字部だけ `.num`。
4. 括弧開き `「（〈` の直前で改行が起きないよう、原稿側で `「` の前に不可視の `&#8203;` を入れない（`line-break:strict` が処理する）。手動 `<wbr>` は禁止。
5. パネル幅は必ず `em` 基準で、日本語1行が 26〜30字に収まるように `max-inline-size` を置く。字数が溢れる翻訳的な長文は原稿段階で分割する。
6. ルビは初出のみ：`<ruby>霧沢<rt>きりさわ</rt></ruby>`。`ruby-position:over; rt{font-size:.5em;letter-spacing:.02em;line-height:1;opacity:.78}`。ルビが行間を蹴らないよう、ルビを含む段落は `line-height:2.1`。
7. 縦書きパネル（章カード・タイトル・写真裏書き）は `writing-mode:vertical-rl` ＋ `font-feature-settings:"vpal" 1,"vkna" 1`、`text-orientation:mixed`。半角数字は `text-combine-upright:digits 2`（縦中横）。

---

## 3. 色・面（サーフェス）体系

**設計原則**：UI は「1985年の写真館にあった紙もの」の再現。台紙・印画紙・伝票・真鍮のプレート。純白 `#FFF`、純黒 `#000`、純グレー `#808080`、青い accent（`#0A84FF` 等 OS色）は一切使わない。角丸は最大 3px（紙は丸まらない）。ドロップシャドウは必ず暖色寄り。

### 3.1 トークン
```css
:root{
  /* 紙 — 印画紙・台紙・伝票 */
  --paper-000:#F6F0E2;  /* 光の当たった紙 */
  --paper-100:#EBE1CD;  /* 標準パネル面 */
  --paper-200:#DED2B9;  /* 沈んだ面・溝 */
  --paper-300:#C9BA9C;  /* 紙の小口・分割線 */
  --paper-400:#AD9C7E;  /* 経年の焼け縁 */

  /* 墨 — 文字 */
  --ink-900:#191512;    /* 主文字（対 --paper-100 で 14.2:1） */
  --ink-700:#2C2621;
  --ink-600:#3E362E;
  --ink-500:#5A4E42;    /* 副文字（対 --paper-100 で 6.6:1） */
  --ink-400:#7A6C5C;    /* 非活性（対 --paper-100 で 3.6:1 = UI下限） */
  --ink-300:#9A8B78;    /* 罫・区切り */

  /* セピア — 写真・過去の情報 */
  --sepia-700:#5C4229;
  --sepia-500:#7E5C36;
  --sepia-300:#A8845A;

  /* 真鍮 — 金具・強調・フォーカス */
  --brass-700:#7E6430;
  --brass-500:#B4924E;
  --brass-400:#C9A961;
  --brass-300:#D8BC7C;
  --brass-100:#EBDCB4;

  /* 漆・機材 — 暗い面 */
  --lacquer-900:#0D0B09;
  --lacquer-800:#141110;
  --lacquer-700:#1E1A16;
  --lacquer-600:#2A2420;

  /* 暗い面の上の文字 */
  --ink-on-dark-1:#F0E7D6;  /* 対 --lacquer-800 で 15.1:1 */
  --ink-on-dark-2:#C7B99F;  /* 8.4:1 */
  --ink-on-dark-3:#948872;  /* 4.7:1 */

  /* 状態色 */
  --vermilion:#9E3B2E;      /* 朱・印・破壊的操作・「新」 */
  --vermilion-bright:#C2503C;
  --safelight:#8E1F18;      /* 安全灯の赤（面） */
  --safelight-glow:#D6402F; /* 安全灯の発光 */
  --indigo:#2F4858;         /* 藍・情報・完了 */
  --indigo-bright:#456A80;
  --tungsten:#E8B26A;       /* 暖色照明・肯定的な光 */
  --moon:#8FA6B8;           /* 冷たい月光 */

  /* 影（すべて暖色寄せ） */
  --sh-1:0 1px 2px rgba(25,21,18,.18);
  --sh-2:0 2px 6px rgba(25,21,18,.22), 0 1px 1px rgba(25,21,18,.14);
  --sh-3:0 8px 24px rgba(20,16,12,.34), 0 2px 6px rgba(20,16,12,.22);
  --sh-4:0 22px 60px rgba(12,9,7,.52), 0 6px 18px rgba(12,9,7,.34);
  --sh-inset-paper:inset 0 1px 0 rgba(255,250,238,.55), inset 0 -1px 0 rgba(120,102,80,.24);
  --sh-inset-well:inset 0 2px 4px rgba(60,48,34,.28), inset 0 -1px 0 rgba(255,250,238,.35);

  --r-sm:2px; --r-md:3px;   /* 角丸はここまで */
}
```

### 3.2 テクスチャ（起動時に canvas 生成 → dataURL → CSS 変数）
```js
// 疑似コード：ノイズ＋繊維＋薄いシミ。256x256 タイル。
const tex = makeCanvasTexture(256, ctx => { /* value noise + 縦繊維 + 3点の薄いシミ */ });
document.documentElement.style.setProperty('--tex-paper', `url(${tex.toDataURL()})`);
```
用意するタイル：`--tex-paper`（紙繊維・256px）、`--tex-board`（台紙のざらつき・512px）、`--tex-glass`（雨滴・1024px）、`--tex-grain`（フィルム粒子・128px、全画面用）。

### 3.3 サーフェスのレシピ
```css
/* A. 紙パネル（設定・手帳・観察の説明カード） */
.surf-paper{
  background-color:var(--paper-100);
  background-image:var(--tex-paper),
    linear-gradient(160deg, rgba(255,250,238,.55) 0%, rgba(255,250,238,0) 42%),
    radial-gradient(120% 100% at 50% 0%, rgba(255,250,238,.30), rgba(173,156,126,.10) 78%);
  background-blend-mode:multiply,normal,normal;
  border:1px solid var(--paper-300);
  border-radius:var(--r-md);
  box-shadow:var(--sh-3), var(--sh-inset-paper);
  color:var(--ink-900);
}
/* B. 台紙（アイテムカード・写真の枠） */
.surf-board{
  background-color:var(--paper-200);
  background-image:var(--tex-board);
  background-blend-mode:multiply;
  border:1px solid var(--paper-400);
  box-shadow:var(--sh-2), inset 0 0 0 1px rgba(255,250,238,.30);
}
/* C. 暗面（道具箱トレイ・観察背景・タイトルメニュー地） */
.surf-dark{
  background:
    linear-gradient(180deg, rgba(30,26,22,.92), rgba(13,11,9,.94));
  backdrop-filter:blur(14px) saturate(.82) sepia(.14) brightness(.86);
  -webkit-backdrop-filter:blur(14px) saturate(.82) sepia(.14) brightness(.86);
  border-top:1px solid rgba(180,146,78,.22);
  box-shadow:0 -12px 40px rgba(0,0,0,.5);
  color:var(--ink-on-dark-1);
}
/* D. 真鍮の縁飾り（重要パネルの上辺のみ） */
.brass-edge::before{
  content:""; position:absolute; inset:0 0 auto 0; height:2px;
  background:linear-gradient(90deg,
    rgba(126,100,48,0) 0%, var(--brass-700) 8%, var(--brass-300) 26%,
    var(--brass-400) 50%, var(--brass-300) 74%, var(--brass-700) 92%, rgba(126,100,48,0) 100%);
  box-shadow:0 1px 3px rgba(216,188,124,.28);
}
/* E. 押し込み面（スライダ溝・入力欄） */
.surf-well{
  background:linear-gradient(180deg,var(--paper-300),var(--paper-200));
  border:1px solid var(--paper-400);
  border-radius:999px;
  box-shadow:var(--sh-inset-well);
}
```

### 3.4 ボタン
```css
.btn{
  font-family:var(--f-gothic); font-size:var(--fs-body);
  letter-spacing:.12em; line-height:1.4;
  padding:.62em 1.5em; border-radius:var(--r-sm); cursor:pointer;
  transition:background-color .16s ease, box-shadow .16s ease, transform .08s ease, color .16s ease;
}
.btn--primary{                       /* 真鍮プレート */
  color:#2A2114; border:1px solid var(--brass-700);
  background:linear-gradient(180deg,var(--brass-300),var(--brass-500) 62%,var(--brass-700));
  box-shadow:var(--sh-2), inset 0 1px 0 rgba(255,244,214,.55), inset 0 -1px 0 rgba(60,44,18,.4);
  text-shadow:0 1px 0 rgba(255,244,214,.35);
}
.btn--primary:hover{background:linear-gradient(180deg,#E4CC96,var(--brass-400) 62%,var(--brass-700));}
.btn--primary:active{transform:translateY(1px);box-shadow:var(--sh-1),inset 0 2px 4px rgba(50,36,14,.45);}

.btn--ghost{                         /* 紙に押した罫だけのボタン */
  color:var(--ink-700); background:transparent; border:1px solid var(--paper-400);
}
.btn--ghost:hover{background:rgba(255,250,238,.5); border-color:var(--ink-400); color:var(--ink-900);}

.btn--danger{                        /* 朱の印 */
  color:var(--paper-000); border:1px solid #7A2B21;
  background:linear-gradient(180deg,#B0483A,var(--vermilion) 60%,#7A2B21);
  box-shadow:var(--sh-2), inset 0 1px 0 rgba(255,220,208,.28);
}
.btn:disabled{opacity:1;color:var(--ink-400);border-color:var(--paper-300);background:var(--paper-200);
  box-shadow:none;cursor:not-allowed;}
```

### 3.5 状態による全画面グレーディング（P1電源復旧 / P7 安全灯）
UI パネルの配色も部屋の状態に追従させる。`<html data-light="moon|tungsten|safelight">`。

```css
html[data-light="moon"]   { --paper-100:#DCD9CF; --paper-000:#E9E7DE; --ink-900:#171A1C; --brass-500:#8E8360; }
html[data-light="tungsten"]{ /* 既定値のまま */ }
html[data-light="safelight"]{
  --paper-100:#3A1A17; --paper-000:#4E221D; --paper-200:#2C1310; --paper-300:#5C2A24; --paper-400:#6E332B;
  --ink-900:#F2C9C2; --ink-500:#D09A92; --ink-400:#A6706A; --ink-300:#7E4F4A;
  --brass-500:#C46A54; --brass-300:#E09076; --sh-3:0 8px 24px rgba(40,4,2,.5);
}
```
遷移は `transition` ではなく、`#overlay` 全体に 420ms の `filter` クロス（`filter:hue-rotate()` は色相が壊れるので、`opacity` で二重描画のクロスフェード）。安全灯下でも本文コントラストは `--ink-900` 対 `--paper-100` で 6.9:1 を確保。

---

## 4. インタラクション・フィードバック

### 4.1 恒久マーカーを置かずにホットスポットを示す三層
1. **カーソル（レティクル）** — 常時。ネイティブカーソルは `cursor:none` で消し、DOM 要素 `#reticle` を毎フレーム `transform:translate3d(x,y,0)` で追従（`will-change:transform`）。ポインタが coarse（タッチ）のときは非表示。
2. **近接反応** — カメラ光軸から一定角度内（`hotspot.angleToCamera < 18°`）かつ視線が乗った瞬間、3D側でオブジェクトに **リム反応**：`emissiveIntensity` を 0 → 0.18 へ 180ms、フレネル強めの縁だけ `--tungsten` 相当が薄く乗る。**輪郭線は描かない**（アウトラインシェーダは即座に「ゲームUI」に見える）。DOM 側は動詞チップを出す。
3. **「見渡す」補助** — キー `Q` 長押し（または 2本指タップ）。押下 240ms 後から発動、離すまで維持、最大 3.0s、クールダウン 4.0s。効果：画面全体が 8% 減光＋わずかに彩度低下し、現在ノードで有効なホットスポットの中心に **⌀14px の真鍮の細いリング**が 1回だけ広がって消える（`0.9s`、`stagger 60ms`、近い順）。持続表示はしない＝「探索の答え」は与えず「取り零しの保険」に留める。

```css
#hint-ring{
  position:absolute; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%;
  border:1px solid var(--brass-300); pointer-events:none;
  animation:ringPop .9s cubic-bezier(.2,.7,.3,1) forwards;
}
@keyframes ringPop{
  0%{transform:scale(.4); opacity:0}
  22%{opacity:.85}
  100%{transform:scale(3.2); opacity:0}
}
```
未取得の重要ホットスポットは `stagger` の最後に置き、既に `EXAMINED` 済みのものはリングを 40% の不透明度に落とす（取得済みが目立たない）。

### 4.2 動詞チップ（カーソル追従ラベル）
```css
.verb-chip{
  position:absolute; transform:translate(-50%,18px);
  font-family:var(--f-gothic); font-size:var(--fs-verb); letter-spacing:.14em; line-height:1;
  color:var(--ink-on-dark-1); padding:.45em .85em; white-space:nowrap;
  background:rgba(15,12,10,.62);
  backdrop-filter:blur(6px) saturate(.8);
  border:1px solid rgba(180,146,78,.28); border-radius:var(--r-sm);
  box-shadow:0 2px 10px rgba(0,0,0,.4);
  opacity:0; transition:opacity .12s ease .18s, transform .18s cubic-bezier(.22,.61,.36,1) .18s;
  pointer-events:none;
}
.verb-chip[data-on]{opacity:1; transform:translate(-50%,14px);}
```
180ms の遅延が要点：視線を素早く振ったときにチップが点滅せず、画面が静かに保たれる。

**動詞ラベル一覧（player-facing 確定文言）**

| 状況 | ラベル | 補足 |
|---|---|---|
| 一般の観察対象 | `調べる` | 既定 |
| 遠景・文字物 | `読む` | 台帳・手順書・ラベル・裏書き |
| 拾得可能 | `手に取る` | 道具箱へ入る |
| 扉・引き出し・戸棚 | `開ける` / `閉める` | 状態で切替 |
| 錠・つまみ・クランク | `回す` | P3 クランク、P8 リング |
| スイッチ・ボタン | `入れる` / `切る` | 配電盤・安全灯・スタジオ灯 |
| レバー・コード | `引く` | 暗幕・引き紐 |
| ピントグラス・ルーペ・引き伸ばし機 | `のぞく` | 覗き込み視点へ |
| 移動先の床マーカー | `進む` | ノード名を副行に `― 撮影室` |
| 視点を戻す | `戻る` | Esc と同義 |
| 道具を対象に使う | `使う` | 道具選択中のみ出現 |
| 写真を年表壁に戻す | `かける` | HIDDEN 条件 |
| 液を注ぐ・薬品 | `注ぐ` | P5 |
| 現像を始める | `現像する` | TRUE 条件 |
| 動かせる家具 | `動かす` | 姿勢椅子 |
| 電話 | `受話器を取る` | |
| 使用不可（条件未達） | `― 今はできない` | 先頭に全角ダッシュ、色 `--ink-on-dark-3` |

「不可」は原則チップを出さず**無反応**にする。プレイヤーが明確に試みた（クリックした）ときだけ 1.4秒だけ理由を出す：例 `暗くて手元が見えない。` / `かたい。何かで回すのだろう。` — 命令形の指示は書かない（謎解きを殺す）。

### 4.3 カーソル（レティクル）全状態
`#reticle` は 40×40 の `<canvas>`。状態ごとに描き分け、状態遷移は 200ms `cubic-bezier(.22,.61,.36,1)` で補間。すべて 1px、色は `rgba(240,231,214,.82)`、外周に `0 0 6px rgba(0,0,0,.7)` の描画影を落として明背景でも視認可。

| # | 状態 | 形 | 挙動 |
|---|---|---|---|
| 1 | `idle` | ⌀3px の中実ドット | 静止。不透明度 .55 |
| 2 | `hover` | ドット＋上下左右 4本の 5px 短線が 11px 離れて配置（照準の「開き」） | 短線が外へ 11→13px、不透明度 1.0 |
| 3 | `read` | ドット＋左右に「⌐ ¬」型の角括弧（テキストの示唆） | |
| 4 | `take` | ドットが中空の小円⌀7に開き、下に 4px の短線（受け皿） | |
| 5 | `move` | 中央ドット消滅、下向きの浅い弧＋その下に小三角 | 500ms 周期で 2px 上下（reduced-motion で停止） |
| 6 | `turn` | ドットの周りに 240° の円弧＋端に矢羽 | ホバー中 ごくゆっくり回転（8s/周） |
| 7 | `peek` | 二重円（⌀7 と ⌀13）＝レンズ | |
| 8 | `use-ready` | 選択中アイテムの 16px シルエットがカーソル左上に半透明で追従＋照準は `hover` 形 | シルエット `opacity:.75` |
| 9 | `use-invalid` | `use-ready` の上に 14px の斜線 1本（`--vermilion-bright`） | クリック時 3回 60ms の横 ±3px シェイク |
| 10 | `back` | 左向きシェブロン `‹` 単体 | 画面端 8% ゾーンで自動的にこれ |
| 11 | `drag` | 中実ドットが⌀5に拡大、周囲に 1px の薄いリング | 観察ビューで押下中 |
| 12 | `busy` | 3点が 120° 配置で回転 | ロード・演出中。入力ロック |
| 13 | `ui` | レティクル非表示。ネイティブ矢印を復帰（`cursor:default`） | DOM パネル上（`.panel:hover` で `#reticle{opacity:0}`） |
| 14 | `text` | ネイティブ `cursor:text` | 入力欄（現状なし。将来の名前入力用に予約） |

**判定ヒステリシス**：ホバー判定に 60ms の入り遅延・120ms の抜け遅延を入れ、境界での点滅を防ぐ。

### 4.4 汎用フィードバック
- **成功**（謎が進む）：真鍮のリングが対象位置から 640ms で広がる＋WebAudio で 1174Hz+1568Hz の短い和音（Attack 4ms / Decay 420ms、-20dB）。画面全体の露光を 60ms だけ `brightness(1.06)`。
- **失敗/拒否**：音は「金属の噛み合わない小さな音」（帯域ノイズ 220Hz中心 / 70ms）。UI 要素は `translateX` ±4px を 3回 / 180ms。**赤い×印は出さない**。
- **入手**：画面下端の道具箱タブが 1.6秒だけせり上がり、当該スロットが `NEW` 表示で光る。トースト `〈道具名〉を手に入れた。` を下中央に 2.2秒。
- **記録**（重要事実の獲得）：手帳タブに朱の点が付き `メモが増えた` と 1.8秒。

---

## 5. 道具箱（インベントリ）

### 5.1 レイアウト
画面下端中央の**引き出し式トレイ**。既定は隠れており、`①` 下端 56px にポインタが入る `②` `I` または `E` キー `③` 下からのスワイプ、で 220ms `cubic-bezier(.22,.61,.36,1)` でせり上がる。`NEW` アイテム所持中はタブに朱点。

```css
#tray{
  position:fixed; left:50%; bottom:0; transform:translate(-50%,calc(100% - 26px));
  z-index:var(--z-hud); pointer-events:auto;
  width:min(1120px, 92vw); padding:18px 22px 22px;
  border-radius:var(--r-md) var(--r-md) 0 0;
  transition:transform .22s cubic-bezier(.22,.61,.36,1);
}
#tray[data-open]{transform:translate(-50%,0)}
#tray .handle{ /* 引き手：真鍮の細い横棒 */
  position:absolute; top:9px; left:50%; transform:translateX(-50%);
  width:64px; height:3px; border-radius:2px;
  background:linear-gradient(90deg,var(--brass-700),var(--brass-300),var(--brass-700));
}
#tray .slots{display:grid; grid-auto-flow:column; grid-auto-columns:88px; gap:14px;
  overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; padding-top:8px;}
.slot{width:88px; height:88px; position:relative; scroll-snap-align:center;
  display:grid; place-items:center; cursor:pointer;}
.slot .thumb{width:100%;height:100%;object-fit:contain;} /* 3Dから焼いたcanvasサムネ */
.slot .name{position:absolute; bottom:-19px; left:50%; transform:translateX(-50%);
  font-size:var(--fs-micro); letter-spacing:.06em; color:var(--ink-on-dark-2); white-space:nowrap;}
.slot .kbd{position:absolute; top:2px; left:4px; font:var(--fs-micro)/1 var(--f-num);
  color:var(--ink-on-dark-3);} /* 1〜8 のキー番号 */
```
スロット枠は常に `surf-board` の小さな台紙。8枠を超えたら横スクロール（`◂ ▸` の真鍮シェブロンが端に出る）。所持ゼロなら `まだ何も持っていない。` を中央に `--ink-on-dark-3`。

### 5.2 5状態の視覚処理と日本語ラベル
色だけに依存しない（形・記号・質感を必ず併用）。ラベルはスロット右上のリボンとして常時表示（`NEW`/`SELECTED`/`CHANGED`/`SPENT`）、`EXAMINED` のみリボンなしで「素の状態」＝視覚ノイズを減らす。

| 状態 | 日本語ラベル | 視覚処理 |
|---|---|---|
| NEW | `未確認` | 台紙の右上角が 12px 三角に**折れている**（形の差）＋朱のリボン。呼吸パルス 2.4s（scale 1→1.03 / glow）。一度でも観察すると EXAMINED へ。 |
| SELECTED | `選択中` | 台紙が 4px 持ち上がり（`translateY(-4px)` + `--sh-3`）、外周に 2px の真鍮枠、下に真鍮の細い受け線。カーソルが `use-ready` に変わる。 |
| EXAMINED | （ラベルなし） | 既定。台紙のみ、リボンなし。 |
| CHANGED | `変化あり` | 台紙の下辺に 3px の藍のインク帯＋左上に⌀6の藍点。サムネを再撮影（現像液になった等）。1回だけ 900ms のインク滲みアニメ。 |
| SPENT | `使用済` | 全体 `filter:grayscale(.55) brightness(.72)`、台紙に左上→右下の 1px 斜線（朱 25%）、ラベルはグレー。**削除はしない**（証拠物として残す）。クリックで観察はできるが `使う` の対象からは除外。 |

```css
.slot[data-state="new"] .board{clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%);}
.slot[data-state="new"]::after{content:"未確認";}
.slot[data-state="selected"]::after{content:"選択中";}
.slot[data-state="changed"]::after{content:"変化あり";}
.slot[data-state="spent"]::after{content:"使用済";}
.slot::after{
  position:absolute; top:4px; right:4px; padding:2px 6px; border-radius:var(--r-sm);
  font-family:var(--f-gothic); font-size:var(--fs-micro); letter-spacing:.06em; line-height:1.2;
}
.slot[data-state="new"]::after   {background:var(--vermilion);color:var(--paper-000);}
.slot[data-state="selected"]::after{background:var(--brass-500);color:#2A2114;}
.slot[data-state="changed"]::after{background:var(--indigo);color:var(--paper-000);}
.slot[data-state="spent"]::after {background:var(--paper-400);color:var(--ink-700);}

.slot[data-state="new"] .board{animation:newBreath 2.4s ease-in-out infinite;}
@keyframes newBreath{0%,100%{box-shadow:var(--sh-2)}50%{box-shadow:var(--sh-2),0 0 14px rgba(194,80,60,.30)}}
@media (prefers-reduced-motion:reduce){.slot[data-state="new"] .board{animation:none;
  box-shadow:var(--sh-2),0 0 0 1px var(--vermilion);}}
```
選択解除は `Esc`、空クリック、または同じスロットの再クリック。

---

## 6. アイテム観察ビュー

### 6.1 レイアウト（1920基準）
背景は現在の3Dシーンを `blur(18px) brightness(.35) saturate(.7)` で残す（場所の記憶が切れない）。中央に対象アイテムを実寸感で。

```
┌──────────────────────────────────────────────┐
│                                        [× 閉じる] │  右上 32/32
│                                                  │
│            ◇  アイテム 3D（中央 52vh）             │
│                                                  │
│ ┌── 説明カード（左下・surf-paper・幅 min(420px,34vw)） │
│ │ 真鍮のクランク            ← --fs-h2 / 明朝           │
│ │ ─────（真鍮罫 1px）─────                            │
│ │ 撮影室の暗幕を巻き上げる…  ← --fs-body / ゴシック     │
│ │ ［気づき：軸に「3/4」の刻印］ ← 発見後に追記            │
│ └──────────────────────────────                   │
│                       [ 組み合わせる ]  ← 右下、btn--ghost │
│  ドラッグで回す ／ ホイールで寄る ／ R で戻す  ← 最下部 meta│
└──────────────────────────────────────────────┘
```

```css
#inspect{position:fixed;inset:0;z-index:var(--z-panel);pointer-events:auto;
  display:grid; grid-template-rows:1fr auto; opacity:0; animation:fadeUp .24s ease forwards;}
#inspect .desc{
  position:absolute; left:clamp(24px,3vw,56px); bottom:clamp(24px,4vh,64px);
  inline-size:min(420px,34vw); padding:20px 22px 18px;
}
#inspect .desc h2{font-family:var(--f-mincho);font-size:var(--fs-h2);letter-spacing:.10em;
  line-height:1.5;color:var(--ink-900);margin-bottom:10px;}
#inspect .desc .rule{height:1px;background:linear-gradient(90deg,var(--brass-500),rgba(180,146,78,0));margin-bottom:12px;}
#inspect .desc p{font-size:var(--fs-body);line-height:1.85;color:var(--ink-700);max-inline-size:26em;}
#inspect .controls{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);
  font-size:var(--fs-meta);letter-spacing:.10em;color:var(--ink-on-dark-3);}
#inspect .close{position:absolute;top:28px;right:32px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
```
アイテム名は縦書きにしない（説明と横並びで読みやすさ優先）。ただし「写真」「台帳」など**紙もの**を観察するときだけ、そのアイテムの中身は紙面上に縦組みで描かれる（3D テクスチャ側）。

### 6.2 操作マッピング

| 操作 | マウス | キーボード | タッチ |
|---|---|---|---|
| 回す | 左ドラッグ（0.42°/px、慣性 減衰 0.90/frame） | `←→`= Y軸 ±12°、`↑↓`= X軸 ±12°、`Shift`併用で ±4° | 1本指ドラッグ |
| 寄る/引く | ホイール（1ノッチ ±8%、範囲 0.7×〜2.6×） | `+` / `-` （±10%） | ピンチ |
| 平行移動 | 右ドラッグ or 中ドラッグ | `Shift`+`←→↑↓` | 2本指ドラッグ |
| 既定に戻す | ダブルクリック | `R` | ダブルタップ |
| 気づき点を開く | リングをクリック | `Tab` で巡回 → `Enter` | リングをタップ |
| 組み合わせ | 右下ボタン | `C` | 右下ボタン |
| 閉じる | 右上×／背景クリック | `Esc` | 2本指下スワイプ／× |

X軸回転は ±72° でクランプ（底面まで回るが天地は失わない）。回転角は `data-yaw` として保存し、再度観察したとき前回の角度を復元する（探索の連続性）。

### 6.3 隠れたディテールの発見シグナル
アイテムには `detail[]`（局所座標＋法線＋テキスト）を持たせる。**その法線がカメラを向いて 25° 以内**かつ**ズーム 1.3× 以上**になった瞬間、その画面座標に発見リングが出る。

```css
.detail-ring{
  position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;
  border:1px solid var(--brass-300); box-shadow:0 0 12px rgba(216,188,124,.28) , inset 0 0 8px rgba(216,188,124,.16);
  opacity:0; animation:detailIn .9s cubic-bezier(.2,.7,.3,1) forwards; cursor:pointer;
}
@keyframes detailIn{0%{opacity:0;transform:scale(1.6)}60%{opacity:1;transform:scale(.94)}100%{opacity:1;transform:scale(1)}}
.detail-ring::after{content:"";position:absolute;inset:-1px;border-radius:50%;
  border:1px solid rgba(216,188,124,.35); animation:detailPulse 2.6s ease-in-out infinite .9s;}
@keyframes detailPulse{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.18);opacity:0}}
@media (prefers-reduced-motion:reduce){
  .detail-ring{animation:none;opacity:1}.detail-ring::after{animation:none;opacity:.4}
}
```
音は 2093Hz / 90ms / -30dB のごく小さな「ちん」。クリックすると：ズームがその点に 480ms で寄り、説明カードに **朱の縦罫付きで追記**され、トースト `気づいた。` を 1.6秒。同時にアイテムは `CHANGED` へ。追記の書式：

```html
<p class="found"><span class="found-mark" aria-hidden="true"></span>軸の根もとに「三／四」と刻んである。</p>
```
```css
.found{position:relative;padding-left:14px;margin-top:12px;color:var(--ink-900);}
.found-mark{position:absolute;left:0;top:.3em;bottom:.3em;width:2px;background:var(--vermilion);}
```
発見前は説明文に一切の伏線を書かない（「何か刻まれている気がする」等の親切は禁止）。ただし 5分間その章で進展がない場合のみ、手帳の第一段階に自動で1行足す。

### 6.4 組み合わせ（P5）
1. **起動**：観察中に `組み合わせる`（`C`）。または道具箱でアイテムAを選択 → アイテムBをクリック。
2. **選択モード**：トレイが自動でせり上がり、`combinableWith` に含まれるものだけ `opacity:1`、それ以外は `opacity:.32; filter:grayscale(.8)` かつ `pointer-events` は有効のまま（押すと拒否演出＝学習が起きる）。画面上部中央に `― 何と合わせる？` を `--fs-body` `--ink-on-dark-2` で表示。`Esc` で解除。
3. **確認バー**：2つ目を選ぶと下端に確認バーが 180ms でせり上がる。
   文言：`〈粉末現像剤〉と〈蒸留水〉を合わせる` — ボタン `合わせる`（`btn--primary`）／`やめる`（`btn--ghost`）。`Enter`で確定、`Esc`で取消。
4. **成功**：2つのサムネが 420ms で中央へ寄り、真鍮のフラッシュ 1回、新アイテムの台紙が回転しながら現れる（reduced-motion ではクロスフェード）。トースト `現像液ができた。` 素材2つは `SPENT` へ（統合される素材は消滅ではなく `SPENT` 表示のまま 3秒後にフェードアウトで除去 — 空き瓶が残る等の物語的理由がある場合のみ残す）。
5. **拒否**：`合わせる` を押しても組み合わせが無効な場合は、確認バー自体を出さない。無効な相手をクリックした瞬間に、そのスロットが ±4px×3 で揺れ、下部に 1.6秒メッセージ：
   - 一般 `うまく合わない。`
   - 惜しい（正解の片割れを持っている）`これだけでは足りない。`
   - 条件未達（暗すぎる等）`ここでは無理だ。`
   
   **「間違いです」「不正解」の類は一切書かない。**

---

## 7. ヒントUI（手帳）

### 7.1 形と原則
プレイヤー（片付け業者）自身の**作業手帳**。画面右上に小さな革タブ、`H` キーで開く。ヒントは常に「主人公の独り言」の文体で、システムの説明文にしない。3段階の逓増開示。**時間ゲートではなく「読む意思」のコストで抑制する**：段階を1つ下げるたびに、押す動作の重さが増す。

### 7.2 段階と正確な文言

パネル見出し：`手帳`／副題は現在地 `― 撮影室`。
現在の課題を1行で提示（常に見える。これはヒントではなく「今の目的」）：
> `いま気になっていること：背景幕が下りたままだ。`

**第一段階 ― 気にかかること**（何を見るべきか／場所の指示のみ）
- ボタン：`気にかかることを書き出す`
- 開封後の見出し：`気にかかること`
- 例文：`幕の巻き取り軸の端に、四角い穴が開いていた。何かを差し込む形だ。`
- コスト：なし。即時。

**第二段階 ― 手がかり**（方法の指示。答えの数値や順序は書かない）
- ボタン：`もう少し考えてみる`（第一段階を開いてから **25秒経過**で有効化。無効時は `もう少し考えてみる（少し待つ）` と表示し `--ink-400`）
- 開封後の見出し：`手がかり`
- 例文：`事務室の机の引き出しに、真鍮の柄が入っていた。あれを軸に差せば回せるはずだ。`

**第三段階 ― 答え**（完全な手順）
- ボタン：`答えを見る`（第二段階を開いてから **40秒経過**で有効化）
- 押下時に**長押しゲート**：ボタンを 1.2秒押し続けると真鍮のリングが周囲を一周して開く。途中で離すと戻る（アニメの巻き戻し 300ms）。この 1.2秒の間、ボタン下に警告文が現れる：
  > `この先は、解き方をそのまま書いてしまう。`
- 開封後の見出し：`答え`
- 例文：`事務室の机・右の引き出しから真鍮のクランクを取り、撮影室の巻き取り軸の右端に差してから回す。`
- 開封後、そのパズルの手帳ページ上端に小さな朱印 `見た` が押される（責めない。ただ記録は残る）。

**閉じるボタン**：`手帳を閉じる`。
**全解決時**：`いまは、気にかかることはない。`
**エンディング直前**：`扉は開けられる。だが ― 暗室に、まだ現像していない一枚がある。` （TRUE への誘導は最終章のみ、第一段階に自動で載る）

```css
#memo{ /* 右からスライドイン */
  position:fixed; top:0; right:0; height:100%; z-index:var(--z-panel);
  inline-size:min(430px,34vw); padding:34px 32px;
  transform:translateX(100%); transition:transform .26s cubic-bezier(.22,.61,.36,1);
  overflow-y:auto; overscroll-behavior:contain;
}
#memo[data-open]{transform:none}
#memo h2{font-family:var(--f-mincho);font-size:var(--fs-h1);letter-spacing:.10em;color:var(--ink-900)}
#memo .tier{border-top:1px solid var(--paper-300); padding:18px 0;}
#memo .tier h3{font-size:var(--fs-h2);letter-spacing:.10em;color:var(--sepia-700);margin-bottom:8px;}
#memo .tier p{font-size:var(--fs-body);line-height:1.9;color:var(--ink-700);max-inline-size:26em;}
#memo .warn{font-size:var(--fs-meta);color:var(--vermilion);letter-spacing:.06em;margin-top:8px;}
.hold-btn{position:relative;overflow:hidden;}
.hold-btn::after{content:"";position:absolute;inset:-1px;border:2px solid var(--brass-300);
  border-radius:var(--r-sm); clip-path:inset(0 100% 0 0);
  transition:clip-path 1.2s linear;}
.hold-btn[data-holding]::after{clip-path:inset(0 0 0 0);}
.seal-seen{ /* 「見た」の朱印 */
  display:inline-block;padding:2px 6px;border:1px solid var(--vermilion);color:var(--vermilion);
  font-size:var(--fs-micro);letter-spacing:.14em;border-radius:var(--r-sm);
  transform:rotate(-6deg);opacity:.72;}
```
**アンチ・フラストレーション**：どの段階も「まだ有効化されていない」ことを隠さない。残り秒数は出さない（カウントダウンは苛立ちを生む）。代わりにボタン下に `― もう一度、部屋を見てからでも遅くない。` を薄く出す。`prefers-reduced-motion` 時は長押しリングを 1.2秒の不透明度フェードに置換（長押しは維持）。

---

## 8. 設定画面

構成：3タブ `音` / `表示` / `操作` ＋ 最下部に `データ`。紙のパネル（`surf-paper` + `brass-edge`）、幅 `min(760px, 86vw)`、中央配置、最大高 `82vh` でスクロール。各行は `label`（`--fs-body`, `--ink-900`）＋ `help`（`--fs-meta`, `--ink-500`, `max-inline-size:30em`）＋ 右にコントロール。

| 区分 | ラベル | 説明文（help） | コントロール |
|---|---|---|---|
| 音 | `全体の音量` | `すべての音の大きさをまとめて変えます。` | スライダ 0–100 / 既定 80 / 5刻み |
| 音 | `環境音の音量` | `雨、風、建物のきしみなどの音量です。` | スライダ 0–100 / 既定 75 |
| 音 | `効果音の音量` | `操作音、機械の音、扉の音などの音量です。` | スライダ 0–100 / 既定 85 |
| 音 | `ミュート` | `すべての音を一時的に止めます。M キーでも切り替えられます。` | トグル / 既定 切 |
| 表示 | `文字の表示速度` | `会話や説明文が流れる速さです。` | セグメント `ゆっくり`／`ふつう`／`速い`／`すぐ表示` （18/32/56/∞ 文字毎秒。既定 `ふつう`） |
| 表示 | `画質` | `描画の精細さです。動作が重いときは下げてください。` | セグメント `低`／`中`／`高`／`自動`（既定 `自動`。低=DPR 1.0・影なし、中=DPR上限1.5・簡易影、高=DPR上限2.0・ソフト影+SSAO） |
| 表示 | `モーション軽減` | `画面の揺れや大きな動きを控えめにします。` | トグル / 既定 OS設定に追従 |
| 表示 | `調べられる場所の表示` | `調べられるものをどこまで知らせるかを選びます。` | セグメント `反応のみ`（既定）／`見渡しで表示`／`常に表示` |
| 表示 | `UIの大きさ` | `文字とボタンの大きさを変えます。` | セグメント `小`／`標準`／`大`／`特大`（0.9/1.0/1.15/1.3） |
| 表示 | `全画面表示` | `画面いっぱいに表示します。F11 でも切り替えられます。` | トグル |
| 操作 | `視点の感度` | `見まわすときの速さです。` | スライダ 0.4–2.0 / 0.1刻み / 既定 1.0（値を `1.0×` と `--f-num` で表示） |
| 操作 | `視点の上下反転` | `見上げる／見下ろすの向きを入れかえます。` | トグル / 既定 切 |
| 操作 | `視点の左右反転` | `左右の向きを入れかえます。` | トグル / 既定 切 |
| データ | `いま保存する` | `自動保存とは別に、この時点を記録します。最後の保存：2026年7月27日 22時14分` | ボタン `btn--primary`。押下後ラベル 1.6秒 `保存しました` |
| データ | `章のやり直し` | `いま進めている章のはじめからやり直します。手に入れた道具や記録は、その章のはじめの状態に戻ります。` | セレクト（到達済章のみ）＋ ボタン `やり直す`（`btn--ghost`、朱文字） |
| データ | `進行データの消去` | `すべての記録を消します。もとに戻すことはできません。` | ボタン `btn--danger`「`消去する`」＋ 1.5秒長押しゲート |

### 8.1 確認ダイアログ文言（破壊的操作）

**章のやり直し**
- 見出し：`章をやり直しますか`
- 本文：`第三章「暗室」のはじめまで戻ります。この章で手に入れた道具と、手帳の記録は失われます。ほかの章の記録は残ります。`
- ボタン：`やり直す`（`btn--ghost` 朱文字・非既定）／`やめる`（`btn--primary`・既定フォーカス）

**進行データの消去**
- 見出し：`すべての記録を消しますか`
- 本文：`これまでの進みぐあい、集めた道具、見た結末、設定のすべてが消えます。もとに戻すことはできません。`
- 追加ゲート：`消去する` ボタンは 1.5秒の長押し（`.hold-btn`）。長押し中に本文下へ `押したままにすると消去されます。` を `--vermilion` で表示。
- ボタン：`消去する`（`btn--danger`・非既定）／`やめる`（`btn--primary`・既定フォーカス、`Esc` で発火）
- 完了トースト：`記録を消しました。`

**セーブ上書き（`つづきから` がある状態で `はじめから`）**
- 見出し：`はじめからやり直しますか`
- 本文：`いまの記録（第三章・4時間12分）は残したまま、新しくはじめます。`  ※スロットは2つ持つ設計。上書き警告は出さない。
- ボタン：`はじめる`／`やめる`

**全設定を既定に戻す**（`表示`タブ末尾に小さく `設定を初期状態に戻す`）
- 見出し：`設定を初期状態に戻しますか`／本文：`音量や操作の設定だけが戻ります。進行データは消えません。`／ボタン `戻す`／`やめる`

### 8.2 コントロールの見た目
```css
.opt-row{display:grid;grid-template-columns:1fr auto;gap:16px 28px;align-items:start;
  padding:16px 0;border-bottom:1px solid var(--paper-300);}
.opt-row .help{grid-column:1;font-size:var(--fs-meta);color:var(--ink-500);line-height:1.75;margin-top:5px;}

/* スライダ：溝は surf-well、つまみは真鍮のノブ */
input[type=range]{-webkit-appearance:none;width:min(260px,32vw);height:22px;background:none;}
input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:999px;
  background:linear-gradient(180deg,var(--paper-300),var(--paper-200));
  box-shadow:var(--sh-inset-well);}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;margin-top:-7px;
  border-radius:50%;border:1px solid var(--brass-700);
  background:radial-gradient(circle at 34% 30%,var(--brass-100),var(--brass-400) 52%,var(--brass-700));
  box-shadow:var(--sh-2);}

/* トグル：真鍮のスライドスイッチ */
.toggle{width:52px;height:26px;border-radius:999px;position:relative;cursor:pointer;
  background:var(--paper-300);box-shadow:var(--sh-inset-well);
  border:1px solid var(--paper-400);transition:background-color .18s ease;}
.toggle[aria-checked="true"]{background:var(--brass-500);border-color:var(--brass-700);}
.toggle::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;
  background:radial-gradient(circle at 34% 30%,var(--paper-000),var(--paper-200) 60%,var(--paper-400));
  box-shadow:var(--sh-1);transition:transform .18s cubic-bezier(.22,.61,.36,1);}
.toggle[aria-checked="true"]::after{transform:translateX(26px);}
/* 色だけに頼らないよう、右側に 入/切 の文字を必ず併記 */

/* セグメント：伝票の欄に丸を付ける形 */
.seg{display:inline-flex;border:1px solid var(--paper-400);border-radius:var(--r-sm);overflow:hidden;}
.seg button{padding:.5em 1.1em;font-size:var(--fs-meta);letter-spacing:.10em;
  background:var(--paper-200);color:var(--ink-500);border:0;border-inline-end:1px solid var(--paper-400);cursor:pointer;}
.seg button:last-child{border-inline-end:0;}
.seg button[aria-pressed="true"]{background:var(--brass-500);color:#2A2114;
  box-shadow:inset 0 1px 0 rgba(255,244,214,.4);font-weight:600;}
```
設定の変更は**即時反映・即時保存**（`localStorage`、キー `kirisawa.settings.v1`）。「適用」ボタンは置かない。

---

## 9. レスポンシブと入力マッピング

### 9.1 ブレークポイント
| 幅 | `--ui-scale` 補正 | 主な変更 |
|---|---|---|
| ≥1600 | 1.00 | 基準。説明カード左下、手帳右スライド（430px） |
| 1280–1599 | 1.00 | パネル幅を `vw` 追従。タイトル余白を圧縮 |
| 1024–1279 | 0.96 | 手帳 `min(400px,42vw)`。設定パネル 1カラム→ help を label 直下に |
| 768–1023（タブレット縦） | 0.94 | 観察ビュー：説明カードが**下端フルワイド**に移動。道具箱スロット 76px |
| 600–767 | 0.92 | 設定タブが横スクロールのピル列に。手帳は全画面シート |
| 391–599 | 0.90 | 下記モバイル規則 |
| ≤390 | 0.88 | 最小構成 |

```css
@media (max-width:767px){
  :root{--ui-scale:.92}
  #memo,#settings{inline-size:100%;inset:auto 0 0 0;height:88svh;border-radius:var(--r-md) var(--r-md) 0 0;
    transform:translateY(100%);}                 /* 右→下からのシートに変更 */
  #memo[data-open],#settings[data-open]{transform:none;}
  #inspect .desc{position:static;inline-size:auto;margin:0 12px 12px;max-block-size:34svh;overflow-y:auto;}
  #tray{inline-size:100%;border-radius:0;padding-bottom:calc(18px + env(safe-area-inset-bottom));}
  #tray .slots{grid-auto-columns:72px;gap:10px;}
  .verb-chip{display:none;}                       /* タッチでは常時チップを出さない */
}
@media (max-width:390px){
  :root{--ui-scale:.88}
  #tray .slots{grid-auto-columns:64px;gap:8px}
  .slot .name{display:none}                       /* 名前は長押しで出す */
  #title-lockup{right:24px}
  .t-main{font-size:40px}
}
/* すべてのパネルに */
.panel{ padding-inline:max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right));
        padding-block-end:max(16px, env(safe-area-inset-bottom)); }
/* 横長スマホ（高さが足りない） */
@media (max-height:480px) and (orientation:landscape){
  :root{--ui-scale:.84}
  #tray{transform:translate(-50%,calc(100% - 18px))}
  #title-menu{bottom:20px;gap:2px}
}
```
モバイル縦持ちでは3D側の `fov` を 42→52 に上げ、ノード内で見える情報量を保つ。ヘッダ/フッタは置かず、常時 UI は「道具箱タブ（下）」「手帳タブ（右上）」「設定（左上・歯車ではなく**真鍮の小さなつまみ**の意匠）」の3点のみ。

### 9.2 タッチ入力マッピング
| ジェスチャ | 動作 |
|---|---|
| 1本指ドラッグ | 視点を見まわす（感度 `0.24°/px × 視点感度`、離した後 240ms の慣性） |
| タップ（移動可能な床） | `進む` |
| タップ（ホットスポット） | その動詞を実行。ヒット判定は**視覚半径 +12px** に拡大 |
| 長押し 260ms（ホットスポット） | 動詞チップをプレビュー表示（離しても実行しない）。誤操作の保険 |
| 2本指タップ | `見渡す`（1回発火・持続 1.6s） |
| 下端から上スワイプ | 道具箱を開く／下スワイプで閉じる |
| 右上タブをタップ | 手帳 |
| 2本指下スワイプ | `戻る`（近接視／観察／パネルを閉じる） |
| ピンチ | 観察ビューのズーム／覗き込み視点の拡大 |
| 観察ビュー内 1本指ドラッグ | アイテム回転 |
| 観察ビュー内 ダブルタップ | 既定角度に戻す |
| 道具箱アイテム 長押し | 名前と `使う`／`調べる`／`やめる` のミニメニュー |
| アイテムを対象へドラッグ&ドロップ | `使う`（タップ2回と等価。どちらでも成立させる） |

タップ判定：移動 12px 未満／300ms 未満。ドラッグ中は動詞チップとレティクルを隠す。すべてのタップターゲットは実測 44×44 CSS px 以上を確保（`::before` で当たり判定を拡張）。

---

## 10. アクセシビリティ

### 10.1 モーション軽減
`prefers-reduced-motion: reduce` または設定 `モーション軽減 = 入` のとき、`<html data-reduced-motion>` を立てる。

```css
html[data-reduced-motion] *{
  animation-duration:.01ms !important; animation-iteration-count:1 !important;
  transition-duration:.08s !important; scroll-behavior:auto !important;
}
```
ただし**機能的に必要な動きは残す**（`!important` の対象外にする allowlist）：
- ノード間移動：既定はカメラの 0.9秒ドリー。軽減時は 200ms のクロスフェードに置換（瞬間移動にはしない — 位置関係の理解が失われる）。
- シャッター幕遷移 → 260ms のクロスフェード。
- 背景幕の巻き上げ（P3）→ 動きは残すが振幅を 60% に、画面揺れ（±3px）は 0 に。
- 「見渡す」リング → 拡大アニメを廃し、静止した ⌀20px リングを 1.2秒表示。
- `NEW` の呼吸 → 静止した 1px 朱枠に置換。
- 発見リングのパルス → 静止表示。
- タイトル背景の呼吸パン → 停止。
- 雨・粒子・レンズフレアの画面全体エフェクトは強度 40% に。
- パララックス（視点に対する UI の追従）は全廃。

### 10.2 コントラスト目標
| 対象 | 目標 | 実測例 |
|---|---|---|
| 本文（`--ink-900` / `--paper-100`） | ≥ 7:1（AAA） | 14.2:1 |
| 副次テキスト（`--ink-500` / `--paper-100`） | ≥ 4.5:1 | 6.6:1 |
| 暗面の本文（`--ink-on-dark-1` / `--lacquer-800`） | ≥ 7:1 | 15.1:1 |
| 暗面の副次（`--ink-on-dark-2`） | ≥ 4.5:1 | 8.4:1 |
| UI 部品の境界・アイコン | ≥ 3:1 | `--paper-400` / `--paper-100` = 3.2:1 |
| 非活性テキスト | ≥ 3:1（免除に頼らない） | `--ink-400` = 3.6:1 |
| フォーカスリング | ≥ 3:1 対 隣接色 | 二重リングで両方の背景に対応 |
| 動詞チップ（3D 上） | 常に半透明黒地を敷いて ≥ 7:1 を保証 | |
| 安全灯モード | 本文 ≥ 6:1 を維持（8.3節） | 6.9:1 |

**色のみで情報を伝えない**：5つのアイテム状態は形（折れ角・斜線・帯）＋文字ラベルを併用。トグルは `入`／`切` の文字併記。エラーは形（揺れ）＋文言。

`prefers-contrast: more` 時：
```css
@media (prefers-contrast:more){
  :root{--paper-100:#F6F0E2;--ink-500:#3E362E;--ink-400:#5A4E42;--paper-400:#7A6C5C;}
  .surf-paper{border-width:2px}
  .verb-chip{background:rgba(10,8,6,.92);border-color:var(--brass-300)}
}
```

### 10.3 キーボード操作マップ（全体）

**探索中**
| キー | 動作 |
|---|---|
| `↑ ↓ ← →` / `W A S D` | 視点を見まわす（1押し 4°、長押しで連続 90°/秒） |
| `Tab` / `Shift+Tab` | 現在ノードのホットスポットを巡回（画面上での左上→右下順）。選択中は 3D 側でリム反応＋動詞チップ表示 |
| `Enter` / `Space` | 選択中のホットスポットを実行 |
| `1`〜`8` | 道具箱のスロットを直接選択／再押下で解除 |
| `I` または `E` | 道具箱の開閉 |
| `C` | 組み合わせモード |
| `Q`（長押し） | `見渡す` |
| `H` | 手帳 |
| `M` | ミュート切替 |
| `F` | 全画面切替（`F11` も） |
| `Esc` | スタックを1つ戻す（組み合わせ → 選択解除 → 近接視/観察を閉じる → 手帳/設定を閉じる → ポーズメニュー） |
| `P` | ポーズメニュー |

**観察ビュー中**：`←→↑↓` 回転／`Shift+方向` 平行移動／`+ -` ズーム／`R` 既定／`Tab` 気づき点巡回／`C` 組み合わせ／`Esc` 閉じる。

**メニュー・パネル内**：`Tab`／`Shift+Tab` フォーカス移動（`focus-trap` 必須）、`↑↓` でリスト内移動、`←→` でスライダ/セグメント値変更（スライダは `Home`/`End` で最小最大、`PageUp/Down` で 10刻み）、`Enter` 決定、`Esc` 閉じる（＝キャンセル、非破壊）。

すべての DOM ボタンは `<button>`。トグルは `role="switch" aria-checked`、セグメントは `role="radiogroup"`／`aria-pressed`。3D ホットスポットは画面座標に対応する不可視の `<button class="sr-hotspot">` をオーバーレイに生成し、`aria-label` に `調べる：受付の引き出し` の形で動詞＋対象名を入れる（スクリーンリーダーで探索が成立する）。

```css
.sr-hotspot{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;
  background:none;border:0;padding:0;opacity:0;pointer-events:none;} /* マウスは3Dが拾う */
.sr-hotspot:focus-visible{opacity:1;pointer-events:auto;}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0;}
```
`aria-live="polite"` のログ領域を1つ用意し、トースト・入手・状態変化・拒否メッセージをすべて流す。

### 10.4 フォーカス表示
「開発者ツールの青枠」を絶対に出さない。真鍮＋墨の二重リングで、明面・暗面の両方に対して 3:1 を確保。

```css
:focus{outline:none}
:focus-visible{
  outline:2px solid var(--brass-300);
  outline-offset:2px;
  box-shadow:0 0 0 4px rgba(25,21,18,.55), 0 0 12px rgba(216,188,124,.35);
  border-radius:var(--r-sm);
}
/* 紙面上では墨を外側に */
.surf-paper :focus-visible{
  outline-color:var(--brass-700);
  box-shadow:0 0 0 4px rgba(246,240,226,.85), 0 0 0 5px rgba(25,21,18,.35);
}
/* 3Dホットスポットのフォーカス：真鍮の角括弧4つ */
.sr-hotspot:focus-visible{outline:none;}
.sr-hotspot:focus-visible::before{
  content:"";position:absolute;inset:6px;
  border:1px solid var(--brass-300);
  clip-path:polygon(0 0,30% 0,30% 1px,1px 1px,1px 30%,0 30%, /* 4隅のみ残すクリップ */
                    70% 0,100% 0,100% 30%,calc(100% - 1px) 30%,calc(100% - 1px) 1px,70% 1px,
                    100% 70%,100% 100%,70% 100%,70% calc(100% - 1px),calc(100% - 1px) calc(100% - 1px),calc(100% - 1px) 70%,
                    0 70%,0 100%,30% 100%,30% calc(100% - 1px),1px calc(100% - 1px),1px 70%);
  filter:drop-shadow(0 0 4px rgba(0,0,0,.8));
}
```
フォーカス移動時、対象が画面外なら 3D 側でその方向へ 320ms で視点を向ける（`prefers-reduced-motion` 時は即時）。パネルを閉じたら、開く直前にフォーカスがあった要素へ必ず戻す。モーダル表示中は背後を `inert` 属性で無効化。