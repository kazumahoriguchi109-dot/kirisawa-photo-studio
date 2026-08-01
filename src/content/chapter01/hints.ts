/**
 * Three-tier hint ladder.
 *
 * ヒント1 points at a place. ヒント2 names the relationship between two things.
 * ヒント3 gives the method - but never performs the action, so the player still
 * has to go and do it. Written in the game's voice, not a manual's.
 *
 * Every entry carries its own number and the room it concerns, because a hint
 * that opens with 「薬品棚に」 is no use to a player who does not yet know which
 * room the chemical shelf is in. The number is fixed per puzzle rather than
 * assigned by position in the list, so the same puzzle is always 謎五 however
 * many others happen to be open at the time.
 */

export interface HintEntry {
  id: string
  /** Fixed puzzle number, shown as 謎一, 謎二 ... */
  no: number
  /** The room this puzzle is solved in. Shown beside the title. */
  place: string
  title: string
  steps: [string, string, string]
}

export const HINTS: Record<string, HintEntry> = {
  p1_fuse: {
    id: 'p1_fuse',
    no: 1,
    place: '玄関ホール',
    title: '明かりが点かない',
    steps: [
      '玄関ホールの、暦が掛かった壁を調べる。そこに「配電盤」と書かれた鉄の箱がある。',
      '配電盤には受け金が三つある。真ん中だけが空で、奥には焦げ跡が残っている。交換用の部品が、受付に保管されていないだろうか。',
      '受付の抽斗から予備のヒューズを取り、配電盤中央の受け金に差す。そのあと、下の主レバーを上げる。',
    ],
  },
  p2_observe: {
    id: 'p2_observe',
    no: 2,
    place: '玄関ホール／撮影室',
    title: '四十年前の一枚',
    steps: [
      '受付の壁に、昭和六十年の撮影室を写した写真がある。現在の撮影室と見比べてみる。',
      '写真と現在の部屋には、三つの違いがある。どれも、写真の中で人がいた側に集まっている。',
      '撮影室で、壁の上部、背景幕、椅子の向きを調べる。写真と違う三か所をすべて確認する。',
    ],
  },
  p3_backdrop: {
    id: 'p3_backdrop',
    no: 3,
    place: '撮影室',
    title: '幕が下りたまま',
    steps: [
      '背景幕を吊る軸の右端に、六角形の差し込み口がある。',
      '六角形の軸を回せる道具が必要だ。古い写真に写っていた、壁の上の丸いものがあった場所を調べる。',
      '時計の跡に掛かった真鍮のクランクを取り、巻き上げ軸へ差して回す。',
    ],
  },
  p4_groundglass: {
    id: 'p4_groundglass',
    no: 4,
    place: '撮影室',
    title: '読めない字',
    steps: [
      '背景幕の裏に、天地が逆になった鉛筆書きがある。',
      '撮影室には、像を上下逆さまに映す道具がある。',
      '大判カメラのピントグラスを覗き、鉛筆書きが映る位置に合わせる。',
    ],
  },
  p4b_key: {
    id: 'p4b_key',
    no: 5,
    place: '撮影室',
    title: '灯の下',
    steps: [
      'ピントグラス越しに読んだ「鍵は灯の下に」という言葉が、まだ使われていない。',
      '「灯」は人の名前であると同時に、この部屋にある道具の名前でもある。',
      '撮影室の撮影灯を調べる。背景幕に近い撮影灯の台座、床に近い部分を見る。',
    ],
  },
  p7_marks: {
    id: 'p7_marks',
    no: 9,
    place: '玄関ホール／撮影室／事務室',
    title: '赤の下の三つの書き付け',
    steps: [
      '安全灯を点けたまま暗室を出ると、館内も赤い光に包まれる。白い光では見えなかった文字を探す。',
      '文字は玄関ホール、撮影室、事務室に一つずつある。目の高さほどの壁を確認する。',
      '玄関ホールの壁、撮影室西側の壁、事務室の壁を調べる。三文字を見つけて、一つの言葉として読む。',
    ],
  },
  p5_developer: {
    id: 'p5_developer',
    no: 7,
    place: '暗室',
    title: '現像液がない',
    steps: [
      '暗室の薬品棚に、粉末現像剤と蒸留水がある。',
      '現像液は、粉末現像剤を水に溶かして作る。どちらか一方だけでは使えない。',
      '持ち物で粉末現像剤と蒸留水を組み合わせる。完成した現像液を、作業台の「現像」と書かれたバットに注ぐ。',
    ],
  },
  p5_trays: {
    id: 'p5_trays',
    no: 15,
    place: '暗室',
    title: '台の上の並び',
    steps: [
      '作業台の四つのバットは、「現像、定着、水洗、停止」の順に並んでいる。作業工程の順とは一致しない。',
      'バットは二つを選ぶと入れ替えられる。正しい順は、事務室の暗室作業手順に残されている。',
      '左から「現像、停止、定着、水洗」の順に並べ替える。',
    ],
  },
  p5_loupe: {
    id: 'p5_loupe',
    no: 6,
    place: '撮影室',
    title: '細かすぎて読めない',
    steps: [
      '撮影椅子の座面に、何かを外したような裂け目がある。',
      '座面から見つかる枠と、大判カメラの三脚にある小抽斗の中身は、もともと一つの道具だった。',
      '三脚の小抽斗からレンズ玉を取り、ルーペの枠と組み合わせる。',
    ],
  },
  p6_enlarger: {
    id: 'p6_enlarger',
    no: 10,
    place: '暗室',
    title: '金庫の番号',
    steps: [
      '暗室の乾燥ロープに、古いネガが一枚残されている。',
      '引き伸ばし機でネガを壁に投影できる。細部を読むには、完成したルーペも必要だ。',
      '安全灯を点け、ネガを引き伸ばし機へ入れる。投影された像にルーペを使う。',
    ],
  },
  p7_safelight: {
    id: 'p7_safelight',
    no: 8,
    place: '暗室',
    title: '赤い明かり',
    steps: [
      '暗室の戸口近くに、「安全灯」と書かれた赤い柄のレバーがある。',
      '暗室では、白い光を使うとネガや印画紙の像が失われる。作業には赤い安全灯が必要だ。',
      '安全灯のレバーを操作する。引き伸ばし機と現像作業は、安全灯を点けた状態で行う。',
    ],
  },
  p8_safe: {
    id: 'p8_safe',
    no: 11,
    place: '事務室',
    title: '金庫の環',
    steps: [
      '事務室の金庫は、一つの環で番号を合わせる仕組みになっている。',
      '番号そのものは書かれていない。暗室で拡大した古いネガには、この金庫が写っている。',
      'ネガの像から読み取った番号に環を合わせ、把手を引く。',
    ],
  },
  p9_lock: {
    id: 'p9_lock',
    no: 12,
    place: '玄関ホール',
    title: '玄関の四つの環',
    steps: [
      '玄関の錠には、写真の工程を表す印が四つ並んでいる。',
      '工程の順は事務室の作業手順に書かれている。暗室時計には、暗室内で行う三工程が同じ順で刻まれている。',
      '「撮影、現像、停止、定着」の順に、左から四つの印を合わせる。印の形は、現像した最後の一枚で確認できる。',
    ],
  },
  true_develop: {
    id: 'true_develop',
    no: 13,
    place: '暗室',
    title: 'まだ現像していない一枚',
    steps: [
      '金庫から見つけたネガには、まだ像が現れていない。',
      '現像には、現像液と赤い安全灯の両方が必要だ。',
      '安全灯を点け、現像液を入れたバットに未現像のネガを浸す。',
    ],
  },
  hidden_restore: {
    id: 'hidden_restore',
    no: 14,
    place: '撮影室',
    title: '壁の四つの空白',
    steps: [
      '背景幕の裏の年代記には、写真を抜き取った跡が四つある。',
      '写真は館内に分けて隠されている。受付の額、暗室の棚、事務机、金庫を調べる。',
      '四枚を集め、年代記の空白へ戻す。左から一歳、四歳、七歳、最後に残った一枚の順に置く。',
    ],
  },
}
