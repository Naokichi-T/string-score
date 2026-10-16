// ==========================================================
// selection.js
// 「選択中の場所」を扱う関数
//   選択中の場所 = { part: パート番号, measure: 小節番号, note: 小節の中の音の番号 }
//   何も選んでいないときは null
//   番号はどれも 0 から数える（1小節目は measure: 0）
// ==========================================================

import { notePitches } from "./model.js"; // 音符の高さを低い順の配列にする（重音なら全部）（ステップ14-1）

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
// 関数：pitchToEnglish
// 音の高さを英語の音名にする（ステップ12-1）
// 例：{ step: 'F', alter: 1, octave: 4 } → 'F♯4'
// （step にはもともと英語の音名 "C" "D" などが入っているので、そのまま使う）
// ----------------------------------------------------------
export function pitchToEnglish(pitch) {
  return `${pitch.step}${ALTER_NAMES[String(pitch.alter ?? 0)]}${pitch.octave}`;
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
// 例：'Viola　3小節目　2つ目　ラ3（A3）・4分音符'
// 重音なら、低い順に「＋」でつなぐ（ステップ14-1）
// 例：'Violin I　1小節目　1つ目　ラ4＋ミ5（A4＋E5）・4分音符'
// ----------------------------------------------------------
export function describeSelection(score, selection) {
  const note = getSelectedNote(score, selection);
  if (!note) return "";

  const partName = score.parts[selection.part].name;
  const where = `${partName}　${selection.measure + 1}小節目　${selection.note + 1}つ目`;
  // 連符の中の音なら「3連符の」を前に付ける（ステップ10-2）
  const tupletText = note.tuplet ? `${note.tuplet.actual}連符の` : "";
  const length = tupletText + durationToJapanese(note.duration, note.dots ?? 0, note.rest);

  if (note.rest) {
    return `${where}　${length}`;
  }
  // 日本語の音名のうしろに、英語の音名をかっこで付ける（ステップ12-1）
  const pitches = notePitches(note);
  const japanese = pitches.map((pitch) => pitchToJapanese(pitch)).join("＋");
  const english = pitches.map((pitch) => pitchToEnglish(pitch)).join("＋");
  return `${where}　${japanese}（${english}）・${length}`;
}

// ==========================================================
// ここから下は、範囲選択の関数（ステップ4-6）
// 範囲 = 「選択中の場所」と「範囲のもう一方の端」の間（同じパートの中だけ）
// ==========================================================

// ----------------------------------------------------------
// 関数：comparePosition
// 2つの場所のどちらが前かを比べる（同じパートの中で）
// 戻り値：a が前ならマイナス、同じなら 0、a が後ろならプラス
// ----------------------------------------------------------
function comparePosition(a, b) {
  if (a.measure !== b.measure) return a.measure - b.measure;
  return a.note - b.note;
}

// ----------------------------------------------------------
// 関数：makeRange
// 2つの場所から範囲を作る（前の方を start、後ろの方を end にする）
//   a, b … 場所 { part, measure, note }（同じパートであること）
// 戻り値：{ part, start: { measure, note }, end: { measure, note } }
//   どちらかが null のときや、パートが違うときは null
// ----------------------------------------------------------
export function makeRange(a, b) {
  if (!a || !b || a.part !== b.part) return null;
  const [first, last] = comparePosition(a, b) <= 0 ? [a, b] : [b, a];
  return {
    part: a.part,
    start: { measure: first.measure, note: first.note },
    end: { measure: last.measure, note: last.note },
  };
}

// ----------------------------------------------------------
// 関数：positionsInRange
// 範囲の中の場所を、前から順に全部並べる
// 戻り値：[{ part, measure, note }, ...]
// ----------------------------------------------------------
export function positionsInRange(score, range) {
  if (!range) return [];
  const positions = [];
  const measures = score.parts[range.part].measures;
  for (let m = range.start.measure; m <= range.end.measure; m++) {
    const count = measures[m].notes.length;
    const from = m === range.start.measure ? range.start.note : 0;
    const to = m === range.end.measure ? range.end.note : count - 1;
    for (let n = from; n <= to; n++) {
      positions.push({ part: range.part, measure: m, note: n });
    }
  }
  return positions;
}

// ----------------------------------------------------------
// 関数：isInRange
// 場所が範囲の中に入っているか調べる
// ----------------------------------------------------------
export function isInRange(range, part, measure, note) {
  if (!range || range.part !== part) return false;
  const position = { measure: measure, note: note };
  return comparePosition(range.start, position) <= 0 && comparePosition(position, range.end) <= 0;
}

// ----------------------------------------------------------
// 関数：describeRange
// 範囲を、画面に出す文章にする
// 例：'Violin I　1小節目 2つ目 〜 2小節目 3つ目（6つ）'
// ----------------------------------------------------------
export function describeRange(score, range) {
  if (!range) return "";
  const partName = score.parts[range.part].name;
  const count = positionsInRange(score, range).length;
  const from = `${range.start.measure + 1}小節目 ${range.start.note + 1}つ目`;
  const to = `${range.end.measure + 1}小節目 ${range.end.note + 1}つ目`;
  return `${partName}　${from} 〜 ${to}（${count}つ）`;
}
