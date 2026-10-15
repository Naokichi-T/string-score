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
// 弦楽器の記号（データの stringMarks に名前の並びを入れる。いくつでも付けられる）（ステップ11-1b）
// いつも五線の上（弓の記号のそば）に付く
//   group … 同じ group のものは、1つの音に1つだけ
//           pluck … はじく記号（左手ピチカート・バルトーク・ピチカート）
// ----------------------------------------------------------
export const STRING_MARKS = {
  harmonic: { label: "ハーモニクス", vf: "ah", musicxml: "harmonic", icon: "\uE614" },
  lhpizz: { label: "左手ピチカート", vf: "a+", musicxml: "stopped", icon: "\uE633", group: "pluck" },
  snappizz: { label: "バルトーク・ピチカート", vf: "ao", musicxml: "snap-pizzicato", icon: "\uE631", group: "pluck" },
};

// ----------------------------------------------------------
// ブレス・カエスーラ（データの breath に入れる。1つの音に1つだけ）（ステップ11-1c）
// 音符の右上（次の音との間）に、五線の上の線にかかるように描く
//   breath  … ブレス（'）：弦楽器では、弓を持ち上げて少し切る
//   caesura … カエスーラ（//）：音を一度切って、間をあける
// ----------------------------------------------------------
export const BREATHS = {
  breath: { label: "ブレス（弓を上げる）", musicxml: "breath-mark", icon: "\uE4CE" },
  caesura: { label: "カエスーラ（間をあける）", musicxml: "caesura", icon: "\uE4D1" },
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
//   text    … 楽譜に書く文字
//   group   … 同じ group の奏法は1つの音に1つだけ（例：pizz. を付けると arco は外れる）
//   aliases … MusicXML を読み込むとき、この奏法とみなす書き方（ステップ11-2）
//             （小文字にして「.」を取りのぞいてから比べるので、ここも「.」なしで書く）
//   string  … 弦の指定のときだけ：どの弦か（楽器にない弦のボタンは押せない）
// （ステップ11-2：pizz.・arco のほかに、弾く場所・弱音器・ビブラート・スピッカート・弦の指定を追加）
// ----------------------------------------------------------
export const TECHNIQUES = {
  // はじく・弓で弾く
  "pizz.": { label: "ピチカート（はじく）", text: "pizz.", musicxml: "pizz.", group: "pluck", aliases: ["pizz", "pizzicato"] },
  arco: { label: "アルコ（弓で弾く）", text: "arco", musicxml: "arco", group: "pluck", aliases: ["arco"] },
  // 弾く場所・音色
  "sul pont.": { label: "スル・ポンティチェロ（駒の近くで弾く）", text: "sul pont.", musicxml: "sul pont.", group: "place", aliases: ["sul pont", "sul ponticello", "sp", "pont"] },
  "sul tasto": { label: "スル・タスト（指板の上で弾く）", text: "sul tasto", musicxml: "sul tasto", group: "place", aliases: ["sul tasto", "st", "tasto"] },
  "flaut.": { label: "フラウタンド（軽く、笛のような音で）", text: "flaut.", musicxml: "flaut.", group: "place", aliases: ["flaut", "flautando"] },
  "col legno": { label: "コル・レーニョ（弓の木の部分で弾く）", text: "col legno", musicxml: "col legno", group: "place", aliases: ["col legno", "col legno battuto", "col legno tratto"] },
  "ord.": { label: "オルディナリオ（ふつうの弾き方に戻す）", text: "ord.", musicxml: "ord.", group: "place", aliases: ["ord", "ordinario", "nat", "naturale", "normale"] },
  // 弱音器
  "con sord.": { label: "コン・ソルディーノ（弱音器を付ける）", text: "con sord.", musicxml: "con sord.", group: "mute", aliases: ["con sord", "con sordino", "con sordini", "mit dämpfer"] },
  "senza sord.": {
    label: "センツァ・ソルディーノ（弱音器を外す）",
    text: "senza sord.",
    musicxml: "senza sord.",
    group: "mute",
    aliases: ["senza sord", "senza sordino", "senza sordini", "via sord", "via sordini", "ohne dämpfer"],
  },
  // ビブラート
  "vib.": { label: "ビブラートあり", text: "vib.", musicxml: "vib.", group: "vibrato", aliases: ["vib", "vibrato", "molto vib"] },
  "non vib.": { label: "ノン・ビブラート（ビブラートなし）", text: "non vib.", musicxml: "non vib.", group: "vibrato", aliases: ["non vib", "non vibrato", "senza vib", "senza vibrato", "nv"] },
  // スピッカート
  "spicc.": { label: "スピッカート（弓を弾ませる）", text: "spicc.", musicxml: "spicc.", group: "spiccato", aliases: ["spicc", "spiccato"] },
  // 弦の指定
  "sul C": { label: "C線で弾く", text: "sul C", musicxml: "sul C", group: "string", string: "C", aliases: ["sul c"] },
  "sul G": { label: "G線で弾く", text: "sul G", musicxml: "sul G", group: "string", string: "G", aliases: ["sul g"] },
  "sul D": { label: "D線で弾く", text: "sul D", musicxml: "sul D", group: "string", string: "D", aliases: ["sul d"] },
  "sul A": { label: "A線で弾く", text: "sul A", musicxml: "sul A", group: "string", string: "A", aliases: ["sul a"] },
  "sul E": { label: "E線で弾く", text: "sul E", musicxml: "sul E", group: "string", string: "E", aliases: ["sul e"] },
};

// ----------------------------------------------------------
// 奏法の組（「奏法」タブで、この順番に組ごとに並べる）（ステップ11-2）
//   id    … TECHNIQUES の group と同じ名前
//   label … 組の名前（ボタンの組にマウスを乗せたときに出す）
// ----------------------------------------------------------
export const TECHNIQUE_GROUPS = [
  { id: "pluck", label: "はじく・弓で弾く" },
  { id: "place", label: "弾く場所・音色" },
  { id: "mute", label: "弱音器" },
  { id: "vibrato", label: "ビブラート" },
  { id: "spiccato", label: "スピッカート" },
  { id: "string", label: "弦の指定" },
];

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
