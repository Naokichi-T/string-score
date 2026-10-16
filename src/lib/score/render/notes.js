// ==========================================================
// render/notes.js
// 音符・休符1つ分のデータから VexFlow の音符を作る
// ==========================================================

import { DURATIONS, CLEFS, pitchToVexKey } from "../model.js";
import { addSymbols } from "./symbols.js";
import { keyAlters } from "../accidentals.js";
import { GRACES } from "../symbols.js";

// 前打音の小さな音符の長さ（VexFlow の書き方）（ステップ11-8a）
//   長前打音は主音の半分の長さで描く：主音の長さ → 1つ短い長さ
//   （付点の主音では、主音の3分の2 ＝ 付点を取った長さ。例：付点4分音符 → 4分音符）
const HALF_DURATION = { whole: "h", half: "q", quarter: "8", eighth: "16", "16th": "32" };

// alter（♯♭の数） → VexFlow の臨時記号の書き方（前打音の臨時記号に使う）（ステップ11-8a）
const ALTER_TO_VF = { "-2": "bb", "-1": "b", 0: "n", 1: "#", 2: "##" };

// ----------------------------------------------------------
// 関数：createNote
// 音符・休符1つ分のデータから VexFlow の音符を作る
//   VF         … VexFlow の部品一式
//   note       … 音符1つ分のデータ
//   clef       … 今の音部記号（'treble' など）
//   accidental … 付ける臨時記号（'#'・'b'・'n' など。付けないときは null）
//   keySignature … 今の調号（前打音の臨時記号を決めるのに使う）（ステップ11-8a）
// ----------------------------------------------------------
export function createNote(VF, note, clef, accidental, keySignature = 0) {
  // VexFlow での長さの書き方（例：'q'）
  let duration = DURATIONS[note.duration].vf;
  // 付点の数だけ 'd' を付ける（例：'qd' は付点4分音符）
  // これで VexFlow が音の長さを正しく計算できる
  duration = duration + "d".repeat(note.dots ?? 0);
  // 休符なら後ろに 'r' を付ける（例：'qr' は4分休符）
  if (note.rest) {
    duration = duration + "r";
  }

  // 音の高さ（休符は五線のまん中に置く）
  const key = note.rest ? CLEFS[clef].restKey : pitchToVexKey(note.pitch);

  // VexFlow の音符を作る
  const staveNote = new VF.StaveNote({
    keys: [key], // 音の高さ（重音は今回なしなので1つだけ）
    duration: duration, // 長さ
    clef: CLEFS[clef].vf, // 音部記号（これで五線上の位置が決まる）
    autoStem: true, // 符尾（棒）の向きを自動で決める
  });

  // 臨時記号を付ける（0 は「1つ目の音」という意味。重音なしなので常に 0）
  if (accidental) {
    staveNote.addModifier(new VF.Accidental(accidental), 0);
  }

  // 付点の「点」を描くための部品を付ける（長さの計算は上の 'd' で済んでいる）
  for (let i = 0; i < (note.dots ?? 0); i++) {
    VF.Dot.buildAndAttach([staveNote], { all: true });
  }

  // 記号（弓・指番号・アーティキュレーションなど）を付ける（休符には付けない）
  if (!note.rest) {
    addSymbols(VF, staveNote, note);
  }

  // 前打音を付ける（休符には付けない）（ステップ11-8a）
  if (!note.rest && note.grace) {
    addGraceNote(VF, staveNote, note, clef, keySignature);
  }

  return staveNote;
}

// ----------------------------------------------------------
// 関数：addGraceNote
// 主音のすぐ左に、前打音の小さな音符を付ける（主音とはスラーでつなぐ）（ステップ11-8a）
//   ・短前打音 … 斜線の付いた小さな8分音符
//   ・長前打音 … 斜線のない小さな音符（主音の半分の長さ。付点の主音なら付点を取った長さ）
// 臨時記号は、調号と違う ♯♭ のときだけ付ける（小節の中の、前の臨時記号は見ない）
//   staveNote … 主音（VexFlow の音符）
//   note      … 主音のデータ（note.grace に前打音が入っている）
//   clef      … 今の音部記号
//   keySignature … 今の調号
// ----------------------------------------------------------
function addGraceNote(VF, staveNote, note, clef, keySignature) {
  const grace = note.grace;
  const isShort = grace.type === "short";
  // 小さな音符の長さ
  let duration = "8";
  if (!isShort) {
    duration = (note.dots ?? 0) > 0 ? DURATIONS[note.duration].vf : (HALF_DURATION[note.duration] ?? "8");
  }

  const graceNote = new VF.GraceNote({
    keys: [pitchToVexKey(grace.pitch)],
    duration: duration,
    clef: CLEFS[clef].vf,
    slash: GRACES[grace.type]?.slash ?? isShort, // 短前打音だけ斜線
    stemDirection: VF.Stem.UP, // 前打音の符尾は上向きにそろえる
  });

  // 臨時記号：調号どおりでなければ付ける
  const alter = grace.pitch.alter ?? 0;
  if (alter !== keyAlters(keySignature)[grace.pitch.step]) {
    graceNote.addModifier(new VF.Accidental(ALTER_TO_VF[alter] ?? "n"), 0);
  }

  // 前打音のまとまりを作って、主音に付ける（true：主音とスラーでつなぐ）
  const group = new VF.GraceNoteGroup([graceNote], true);

  // まとまりの「囲む四角」を、前打音の小さな音符の四角にする
  // （VexFlow のままだと、まとまり自体には位置がないので (0, 0) からの四角になり、
  //   主音の四角が楽譜の左上まで広がってしまう。そうなると、クリックの当たり判定や、
  //   かっこ・テンポの指示の高さを決めるときに、ずれてしまう）
  // 前打音がまだ描かれていない（位置が決まっていない）ときは、主音の玉の所の点にしておく
  group.getBoundingBox = () => {
    if (graceNote.isRendered()) return graceNote.getBoundingBox();
    return new VF.BoundingBox(staveNote.getAbsoluteX(), staveNote.getYs()[0], 0, 0);
  };

  staveNote.addModifier(group, 0);
}
