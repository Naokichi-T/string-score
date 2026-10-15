// ==========================================================
// symbols.js
// 楽譜に付ける記号の一覧表
// 新しい記号を足すときは、まずこの表に1行足す
//   label    … 画面に出す日本語の名前（入力ボタンなどで使う）
//   vf       … VexFlow での書き方
//   musicxml … MusicXML での名前（書き出し・読み込みで使う）
//   icon     … ボタンに出す記号（楽譜用フォント Bravura の文字）
// ==========================================================

// ----------------------------------------------------------
// 弓の記号（データの bowing に入れる。1つの音に1つだけ）
// ----------------------------------------------------------
export const BOWINGS = {
  down: { label: "ダウンボウ", vf: "am", musicxml: "down-bow", icon: "\uE610" },
  up: { label: "アップボウ", vf: "a|", musicxml: "up-bow", icon: "\uE612" },
};

// ----------------------------------------------------------
// アーティキュレーション（データの articulations に入れる。いくつでも付けられる）
// 音符の玉の近く（符尾と反対側）に付く
//   group … 同じ group のものは、1つの音に1つだけ（ステップ11-1a）
//           short  … 短く切る記号（スタッカート・スタッカーティシモ）
//           strong … 強くする記号（アクセント・マルカート）
//           テヌートは group なし（スタッカートと一緒に付けられる）
// ----------------------------------------------------------
export const ARTICULATIONS = {
  staccato: { label: "スタッカート", vf: "a.", musicxml: "staccato", icon: "\uE4A2", group: "short" },
  staccatissimo: { label: "スタッカーティシモ", vf: "av", musicxml: "staccatissimo", icon: "\uE4A6", group: "short" },
  tenuto: { label: "テヌート", vf: "a-", musicxml: "tenuto", icon: "\uE4A4" },
  accent: { label: "アクセント", vf: "a>", musicxml: "accent", icon: "\uE4A0", group: "strong" },
  marcato: { label: "マルカート", vf: "a^", musicxml: "strong-accent", icon: "\uE4AC", group: "strong" },
};

// ----------------------------------------------------------
// フェルマータ（データの fermata に true を入れる）
// ----------------------------------------------------------
export const FERMATA = { label: "フェルマータ", vf: "a@a", musicxml: "fermata", icon: "\uE4C0" };

// ----------------------------------------------------------
// 指番号（データの fingerings に数字の並びを入れる。いくつでも付けられる）
// 例：fingerings: [1, 2] → 下から「1」「2」と積み重ねて表示
// ----------------------------------------------------------
export const FINGERINGS = [0, 1, 2, 3, 4];

// ----------------------------------------------------------
// 奏法の文字（データの techniques に名前の並びを入れる。いくつでも付けられる）
//   text  … 楽譜に書く文字
//   group … 同じ group の奏法は反対の意味なので、1つの音に1つだけ
//           （例：pizz. を付けると arco は外れる）
// ----------------------------------------------------------
export const TECHNIQUES = {
  "pizz.": { label: "ピチカート", text: "pizz.", musicxml: "pizz.", group: "pluck" },
  arco: { label: "アルコ", text: "arco", musicxml: "arco", group: "pluck" },
};

// ----------------------------------------------------------
// 強弱（データの dynamic に入れる。1つの音に1つだけ）
//   glyph … 楽譜用フォント（Bravura）で強弱記号を描くための文字
//           （Bravura では、強弱記号の p・m・f・s・z が専用の形で入っている）
// ----------------------------------------------------------
const P = "\uE520"; // 強弱記号の p
const M = "\uE521"; // 強弱記号の m
const F = "\uE522"; // 強弱記号の f
const S = "\uE524"; // 強弱記号の s

export const DYNAMICS = {
  pp: { label: "ピアニッシモ", glyph: P + P, musicxml: "pp" },
  p: { label: "ピアノ", glyph: P, musicxml: "p" },
  mp: { label: "メゾピアノ", glyph: M + P, musicxml: "mp" },
  mf: { label: "メゾフォルテ", glyph: M + F, musicxml: "mf" },
  f: { label: "フォルテ", glyph: F, musicxml: "f" },
  ff: { label: "フォルティッシモ", glyph: F + F, musicxml: "ff" },
  sf: { label: "スフォルツァンド", glyph: S + F, musicxml: "sf" },
  fp: { label: "フォルテピアノ", glyph: F + P, musicxml: "fp" },
};
