# Handoff: 日本救急医学会 論文用 Figures（Monster Bash 救護所ベッド管理システム）

## Overview

大規模野外音楽フェスティバル「Monster Bash」（2日間・来場者数約50,000名）の救護所（4カ所・医師15名）で運用している、Firebase Realtime Database ベースのリアルタイム傷病者管理 Web アプリ（[monsterBash_bedControl](https://github.com/Liptonist/monsterBash_bedControl)）に関する原著論文（Journal of Japanese Association for Acute Medicine 投稿想定）用の Figure 3枚。

3枚で以下を示す：
1. **Figure 1** — システム構成図：4救護所端末・認証層・クラウドDB・監査ログの全体関係
2. **Figure 2** — データフロー図：起点端末から他救護所端末へのリアルタイム同期シーケンス（時系列付き）
3. **Figure 3** — 臨床運用フローと画面構成：受入→状態変化→退所の3ステップ + 管理画面のモノクロ再構成 + 従来の紙運用に対する帰結

## About the Design Files

このバンドルに含まれる HTML/CSS は **論文投稿用の Figure を HTML で組んだデザインリファレンス** です。運用としては次のいずれかを想定しています：

1. **そのまま論文投稿に使用**：ブラウザで開き Cmd/Ctrl+P → A4 横・余白15mm・「背景を印刷しない」で PDF 化して投稿。Journal of JAAM の Figure 提出フォーマットに合致。
2. **編集用テンプレートとして扱う**：Adobe Illustrator や Inkscape で作り直す場合の下敷き。数値・レイアウトはすべて mm 単位で記述してあるため寸法をそのまま流用可能。

いずれの場合も本 HTML は「HTML アプリ」ではなく「印刷用の静的レイアウト」である点に注意してください。JavaScript は使っていません。

## Fidelity

**High-fidelity (hifi)**。以下すべて確定値：

- 用紙サイズ：A4 横（297×210 mm）
- Figure 描画エリア：`.figure-page` = 267×200 mm（左右余白 15mm、上下余白 12/10mm）
- カラー：**完全モノクロ**（グレースケール + 線種 + パターン塗りのみ）
- フォント：Noto Sans JP（見出し・本文）、system monospace（コード・数値ラベル）
- 線幅：本文罫線 0.4–0.6pt、強調枠 1.2pt、矢印線 0.9–1.5pt
- フォントサイズ：本文 8–9pt、見出し 9.5–13pt、キャプション 9.5pt、注釈 8.5pt

## Screens / Views

各 Figure は独立した A4 横1ページ。共通ヘッダ（journal 名 + 著者欄）とフッタ（fig-caption）を持つ。

---

### Figure 1 — システム構成図

**Name**: `Figure 1 システム構成図.html`

**Purpose**: 論文の Introduction / Materials & Methods 節で「本システムはどこに何が置かれているか」を1枚で示す。

**Layout**: `.f1-canvas` は flexbox 縦積み、`padding: 8mm 10mm`。子要素は上から順に：
1. `.row-clinics` — CSS Grid `repeat(4, 1fr)` gap 5mm
2. `.arrows-band` — 破線矢印バンド 高さ 8mm、内部に絶対配置 4本
3. `.auth-band` — CSS Grid `auto 1fr 1fr 1fr` gap 6mm
4. `.arrows-band2` — 実線矢印バンド 高さ 8mm、内部に 2本
5. `.backend` — DB 帯、左右 20mm マージン、内部に CSS Grid `repeat(3, 1fr)` gap 5px
6. `.arrows-band3` — 点線矢印バンド 高さ 8mm（右寄せ 22%）
7. `.bottom-row` — CSS Grid `1.2fr 1fr 1fr` gap 4mm、margin-top 4mm

**Components**:

- **`.clinic`（4個）**：border 0.6pt solid #000、padding 5px 8px 6px
  - `.c-hd` 9.5pt/700、下線 0.4pt
  - `.c-sub` 8pt/400 グレー
  - `.dev`（端末アイコン） 7×9mm、border 0.5pt、内部 `#f2f2f2` の擬似画面 + 下端ホームボタン
  - `.cnt` 8pt/500
- **`.auth-band`**：border 0.6pt dashed、background `#fafafa`
  - `.ab-t`（「認証層」）9pt/700、白背景の枠、実線 0.4pt border
  - `.ab-item` 8.5pt/normal
- **`.backend`**：border 1.2pt solid（強調枠）
  - `.b-hd` 11pt/700、Firebase Realtime Database の英字は monospace 8.5pt/400
  - `.b-cell`（3個 = rooms/discharged/archives）：border 0.4pt solid #666、monospace 9pt キー名 + 8pt 説明
- **`.bottom-row` 内のカード3枚**：
  - `.b-staff`（左）：参加医師総計 15名。border 0.5pt solid
  - `.b-legend`（中央）：凡例。SVGで線種サンプル（実線→破線→点線、全て #000）+ ラベル
  - `.b-audit`（右）：監査ログ。border 0.5pt **dotted** solid #000（他の2枚と差別化）

**矢印**：`.arr-col`（垂直線）+ `.arr-head`（三角形、CSSボーダートリック）
- 破線矢印（救護所→認証層）：4本、`border-left: 0.7pt dashed #000`、左位置 12.5/37.5/62.5/87.5%
- 実線矢印（認証層→DB）：2本、`border-left: 0.9pt solid #000`、左位置 35/65%
- 点線矢印（DB→監査ログ）：1本、`border-left: 0.5pt dotted #000`、右位置 22%

---

### Figure 2 — リアルタイムデータフロー図

**Name**: `Figure 2 データフロー図.html`

**Purpose**: 論文の Results 節で「複数救護所間でのリアルタイム同期がどのように実現されているか」を時系列で示す。本論文の主要な novelty claim を可視化する要となる図。

**Layout**: `.f2-canvas` は flexbox 縦積み、`padding: 6mm 8mm`。子要素は上から：
1. `.actors-row` — CSS Grid `1fr 3fr` gap 5mm（起点 + 他3拠点）
2. `.arrow-band` — 高さ 14mm、内部に矢印 4本 + STEP キャプション 2枚（絶対配置）
3. `.db-bar` — flex justify-space-between、min-height 15mm、border 1.2pt solid（強調）
4. `.timeaxis-wrap` — 経過時間ラベル + timeaxis バー（margin-top 4mm）
5. `.steps-detail` — CSS Grid `repeat(3, 1fr)` gap 4mm（STEP1/2/3 の詳細カード）
6. `.f2-legend` — flex 横並び gap 22px（凡例）

**Components**:

- **`.actor-single.origin`**（起点端末A）：border **1.2pt** solid（強調）、右上に `.tag`（黒背景・白文字・7pt/700 の「起点」バッジ）
- **`.actor-multi`**（他3拠点コンテナ）：border 0.6pt solid、内部に CSS Grid `repeat(3, 1fr)` gap 3mm の `.a-cell`
- **`.arrow-band` 内の矢印**：
  - `.aw-write`（起点→DB、太い下向き）：`border-left: 1.5pt solid #000`、下端に三角矢印（黒塗り、5pt）、左 12.5%
  - `.aw-up`（DB→他3拠点、細い上向き）3本：`border-left: 0.9pt solid #000`、上端に三角矢印（黒塗り、5pt）、左 42.5/58.3/74.2%
  - `.step-cap`（STEPキャプション）2枚：background #fff、border 0.4pt solid、白抜き pill 状に浮遊配置
- **`.db-bar`**：border 1.2pt solid（Figure 1 の DB と同じ強調）、左に DB 名、右に `.db-port` 2個（受信/配信）
- **`.timeaxis`**：高さ 8mm、上下 0.6pt solid ボーダー、background `#fafafa`、`.tick` を absolute で 0%, 25%, 50%, 75%, 100% に配置
  - `.tick` は monospace 8pt、`white-space: nowrap`（**改行禁止が重要 — v1で見切れの原因になった箇所**）
  - `.tick.major` と `.tick.end` は 700/太い縦罫線
- **`.steps-detail .stp`** 3枚：border 0.5pt solid、`.sd-hd` 9pt/700 + `.sd-time` monospace 7.5pt グレー
- **`.f2-legend`**：border 0.5pt solid、`.lg-title` 9pt/700 + 縦罫線区切り、`.lg-row` 各行に SVG アイコン（矢印線種 + 三角）+ ラベル

---

### Figure 3 — 臨床運用フローと画面構成

**Name**: `Figure 3 運用フローと画面.html`

**Purpose**: Discussion 節向け。「臨床のどの場面でどの操作をするか」を左に、「実際の管理画面がモノクロで見るとこう見えるか」を右に、下段に「従来の紙運用と比べての帰結」を4項目で並べる。

**Layout**: `.f3-canvas` は flexbox 縦積み、`padding: 6mm 8mm`、gap 5mm。子要素：
1. `.f3-top` — CSS Grid `1fr 1.15fr` gap 5mm（左:フロー / 右:UI）
2. `.outcome` — 帰結セクション（見出し + 4カラム CSS Grid）

**Components**:

**左側 `.flow-col`（A. 傷病者1名あたりの臨床運用フロー）**
- `.fc-title`：見出し帯、`background: #eaeaea`、border 0.6pt solid、9.5pt/700
- `.flow-step`（3個）：CSS Grid `12mm 1fr`
  - `.fs-num`：黒背景 / 白文字 / monospace 11pt/700 の番号セル
  - `.fs-body`：右側本文。`.fs-hd` 9.5pt/700 + `.fs-op` monospace 7.5pt グレーで技術ラベル
- `.arrow-down`：ステップ間の `↓` 記号、12pt 中央寄せ

**右側 `.ui-panel`（B. 管理画面 モノクロ再構成）**
- `.mock`：`index.html` の縮小レプリカ
  - `.mk-hdr`：ヘッダバー、7pt、`background: #f5f5f5`
  - `.mk-tabs`：4タブ、選択タブは黒背景/白文字/700
  - `.mk-body`：CSS Grid `1fr 1fr` gap 4px、`.col-lbl` はグリッド全幅ラベル
  - `.bed` / `.chair` セル：border 0.4pt solid、6.5–7pt
- **トリアージのモノクロ表現**（重要な設計判断）：
  - `.tri-empty` → 白 `#fff`
  - `.tri-green`（軽症） → 均一グレー `#f0f0f0`
  - `.tri-yellow`（中等症） → `repeating-linear-gradient(45deg, transparent 0 3pt, rgba(0,0,0,.18) 3pt 4pt)` の疎らな斜線
  - `.tri-red`（重症） → `repeating-linear-gradient(45deg, rgba(0,0,0,.35) 0 1.5pt, transparent 1.5pt 3pt)` の濃い斜線
- `.tri-legend`：トリアージ4値の凡例、破線区切り

**下段 `.outcome`（C. 本システム運用の帰結）**
- `.out-title`：グレー背景の見出し帯
- `.outcome-grid`：CSS Grid `repeat(4, 1fr)` gap 6px
- `.card` × 4：border 0.5pt solid、`.oc-hd` 8.5pt/700 + `<p>` 8pt

## Interactions & Behavior

**なし**。純粋な静的な印刷レイアウト。JavaScript は一切使用していない。ホバー・クリック・遷移などの動的挙動なし。

## State Management

**なし**。すべての値はハードコード。ダイナミックデータ・API連携は無し。

## Design Tokens

### Colors（完全モノクロ）

| 名前 | 値 | 用途 |
|---|---|---|
| ink | `#000000` | 本文・罫線 |
| ink-2 | `#333333` | セカンダリテキスト |
| ink-3 | `#555–#666` | キャプション・注釈 |
| ink-4 | `#999` | 破線区切り |
| paper-white | `#ffffff` | 紙背景 |
| gray-band | `#fafafa` | 認証層・時刻軸の帯 |
| gray-tab | `#f5f5f5` | UI モックのヘッダ |
| gray-fill-empty-screen | `#f2f2f2` | 端末アイコンの擬似画面 |
| gray-label-band | `#eaeaea` | A/C セクションの見出し帯 |
| tri-green-fill | `#f0f0f0` | トリアージ「軽症」 |
| tri-yellow-pattern | `rgba(0,0,0,.18)` @ 45° 3-4pt 疎らな斜線 | 「中等症」 |
| tri-red-pattern | `rgba(0,0,0,.35)` @ 45° 1.5-3pt 濃い斜線 | 「重症」 |
| ecect-bg | `#ececec` | 画面プレビュー時の紙外側背景（印刷時は白） |

### Typography

- 本文フォント：`'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif`
- 等幅：ブラウザ標準の monospace
- **サイズスケール**（すべてポイント）：
  - Figure タイトル: 13pt / 700
  - Figure 番号: 12pt / 700
  - セクション見出し: 9.5–11pt / 700
  - 本文: 8–9pt / 400
  - キャプション: 9.5pt / justify + `text-justify: inter-ideograph`
  - 注釈（cap-note）: 8.5pt / 破線上罫
  - ジャーナル名（ヘッダ）: 9pt / 500

### Spacing

- ページ余白：左右 15mm / 上 12mm / 下 10mm
- 描画エリア内 padding：Figure 1 = 8mm 10mm、Figure 2 = 6mm 8mm、Figure 3 = 6mm 8mm
- セクション間 gap：4–5mm
- カード内 padding：5–8px 8–14px

### Border

- 標準罫線：0.4–0.6pt solid #000
- 破線罫線：0.6pt dashed（認証層など「非確定」を示す）
- 点線罫線：0.5pt dotted（監査ログなど「副次的な流れ」）
- 強調枠（DB、起点端末）：1.2pt solid
- Border radius: **0**（角丸なし。論文図の慣習を優先）

### Shadow

- **なし**。印刷を意識しシャドウは一切使わない。画面プレビュー時のみ `.figure-page` に `box-shadow: 0 4px 20px rgba(0,0,0,.12)` を付与し、`@media print` で解除。

### 印刷設定（重要）

`@page { size: A4 landscape; margin: 15mm 15mm 15mm 15mm; }` を宣言。ブラウザから Cmd/Ctrl+P → 「用紙 A4 横 / 余白 デフォルト / 背景グラフィックを印刷しない」で書き出しできる。

## Assets

- **外部フォント**：Google Fonts `Noto Sans JP` (weights 400/500/700)。CDN 経由。オフライン運用時は同フォントを `.woff2` で同梱推奨。
- **画像**：一切使用せず。すべて CSS シェイプ + SVG インラインで描画。
- **アイコン**：使用せず。凡例内の線種サンプルのみ SVG インライン `<line>` + `<polygon>` で描画。
- **絵文字**：使用せず。

## Files

このハンドオフに含まれるファイル：

- `_共通スタイル.css` — 3枚の Figure すべてが `<link rel="stylesheet">` で参照する共通スタイル。ページ設定（A4 横）、フォント、ヘッダ／キャプション、`.node` `.legend` `.pat-*` などの共通コンポーネント、印刷用 `@media print` を含む。
- `Figure 1 システム構成図.html` — Figure 1 本体（自己完結、共通CSSを参照）
- `Figure 2 データフロー図.html` — Figure 2 本体
- `Figure 3 運用フローと画面.html` — Figure 3 本体
- `Figures 一覧.html` — 3枚を iframe で並べて確認するインデックスページ（レビュー用）

### 対象システムの参照ソース

本 Figure が説明しているアプリの実装：
- リポジトリ：[github.com/Liptonist/monsterBash_bedControl](https://github.com/Liptonist/monsterBash_bedControl)
- 主要ファイル：`index.html`（メイン画面）、`app-common.js`（認証・共通処理）、`database.rules.json`（セキュリティルール）

### 移植時の注意

- **絶対配置は最小限に**：v1 版では絶対配置で組んだが、DB の可変高さで下段カードが被る問題が発生した。v2 では **flexbox の自然な縦積み** に組み直してある。移植先でも同様の方針を推奨。
- **矢印の実装**：SVG ではなく CSS の border + 三角ボーダー疑似要素で描画している。React で書き直す場合は同じテクニックが使えるが、SVG に置き換えても構わない。ただし線種（実線/破線/点線）と線幅の使い分けは論文図の可読性上、必ず維持すること。
- **フォントサイズは pt 単位で厳守**：本文 8pt を下回ると Journal of JAAM の要求最小サイズを割り込む可能性がある。
- **モノクロ厳守**：カラーで見栄えを補強したくなるが、JAAM 誌はモノクロ印刷される可能性があるため、色情報だけに意味を担わせないこと（現状は線種・パターン・強度の3軸で情報を分けている）。
- **著者名・所属**：ヘッダ右上の「著者名・所属（投稿時記載）」は投稿時に実名に置換すること。

### 論文投稿時の Figure 提出手順（ユーザ操作）

1. `Figures 一覧.html` を開き、各 Figure の「単独で開く」から個別 HTML を開く
2. ブラウザで Cmd/Ctrl+P
3. 用紙：A4 横 / 余白：デフォルト（15mm）/ 背景グラフィックを印刷：OFF
4. 「PDF として保存」で1枚 = 1PDF ファイルとして書き出し
5. Journal of JAAM の投稿システムへアップロード
