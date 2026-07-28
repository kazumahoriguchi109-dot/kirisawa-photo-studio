# 素材とライセンスの記録

本作は**外部素材をひとつも同梱していません**。画像・音声・3Dモデル・フォント
ファイルのいずれも、リポジトリにもビルド成果物にも含まれません。
プレイヤーが見聞きするものはすべて、起動時にコードから生成されています。

## 一覧

| 種別 | 生成方法 | 生成箇所 | ライセンス上の扱い |
|---|---|---|---|
| 3D形状 | `BoxGeometry` / `CylinderGeometry` / `SphereGeometry` / `TorusGeometry` / `LatheGeometry` / `ExtrudeGeometry` / `TubeGeometry` と自前の `BufferGeometry` | `src/world/Geo.ts`、`src/world/props/*` | 本プロジェクトのオリジナル |
| 質感（壁・木・床・真鍮・天鵞絨・紙ほか） | `<canvas>` 2D 描画＋決定論的な値ノイズ。法線マップとラフネスマップも同じ canvas から Sobel で生成 | `src/world/Textures.ts`、`src/world/Noise.ts` | 本プロジェクトのオリジナル |
| 写真（肖像・集合写真・室内記録・最後の一枚・ネガ） | シルエット、階調カーブ、銀粒子ノイズ、周辺減光、褪色斑を重ねて描画 | `src/world/Photographs.ts` | 本プロジェクトのオリジナル。実在の写真は一切参照していない |
| 文字を含む面（ラベル・貼り紙・台帳・暦・文字盤） | `<canvas>` へシステムフォントで描画 | `src/world/props/Common.ts` ほか | 本プロジェクトのオリジナル |
| 効果音・環境音 | WebAudio の `OscillatorNode` と手続き的に生成したノイズバッファを、フィルタとエンベロープで整形 | `src/core/Audio.ts` | 本プロジェクトのオリジナル |
| 音楽的モチーフ | 174.61 Hz を基音とする三音／四音の音列を、合成音色で発音 | `src/core/Audio.ts` `motif()` | 本プロジェクトのオリジナル |
| 書体 | システムフォントのみを CSS のフォントスタックで指定（Hiragino / Yu / Noto / Meiryo など） | `src/ui/styles.css` | 同梱していないため配布ライセンス不要 |

## 依存ライブラリ

| 名前 | 版 | ライセンス | 用途 |
|---|---|---|---|
| three | ^0.170.0 | MIT | 描画 |
| three/examples/jsm/postprocessing | 同上 | MIT | EffectComposer / RenderPass / UnrealBloomPass / SMAAPass / ShaderPass |
| typescript | ^5.6.3 | Apache-2.0 | 型検査（開発時のみ） |
| vite | ^5.4.10 | MIT | 開発サーバとビルド（開発時のみ） |

`three` の examples 由来のパスは MIT ライセンスの範囲で利用しています。
`SMAAPass` は three に同梱された内部データのみを使用し、外部ファイルを読み込みません。

## 権利についての確認事項

- 登場する写真館、人物、町、事件はすべて架空のものです。
- 実在の写真館、写真技術者、企業、商品名は登場しません。
- 既存のゲーム作品から、物語・部屋・謎・文章・意匠・音・記号を引き写した箇所は
  ありません。写真の四工程（撮影・現像・停止・定着）は白黒写真の一般的な実務手順で
  あり、特定の著作物に由来するものではありません。
