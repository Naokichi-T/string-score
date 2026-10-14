// ==========================================================
// symbols.js
// 楽譜に付ける記号の一覧表
// 新しい記号を足すときは、まずこの表に1行足す
//   label    … 画面に出す日本語の名前（入力ボタンなどで使う）
//   vf       … VexFlow での書き方
//   musicxml … MusicXML での名前（書き出し・読み込みで使う）
// ==========================================================

// ----------------------------------------------------------
// 弓の記号（データの bowing に入れる）
// ----------------------------------------------------------
export const BOWINGS = {
  down: { label: "ダウンボウ", vf: "am", musicxml: "down-bow" },
  up: { label: "アップボウ", vf: "a|", musicxml: "up-bow" },
};

// ----------------------------------------------------------
// アーティキュレーション（データの articulations に入れる。いくつでも付けられる）
// 音符の玉の近く（符尾と反対側）に付く
// ----------------------------------------------------------
export const ARTICULATIONS = {
  staccato: { label: "スタッカート", vf: "a.", musicxml: "staccato" },
  tenuto: { label: "テヌート", vf: "a-", musicxml: "tenuto" },
  accent: { label: "アクセント", vf: "a>", musicxml: "accent" },
};

// ----------------------------------------------------------
// フェルマータ（データの fermata に true を入れる）
// ----------------------------------------------------------
export const FERMATA = { label: "フェルマータ", vf: "a@a", musicxml: "fermata" };

// ----------------------------------------------------------
// 指番号（データの fingering に数字を入れる）
// ----------------------------------------------------------
export const FINGERINGS = [0, 1, 2, 3, 4];

// ----------------------------------------------------------
// 奏法の文字（データの technique に入れる）
//   text … 楽譜に書く文字
// ----------------------------------------------------------
export const TECHNIQUES = {
  "pizz.": { label: "ピチカート", text: "pizz.", musicxml: "pizz." },
  arco: { label: "アルコ", text: "arco", musicxml: "arco" },
};

// ----------------------------------------------------------
// 強弱（データの dynamic に入れる）
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
