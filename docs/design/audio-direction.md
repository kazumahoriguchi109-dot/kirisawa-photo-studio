# 音響設計仕様書 ―「霧沢写真館 ― 最後の一枚」

全音源は WebAudio API による実行時合成。ファイル参照ゼロ。以下すべて `AudioContext` サンプルレート 48kHz 前提（44.1kHz でも周波数指定はそのまま有効）。

---

## 0. 基礎ユーティリティ（全キューが依存する共通部品）

```
noiseBuffer(ctx, seconds=4, type)   // 'white' | 'pink' | 'brown'
  white: r = Math.random()*2-1
  pink : Paul Kellet 7-pole フィルタ（b0..b6）
  brown: last = (last + 0.02*white)/1.02, out = last*3.5
  → 4秒バッファを loop=true で使い回す。全ノイズ源はこの3枚のみ生成し共有。

impulseVerb(ctx, seconds, decay, preDelay)
  // 2ch ノイズ * (1-t)^decay の畳み込みIR。以下3種を起動時に生成:
  IR_ROOM   : 1.6s, decay 2.6, preDelay 0.012  → 玄関/撮影室（板張り+高天井）
  IR_TILE   : 0.9s, decay 1.4, preDelay 0.004  → 暗室（タイル・狭い・高域残る）
  IR_SMALL  : 0.5s, decay 3.2, preDelay 0.002  → 事務室（書類と布で吸われる）

env(param, t0, {a, d, s, sl, r, peak})  // 全て setValueAtTime→linearRamp/ setTargetAtTime
adsrPluck(param, t0, peak, atk, dec)    // atk=0.004 固定の汎用短音
```

**クリック回避原則（全キューに適用）**: どのゲインも `0` を `exponentialRampToValueAtTime` の終点に使わない。最小値 `1e-4`、その後 `setValueAtTime(0, t+ε)`。全ワンショットは `atk ≥ 0.003s`, `release ≥ 0.02s`。`stop()` は必ず release 終端 +0.05s。

---

## 1. アンビエントベッド（4状態）

常駐ノード。**生成は一度きり**、状態遷移はゲインとフィルタのオートメーションのみ。オシレータの start/stop は行わない（再起動ノイズと位相跳びを避ける）。

### 1.1 共通レイヤー構成（常時鳴る4本 + 状態別レイヤー）

```
[L1 ROOM TONE]   brownNoise → BQ lowpass(f=90, Q=0.5) → BQ highpass(f=28, Q=0.7)
                 → gain gRoom → busAmbient
                 LFO_A: sine 0.045Hz, depth ±6Hz on lowpass.frequency（呼吸感）
                 LFO_B: sine 0.011Hz, depth ±0.15 (相対) on gRoom（超低速うねり）
                 素の gRoom 基準値 = 0.055

[L2 RAIN FAR]    pinkNoise → BQ bandpass(f=1100, Q=0.55) → BQ highshelf(f=4000, gain -9dB)
                 → gain gRain → convolver(IR_ROOM, wet 0.35) → busAmbient
                 gRain 基準 0.030
                 ガラス越しの減衰: BQ lowpass(f=2600, Q=0.4) を直列で最後に

[L3 RAIN DROPS]  ランダムスケジューラ。0.8〜3.4秒間隔で「窓を伝う一粒」:
                 white 12ms burst → BQ bandpass(f=rand(1800,3600), Q=9)
                 → gain: 0→0.018 in 3ms → 1e-4 in 65ms
                 → 軽い pan (-0.5..0.5) → convolver(IR_ROOM)
                 blackout 時は密度2倍・音量1.4倍（他が静かなので相対的に立つ）

[L4 CREAK]       建物の軋み。18〜52秒のランダム間隔で1回:
                 sawtooth osc f=rand(58,104) → BQ bandpass(f=f0*2.4, Q=14)
                 f を 0.9〜1.35秒かけて ±4% ゆっくりベンド（木のたわみ）
                 gain: 0→rand(0.012,0.028) in 0.25s → 0.4s hold → 1e-4 in 0.8s
                 直列に waveshaper(soft, amount 0.15) で微妙な軋み倍音
                 → convolver(IR_ROOM, wet 0.6)
```

### 1.2 状態別パラメータ表

| 状態 | gRoom | gRain | L3密度 | L4間隔 | 追加レイヤー |
|---|---|---|---|---|---|
| **BLACKOUT**（開始・停電） | 0.075 | 0.038 | ×2.0 | 14–34s | **L5 WIND SEAM**: pink → bandpass(f=380, Q=1.1) → gain 0.014、LFO 0.07Hz ±0.010（隙間風）<br>**L6 SUB PRESSURE**: sine 31Hz, gain 0.020, LFO 0.03Hz ±0.008 |
| **TUNGSTEN**（通電後） | 0.050 | 0.026 | ×1.0 | 20–52s | **L7 FILAMENT**: sine 100Hz(電源2倍) gain 0.011 + sine 200Hz gain 0.005 + sine 300Hz gain 0.002 → highpass(60) 。微小 AM: LFO 0.9Hz ±12%（フィラメント揺れ）<br>**L8 FRIDGE HUM**（事務室方向の残置冷蔵庫）: PositionalAudio、後述 |
| **SAFELIGHT**（赤色灯） | 0.062 | 0.020 | ×0.7 | 26–60s | L7 を gain×0.15 に落とす（タングステン消灯）<br>**L9 SAFELIGHT BALLAST**: square 120Hz → lowpass(f=900,Q=3) gain 0.014 + sine 240Hz gain 0.004。ランダム微小フリッカ: 4〜11秒ごとに gain を 30ms だけ ×1.6<br>全体に **busAmbient → lowpass(f=5200)** を挿入（暗さ＝高域を落とす心理効果） |
| **DAWN**（脱出直前〜エンディング） | 0.038 | 0.034 | ×1.3 | 40–90s | 雨のフィルタを開く: L2 lowpass 2600→4200Hz、highshelf -9→-3dB（＝ドアが開き外気が入る）<br>**L10 BIRD**: 稀（12〜30秒間隔、最大3回）。sine osc、f を 2400→3100→2650Hz と 0.18秒で階段ベンド、gain 0.010、2〜3回連続。IR_ROOM wet 0.2 |

### 1.3 クロスフェード規則

```
transitionAmbient(from, to, dur):
  dur = { blackout→tungsten: 1.4,  tungsten→safelight: 0.9,
          safelight→tungsten: 0.7, *→dawn: 3.5,  →blackout: 0.35 }
  各 gain: setTargetAtTime(target, now, dur/3)   // 指数収束、クリックなし
  各 filter.frequency: linearRampToValueAtTime(target, now+dur)
  L3密度/L4間隔: 次回スケジュール時に新値を採用（進行中の音は切らない）
```

- **→blackout は 0.35s と速い**：照明が落ちた瞬間の「空気が縮む」感覚。ただし L1 だけは 0.9s かけて逆に**上げる**（無音にせず、暗さを厚くする）。
- **重複禁止ルール**: 遷移中に新たな遷移が来たら、進行中の `setTargetAtTime` は自然に上書きされる（cancelScheduledValues は使わない＝段差が出るため）。
- **P1（通電）と P7（安全灯）は状態遷移そのものが最大の演出**なので、遷移開始の 0.15 秒前に全 SFX バスを -4dB ダックし、遷移完了後 1.0 秒で戻す（後述 §6）。

---

## 2. インタラクション・キュー表（32件）

表記: `src → filter → env → fx`。時間は秒、周波数は Hz、gain は線形（バス前）。

| # | キュー | 合成レシピ |
|---|---|---|
| 1 | **hotspot hover** | sine 1860 + sine 2790(gain 0.25倍) → highpass(1200) → env a0.004 / d0.07 / peak 0.035 → 2D、pan 0。連続hoverは 90ms スロットル。3回連続で同一hotspotなら peak を 0.6倍に減衰（うるささ回避） |
| 2 | **close-up enter** | pink burst 0.22s → bandpass f 700→2400 (0.18s linear) Q1.2 → env a0.02/d0.20 peak 0.05。同時に sine 220 の 0.3s スワイプ（220→330、exp）gain 0.028 → IR_ROOM wet 0.3。**アンビエント全体を -3dB / 0.25s ダック**（没入＝周囲が引く） |
| 3 | **close-up exit** | #2 の逆: bandpass 2400→700、sine 330→220。peak 0.04。ダック解除 0.4s |
| 4 | **drawer open** | brown noise 0.55s → bandpass f 240→420 Q 2.2（0.5s linear、引き出す加速）→ env a0.03/hold0.35/r0.12 peak 0.09。末尾に木のストッパー: white 8ms → bandpass(520,Q6) peak 0.05。IR_ROOM wet 0.25。PositionalAudio |
| 5 | **drawer close** | brown 0.30s → bandpass 420→200 Q2.2 → env a0.02/d0.26 peak 0.10。終端に「ドン」: sine 96、0.11s exp decay、peak 0.13 + white 6ms bandpass(380,Q4) peak 0.06 |
| 6 | **metal latch** | white 5ms → bandpass(2900, Q 11) peak 0.09、+ 8ms 後に triangle 640 の 0.06s pluck peak 0.05、+ ring: sine 4200 gain 0.012 decay 0.18。IR_TILE wet 0.15 |
| 7 | **key in lock** | 3連ランダム: 各 white 4ms → bandpass(rand 1800–3400, Q 14) peak 0.055、間隔 55ms/40ms。最後に brown 0.12s → bandpass(300,Q3) peak 0.04（真鍮の擦れ） |
| 8 | **fuse seating** | 段階1 擦れ: brown 0.09s bandpass(1400,Q2) peak 0.03 → 段階2 着座: white 6ms bandpass(1100,Q8) peak 0.11 + square 180 の 0.04s（金属受け）peak 0.06 → lowpass(2200)。最後に sine 72、0.09s、peak 0.07（筐体の共鳴） |
| 9 | **breaker throw** | 大型ナイフスイッチ。white 4ms → highpass(3000) peak 0.14（接点）→ 22ms 後 square 88 の 0.16s、f 88→64 exp、peak 0.12 → lowpass(900)（レバーの重さ）→ 直後 §1.3 の blackout→tungsten 遷移をトリガ。加えて **通電サージ**: sawtooth 100Hz を gain 0→0.05→0.011 (0.05s / 0.9s) でフェード＝L7 へシームレスに引き継ぐ |
| 10 | **crank ratchet loop** | ループではなく**イベント駆動**。クランク回転角 15° ごとに1クリック: white 3ms → bandpass(1650, Q 13) peak 0.06、ピッチを回転速度に連動 f = 1650 * (0.85 + speed*0.35)。同時に持続音: brown → bandpass(180, Q1.6) gain = speed*0.05（軸の擦れ）。停止時は brown を 0.25s でフェード |
| 11 | **backdrop motor start** | sawtooth f 0→46Hz を 0.42s で exp 立ち上げ（起動トルク）→ lowpass(f 300→1400 同時に開く, Q 2.8) → env a0.15 peak 0.075。同時に white → bandpass(3200,Q1.2) gain 0.012（ブラシノイズ）。IR_ROOM wet 0.35。PositionalAudio |
| 12 | **backdrop motor run** | 上記の持続部。sawtooth 46Hz + sawtooth 46*2.02Hz(gain 0.4、僅かにデチューン＝唸り) → lowpass(1400, Q2.8) → gain 0.075。AM LFO 4.6Hz ±14%（減速ギアの脈動）。さらに 0.7Hz ±25Hz で lowpass を揺らす（負荷変動） |
| 13 | **backdrop motor stop** | sawtooth f 46→11Hz を 0.55s exp、lowpass 1400→260 同時、gain 0.075→1e-4 in 0.6s。終端に金属停止音: white 7ms bandpass(900,Q7) peak 0.05 + 幕の揺れ: pink 0.9s → bandpass(2200,Q0.8) gain 0→0.020→1e-4 (0.1/0.8)（ベルベットが慣性で揺れる） |
| 14 | **tray slosh** | 現像トレイを傾ける。brown noise 1.1s → bandpass f を LFO で 220⇄520 に 0.55Hz で往復（Q 1.4）→ env a0.12 / hold 0.6 / r 0.35 peak 0.055。上に「液面の粒」: 0.06〜0.18秒間隔で white 4ms → bandpass(rand 900–2200, Q 12) peak 0.020 を 7〜11粒。IR_TILE wet 0.45 |
| 15 | **liquid pour** | brown → bandpass f 900→380（3.0s linear、容器が満ちて音程が下がる）Q 2.6 → env a0.18 / hold(可変) / r0.30 peak 0.060。粒レイヤー: 白ノイズ→bandpass(2400,Q6) gain 0.018、密度は注ぎ量に比例。着液の泡: sine f 480→260 の 0.25s pluck を 0.4秒ごと、peak 0.012 |
| 16 | **enlarger relay click** | white 3ms → bandpass(1250, Q 9) peak 0.10 → 14ms 後に反動 white 2ms bandpass(2600,Q12) peak 0.045。ケース共鳴: triangle 310、0.10s exp、peak 0.030。IR_TILE wet 0.3 |
| 17 | **enlarger lamp hum** | 持続。sine 100 gain 0.016 + sine 200 gain 0.009 + sine 400 gain 0.003 + triangle 50 gain 0.004（変圧器の鉄心）→ highpass(45) → 微小 AM 1.7Hz ±8%。起動時 0.35s フェードイン、消灯時 0.20s フェードアウト＋ pink 0.15s の「冷却カチ」（bandpass 3000, peak 0.02） |
| 18 | **safelight buzz** | §1.2 L9 と同一ソースだが、**点灯の瞬間**だけ別キュー: square 120 gain 0→0.045 in 0.02s → 0.014 in 0.5s、加えて点灯前の 0.25秒に「ジー…」の予備放電: white → bandpass(4200, Q 5) gain 0.010、断続（30ms on / 20ms off × 5） |
| 19 | **dial detent** | 金庫ダイヤル1目盛。white 2.5ms → bandpass(2050, Q 16) peak 0.055 + triangle 1420 の 0.035s pluck peak 0.022 → highpass(700)。**目盛番号に応じて f を ±3% 微変**（同音連打の機械的単調さを消す）。IR_SMALL wet 0.2 |
| 20 | **ring rotate**（四工程錠） | 回転中: brown → bandpass(340, Q 2.0) gain 0.030、回転速度で lowpass 600→1600。1アイコンごとの着座: white 4ms bandpass(1500,Q10) peak 0.07 + sine 128 の 0.08s peak 0.045（重い真鍮リング）。IR_ROOM wet 0.3。PositionalAudio（ドア位置） |
| 21 | **wrong answer** | 「拒絶」ではなく「動かない」。sine 174.6(F3) + sine 185.0(F#3) を同時 → 唸り 10.4Hz が発生 → lowpass(700, Q1) → env a0.01/d0.55 peak 0.045。加えて機構が噛む音: brown 0.18s bandpass(210,Q3) peak 0.035。**不快な不協和ではなく「重くて回らない」体感**にする。2D＋IR wet 0.2 |
| 22 | **correct answer** | §3 の旋律セル「小」形。詳細後述 |
| 23 | **item acquire** | triangle 1174.7(D6) 0.09s pluck peak 0.030 → 60ms 後 triangle 1567.98(G6) 0.12s peak 0.024 → 上に紙/布の擦れ: pink 0.18s bandpass(2600,Q1.5) gain 0.014。2D、pan 0 |
| 24 | **item combine** | 2音の合流: sine 392(G4) と sine 587.33(D5) をそれぞれ 0.25s 鳴らし、**両者を 0.30s かけて 493.88(B4) へ portamento で収束**（exponentialRamp）→ 収束点で triangle 987.77(B5) の 0.10s pluck peak 0.035。合わせて実体音（組合せ内容依存）: 液体なら #15 の短縮版、金属なら #6 |
| 25 | **paper handling** | pink 0.30s → bandpass f を 1400→3400→2100 に（0.1/0.2s）Q 1.1 → env a0.02/d0.28 peak 0.038。バリアント3種を f 中心 ±15% でランダム選択。印画紙は硬いので highpass(900) を追加、書類（帳簿）は lowpass(5000) で柔らかく |
| 26 | **footstep node transition** | 2歩ぶん。各歩: brown 0.10s → lowpass(400, Q1.2) → env a0.006/d0.09 peak 0.075（踵）＋ white 5ms bandpass(1900, Q3) peak 0.022（埃・砂）。床材で切替: 板張り→ triangle 88 の 0.13s peak 0.030（床鳴り）を加算 / タイル(暗室)→ bandpass を 2600 に上げ IR_TILE wet 0.5。間隔 0.34s。移動カメラ補間に合わせて 1歩目 t=0.05、2歩目 t=0.39 |
| 27 | **door bolt withdraw** | brown 0.40s → bandpass f 380→560 Q 3.5 → env a0.05/hold0.25/r0.10 peak 0.085（かんぬきが滑る）→ 終端 white 6ms bandpass(1150, Q7) peak 0.09 + sine 110 の 0.20s exp peak 0.070（重い着地）。IR_ROOM wet 0.5 |
| 28 | **final door mechanism** | 4段構成、総長 2.6s。(a) 0.00 四つのリングが同時に沈む: #20着座音を 4回 0/0.06/0.11/0.15s、f を 1500/1420/1350/1290 と下降。(b) 0.30 内部機構: brown → bandpass 300→900 (0.9s) Q4 gain 0.06、上に5個のラチェット white 3ms bandpass(1700,Q10) peak 0.05 を 0.35/0.48/0.62/0.79/0.95s。(c) 1.10 錠が落ちる: sine 82 の 0.5s exp peak 0.14 + white 9ms bandpass(700, Q5) peak 0.11。(d) 1.35〜2.6 ドアが 40年ぶりに開く: brown → bandpass f 180→90 Q 2 gain 0→0.05→1e-4（0.4/0.9s、蝶番の軋み）＋ sawtooth f 210→168Hz を 1.1s、bandpass(f*3, Q 20)、gain 0.045（金属の鳴き）。同時に **DAWN 遷移開始**（雨が「外の音」になる） |
| 29 | **phosphorescent shimmer** | 蓄光マーク発見。sine 3136(G7) gain 0.014 + sine 4186(C8) gain 0.008 + sine 2637(E7) gain 0.010 を各 1.2s、それぞれ ±0.4Hz の微妙なデチューンで**ゆらぎ**。env a0.35 / d0.85（極めて柔らかい立ち上がり＝光が滲む）。→ highpass(2000) → IR_TILE wet 0.6。加えて超低域の「気配」: sine 46Hz gain 0.018、1.4s。3つ全部発見時は §3「大」形へ接続 |
| 30 | **clock tick**（時計の無い壁／事務室の別時計） | white 2ms → bandpass(1750, Q 18) peak 0.028 + triangle 3400 の 0.02s peak 0.010 → highpass(1000)。1.00秒間隔だが **偶数拍は peak ×0.82、間隔 0.98s**（機械時計の非対称）。P2で「時計が無い」ことに気づいた直後 6秒間だけ、**存在しない時計の音**を音量 0.4 倍・IR wet 0.8 で鳴らして止める（記憶の残響。ホラーではなく喪失の表現） |
| 31 | **telephone bell** | 打鈴。white 3ms → 2つの並列 bandpass(1420, Q 28) と (1880, Q 26) → 各 peak 0.09、decay 0.42s、**16.6ms 間隔で交互に 22 回**（往復するハンマー）= 約 0.37s の一鳴り。1秒休んで2鳴り目。ベース共鳴: sine 710 gain 0.020 decay 0.9s。IR_SMALL wet 0.5。PositionalAudio（事務室） |
| 32 | **rain gust** | 突風。L2 の gRain を 0→+140% に 1.2s、同時に L2 bandpass の Q を 0.55→0.30、center を 1100→1450。加えて windowRattle: brown 0.5s → bandpass(120, Q 6) gain 0.030 + 硝子の細かい震え white → bandpass(5200, Q 3) gain 0.012、AM 17Hz。減衰 2.8s。**進行の節目（章の切れ目）に手動配置**、ランダム連発はしない |
| 33 | **ending swell** | §3「大」形 ＋ §4 参照 |

---

## 3. 旋律セル（発見スティンガーとエンディングの共通素材）

### 3.1 素材：4音の「灯（あかり）セル」

娘の名前「灯」から。**ヨナ抜き音階由来の5音**から4音のみを使い、常に**未完（第5音を鳴らさない）**にしておくことで「まだ終わっていない」感を持たせる。全体はト調系。

| 位置 | 音名 | Hz | 相対時間(s) | 長さ(s) |
|---|---|---|---|---|
| n1 | D5 | 587.33 | 0.00 | 0.55 |
| n2 | G5 | 783.99 | 0.36 | 0.70 |
| n3 | A5 | 880.00 | 0.84 | 0.50 |
| n4 | E5 | 659.25 | 1.20 | 1.40 |

**未使用の第5音 = B5 (987.77)**。これは**エンディングでのみ**鳴る（§4）。プレイヤーは全編この音を聴かないまま、最後に初めて解決を得る。

低音の支え（全形共通）: sine 97.999 (G2) を n1 と同時、gain 0.022、2.2s の exp decay。

### 3.2 音色（3種のシンセ音色を用途で使い分け）

```
TIMBRE "GLASS"  （小発見用・軽い）
  triangle f  gain 1.00
  sine    2f  gain 0.30
  sine    3f  gain 0.12
  sine    4.7f gain 0.05   ← 非整数倍音でガラスらしさ
  → lowpass(f*6, Q0.7) → env a 0.012 / d 0.18 / s 0.35 / r 0.45
  peak 合計 0.045

TIMBRE "BELL"   （中発見用・写真館の真鍮）
  sine    f    1.00
  sine    2.76f 0.42     ← チューブラーベル比
  sine    5.40f 0.18
  sine    8.93f 0.07
  → bandpass(f*2.2, Q 1.2) → env a 0.006 / d 0.9（各倍音の decay を 1/n 倍にして高域が先に消える）
  peak 合計 0.055

TIMBRE "BREATH" （大発見・エンディング用・人の気配）
  triangle f  1.00 + triangle f*1.003 0.85（デチューン2声）
  sine    2f  0.20
  + フォルマント: bandpass(560, Q4) と bandpass(1180, Q5) を並列（"あ"母音に近い共鳴）
  → env a 0.28 / d 1.2 / s 0.5 / r 1.8   ← 息のように立ち上がる
  peak 合計 0.050
  必ず convolver(IR_ROOM, wet 0.5) を通す
```

### 3.3 規模別バリエーション（反復感を消すための7段階）

| 規模 | 使う音 | 音色 | 変形 |
|---|---|---|---|
| **XS**（hotspot 内の小情報を読んだ） | n1 のみ | GLASS | 移高 +0（D5）。長さ 0.35s |
| **S**（アイテム入手・小さな気づき／#22 correct answer） | n1, n2 | GLASS | **移高をローテーション**: 発見回数 mod 4 で 0 / +2 / -3 / +5 半音。転回形（n2 を1オクターブ下）は 3回目以降に混ぜる |
| **M**（一つのパズル解決 P1/P3/P5） | n1, n2, n3 | BELL | テンポ ×0.92（少し伸びる）。n3 に 0.18s の遅延ビブラート（±4Hz, 5.5Hz） |
| **L**（大パズル解決 P4/P6/P7） | n1〜n4 全 | BELL + GLASS 重ね（GLASS は 1オクターブ上・gain 0.35倍） | 低音支えを G2 + D3(146.83) の2音に。n4 の長さ 2.2s |
| **XL**（最後のネガを現像・真相判明） | n1〜n4 全 | BREATH（主）+ BELL（1オクターブ上、gain 0.30） | **テンポ ×1.45（大幅に引き延ばす）**: n1=0, n2=0.52, n3=1.22, n4=1.74、n4 は 4.0s。IR wet 0.65 |
| **HIDDEN**（蓄光3つ＋写真4枚復元） | n1〜n4 ＋ **n4 の直後に n3 を1オクターブ上（A6 1760）で 1回だけ**（"呼びかけ"） | BREATH | n4 と A6 の間に 0.9s の完全な静寂を置く。ここだけアンビエントも -6dB |
| **ENDING**（§4） | n1〜n4 ＋ **B5 987.77 で解決** | BREATH + BELL + GLASS 3層 | 唯一 B5 が鳴る。B5 は 6.0s、gain を 0.050→0.012 で長く残す |

**追加の反復対策**：
- 同一規模のスティンガーが 20秒以内に再発する場合、2回目は**全体を -2半音**し、peak を 0.85 倍。
- n2 の attack を毎回 `0.006〜0.020` のランダムで揺らす（人間の演奏らしさ）。
- BELL の第2倍音比を `2.76 ± 0.03` でランダム化（同じベルを2回叩いても同じ音にならない物理）。

---

## 4. 最終脱出シーケンス（約40秒・秒刻み）

前提: TRUE または HIDDEN ルート。四工程錠が正解に揃った瞬間を `t=0.0` とする。

| 時刻 | 内容 |
|---|---|
| **0.0** | 最後のリングが着座（#20 着座音、f 1290）。**全SFXバス -3dB / 0.2s ダック**。アンビエントの L4 CREAK スケジューラを停止（以降ノイズを増やさない） |
| **0.2 – 2.8** | #28 **final door mechanism** 全4段を再生。(c) の「錠が落ちる」sine 82 で床が僅かに振動する感触を出すため、L1 ROOM TONE を 0.25s だけ +4dB してから 1.2s で戻す |
| **1.4** | **DAWN 遷移開始**（dur 3.5s）。L2 の lowpass 2600→4200、highshelf -9→-3dB を linearRamp。＝ドアの隙間から外の雨が「近く」なる |
| **2.9 – 4.6** | ドアが開ききる残響。#32 rain gust を 0.7倍の穏やかな形で1回（gRain +90%、2.4s減衰）。同時に **L5 WIND SEAM を復活**させ 0.024 まで上げる（外気の流入） |
| **4.6** | 静寂の窓。全 SFX 停止、アンビエントのみ。**1.4秒間、何も鳴らさない**（旋律の前の呼吸） |
| **6.0** | 旋律セル ENDING 形、開始。BREATH の n1 (D5)。attack 0.28s で滲むように |
| **6.5** | n2 (G5)。BELL 層（1オクターブ上 G6 1567.98、gain 0.30）が重なる |
| **7.2** | n3 (A5)。ここで **L1 ROOM TONE を 6秒かけて 0.038 → 0.020 へ**（部屋が player を手放す） |
| **7.8** | n4 (E5)、長さ 4.0s。GLASS 層が E6 (1318.5) で薄く重なる（gain 0.35倍） |
| **11.8 – 13.2** | 完全な静寂（アンビエント L2 雨のみ、gRain 0.034）。**n4 の残響が IR_ROOM で自然に消える**のを聴かせる |
| **13.2** | **B5 (987.77) 初出**。BREATH + BELL + GLASS 3層同時。a 0.9s / peak 0.050 → 6.0s かけて 0.012 へ。**このゲームで初めて旋律が解決する** |
| **14.0** | 低音の支え: G2 (98.0) と D3 (146.83) を gain 0.020 / 0.014、8秒 decay |
| **15.5** | 足音 #26 を 1組（外へ出る）。板張り→外のコンクリートへ変化: 2歩目は lowpass 400→900、IR wet 0.15（残響が急に減る＝屋外） |
| **17.0 – 24.0** | **屋外アンビエントへ最終移行**。gRain を 0.034→0.055 に 4秒、L2 lowpass 4200→7000、L3 DROPS は消し、代わりに **RAIN GROUND**（pink → bandpass(3200, Q0.6) gain 0.022、AM 0.3Hz ±20%）＝地面を打つ雨。IR を IR_ROOM → 無響（wet 0→0.08）に 5秒でクロス |
| **20.0** | HIDDEN ルートのみ: A6 (1760) の"呼びかけ"を 1回、gain 0.022、a 0.5s / d 3.5s。IR は残響ゼロ（外だから）。**ここだけ B5 の残響と重なり、完全五度上の柔らかい響きになる** |
| **24.0 – 31.0** | B5 の残響が完全に消える。雨だけが残る。L10 BIRD を 1回（夜明け） |
| **31.0 – 36.0** | 雨を 0.055 → 0.030 へ 5秒フェード。**タイトルロゴ表示のタイミング**でここに GLASS の D5 を 1音だけ、gain 0.018、d 3.0s（＝最初の音に還る） |
| **36.0 – 40.0** | 全バス master を 4秒で 1.0 → 0.0 に `setTargetAtTime(0, t, 1.2)`。完全な無音で終わる |

**NORMAL エンディング（真相未到達）の差分**: 6.0秒以降の旋律を **L形（BELL、n1〜n4、B5 なし）** に差し替え、13.2秒の B5 を**鳴らさない**。その空白に rain gust を 1回置く。→ 音楽的に未解決のまま終わる＝「何かを置いてきた」感触。総長は 30秒に短縮。

---

## 5. 空間化（PositionalAudio vs 2D）

### 5.1 リスナー

```
listener = ctx.listener
// ノードベース移動なので、カメラの world position / orientation を毎フレーム反映
setPosition/setOrientation ではなく AudioParam 版を使用:
  listener.positionX.setTargetAtTime(cam.x, ctx.currentTime, 0.02)   // 0.02s 平滑化
  forwardX/Y/Z, upX/Y/Z も同様（首振りの高速回転でジッパーノイズが出るのを防ぐ）
distanceModel = 'inverse'（全体）
```

シーンスケール: **1 unit = 1 meter**。部屋は 4〜7m 四方想定。

### 5.2 分類表

| キュー | 種別 | refDist | rolloff | maxDist | cone(inner/outer/outerGain) |
|---|---|---|---|---|---|
| L1 ROOM TONE / L2 RAIN FAR | 2D（バス直） | – | – | – | – |
| L3 RAIN DROPS | 2D + StereoPanner ランダム | – | – | – | – |
| L4 CREAK | **Positional**、天井/床のランダム点 | 3.0 | 1.0 | 20 | 全方位 |
| L8 FRIDGE HUM | Positional（事務室） | 1.2 | 2.2 | 12 | 全方位 |
| L9 SAFELIGHT BALLAST | Positional（暗室の灯具） | 0.8 | 2.6 | 8 | 60/220/0.35（灯具の向き） |
| #1 hover, #2/#3 close-up, #21 wrong, #22 correct, #23 acquire, #24 combine, §3 全スティンガー | **2D UI** | – | – | – | – |
| #4/#5 drawer | Positional（引き出し） | 0.7 | 2.4 | 8 | 全方位 |
| #6 latch, #7 key | Positional | 0.6 | 2.6 | 6 | 全方位 |
| #8 fuse, #9 breaker | Positional（配電盤） | 0.9 | 2.0 | 14 | 100/300/0.5 |
| #10 crank | Positional（背景幕軸） | 0.8 | 2.2 | 10 | 全方位 |
| #11/#12/#13 motor | Positional（幕ロール中心、高さ 2.6m） | **2.0** | 1.4 | 22 | 全方位（大きい音源なので refDist 大・rolloff 小） |
| #14 slosh, #15 pour | Positional（トレイ） | 0.6 | 2.8 | 6 | 全方位（暗室は狭いので急峻に） |
| #16 relay, #17 lamp hum | Positional（引き伸ばし機） | 0.8 | 2.4 | 9 | 90/260/0.4（ランプハウスの向き） |
| #19 dial | Positional（金庫） | 0.5 | 3.0 | 5 | 40/160/0.25（顔を近づける） |
| #20 ring, #27 bolt, #28 final door | Positional（扉、高さ 1.1m） | 1.0 | 1.8 | 18 | 全方位 |
| #25 paper | Positional（手元＝カメラ前 0.45m）→ 実質ほぼ 2D | 0.4 | 2.0 | 4 | 全方位 |
| #26 footstep | Positional（カメラ足元、y = -1.45） | 1.0 | 1.6 | 12 | 全方位 |
| #29 shimmer | Positional（各マーク位置） | 1.5 | 1.2 | 16 | 全方位（遠くからでも気配が届く＝発見誘導） |
| #30 clock tick | Positional（事務室の壁） | 1.0 | 2.4 | 14 | 全方位 |
| #31 telephone | Positional（事務室机） | 1.0 | 2.0 | 20 | 全方位（**遠くの部屋から聴こえて誘導する**役割） |
| #32 rain gust | 2D（窓ガラス震えのみ Positional、refDist 2.5 / rolloff 1.6 / max 18） | – | – | – | – |
| §4 エンディング全体 | 2D（プレイヤーの内面） | – | – | – | – |

**設計原則**: 「プレイヤーの手・目・思考」に属する音は 2D、「建物に属する音」は Positional。クローズアップ中は例外的に対象オブジェクトの PositionalAudio の refDistance を 1.6 倍に一時変更し、`panner.positionX/Y/Z` をカメラ前 0.5m へ 0.3s で補間移動させる（手元に引き寄せる感覚）。閉じるとき 0.3s で戻す。

---

## 6. ミキシング

### 6.1 バス構造

```
[各ソース]
   ├→ busAmbient  (GainNode) ─┐
   ├→ busSFX      (GainNode) ─┤
   ├→ busUI       (GainNode) ─┤→ busPreMaster → masterCompressor → masterGain → destination
   ├→ busMusic    (GainNode) ─┤                       ↑
   └→ (各バス個別に sendVerb) ─┘                  安全網のみ

sendVerb 構成: 各バス → sendGain → convolver(IR_*) → verbReturn(Gain) → busPreMaster
  部屋切替時に convolver.buffer を差し替え（切替は 0.4s のクロスフェードで2系統を並列運用）

masterCompressor: DynamicsCompressorNode
  threshold -12dB, knee 8, ratio 3.5, attack 0.006, release 0.18
  ※音を潰す目的ではなく「絶対にクリップさせない安全網」。通常は 1〜2dB しか動かない
```

### 6.2 目標レベル

| バス | 基準ゲイン | ピーク目標 | RMS 目標 |
|---|---|---|---|
| busAmbient | 0.55 | -24 dBFS | -34 dBFS |
| busSFX | 0.80 | -12 dBFS | -26 dBFS |
| busUI | 0.65 | -16 dBFS | -30 dBFS |
| busMusic | 0.70 | -14 dBFS | -24 dBFS |
| **master 出力** | 1.0 | **-3 dBFS（絶対上限）** | **-23 LUFS 相当** |

静かなゲームなので**全体を小さく作る**。プレイヤーが音量を上げた状態で、L4 CREAK や #31 telephone が「不意に大きい」と感じないよう、単発ピークは busSFX 内で -12dBFS を超えないこと。

### 6.3 ダッキング規則

すべて `setTargetAtTime` で実装（timeConstant = 減衰時間 / 3）。

| トリガ | 対象 | 減衰量 | attack | hold | release |
|---|---|---|---|---|---|
| §3 スティンガー再生（M以上） | busAmbient, busSFX | -5 dB | 0.08s | 旋律長 | 0.9s |
| close-up enter | busAmbient | -3 dB | 0.25s | 滞在中 | 0.4s |
| 状態遷移（P1/P7） | busSFX, busUI | -4 dB | 0.15s | 遷移長 | 1.0s |
| #28 final door | busAmbient | -4 dB | 0.2s | 2.6s | 1.5s |
| #31 telephone bell | busAmbient, busUI | -6 dB | 0.05s | 1.4s | 0.6s |
| 日本語テキスト表示中（長文読み） | busSFX | -2 dB | 0.3s | 表示中 | 0.5s |
| §4 の 4.6s / 11.8s 静寂窓 | busSFX, busUI | -∞（実質 1e-4） | 0.15s | 指定長 | 0.6s |

ダック量は**加算ではなく最大値採用**（複数トリガ時に音が消え去らないよう `Math.min` で最も深いものを適用）。

### 6.4 クリック回避

1. `gain.value = 0` の直接代入禁止。必ず `setValueAtTime(current, now)` を先に置いてからランプ。
2. `exponentialRampToValueAtTime` の終点に 0 を渡さない（例外送出）。**1e-4** を終点にし、その 0.01s 後に `setValueAtTime(0)`。
3. 全 OscillatorNode は専用の GainNode を必ず経由。osc を直接バスへ繋がない。
4. `osc.start(t)` の t は必ずエンベロープ開始と同時か 1ms 前。ゲインが 0 の状態で start する。
5. `osc.stop(t)` の t は release 終端 + 0.05s。
6. ノイズ源の `AudioBufferSourceNode` は `loopStart/loopEnd` をゼロクロス近傍に丸める（4秒バッファ末尾の不連続対策として `loopEnd = 3.999`）。
7. ループ持続音（#12 motor, #17 lamp hum, L9 ballast）は**停止しない**。ゲインを 1e-4 まで落として待機させ、再利用する。停止するのは画面を離れるときのみ。
8. `AudioContext` は初回クリック（タイトル画面の「はじめる」）で `resume()`。それ以前に一切ノードを鳴らさない。

### 6.5 マスターボリューム / ミュート / リデュースドモーション

```
masterGain.gain: UI スライダー 0–100 を x とし、gain = (x/100)^2.2 （知覚リニア）
  変更時は setTargetAtTime(target, now, 0.05)。即時代入しない。

ミュート: masterGain を 0.08s で 1e-4 へ。ノードは動かし続ける（復帰時の位相跳び回避）。
  ただしミュート継続 30秒で L3/L4/L10 のランダムスケジューラを休止（CPU節約）、解除時に再開。

タブ非アクティブ（visibilitychange）: masterGain を 0.3s で 1e-4、ctx.suspend() は
  0.5s 後（残響を切らないため）。復帰は resume() → 0.5s でフェードイン。

prefers-reduced-motion: reduce の場合の音響側の対応:
  - #12 backdrop motor の AM LFO 深度 14% → 4%、lowpass 揺れ 0.7Hz を停止
  - L7 FILAMENT の 0.9Hz フリッカ AM を停止（定常に）
  - L9 SAFELIGHT のランダムフリッカを停止
  - #29 shimmer のデチューンうねりを ±0.4Hz → ±0.05Hz
  - #32 rain gust の立ち上がりを 1.2s → 2.4s に緩める
  → 「音の中の速い揺れ」も前庭系に負担をかけうるため、視覚と同じ扱いで鈍化させる。
    音そのものは消さない（情報が失われるため）。

アクセシビリティ別枠 "字幕モード": ON のとき、Positional な非UI音（#31 telephone,
  #29 shimmer, L4 creak）の発生時に DOM 字幕を出す。例:「― 遠くで電話が鳴っている」
  「― 壁のどこかが、かすかに光る」。音量は変えない。
```

### 6.6 CPU 予算

同時発音の上限を **28 voice**。超過時は busSFX の最も古い・最も小さいものから `release 0.05s` で刈る。Convolver は**同時に最大 2 個**（部屋切替クロスフェード時のみ 2、通常 1）。ノイズバッファは white/pink/brown の 3 枚のみを全ソースで共有（`AudioBufferSourceNode` は毎回新規だがバッファは同一参照）。