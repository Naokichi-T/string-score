// ==========================================================
// model.js
// 楽譜データの「形」の説明と、表示・計算に使う表をまとめたファイル
// ==========================================================
//
// 【楽譜データの形】
// score = {
//   title: 'タイトル',
//   composer: '作曲者',
//   tempoText: 'Allegro',            // 速度記号（なければ空の文字）
//   tempo: 80,                       // ♩＝80
//   measures: [                      // 楽譜全体の小節の情報（全パート共通）
//     { time: { beats: 4, beatType: 4 }, key: 0 }, // 拍子・調が変わる小節だけ書く
//     {}                                           // 変更なしの小節は空
//     // 1小節目がアウフタクト（短い小節）なら、1小節目に pickup（拍の数）を書く（ステップ15-1）
//     // 例：{ time: { beats: 4, beatType: 4 }, key: 0, pickup: 1 } … 4分音符1つ分のアウフタクト
//   ],
//   parts: [                         // パート（楽器）ごとの情報
//     {
//       name: 'Violin',              // パート名
//       instrument: 'violin',        // 楽器
//       measures: [                  // このパートの小節（楽譜全体の小節と同じ数）
//         {
//           clef: 'treble',          // 音部記号が変わる小節だけ書く
//           notes: [                 // 音符・休符の並び
//             { pitch: { step: 'C', alter: 0, octave: 4 }, duration: 'quarter', dots: 0, tie: false },
//             { rest: true, duration: 'quarter', dots: 0 },
//             // 連符の中の音には tuplet を付ける（ステップ10-2）
//             // 例：8分音符の3連符 = 「8分音符2つ分の長さに、8分音符を3つ入れる」
//             { pitch: { step: 'D', alter: 0, octave: 4 }, duration: 'eighth', dots: 0, tie: false, tuplet: { actual: 3, normal: 2 } },
//             // 重音（1つの音符に高さが2つ以上）には chord を付ける（ステップ14-1）
//             //   pitch … いちばん低い音
//             //   chord … その上に重ねる音（低い順）
//             { pitch: { step: 'A', alter: 0, octave: 4 }, chord: [{ step: 'E', alter: 0, octave: 5 }], duration: 'quarter', dots: 0, tie: false },
//             // ハーモニクスで軽く触れる玉（ひし形の玉）は、その高さに diamond: true を付ける（ステップ14-5a）
//             // 例：人工ハーモニクス（ラ4を押さえて、4度上のレ5に軽く触れる）
//             { pitch: { step: 'A', alter: 0, octave: 4 }, chord: [{ step: 'D', alter: 0, octave: 5, diamond: true }], duration: 'quarter', dots: 0, tie: false },
//             // 2つの音を行き来するトレモロ（2音トレモロ）は、2音の重音に alternate: true と tremolo（連桁の本数）を付ける（ステップ14-6a）
//             // 例：2分音符の長さの間、ド5とミ5を32分音符の細かさで交互に弾く（下の音から）
//             { pitch: { step: 'C', alter: 0, octave: 5 }, chord: [{ step: 'E', alter: 0, octave: 5 }], duration: 'half', dots: 0, tie: false, tremolo: 3, alternate: true },
//             // 松葉（＜ ＞）は3つの項目で書く（ステップ16-1。前は wedge に "stop"（終わり）も入れていた）
//             //   wedge       … ここから松葉が始まる（"crescendo"（＜）か "diminuendo"（＞））
//             //   wedgeEnd    … 前から続いてきた松葉が、ここで終わる（true）
//             //   wedgeInside … この音符の下だけの松葉（"crescendo" か "diminuendo"。1つの音符に1つだけ）
//             // 例：ファで ＜ が終わって、ファから ＞ が始まる → ファに wedgeEnd: true と wedge: "diminuendo"
//             { pitch: { step: 'F', alter: 0, octave: 4 }, duration: 'quarter', dots: 0, tie: false, wedgeEnd: true, wedge: 'diminuendo' }
//           ]
//         }
//       ]
//     }
//   ]
// }
//
// 音の高さ（step・alter・octave）と長さの名前（quarter など）は
// MusicXML と同じ書き方にしている
// ==========================================================

// ----------------------------------------------------------
// 音の長さの表
//   キー（quarter など）… データで使う名前（MusicXML と同じ）
//   vf                  … VexFlow で使う書き方
//   quarters            … 4分音符を 1 としたときの長さ
// ----------------------------------------------------------
export const DURATIONS = {
  whole: { vf: "w", quarters: 4 }, // 全音符
  half: { vf: "h", quarters: 2 }, // 2分音符
  quarter: { vf: "q", quarters: 1 }, // 4分音符
  eighth: { vf: "8", quarters: 0.5 }, // 8分音符
  "16th": { vf: "16", quarters: 0.25 }, // 16分音符
  "32nd": { vf: "32", quarters: 0.125 }, // 32分音符（ステップ15-5：MusicXML の読み込み・表示・再生・書き出しだけ。長さのボタンはない）
};

// ----------------------------------------------------------
// 音部記号の表
//   vf      … VexFlow で使う名前
//   restKey … 休符を置く高さ（五線のまん中の線＝第3線にあたる音）
//   measureRestKey … 小節まるごとの休符（全休符）を置く高さ（第4線にあたる音。全休符は第4線からぶら下げる）（ステップ13-3）
// ----------------------------------------------------------
export const CLEFS = {
  treble: { vf: "treble", restKey: "b/4", measureRestKey: "d/5" }, // ト音記号
  alto: { vf: "alto", restKey: "c/4", measureRestKey: "e/4" }, // アルト記号（ハ音記号・第3線）
  tenor: { vf: "tenor", restKey: "a/3", measureRestKey: "c/4" }, // テノール記号（ハ音記号・第4線）
  bass: { vf: "bass", restKey: "d/3", measureRestKey: "f/3" }, // ヘ音記号
};

// ----------------------------------------------------------
// 調の一覧（選ぶ欄に出す順番）
//   key  … データで使う数字（♯の数がプラス、♭の数がマイナス）
//   name … 選ぶ欄に出す名前（長調と短調は調号が同じなので、両方書く）
// （ステップ17-1：「小節」タブの調の変更と「楽譜の設定」タブの移調の両方で使うので、MeasureTools.svelte から移した）
// ----------------------------------------------------------
export const KEY_CHOICES = [
  { key: 0, name: "なし（ハ長調・イ短調）" },
  { key: 1, name: "♯1つ（ト長調・ホ短調）" },
  { key: 2, name: "♯2つ（ニ長調・ロ短調）" },
  { key: 3, name: "♯3つ（イ長調・嬰ヘ短調）" },
  { key: 4, name: "♯4つ（ホ長調・嬰ハ短調）" },
  { key: 5, name: "♯5つ（ロ長調・嬰ト短調）" },
  { key: 6, name: "♯6つ（嬰ヘ長調・嬰ニ短調）" },
  { key: 7, name: "♯7つ（嬰ハ長調・嬰イ短調）" },
  { key: -1, name: "♭1つ（ヘ長調・ニ短調）" },
  { key: -2, name: "♭2つ（変ロ長調・ト短調）" },
  { key: -3, name: "♭3つ（変ホ長調・ハ短調）" },
  { key: -4, name: "♭4つ（変イ長調・ヘ短調）" },
  { key: -5, name: "♭5つ（変ニ長調・変ロ短調）" },
  { key: -6, name: "♭6つ（変ト長調・変ホ短調）" },
  { key: -7, name: "♭7つ（変ハ長調・変イ短調）" },
];

// ----------------------------------------------------------
// 楽器ごとの最初の音部記号
// ----------------------------------------------------------
//   keyboardOctave … 鍵盤の一番左のドのオクターブ（そのパートを選んだとき、ここから3オクターブ分を出す）
//   name           … パート名（同じ楽器が2つ以上あるときは、うしろに I・II… を付ける）
//   abbreviation   … 2段目からの短いパート名
//   label          … ボタンに出す日本語の名前
// （ステップ5-6：name・abbreviation・label を追加）
export const INSTRUMENTS = {
  // strings … 弦の名前（低い弦から順に）（「奏法」タブの弦の指定で使う）（ステップ11-2）
  // openOctaves … 弦の開放弦のオクターブ（strings と同じ順番）（ハーモニクスで聞こえる音を計算するのに使う）（ステップ14-5a）
  //               例：バイオリンの G 線の開放弦はソ3（G3）
  violin: { clef: "treble", keyboardOctave: 4, name: "Violin", abbreviation: "Vln.", label: "バイオリン", strings: ["G", "D", "A", "E"], openOctaves: [3, 4, 4, 5] }, // バイオリン（ド4〜ド7）
  viola: { clef: "alto", keyboardOctave: 3, name: "Viola", abbreviation: "Vla.", label: "ビオラ", strings: ["C", "G", "D", "A"], openOctaves: [3, 3, 4, 4] }, // ビオラ（ド3〜ド6）
  cello: { clef: "bass", keyboardOctave: 2, name: "Cello", abbreviation: "Vc.", label: "チェロ", strings: ["C", "G", "D", "A"], openOctaves: [2, 2, 3, 3] }, // チェロ（ド2〜ド5）
  // コントラバス（ステップ18-3a）
  //   楽譜には、鳴る高さより1オクターブ上に書く（ふつうのコントラバスの楽譜と同じ）
  //   データも「書いた高さ」で持つので、弦の開放弦（openOctaves）も書いた高さで入れる
  //   例：いちばん低い E 線は、鳴る高さはミ1（E1）、楽譜に書く高さはミ2（E2）
  //   soundOctaves … 鳴る高さが、書いた高さから何オクターブずれるか（−1 ＝ 1オクターブ下で鳴る）
  //                  （再生（ステップ18-3b）と MusicXML（ステップ18-3c）で使う。ほかの楽器は書いていない ＝ 0）
  contrabass: { clef: "bass", keyboardOctave: 2, name: "Contrabass", abbreviation: "Cb.", label: "コントラバス", strings: ["E", "A", "D", "G"], openOctaves: [2, 2, 3, 3], soundOctaves: -1 }, // コントラバス（書いた高さでド2〜ド5）
};

// ----------------------------------------------------------
// 関数：durationToQuarters
// 音の長さ（名前＋付点の数）を「4分音符いくつ分か」に変換する
// 例：('quarter', 1) → 1.5（付点4分音符）
// ----------------------------------------------------------
export function durationToQuarters(duration, dots = 0) {
  // 付点なしの長さ
  const base = DURATIONS[duration].quarters;
  // 付点1つごとに、直前に足した長さの半分を足していく
  let total = base;
  let add = base;
  for (let i = 0; i < dots; i++) {
    add = add / 2;
    total = total + add;
  }
  return total;
}

// ----------------------------------------------------------
// 関数：pitchToVexKey
// データの音の高さを VexFlow の書き方に変換する
// 例：{ step: 'C', alter: 0, octave: 4 } → 'c/4'
//     { step: 'F', alter: 1, octave: 4 } → 'f#/4'
// （♯♭の記号を表示するかどうかは、ステップ2-2で別に決める）
// ----------------------------------------------------------
export function pitchToVexKey(pitch) {
  // alter の数字を記号に変換する表
  const alterText = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" };
  const step = pitch.step.toLowerCase();
  const acc = alterText[String(pitch.alter ?? 0)];
  return `${step}${acc}/${pitch.octave}`;
}

// ==========================================================
// ここから下は、重音の関数（ステップ14-1）
// 【重音のデータの決まり】
//   ・pitch にはいちばん低い音、chord にはその上に重ねる音を低い順に入れる
//   ・chord は、重ねる音がないときは付けない（ふつうの音符と同じ形）
//   ・同じ高さ（鍵盤で同じ所）の音は2つ入れない
//   ・1つの重音は MAX_CHORD_NOTES 音まで
//   ・ひし形の玉（ハーモニクスで軽く触れる音）の高さには diamond: true を付ける（ステップ14-5a）
// ==========================================================

// 1つの重音に入れられる音の数（弦楽器の弦は4本なので、同時に弾けるのは4音まで）
export const MAX_CHORD_NOTES = 4;

// ドからの半音の数（高さをくらべるのに使う）
const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 音名の並び（同じ高さで書き方が違う音を並べるときの順番に使う）
const STEP_ORDER = ["C", "D", "E", "F", "G", "A", "B"];

// ----------------------------------------------------------
// 関数：pitchNumber
// 音の高さを、くらべられる1つの数にする（MIDI の番号と同じ。ド4 = 60。半音上がるごとに 1 増える）
// 例：{ step: 'A', alter: 0, octave: 4 } → 69
// ----------------------------------------------------------
export function pitchNumber(pitch) {
  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
}

// ----------------------------------------------------------
// 関数：samePitch
// 2つの音が鍵盤で同じ所の高さか調べる（ミ♯ と ファ のように書き方が違っても、同じ高さなら true）
// ----------------------------------------------------------
export function samePitch(a, b) {
  return pitchNumber(a) === pitchNumber(b);
}

// ----------------------------------------------------------
// 関数：notePitches
// 音符の高さを、低い順の配列にして返す（重音でなければ、高さ1つだけの配列）
//   note … 音符・休符のデータ
// 戻り値：[{ step, alter, octave }, ...]（休符なら空の配列）
// 例：ラ4とミ5の重音 → [ラ4, ミ5]、ふつうのド5 → [ド5]
// ----------------------------------------------------------
export function notePitches(note) {
  if (!note || note.rest) return [];
  return [note.pitch, ...(note.chord ?? [])];
}

// ----------------------------------------------------------
// 関数：hasDiamond
// 音符に、ひし形の玉（ハーモニクスで軽く触れる音）があるか調べる（ステップ14-5a）
// ----------------------------------------------------------
export function hasDiamond(note) {
  return notePitches(note).some((pitch) => pitch.diamond);
}

// 2音トレモロにできる長さ（全・2分・4分音符。付点も可）（ステップ14-6a）
// （8分音符より短いと、連桁の1本目を符尾につなぐ別の書き方になるので、このアプリでは使わない）
export const ALTERNATE_DURATIONS = ["whole", "half", "quarter"];

// ----------------------------------------------------------
// 関数：canAlternate
// 音符を、2つの音を行き来するトレモロ（2音トレモロ）にできるか調べる（ステップ14-6a）
// できるのは、次のことが全部そろっているとき
//   ・2音の重音（下の音と上の音を行き来する）
//   ・長さが全・2分・4分音符（付点も可）
//   ・連符の中の音ではない
//   ・ひし形の玉（ハーモニクス）がない
//   note … 音符のデータ
// 戻り値：true / false
// ----------------------------------------------------------
export function canAlternate(note) {
  if (!note || note.rest) return false;
  if (!note.chord || note.chord.length !== 1) return false;
  if (!ALTERNATE_DURATIONS.includes(note.duration)) return false;
  if (note.tuplet) return false;
  if (hasDiamond(note)) return false;
  return true;
}

// ----------------------------------------------------------
// 関数：isAlternate
// 音符が、2つの音を行き来するトレモロ（2音トレモロ）として扱えるか調べる（ステップ14-6a）
// 印 alternate と、連桁の本数 tremolo が付いていて、canAlternate の条件もそろっているとき true
// （表示・再生・書き出しは、印ではなくこの関数で決める）
//   note … 音符のデータ
// 戻り値：true / false
// ----------------------------------------------------------
export function isAlternate(note) {
  return !!note && !!note.alternate && !!note.tremolo && canAlternate(note);
}

// ----------------------------------------------------------
// 関数：setNotePitches
// 音符の高さを、決まりどおりに入れ直す（渡された音符のデータを直接書き換える）
//   ・低い順に並べて、いちばん低い音を pitch、残りを chord にする
//   ・残りがなければ chord は付けない
// コピーした楽譜データの中でだけ使う
//   note    … 音符のデータ
//   pitches … 高さの配列（順番はばらばらでもよい。同じ高さが入っていないこと）
//   ひし形の印（diamond）は、その高さに付けたまま並べ直す（ステップ14-5a）
// ----------------------------------------------------------
export function setNotePitches(note, pitches) {
  // 低い順に並べる（同じ高さなら、音名の順）
  const sorted = pitches
    .map((pitch) => ({ step: pitch.step, alter: pitch.alter ?? 0, octave: pitch.octave, ...(pitch.diamond ? { diamond: true } : {}) }))
    .sort((a, b) => pitchNumber(a) - pitchNumber(b) || STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step));
  note.pitch = sorted[0];
  if (sorted.length > 1) {
    note.chord = sorted.slice(1);
  } else {
    delete note.chord;
  }
}

// ==========================================================
// ここから下は、入力・編集のときに使う関数
// 長さは「ティック」という整数で計算する
// （小数で計算すると、0.1 + 0.2 のような誤差が出ることがあるため）
// ==========================================================

// ----------------------------------------------------------
// 16分音符1つを何ティックとするか（ステップ10-1）
// 27720 は、2〜12 のどの数で割っても割り切れる一番小さい数
// こうしておくと、2〜12連符の1つ分の長さも整数になる
//   例：8分音符の3連符の1つ分 = 8分音符2つ分 ÷ 3 = 27720 × 2 × 2 ÷ 3 = 36960
// （前は 16分音符 = 1 だった。楽譜データには長さの名前しか保存していないので、
//   この数を変えても、保存した楽譜には影響しない）
// ----------------------------------------------------------
export const TICKS_PER_16TH = 27720;

// 音の長さ（付点なし）を、ティックで表した表
const DURATION_TICKS = {
  whole: 16 * TICKS_PER_16TH, // 全音符 = 16分音符16個分
  half: 8 * TICKS_PER_16TH, // 2分音符 = 16分音符8個分
  quarter: 4 * TICKS_PER_16TH, // 4分音符 = 16分音符4個分
  eighth: 2 * TICKS_PER_16TH, // 8分音符 = 16分音符2個分
  "16th": 1 * TICKS_PER_16TH, // 16分音符
  "32nd": TICKS_PER_16TH / 2, // 32分音符 = 16分音符の半分（ステップ15-5）
};

// 長さの名前を、長い順に並べたもの（休符で埋めるときの長さの候補・読み込める連符の音の形などに使う）
// （ステップ15-5：32分音符を足した。長さのボタンには INPUT_DURATIONS を使う）
export const DURATION_ORDER = ["whole", "half", "quarter", "eighth", "16th", "32nd"];

// 長さのボタンに並べる長さ（長い順）（ステップ15-5）
// 32分音符は、MusicXML の読み込みで出てくる音のためだけに入れたので、ボタンは作らない
export const INPUT_DURATIONS = ["whole", "half", "quarter", "eighth", "16th"];

// 付点を付けられない長さ（ステップ15-5）
//   16分音符 … 付点16分音符を入力すると、残りを埋めるのに32分音符の休符が要り、ボタンのない長さが増えてしまうため
//              （MusicXML の読み込みで出てくる付点16分音符は、そのまま使える）
//   32分音符 … 付点を付けると、64分音符が要るため
export const NO_DOT_DURATIONS = ["16th", "32nd"];

// ----------------------------------------------------------
// 関数：durationToTicks
// 音の長さ（名前＋付点の数）を、ティックにする
// 例：('quarter', 0) → 4分音符のティック、('quarter', 1) → その 1.5倍（付点4分音符）
// （入力で付点を付けられない長さは NO_DOT_DURATIONS。ここでは付点16分音符の長さも計算できる（読み込みで使う））（ステップ15-5）
// ----------------------------------------------------------
export function durationToTicks(duration, dots = 0) {
  const base = DURATION_TICKS[duration];
  if (dots === 1) return base + base / 2;
  return base;
}

// ----------------------------------------------------------
// 関数：noteTicks
// 音符・休符1つ分のデータの長さを、ティックにする
// 連符の中の音は「normal 個分の長さに actual 個入れる」ので、normal ÷ actual 倍にする（ステップ10-2）
//   例：8分音符の3連符の1つ分 → 8分音符 × 2 ÷ 3
// ----------------------------------------------------------
export function noteTicks(note) {
  const ticks = durationToTicks(note.duration, note.dots ?? 0);
  if (note.tuplet) return (ticks * note.tuplet.normal) / note.tuplet.actual;
  return ticks;
}

// ==========================================================
// ここから下は、連符の関数（ステップ10-2）
// 【連符のデータの決まり】
//   ・連符の中の音（休符も）には、全部に tuplet: { actual, normal } を付ける
//       actual … 連符の数字（3連符なら 3）
//       normal … 何個分の長さに入れるか（3連符なら 2）
//   ・1つの連符の中の音は、全部同じ長さ（付点なし）
//   ・連符の音は小節の中で順に並び、actual 個ずつで1つの連符になる
// ==========================================================

// ----------------------------------------------------------
// 関数：tupletNormal
// 連符の数字から「何個分の長さに入れるか」を決める（ふつうの決まり）
//   2連符 → 3個分（8分の6拍子などで使う）
//   4連符 → 3個分（8分の6拍子などで使う）
//   それ以外 → 連符の数字より小さい、一番大きい 2・4・8 のどれか
//     例：3連符 → 2、5〜7連符 → 4、9〜12連符 → 8
// ----------------------------------------------------------
export function tupletNormal(actual) {
  if (actual === 2 || actual === 4) return 3;
  let normal = 2;
  while (normal * 2 < actual) {
    normal = normal * 2;
  }
  return normal;
}

// ----------------------------------------------------------
// 関数：tupletGroups
// 小節の音の並びから、連符のまとまりを探す
//   notes … 小節の音の並び
// 戻り値：[{ start: 最初の音の番号, end: 最後の音の番号, actual, normal, duration: 1つ分の長さの名前 }, ...]
// tuplet の付いた音が続く所を、actual 個ずつに区切る
// （数字や長さが変わったら、そこから新しい連符にする）
// ----------------------------------------------------------
export function tupletGroups(notes) {
  const groups = [];
  let current = null; // 今まとめている連符
  notes.forEach((note, j) => {
    // 連符でない音：まとめるのをやめる
    if (!note.tuplet) {
      current = null;
      return;
    }
    // 今の連符の続きにできるか（同じ数字・同じ長さで、まだ actual 個そろっていない）
    const canContinue = current && current.actual === note.tuplet.actual && current.normal === note.tuplet.normal && current.duration === note.duration && j - current.start < current.actual;
    if (canContinue) {
      current.end = j;
    } else {
      // 新しい連符を始める
      current = { start: j, end: j, actual: note.tuplet.actual, normal: note.tuplet.normal, duration: note.duration };
      groups.push(current);
    }
  });
  return groups;
}

// ----------------------------------------------------------
// 関数：timeAt
// i 小節目（0 から数える）の拍子を返す
// （拍子は変わる小節にしか書いていないので、前の小節にさかのぼって探す）
// ----------------------------------------------------------
export function timeAt(score, i) {
  for (let k = i; k >= 0; k--) {
    if (score.measures[k].time) return score.measures[k].time;
  }
  return { beats: 4, beatType: 4 }; // 見つからないときは4分の4拍子
}

// ----------------------------------------------------------
// 関数：tempoAt
// i 小節目（0 から数える）のテンポを返す（ステップ11-6a）
// テンポが変わる小節には measures[i].tempo（と、あれば tempoText）が書いてある
// 1小節目のテンポは、楽譜全体の score.tempo・score.tempoText（「楽譜の設定」タブで変えるもの）
// 戻り値：{ tempo: ♩＝○○ の数字, tempoText: 速度記号（なければ空の文字） }
// ----------------------------------------------------------
export function tempoAt(score, i) {
  for (let k = i; k >= 1; k--) {
    const info = score.measures[k];
    if (info.tempo !== undefined) return { tempo: info.tempo, tempoText: info.tempoText ?? "" };
  }
  return { tempo: score.tempo, tempoText: score.tempoText ?? "" };
}

// ----------------------------------------------------------
// 関数：isMeasureRest
// その小節（1つのパートの1小節）が「小節まるごとの休符」かどうかを調べる（ステップ13-3）
// 休符に measureRest: true の印が付いていて、しかも小節の中にその休符1つだけのときに true
// （長さを変えたり、ほかの音が入ったりして1つではなくなったら、印が残っていても、ふつうの休符として扱う）
//   notes … 小節の音の並び（part.measures[i].notes）
// 戻り値：true か false
// ----------------------------------------------------------
export function isMeasureRest(notes) {
  return notes.length === 1 && !!notes[0].rest && !!notes[0].measureRest;
}

// ----------------------------------------------------------
// 関数：rehearsalLabel
// i 小節目の練習番号の文字を返す（ステップ11-7d）
// 練習番号（measures[i].rehearsal）の付いた小節を前から数えて、A, B, C… … Z, AA, BB… と付ける
// （文字はデータに持たず、そのつど数えるので、途中に足したり消したりすると後ろが付け直される）
//   例：3小節目と9小節目に付いていたら、3小節目は "A"、9小節目は "B"
// 戻り値：文字（その小節に練習番号がなければ null）
// ----------------------------------------------------------
export function rehearsalLabel(measures, i) {
  if (!measures[i].rehearsal) return null;
  // この小節までに、練習番号がいくつあるか（この小節も入れる）
  let count = 0;
  for (let k = 0; k <= i; k++) {
    if (measures[k].rehearsal) count = count + 1;
  }
  const n = count - 1; // 0 から数えた番号
  const letter = String.fromCharCode(65 + (n % 26)); // 65 は "A"
  return letter.repeat(Math.floor(n / 26) + 1); // 27個目からは AA, BB…
}

// D.C.・D.S. の種類と、楽譜に書く文字（ステップ11-7c）
// 小節の情報の jump に、この左側の名前（"dc" など）を入れる
export const JUMP_TEXTS = {
  dc: "D.C.", // 曲の頭へ戻る
  dcFine: "D.C. al Fine", // 曲の頭へ戻って、Fine で終わる
  dcCoda: "D.C. al Coda", // 曲の頭へ戻って、To Coda からコーダ（𝄌）へ飛ぶ
  ds: "D.S.", // 𝄋（Segno）へ戻る
  dsFine: "D.S. al Fine", // 𝄋 へ戻って、Fine で終わる
  dsCoda: "D.S. al Coda", // 𝄋 へ戻って、To Coda からコーダ（𝄌）へ飛ぶ
};

// ----------------------------------------------------------
// 関数：keyAt
// i 小節目（0 から数える）の調号を返す（さかのぼって探す）
// ----------------------------------------------------------
export function keyAt(score, i) {
  for (let k = i; k >= 0; k--) {
    if (score.measures[k].key !== undefined) return score.measures[k].key;
  }
  return 0;
}

// ----------------------------------------------------------
// 関数：measureTicks
// 拍子から、1小節の長さ（ティック）を計算する
// 例：4分の4拍子 → 16分音符16個分、4分の3拍子 → 12個分、8分の6拍子 → 12個分
// ----------------------------------------------------------
export function measureTicks(time) {
  return (time.beats * 16 * TICKS_PER_16TH) / time.beatType;
}

// ==========================================================
// ここから下は、アウフタクト（短い1小節目）の関数（ステップ15-1）
// アウフタクトは、楽譜全体の小節の情報の1小節目（score.measures[0]）に
//   pickup: 拍の数（拍子の下の数字の音符がいくつ分か）
// として持つ（例：4分の4拍子で、4分音符1つ分のアウフタクト → pickup: 1）
// アウフタクトがないときは、pickup を書かない
// ==========================================================

// ----------------------------------------------------------
// 関数：hasPickup
// 楽譜にアウフタクトがあるか調べる（ステップ15-1）
// 戻り値：true か false
// ----------------------------------------------------------
export function hasPickup(score) {
  return !!score.measures[0]?.pickup;
}

// ----------------------------------------------------------
// 関数：isShortEnd
// i 小節目が「短い最後の小節」か調べる（ステップ20）
// 短い最後の小節は、楽譜全体の小節の情報の最後の小節（score.measures[最後]）に
//   short: 拍の数（拍子の下の数字の音符がいくつ分か）
// として持つ（例：4分の4拍子で、最後の小節が付点2分音符だけ → short: 3）
// 小節が1つだけで、それがアウフタクトのときは、アウフタクトのほうを使う（short は使わない）
// 戻り値：true か false
// ----------------------------------------------------------
export function isShortEnd(score, i) {
  const last = score.measures.length - 1;
  if (i !== last || !score.measures[i]?.short) return false;
  return !(i === 0 && hasPickup(score));
}

// ----------------------------------------------------------
// 関数：measureLength
// i 小節目（0 から数える）の長さ（ティック）を返す（ステップ15-1）
//   ・1小節目がアウフタクトなら … アウフタクトの長さ（拍の数 × 拍子の下の数字の音符1つ分）
//   ・短い最後の小節なら     … その長さ（拍の数 × 拍子の下の数字の音符1つ分）（ステップ20）
//   ・それ以外             … 拍子どおりの1小節の長さ（measureTicks と同じ）
// 小節の中に入る音の長さを調べるときは、measureTicks(timeAt(...)) ではなく、いつもこれを使う
// 例：4分の4拍子で pickup: 1 → 1小節目は 4分音符1つ分、2小節目からは 4分音符4つ分
// ----------------------------------------------------------
export function measureLength(score, i) {
  const time = timeAt(score, i);
  if (i === 0 && hasPickup(score)) {
    return (score.measures[0].pickup * 16 * TICKS_PER_16TH) / time.beatType;
  }
  if (isShortEnd(score, i)) {
    return (score.measures[i].short * 16 * TICKS_PER_16TH) / time.beatType;
  }
  return measureTicks(time);
}

// ----------------------------------------------------------
// 関数：measureOffset
// i 小節目の頭が、拍子どおりの1小節の中の、どの位置にあたるか（ティック）を返す（ステップ15-1）
//   ・アウフタクトの小節 … 拍子どおりの1小節の長さ − アウフタクトの長さ
//                         （アウフタクトは小節の後ろの部分なので。4/4 で1拍のアウフタクトなら、4拍目から始まる）
//   ・それ以外         … 0
//   （ステップ20：短い最後の小節は、小節の「前の部分」なので 0（拍の線・メトロノームは小節の頭からそろう））
// 拍の線・連桁のつなぎ方・メトロノームを、拍子どおりの位置にそろえるのに使う
// ----------------------------------------------------------
export function measureOffset(score, i) {
  if (isShortEnd(score, i)) return 0;
  return measureTicks(timeAt(score, i)) - measureLength(score, i);
}

// ----------------------------------------------------------
// 関数：measureNumber
// i 小節目（0 から数える）の、楽譜に書く小節番号を返す（ステップ15-1）
//   ・アウフタクトがある … アウフタクトは数えないので、i をそのまま使う（アウフタクトは 0、その次が 1）
//   ・アウフタクトがない … i + 1
// ----------------------------------------------------------
export function measureNumber(score, i) {
  return hasPickup(score) ? i : i + 1;
}

// ----------------------------------------------------------
// 関数：measureName
// i 小節目を、画面に出す文字にする（ステップ15-1）
//   例："3小節目"、アウフタクトなら "アウフタクト"
// ----------------------------------------------------------
export function measureName(score, i) {
  if (i === 0 && hasPickup(score)) return "アウフタクト";
  return `${measureNumber(score, i)}小節目`;
}

// ----------------------------------------------------------
// 関数：restsForSpan
// 小節の中の「start から length の長さ」を、休符で埋めるための休符の並びを作る
//   start  … 埋め始める位置（小節の頭から何ティックか）
//   length … 埋める長さ（ティック）
//   time   … その小節の拍子 { beats, beatType }
// Flat と同じように「1拍ずつの休符」で埋める
//   ・1拍の長さ = 拍子の下の数字の音符1つ分（4分の4拍子なら4分音符、8分の6拍子なら8分音符）
//   ・1拍より長い休符は使わない（空の4分の4拍子の小節 → 4分休符が4つ）
//   ・拍の途中から始まるときは、その休符の長さで割り切れる位置にだけ置く
//     例：4分の4拍子で、3拍目のうら（8分音符1つ分あと）から → 8分休符 → 4分休符…
// ----------------------------------------------------------
export function restsForSpan(start, length, time) {
  const beat = (16 * TICKS_PER_16TH) / time.beatType; // 1拍の長さ（ティック）

  const rests = [];
  let position = start;
  const end = start + length;
  while (position < end) {
    // 長い休符から順に、置けるものを探す
    for (const duration of DURATION_ORDER) {
      const ticks = DURATION_TICKS[duration];
      const withinBeat = ticks <= beat; // 1拍より長くない
      const fits = position + ticks <= end; // はみ出さない
      const aligned = position % ticks === 0; // その休符の長さで割り切れる位置
      if (withinBeat && fits && aligned) {
        rests.push({ rest: true, duration: duration, dots: 0 });
        position = position + ticks;
        break;
      }
    }
  }
  return rests;
}

// ----------------------------------------------------------
// 関数：createPartId
// パートの名札（id）を新しく作る（ステップ12-3）
// パートの名前や並び順が変わっても、同じパートだとわかるようにするため
// （パートごとの音量の設定を、この id で覚える）
// 例："p8k2xq7mz"（"p" ＋ ランダムな英数字8文字）
// ----------------------------------------------------------
export function createPartId() {
  return "p" + Math.random().toString(36).slice(2, 10);
}

// ----------------------------------------------------------
// 関数：upgradeWedgeNotes
// 音の並びの中の、古い形の松葉の終わり（wedge: "stop"）を、新しい形（wedgeEnd: true）に直す（ステップ16-1）
// （ステップ16-1 より前に保存した楽譜・コピーした音には、古い形が入っているため）
//   notes … 音の並び
// 戻り値：直すものがなければ、渡された並びそのまま。あれば、直した新しい並び
// ----------------------------------------------------------
export function upgradeWedgeNotes(notes) {
  if (!notes.some((note) => note.wedge === "stop")) return notes;
  return notes.map((note) => {
    if (note.wedge !== "stop") return note;
    const { wedge, ...rest } = note; // wedge を取りのぞいた形
    return { ...rest, wedgeEnd: true };
  });
}

// ----------------------------------------------------------
// 関数：upgradeWedges
// 楽譜の中の、古い形の松葉の終わり（wedge: "stop"）を、新しい形（wedgeEnd: true）に直す（ステップ16-1）
// 開いたとき（ensurePartIds といっしょに）と、MusicXML を読み込んだときに使う
// 戻り値：直すものがなければ、渡された楽譜データそのまま。あれば、直した新しい楽譜データ
// ----------------------------------------------------------
export function upgradeWedges(score) {
  const needs = score.parts.some((part) => part.measures.some((measure) => measure.notes.some((note) => note.wedge === "stop")));
  if (!needs) return score;
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      measures: part.measures.map((measure) => ({ ...measure, notes: upgradeWedgeNotes(measure.notes) })),
    })),
  };
}

// ----------------------------------------------------------
// 関数：ensurePartIds
// id の付いていないパートがあれば、id を付けた新しい楽譜データを返す（ステップ12-3）
// （ステップ12-3 より前に作った楽譜には id がないため。開いたときに使う）
// 戻り値：全部のパートに id があれば、渡された楽譜データそのまま
//         なければ、id を付けた新しい楽譜データ
// ----------------------------------------------------------
export function ensurePartIds(score) {
  if (score.parts.every((part) => part.id)) return score;
  return {
    ...score,
    parts: score.parts.map((part) => (part.id ? part : { ...part, id: createPartId() })),
  };
}

// パートの番号に使うローマ数字（11個目からは、ふつうの数字にする）
// （ステップ7-3：edit.js から移した）
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// ----------------------------------------------------------
// 関数：renameParts
// パート名を、楽器と並び順から付け直す（渡されたパートの配列を直接書き換える）
//   同じ楽器が1つだけ   → 番号なし（"Violin"・"Vln."）
//   同じ楽器が2つ以上   → 上から順に I・II…（"Violin I"・"Vln. I"）
// （コピーした楽譜データの中でだけ使う）
// （ステップ7-3：新しい楽譜を作るときにも使うので、edit.js から移した）
// ----------------------------------------------------------
export function renameParts(parts) {
  // 楽器ごとの数を数える
  const totals = {};
  parts.forEach((part) => {
    totals[part.instrument] = (totals[part.instrument] ?? 0) + 1;
  });

  // 上から順に名前を付ける
  const counters = {}; // 楽器ごとに、ここまでにいくつ出てきたか
  parts.forEach((part) => {
    const info = INSTRUMENTS[part.instrument];
    counters[part.instrument] = (counters[part.instrument] ?? 0) + 1;
    if (totals[part.instrument] === 1) {
      part.name = info.name;
      part.abbreviation = info.abbreviation;
    } else {
      const n = counters[part.instrument];
      const number = ROMAN[n - 1] ?? String(n);
      part.name = `${info.name} ${number}`;
      part.abbreviation = `${info.abbreviation} ${number}`;
    }
  });
}

// ----------------------------------------------------------
// 関数：createEmptyScore
// 空の楽譜を作る（4小節・ハ長調・4分の4拍子・全部休符。アウフタクトなし）
//   instruments … 上から順の楽器の配列（例：["violin", "violin", "viola", "cello"]）
//                 省略したときは弦楽四重奏
// パート名は楽器の並びから自動で付ける（renameParts）
// （ステップ7-3：楽器を選べるようにした）
// ----------------------------------------------------------
export function createEmptyScore(instruments = ["violin", "violin", "viola", "cello"]) {
  const time = { beats: 4, beatType: 4 };
  const measureCount = 4;
  const ticks = measureTicks(time);

  // パートを作る（名前はあとで renameParts で付ける）
  const parts = instruments.map((instrument) => ({
    id: createPartId(), // パートの名札（ステップ12-3）
    name: "",
    abbreviation: "",
    instrument: instrument,
    measures: Array.from({ length: measureCount }, (_, i) => {
      const measure = { notes: restsForSpan(0, ticks, time) };
      // 1小節目には楽器に合った音部記号を書いておく
      if (i === 0) measure.clef = INSTRUMENTS[instrument].clef;
      return measure;
    }),
  }));
  renameParts(parts);

  return {
    title: "無題",
    composer: "",
    tempoText: "", // 速度記号（"Allegro" など。空ならなし）
    tempo: 80,
    // 1小節目に最初の拍子と調、あとは空
    measures: Array.from({ length: measureCount }, (_, i) => (i === 0 ? { time: time, key: 0 } : {})),
    parts: parts,
  };
}
