/**
 * Every player-facing string in the chapter.
 *
 * House style (from the script bible):
 *  - 乾いた観察文体. No first or second person in narration.
 *  - No 「！」 and no 「？」 anywhere.
 *  - Fixed UI vocabulary; see UI_TEXT below. Never vary it.
 *  - Never name an emotion; describe the thing instead.
 */

export const UI_TEXT = {
  title: '霧沢写真館',
  menuNew: 'はじめから',
  menuContinue: 'つづきから',
  menuSettings: '設定',
  menuHowTo: 'あそびかた',
  menuCredits: '制作について',

  inventory: '持ち物',
  // 「控え」 is a bookkeeping word - a duplicate, a counterfoil - and a player
  // reading it on a HUD button has no way to guess it holds what they noticed.
  clues: '覚え書き',
  hints: '手がかり',
  settings: '設定',
  close: '閉じる',
  back: '戻る',
  use: '使う',
  combine: '組み合わせる',
  examine: '調べる',
  take: '手に取る',
  read: '読む',
  advance: '進む',
  open: '開ける',
  turn: '回す',
  pull: '引く',
  push: '押す',
  select: '選ぶ',
  deselect: '選択を解除',
  cancel: 'やめる',
  confirm: '実行する',

  itemStateNew: '新しい',
  itemStateExamined: '確認した',
  itemStateTransformed: '変わった',
  itemStateSpent: '使い終えた',

  inventoryEmpty: '持ち物はまだない',
  cluesEmpty: '覚え書きはまだない',
  selectedPrefix: '選択中',
  saved: '記録した',
  autoSaved: '自動で記録した',

  // Numbered, because a player asking for help wants to know how much help is
  // left, not to decode 「そっと示す」 against 「つながりを示す」.
  hintTierLabels: ['着眼点', 'つながり', '次の操作'],
  // Never a sentence that could pass for the hint itself. Joined to the tier
  // label by an em-dash, the old wording read as 「ヒント1 — これを開くまえに…」,
  // and two blind testers took that FOR hint one: both finished their sessions
  // believing every first hint in the game was the same content-free line. The
  // encouragement it carried now lives in the panel's own subtitle, once.
  hintLockedNote: '未開放',
  hintPanelNote: 'ヒントは一段ずつ開く。まずは、まだ調べていない場所を探してみるといい。',
  hintReveal: '一段開く',
  /** Prefix for the fixed puzzle number: 謎一, 謎二 ... */
  puzzleNo: '謎',
  hintNothingActive: 'いま表示できるヒントはない',

  survey: '見渡す',
  surveyKey: 'Q',

  chapterCard: '第一章　玄関ホール',
} as const

export const OPENING_NARRATION = [
  '雨。取り壊しは、明日の朝九時。',
  '霧沢写真館。四十年前に店を閉めてから、誰も住んでいない。',
  '鍵を預かった。中のものを、持ち出すものと、残すものに分ける。それだけの仕事だった。',
  '引き戸が、背中で鳴る。',
  '錠の落ちる音。四つ。',
  '——外は、まだ夜だ。',
]

/** Short lines shown when an action does not work. Never generic. */
export const FEEDBACK = {
  doorLocked: '四つの環が揃っていない。錠は動かない。',
  wrongItem: 'ここで使うものではない。',
  wrongItemDelicate: 'この機械は、当てて壊すためのものではない。',
  emptyDrawer: '底に、四十年ぶんの埃が平らに積もっている。',
  nothingWall: '壁。日に焼けた色が均一に古い。',
  nothingFloor: '板が鈍く鳴る。動く様子はない。',
  powerOff: '通電していない。先に配電盤を確認する必要がある。',
  safeWrong: '何かが噛んでいる。環は最後まで回らない。',
  crankMissing: '軸の端に、六角形の差し込み口がある。',
  crankStuck: '向きが違う。軸に力が伝わっていない。',
  enlargerNoNeg: '白い光では、像が見えない。',
  loupeBroken: 'レンズがなければ、像は拡大できない。',
  devNoWater: '粉末のままでは現像に使えない。',
  trayWrongOrder: 'この順では、像が止まらない。',
  safelightOnWhite: '赤を消せば、出かかった像が消える。',
  phosNotDark: '白い明かりの下では、塗料の文字は見えない。',
  photoWrongSlot: '枠の大きさが合わない。年がずれている。',
  telephoneDead: '線は壁の途中で切られている。切ったのは素人の手つきだ。',
  windowLocked: '内側から釘が打ってある。外側からではない。',
  takeImmovable: '明日には無くなるものだ。今日、動かす理由がない。',
  darkroomLocked: '把手は回る。しかし、内側の錠が落ちたままだ。',
  officeLocked: 'すりガラスの向こうは暗い。扉には鍵が掛かっている。',
  needDeveloper: 'まだ現像液を作っていない。粉と水を組み合わせて、いちばん左のバットに張るところからだ。',
  needSafelight: '白い光の下では、像の出るまえに焼けてしまう。赤の下でする仕事だ。',
  alreadyDone: 'もう済んでいる。',
  nothingHere: '手の届くところに、いま用のあるものはない。',
} as const

/** Environmental storytelling. Not puzzles; the room speaking. */
export const AMBIENT_TEXT: Record<string, string> = {
  mem_portrait_wall:
    '見合い、七五三、卒業。知らない町の知らない顔が、みな同じ椅子に座っている。四十年ぶんの他人が、まだきちんと笑っている。',
  mem_calendar:
    '昭和六十年十一月。めくられないまま、右下がわずかに反っている。二十三日に丸がついている。誰かの写真の予定だったのだろう。',
  mem_coat_rack:
    '大人用の外套が一着。その下に、届くはずのない高さに小さな木のフックが後から打ち足してある。何もかかっていない。',
  mem_bell: '押すと、澄んだ音がひとつ。四十年経っても狂っていない。返事はない。',
  mem_telephone:
    '受話器を上げても、音はしない。線は壁の途中で切られている。切ったのは業者ではなく、素人の手つきだ。',
  mem_ledger_spine:
    '背表紙に年号が並ぶ。昭和五十四、五十五、五十六——六十で途切れる。六十一年の分は、買われてもいない。',
  mem_height_marks:
    '戸口の柱に、鉛筆の横線が四本。いちばん上でも、胸より低い。日付だけが書いてあって、名前がない。',
  mem_drying_line:
    '洗濯挟みが六つ、等間隔で並んでいる。印画紙は一枚も残っていない。挟まっているのは、ネガが一枚きり。挟み口の内側だけ、二つが黄ばんでいる。',
  mem_chem_shelf:
    '茶色の瓶が並ぶ。ラベルは館主の字で、どれも同じ大きさ、同じ高さに貼ってある。右端に一本ぶんの空きがある。',
  mem_shopfront:
    'すりガラスの向こうで、雨が街灯を溶かしている。外から見れば、この明かりは四十年ぶりということになる。',
  mem_posing_chair:
    '座面の中央だけ、布の毛が寝ている。何千人がここに座って、正面を向いた。いまは壁を向いている。',
  mem_studio_lamps:
    '大きな傘が三つ、天井を向いたまま。フィラメントは切れていない。この明かりで人を綺麗にするのが仕事だった。',
  mem_umbrella:
    '傘立てに、骨の折れた子供用の傘。赤。折れた骨だけが、ていねいに糸で束ねてある。直そうとして、途中でやめたらしい。',
  mem_stairs:
    '五段上がったところで、板が五枚、内側から打ちつけてある。釘の頭がまだ新しい。' +
    'ここから上へは行けない。上に何かあったことだけが、手すりの磨り減り方でわかる。',
  mem_darkroom_clock:
    '秒針だけが動いている。電気が戻ってから数えはじめた秒だ。四十年ぶんの遅れは、誰も直さない。律儀な話だ。',
  mem_kettle: '石油ストーブの上に、蓋のずれたやかん。底に白い輪。最後に沸かした水が、そのまま乾ききっている。',
  mem_desk_lamp: '傘のついた事務用の灯。首の関節だけ、油の色が濃い。何度も同じ角度に戻された跡だ。',
  mem_bench_leg: '作業台の脚が、片側だけ継いである。継いだ木の色が新しい。焼けた分を切って、同じ寸法に戻したらしい。',
  mem_licence: '営業許可証。昭和三十九年開業。判子の朱肉が、紙の繊維の間で少し滲んでいる。',
  mem_safe_outside: '床に据えつけの金庫。塗装は厚く、角だけが下地の鉄を見せている。環はまだ滑らかに回る。',
  mem_sink: '深い流し。栓の周りだけ、水垢の輪が四十年ぶん重なっている。',
  mem_reflector: '反射板。片面が白く、片面が銀。持ち手のところだけ、布地がすり切れている。',
  mem_shopsign: 'すりガラスに、外向きの字。内側からは、いつも逆さに読むことになっていた。',
  mem_boxes: '印画紙の箱。未開封が一つ。使用期限は昭和六十二年まで、と印刷してある。',
  mem_projector_wall: '壁のこの一画だけ、塗りが新しい。何かを繰り返し映していた場所だ。',
  mem_wastebasket: '屑籠。丸めた紙が三つ。どれも書き出しの二行で止まっている。',
} as const

/** Full documents. Rendered monospaced with the indentation preserved. */
export const DOCUMENTS: Record<string, { title: string; body: string }> = {
  doc_note: {
    title: '手記',
    body: `　　　　　　　　　　　　昭和六十年十一月二十三日　夜

一枚だけ、まだ現像していない。

撮るつもりのない一枚だった。
棚に肘を当てたのは私だ。

瓶が落ち、栓が飛び、液がストーブの脚元まで走った。
拾おうとして蛇腹の脇に手をついた。そのとき、シャッターが落ちた。

あのフィルムには、床が写っている。
液が広がっていく、その瞬間が写っている。
現像すれば、何が起きたのかがそのまま出る。

出したところで、火は消えない。
出さなければ、この家は「原因の分からない火事の家」で済む。
出せば、「父親が焼いた家」になる。
灯は、その家の子になる。

私はここを畳む。
写真の中からも、あの子を外す。
惜しいが、惜しいで済む話ではない。

あの子には、写真館の娘ではない場所で、大きくなってもらう。

壁の一面だけは残す。
あそこだけは切らない。

いつか誰かが、抜いたところを埋めてくれればいい。
埋まらなくても、それでいい。
空いているという事実だけは残る。

　　　　　　　　　　　　　　　　　　　　　　霧沢響一`,
  },
  doc_manual: {
    title: '暗室作業手順',
    body: `　　　　　　暗室作業手順　　霧沢写真館

一、撮影
露光を終えたフィルムは暗袋に入れ、そのまま暗室へ運ぶこと。
途中で明るい場所を通らないこと。

二、現像
現像液に浸す。液温二十度。時間は指定に従うこと。
ここで像が現れる。現れた像は、まだ光に弱い。

三、停止
停止液へ移す。
ここを飛ばすと現像が止まらず、像が潰れる。
時間は短くてよい。短くなければならない。

四、定着
定着液へ十分に浸す。
ここまで終えて初めて、光に当てても像が消えなくなる。
定着後は水洗すること。

＊バットは作業台の左から、
　現像、停止、定着、水洗の順に並べること。

＊撮影は暗室の外の工程であり、台には載らない。

＊暗い中では、並びの違いが取り違えにつながる。
　並べ直したあとは、必ずラベルも確かめること。
　ラベルだけを信じないこと。

　　　　　　　　　　　　　　　　　　　　　　霧沢`,
  },
  doc_ledger: {
    title: '予約控',
    body: `　二十三日（土）　十時　　灯　七歳　　七五三　　—
　　　　　　　　　　　　着付けは母の分を直して使う

　二十四日以降　　白紙`,
  },
  doc_letter: {
    title: '灯へ',
    body: `　灯へ

これを読む頃には、お前はもう大人になっている。

父さんは写真の人間だから、言葉で書くのは下手だ。
撮ったものは山ほどあるのに、渡せるものが一枚もない。

家の写真を、すべてやり直した。
お前の写っているところを外した。

理由は書かない。書けば、言い訳になる。
ただ、お前が悪いことは一つもない。
それだけは、順番として先に書いておく。

七五三の日に撮るつもりだった。
着物はもう直してある。
二十三日の十時に、椅子を正面に向けて待っている。

こちらを見て、と言うと、お前はいつも先に笑う。
笑うのは押したあとでいいと、何度言っても先に笑う。

　　　　どこにいてもいい。写らなくてもいい。
　　　　明るいところにいてくれれば、それでいい。

　　　　　　　　　　　　　　　　　　　　　　　　父`,
  },
} as const

export interface EndingText {
  id: string
  title: string
  body: string
  card: string
}

export const ENDINGS: Record<string, EndingText> = {
  normal: {
    id: 'normal',
    title: '夜明けの扉',
    body: `四つの環が揃う。
錠が外れる音は、落ちたときと同じだった。

引き戸を開ける。
雨は、上がりかけている。

振り返ると、館は何も変わらない顔をしている。

荷台に積むものは、結局ほとんどなかった。
持ち出すものと、残すもの。
ここにあったものは、たぶん、そのどちらにも分けられない。

朝九時には、この館は無くなる。

何があったのかは、分からないままだ。

戸を閉める。
今度は、外から。`,
    card: '——霧沢写真館　解体　午前九時十二分　立会人なし',
  },
  'true': {
    id: 'true',
    title: '最後の一枚',
    body: `液の中から、像が現れる。

床の木目。
倒れた茶色の瓶。
転がった栓。

広がる液の縁は、そこで止まったまま、
四十年ぶんの静けさになっている。

人は写っていない。
写真は、誰も責めない。

ただ、肘が当たったのだと、
この一枚だけが覚えている。

光に当てても、もう消えない。

四十年遅れて、
最後の一枚が乾燥ロープに掛けられる。

消えた人が、何を守ろうとしたのかは分かった。
それが正しかったのかは、分からない。

それでも、起きたことは残った。`,
    card: '——最後の一枚は、四十年後に定着した',
  },
  hidden: {
    id: 'hidden',
    title: '灯をかえす',
    body: `四つの空白に、四枚を戻す。

一歳。
四歳。
七歳。

そして、椅子を正面に向けたまま、
撮られることのなかった日のための一枚。

安全灯を落とす。
赤が引き、文字は壁へ戻る。

散らばっていた三つの字が、
写真の中央で一つの言葉になる。

——灯を、かえす。

家じゅうの写真から外された名前が、
この壁に一つだけ戻った。

朝九時に壊されるとしても、
それまで、この壁は揃っている。

揃っていたという事実は、
壁を壊しても消えない。`,
    card: '——解体延期　屋内に、保存すべき記録が確認されたため',
  },
} as const

export const CREDITS = `　　　　　　　　霧沢写真館　　最後の一枚


　　　　企画・脚本・演出・美術・造形・効果音・実装

　　　　　　　　　　（個人制作）


　　　　　　　　　　　　　—


　この作品に登場する写真館、人物、町はすべて架空のものです。
　現実の写真館、写真技術者、および出来事とは関係がありません。

　劇中の暗室作業手順は、昭和期の一般的な白黒写真処理を
　物語のために簡略化したものです。

　本作の三次元形状、質感、音は、すべて実行時に生成されています。
　外部の画像、音声、モデルは一切使用していません。


　　　　　　　　　　　　　—


　　　　　撮影　現像　停止　定着
　　　　　　　　　水洗


　　　　　　霧沢写真館にお越しいただき、ありがとうございました


　　　　　　　　　　　　　—`

export const HOW_TO_PLAY = `向きを変える
画面の左右端をクリックする　／　← → キー

調べる
対象に触れて名前が表示されたら、クリックする

部屋を移動する
扉や通路をクリックする

近くで見るのをやめる
画面右上の「× 戻る」　／　右クリック　／　Escキー

持ち物を開く
画面下の「持ち物」　／　Iキー

道具を使う
持ち物から道具を選び、使用する対象をクリックする

道具を組み合わせる
持ち物から道具を選び、もう一方の道具を選んで「組み合わせる」

覚え書きを開く
見つけた手がかりは自動で記録される　／　Jキー

ヒントを見る
行き詰まったときに開く　／　Hキー

見渡す
調べられる場所を一度だけ光らせる　／　Qキー

記録
節目ごとに自動で記録される


急がなくていい。
部屋のほうは、四十年待っている。`
