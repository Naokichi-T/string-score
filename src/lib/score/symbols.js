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
// 装飾（データの ornament に入れる。1つの音に1つだけ）（ステップ11-3a）
//   trill   … トリル（tr）：1つ上の音とすばやく行き来する
//             次の音にタイでつながっているときは、tr の右に波線をのばす
//   prall   … プラルトリラー（短いギザギザ）：主の音 → 上の音 → 主の音（ステップ11-3b）
//   mordent … モルデント（ギザギザに縦線）：主の音 → 下の音 → 主の音（ステップ11-3b）
//   turn    … ターン（∽）：上の音 → 主の音 → 下の音 → 主の音（ステップ11-3b）
// （VexFlow と MusicXML では、名前の付け方が逆になっている所があるので注意
//   ・VexFlow の "mordent" は縦線なし（＝プラルトリラー）、"mordentInverted" は縦線あり（＝モルデント）
//   ・MusicXML の "inverted-mordent" がプラルトリラー、"mordent" がモルデント）
// ----------------------------------------------------------
export const ORNAMENTS = {
  trill: { label: "トリル", vf: "tr", musicxml: "trill-mark", icon: "\uE566" },
  prall: { label: "プラルトリラー（上の音へ1回）", vf: "mordent", musicxml: "inverted-mordent", icon: "\uE56C" },
  mordent: { label: "モルデント（下の音へ1回）", vf: "mordentInverted", musicxml: "mordent", icon: "\uE56D" },
  turn: { label: "ターン", vf: "turn", musicxml: "turn", icon: "\uE567" },
};

// ----------------------------------------------------------
// トレモロ（データの tremolo に斜線の本数 1〜3 を入れる）（ステップ11-4）
// 符尾に斜線を引いて、同じ音を細かく刻む
// トリルなどの装飾とは、1つの音にどちらか1つだけ
//   count … 斜線の本数
//   icon  … ボタンに出す記号（楽譜用フォント Bravura の文字）
// ----------------------------------------------------------
export const TREMOLOS = [
  { count: 1, label: "トレモロ（斜線1本）", icon: "\uE220" },
  { count: 2, label: "トレモロ（斜線2本）", icon: "\uE221" },
  { count: 3, label: "トレモロ（斜線3本）", icon: "\uE222" },
];

// ----------------------------------------------------------
// 2音トレモロ（2つの音を行き来するトレモロ）（ステップ14-6a）
// 2音の重音に付けると、下の音と上の音を交互にすばやく弾く形になる
// データ：音符に alternate: true を付ける。連桁の本数は、トレモロと同じ tremolo（1〜3）に入れる
//   ・付けたときにトレモロの本数がなければ、DEFAULT_COUNT 本にする
//   ・本数は、トレモロの斜線1〜3本のボタンで変えられる（今の本数のボタンを押すと、ふつうの重音に戻る）
// （ボタンの絵は SymbolTools.svelte の中の SVG で描く）
// ----------------------------------------------------------
export const ALTERNATE_TREMOLO = {
  label: "2音トレモロ：2音の重音を、下の音と上の音で交互にすばやく弾く形にする（全・2分・4分音符）。本数はトレモロの斜線のボタンで変える",
  musicxml: "tremolo",
  defaultCount: 3,
};

// ----------------------------------------------------------
// フェルマータ（データの fermata に true を入れる）
// ----------------------------------------------------------
export const FERMATA = { label: "フェルマータ", vf: "a@a", musicxml: "fermata", icon: "\uE4C0" };

// ----------------------------------------------------------
// グリッサンド（データの glissando に true を入れる）（ステップ11-5a）
// その音から「次の音」まで、高さをすべらせて移る
// 楽譜では、2つの音の玉を線でつなぎ、線の上に「gliss.」と書く
//   label    … ボタンの説明
//   text     … 線の上に書く文字（ボタンにも出す）
//   musicxml … MusicXML での名前
// ----------------------------------------------------------
export const GLISSANDO = { label: "グリッサンド（次の音まですべらせる）", text: "gliss.", musicxml: "glissando" };

// ----------------------------------------------------------
// ハーモニクスのひし形の玉（ステップ14-5a）
// 軽く触れる音は、ひし形の玉で書く。データでは、その高さに diamond: true を付ける
//   ・人工ハーモニクス … しっかり押さえる音（ふつうの玉）＋ 軽く触れる音（ひし形の玉）の2つを重ねる
//   ・自然ハーモニクス … 開放弦（ふつうの玉）＋ 触れる位置（ひし形の玉）。開放弦の玉を省いて、ひし形だけのこともある
// 実際に聞こえる音は、下の音とひし形の間の音程で決まる（HARMONIC_SOUNDS）
//   ARTIFICIAL_HARMONIC … ［人工ハーモニクス］のボタン（1音の音符の4度上に、ひし形を足す）
//   DIAMOND_HEAD        … ［ひし形］のボタン（選んでいる玉を、ひし形にする・戻す）
//   musicxml … MusicXML での名前（<technical> の中の <harmonic>）
// ----------------------------------------------------------
export const ARTIFICIAL_HARMONIC = {
  label: "人工ハーモニクス：押さえた音の4度上に、軽く触れる音（ひし形）を足す。2オクターブ上の音が出る。ひし形のある音符で押すと、ひし形を外す",
  musicxml: "harmonic",
};
export const DIAMOND_HEAD = { label: "ひし形：選んでいる玉を、ハーモニクスで軽く触れる音（ひし形の玉）にする・戻す。重音のときは、先に玉をクリックして選ぶ" };

// ----------------------------------------------------------
// 下の音からひし形までの半音の数 → 下の音から聞こえる音までの半音の数（ステップ14-5a）
// 弦の「どこに触れるか」で、聞こえる音が決まる（弦の長さを等分した所に触れると、その数倍の高さの音が出る）
//   1/2 の所（1オクターブ上）                 → 1オクターブ上が聞こえる
//   1/3 の所（5度上・1オクターブと5度上）      → 1オクターブと5度上
//   1/4 の所（4度上・2オクターブ上）           → 2オクターブ上
//   1/5 の所（長3度上・長6度上など）          → 2オクターブと長3度上
//   1/6 の所（短3度上など）                   → 2オクターブと5度上
// 表にない音程は、ハーモニクスとしては鳴らない（書いた高さをそのまま鳴らす）
// ----------------------------------------------------------
export const HARMONIC_SOUNDS = { 12: 12, 7: 19, 19: 19, 5: 24, 24: 24, 4: 28, 9: 28, 16: 28, 28: 28, 3: 31, 31: 31 };

// ----------------------------------------------------------
// アルペジオ（データの arpeggio に true を入れる。重音だけに付けられる）（ステップ14-4a）
// 重音の左に縦の波線を描き、下の音から順にすばやく弾く
//   label    … ボタンの説明
//   musicxml … MusicXML での名前
// （ボタンの記号は、楽譜用フォントの文字だとブラウザによってボタンからはみ出すので、SymbolTools.svelte で波線を描いている）
// ----------------------------------------------------------
export const ARPEGGIO = { label: "アルペジオ（重音を、下の音から順にすばやく弾く）", musicxml: "arpeggiate" };

// ----------------------------------------------------------
// 前打音（データの grace に { type, pitch } を入れる。1つの音に1つだけ）（ステップ11-8a）
//   type  … "short"（短前打音）・"long"（長前打音）
//   pitch … 前打音の高さ（主音と同じ形 { step, alter, octave }）
//   glyph … ボタンに出す楽譜用フォント（Bravura）の文字
//   slash … 小さな音符に斜線を付けるか（MusicXML の <grace slash="yes"> にも使う）
// ----------------------------------------------------------
export const GRACES = {
  short: { label: "短前打音（斜線のある小さな音符。主音の頭でごく短く鳴らす）", glyph: "\uE560", slash: true },
  long: { label: "長前打音（斜線のない小さな音符。主音の長さの半分を使って鳴らす）", glyph: "\uE562", slash: false },
};

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
