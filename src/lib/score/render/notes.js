// ==========================================================
// render/notes.js
// 音符・休符1つ分のデータから VexFlow の音符を作る
// ==========================================================

import { DURATIONS, CLEFS, pitchToVexKey } from "../model.js";
import { addSymbols } from "./symbols.js";

// ----------------------------------------------------------
// 関数：createNote
// 音符・休符1つ分のデータから VexFlow の音符を作る
//   VF         … VexFlow の部品一式
//   note       … 音符1つ分のデータ
//   clef       … 今の音部記号（'treble' など）
//   accidental … 付ける臨時記号（'#'・'b'・'n' など。付けないときは null）
// ----------------------------------------------------------
export function createNote(VF, note, clef, accidental) {
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

  return staveNote;
}
