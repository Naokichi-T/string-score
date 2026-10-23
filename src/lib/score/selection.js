// ==========================================================
// selection.js
// 「選択中の場所」を扱う関数
//   選択中の場所 = { part: パート番号, measure: 小節番号, note: 小節の中の音の番号, head: 重音の中の玉の番号 }
//   head … 重音のときだけ使う。低い順に 0, 1, 2…（ステップ14-2）
//           書いていない・合わない番号のときは、いちばん上の玉を選んでいることにする（selectedHead で決める）
//   grace … 前打音を選んでいるときだけ true（ステップ24-1）
//           このときの head は、前打音の中の玉の番号（前打音が重音のとき。低い順に 0, 1, 2…）
//           前打音が付いていない音符で true になっているときは、主音を選んでいることにする
//   何も選んでいないときは null
//   番号はどれも 0 から数える（1小節目は measure: 0）
// ==========================================================

// notePitches … 音符の高さを低い順の配列にする（重音なら全部）（ステップ14-1）
// measureName … 小節を「3小節目」「アウフタクト」の文字にする（ステップ15-1）
import { notePitches, measureName } from "./model.js";

// ひし形の玉（ハーモニクスで軽く触れる音）の音名のうしろに付ける印（ステップ14-5a）
const DIAMOND_MARK = "◇";

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
  "32nd": "32分", // ステップ15-5
};

// 前打音の種類を日本語で表すための表（ステップ24-1）
const GRACE_NAMES = { short: "短前打音", long: "長前打音" };

// ----------------------------------------------------------
// 関数：moveSelection
// 選択中の場所を、同じパートの前・次の音に動かす（小節をまたいでもよい）
//   score     … 楽譜データ
//   selection … 今の選択中の場所
//   direction … 1 なら次の音へ、-1 なら前の音へ
// 戻り値：動かしたあとの選択中の場所（端まで来ていたら動かさずにそのまま返す）
// （ステップ14-2：移った先が重音なら、いちばん上の玉を選ぶ）
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

  return withTopHead(score, { part: selection.part, measure: measure, note: note });
}

// ----------------------------------------------------------
// 関数：withTopHead
// 選択中の場所が重音なら、いちばん上の玉を選んだ形にして返す（重音でなければ head を付けない）（ステップ14-2）
// ----------------------------------------------------------
export function withTopHead(score, selection) {
  const count = selectedPitches(score, selection).length;
  if (count <= 1) return selection;
  return { ...selection, head: count - 1 };
}

// ----------------------------------------------------------
// 関数：stepSelection
// ← → キー・［◀ 前の音］［次の音 ▶］で、前打音にも止まりながら前後へ動く（ステップ24-1）
//   score     … 楽譜データ
//   selection … 今の選択中の場所
//   direction … 1 なら次へ、-1 なら前へ
// 動き方（Flat と同じ）
//   前の音 ─ → ─▶ 前打音 ─ → ─▶ 主音 ─ → ─▶ 次の音
//          ◀─ ← ─        ◀─ ← ─       ◀─ ← ─
//   ・主音で ← → 前打音があれば、その前打音へ（なければ前の音へ）
//   ・前打音で → → その主音へ
//   ・前打音で ← → 前の音（の主音）へ
//   ・→ で次の音へ移ったとき、次の音に前打音があれば、まず前打音で止まる
// 移った先が重音（前打音の重音も）なら、いちばん上の玉を選ぶ
// 戻り値：動かしたあとの選択中の場所（端まで来ていたら動かさずにそのまま返す）
// （範囲を広げる Shift＋← → は、前打音には止まらない moveSelection を使う）
// ----------------------------------------------------------
export function stepSelection(score, selection, direction) {
  if (!selection) return selection;
  const main = mainPlace(selection); // 前打音の印・玉の番号を取りのぞいた場所（主音）
  const onGrace = isGraceSelected(score, selection);

  if (direction < 0) {
    // 主音で、前打音がある → 前打音へ
    if (!onGrace && getSelectedNote(score, main)?.grace) return withTopHead(score, { ...main, grace: true });
    // それ以外 → 前の音（の主音）へ（いちばん前なら動かさない）
    const prev = moveSelection(score, main, -1);
    return samePosition(prev, main) ? selection : prev;
  }

  // 前打音 → その主音へ
  if (onGrace) return withTopHead(score, main);
  // 主音 → 次の音へ（次の音に前打音があれば、前打音で止まる）
  const next = moveSelection(score, main, 1);
  if (samePosition(next, main)) return selection; // いちばん後ろなら動かさない
  if (getSelectedNote(score, next)?.grace) return withTopHead(score, { ...mainPlace(next), grace: true });
  return next;
}

// ----------------------------------------------------------
// 関数：mainPlace
// 選択中の場所から、前打音の印（grace）と玉の番号（head）を取りのぞいた「主音の場所」を返す（ステップ24-1）
// ----------------------------------------------------------
export function mainPlace(selection) {
  if (!selection) return selection;
  return { part: selection.part, measure: selection.measure, note: selection.note };
}

// ----------------------------------------------------------
// 関数：samePosition
// 2つの場所が、同じパート・小節・音か調べる（前打音か・玉の番号は見ない）（ステップ24-1）
// ----------------------------------------------------------
function samePosition(a, b) {
  return a.part === b.part && a.measure === b.measure && a.note === b.note;
}

// ----------------------------------------------------------
// 関数：isGraceSelected
// 前打音を選んでいるか調べる（ステップ24-1）
// selection に grace の印があり、その音符に本当に前打音が付いているときだけ true
// （前打音を外したあとなどに、印だけが残っていても、主音を選んでいることにする）
// ----------------------------------------------------------
export function isGraceSelected(score, selection) {
  if (!selection || !selection.grace) return false;
  const note = getSelectedNote(score, selection);
  return !!note && !note.rest && !!note.grace;
}

// ----------------------------------------------------------
// 関数：selectedPitches
// 選んでいるもの（主音か前打音）の高さを、低い順の配列で返す（ステップ24-1）
//   ・前打音を選んでいるとき … 前打音の高さ（前打音も { pitch, chord } の形なので notePitches が使える）
//   ・それ以外 … 音符の高さ（重音なら全部。休符なら空の配列）
// ----------------------------------------------------------
export function selectedPitches(score, selection) {
  const note = getSelectedNote(score, selection);
  if (isGraceSelected(score, selection)) return notePitches(note.grace);
  return notePitches(note);
}

// ----------------------------------------------------------
// 関数：selectedHead
// 選んでいる音符の、何番目の玉（低い順。0 から）を選んでいるかを返す（ステップ14-2）
//   ・重音でなければ 0
//   ・head が書いていない・玉の数より大きいときは、いちばん上の玉
//   ・前打音を選んでいるときは、前打音の中の玉の番号（ステップ24-1）
// ----------------------------------------------------------
export function selectedHead(score, selection) {
  const count = selectedPitches(score, selection).length;
  if (count <= 1) return 0;
  const head = selection.head;
  return Number.isInteger(head) && head >= 0 && head < count ? head : count - 1;
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
// ひし形の玉（diamond）なら、うしろに「◇」を付ける（ステップ14-5a）
// ----------------------------------------------------------
export function pitchToJapanese(pitch) {
  return `${STEP_NAMES[pitch.step]}${ALTER_NAMES[String(pitch.alter ?? 0)]}${pitch.octave}${pitch.diamond ? DIAMOND_MARK : ""}`;
}

// ----------------------------------------------------------
// 関数：pitchToEnglish
// 音の高さを英語の音名にする（ステップ12-1）
// 例：{ step: 'F', alter: 1, octave: 4 } → 'F♯4'
// （step にはもともと英語の音名 "C" "D" などが入っているので、そのまま使う）
// ----------------------------------------------------------
export function pitchToEnglish(pitch) {
  return `${pitch.step}${ALTER_NAMES[String(pitch.alter ?? 0)]}${pitch.octave}${pitch.diamond ? DIAMOND_MARK : ""}`;
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
// 重音の中で選んでいる音は［ ］で囲む（ステップ14-2）
// 例：'Violin I　1小節目　1つ目　ラ4＋［ミ5］（A4＋E5）・4分音符'
// ひし形の玉（ハーモニクスで軽く触れる音）は、音名のうしろに「◇」を付ける（ステップ14-5a）
// 例：'Violin I　1小節目　1つ目　ラ4＋［レ5◇］（A4＋D5◇）・4分音符'
// 前打音を選んでいるときは、前打音の高さと種類を出す（ステップ24-1）
// 例：'Violin I　12小節目　1つ目の前打音　レ4（D4）・短前打音'

// ----------------------------------------------------------
export function describeSelection(score, selection) {
  const note = getSelectedNote(score, selection);
  if (!note) return "";

  const partName = score.parts[selection.part].name;
  // 小節は「3小節目」の形（アウフタクトなら「アウフタクト」）（ステップ15-1）
  const where = `${partName}　${measureName(score, selection.measure)}　${selection.note + 1}つ目`;
  // 連符の中の音なら「3連符の」を前に付ける（ステップ10-2）
  const tupletText = note.tuplet ? `${note.tuplet.actual}連符の` : "";
  const length = tupletText + durationToJapanese(note.duration, note.dots ?? 0, note.rest);

  if (note.rest) {
    return `${where}　${length}`;
  }

  // 前打音を選んでいるとき：「○つ目の前打音」と、前打音の高さ・種類（ステップ24-1）
  if (isGraceSelected(score, selection)) {
    const gracePitches = selectedPitches(score, selection);
    const graceHead = selectedHead(score, selection);
    const graceJapanese = gracePitches.map((pitch, k) => (gracePitches.length > 1 && k === graceHead ? `［${pitchToJapanese(pitch)}］` : pitchToJapanese(pitch))).join("＋");
    const graceEnglish = gracePitches.map((pitch) => pitchToEnglish(pitch)).join("＋");
    return `${where}の前打音　${graceJapanese}（${graceEnglish}）・${GRACE_NAMES[note.grace.type] ?? "前打音"}`;
  }

  // 日本語の音名のうしろに、英語の音名をかっこで付ける（ステップ12-1）
  const pitches = notePitches(note);
  const head = selectedHead(score, selection);
  // 重音のときは、選んでいる音を［ ］で囲む（ステップ14-2）
  const japanese = pitches.map((pitch, k) => (pitches.length > 1 && k === head ? `［${pitchToJapanese(pitch)}］` : pitchToJapanese(pitch))).join("＋");
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
  // 小節は「3小節目」の形（アウフタクトなら「アウフタクト」）（ステップ15-1）
  const from = `${measureName(score, range.start.measure)} ${range.start.note + 1}つ目`;
  const to = `${measureName(score, range.end.measure)} ${range.end.note + 1}つ目`;
  return `${partName}　${from} 〜 ${to}（${count}つ）`;
}
