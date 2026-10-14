// ==========================================================
// selection.js
// 「選択中の場所」を扱う関数
//   選択中の場所 = { part: パート番号, measure: 小節番号, note: 小節の中の音の番号 }
//   何も選んでいないときは null
//   番号はどれも 0 から数える（1小節目は measure: 0）
// ==========================================================

// 音名を日本語（ドレミ）で表すための表
const STEP_NAMES = { C: "ド", D: "レ", E: "ミ", F: "ファ", G: "ソ", A: "ラ", B: "シ" };

// ♯♭を記号で表すための表
const ALTER_NAMES = { "-2": "𝄫", "-1": "♭", 0: "", 1: "♯", 2: "𝄪" };

// 音の長さを日本語で表すための表（後ろに「音符」か「休符」を付けて使う）
const DURATION_NAMES = {
  whole: "全",
  half: "2分",
  quarter: "4分",
  eighth: "8分",
  "16th": "16分",
};

// ----------------------------------------------------------
// 関数：moveSelection
// 選択中の場所を、同じパートの前・次の音に動かす（小節をまたいでもよい）
//   score     … 楽譜データ
//   selection … 今の選択中の場所
//   direction … 1 なら次の音へ、-1 なら前の音へ
// 戻り値：動かしたあとの選択中の場所（端まで来ていたら動かさずにそのまま返す）
// ----------------------------------------------------------
export function moveSelection(score, selection, direction) {
  if (!selection) return selection;

  const measures = score.parts[selection.part].measures;
  let measure = selection.measure;
  let note = selection.note + direction;

  if (note >= measures[measure].notes.length) {
    // 小節の最後の音より先 → 次の小節の最初の音へ
    if (measure + 1 >= measures.length) return selection; // 最後の小節なら動かさない
    measure = measure + 1;
    note = 0;
  } else if (note < 0) {
    // 小節の最初の音より前 → 前の小節の最後の音へ
    if (measure - 1 < 0) return selection; // 最初の小節なら動かさない
    measure = measure - 1;
    note = measures[measure].notes.length - 1;
  }

  return { part: selection.part, measure: measure, note: note };
}

// ----------------------------------------------------------
// 関数：getSelectedNote
// 選択中の場所にある音符のデータを返す（何も選んでいなければ null）
// ----------------------------------------------------------
export function getSelectedNote(score, selection) {
  if (!selection) return null;
  return score.parts[selection.part].measures[selection.measure].notes[selection.note] ?? null;
}

// ----------------------------------------------------------
// 関数：pitchToJapanese
// 音の高さを日本語の音名にする
// 例：{ step: 'F', alter: 1, octave: 4 } → 'ファ♯4'
// ----------------------------------------------------------
export function pitchToJapanese(pitch) {
  return `${STEP_NAMES[pitch.step]}${ALTER_NAMES[String(pitch.alter ?? 0)]}${pitch.octave}`;
}

// ----------------------------------------------------------
// 関数：durationToJapanese
// 音の長さを日本語にする
// 例：('quarter', 1, false) → '付点4分音符'、('eighth', 0, true) → '8分休符'
// ----------------------------------------------------------
export function durationToJapanese(duration, dots, isRest) {
  let prefix = "";
  if (dots === 1) prefix = "付点";
  if (dots === 2) prefix = "複付点";
  return `${prefix}${DURATION_NAMES[duration]}${isRest ? "休符" : "音符"}`;
}

// ----------------------------------------------------------
// 関数：describeSelection
// 選択中の場所と音を、画面に出す文章にする
// 例：'Viola　3小節目　2つ目　ラ3・4分音符'
// ----------------------------------------------------------
export function describeSelection(score, selection) {
  const note = getSelectedNote(score, selection);
  if (!note) return "";

  const partName = score.parts[selection.part].name;
  const where = `${partName}　${selection.measure + 1}小節目　${selection.note + 1}つ目`;
  const length = durationToJapanese(note.duration, note.dots ?? 0, note.rest);

  if (note.rest) {
    return `${where}　${length}`;
  }
  return `${where}　${pitchToJapanese(note.pitch)}・${length}`;
}
