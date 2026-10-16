// ==========================================================
// render/widths.js
// 小節ごとの「音符を並べるのに要る幅」を決める（ステップ13-2）
//
// 【考え方】
//   前は「音符1つにつき決まった幅 × 音符の数」で決めていたので、
//   8分音符も2分音符も同じ幅を取り、細かい音符の多い小節がとても広くなっていた。
//   ここでは VexFlow に、実際に音符を作って「ぶつからずに並べるのに最低いくつ要るか」を計算させる
//   （Formatter の preCalculateMinTotalWidth）。
//   臨時記号・付点・前打音・連符の数字なども入った幅になる。
//   （連桁も描くときと同じように作る。連桁でつながった音符は旗がないので、旗のぶんの幅を取らないため）
//   その最低の幅に、少しゆとりを足して、小節の幅にする。
// ==========================================================

import { createNote } from "./notes.js";
import { isMeasureRest } from "../model.js";
import { createTuplets, createBeams } from "./tuplets.js";

// ゆとりの付け方：最低の幅 × SPACE_RATE ＋ SPACE_EXTRA
// （最低の幅は、音符どうしがくっつくほど詰めた幅なので、少し広げて読みやすくする）
const SPACE_RATE = 1.0; // 最低の幅を何倍にするか（VexFlow の最低の幅は、もともと少しゆとりがあるので、そのまま使う）
const SPACE_EXTRA = 10; // さらに足す幅

// 最後に計算した楽譜と、その結果を覚えておく
// 楽譜データが前と同じなら計算し直さない（選択の青や再生中の緑では、幅は変わらないため）
// （楽譜データは書き換えずに新しく作る決まりなので、「同じものか」は === で比べられる）
let lastResult = { score: null, widths: null };

// ----------------------------------------------------------
// 関数：measureNoteWidths
// 小節ごとの「音符を並べるのに要る幅」を計算する（全パートの音符を縦にそろえたときの幅）
//   VF              … VexFlow の部品一式
//   score           … 楽譜データ
//   states          … 小節ごとの状態（拍子・調・音部記号。render/measures.js の buildStates で作ったもの）
//   accidentalsList … パートごと・小節ごとの臨時記号（render.js の 2. で作ったもの）
// 戻り値：小節ごとの幅の配列（音符を並べる所だけ。小節の頭の記号や、小節の終わりのすき間は入らない）
// ----------------------------------------------------------
export function measureNoteWidths(VF, score, states, accidentalsList) {
  if (lastResult.score === score) return lastResult.widths;

  const widths = score.measures.map((_, i) => {
    const state = states[i];
    // パートごとに、この小節の音符を作って「声部（Voice）」にまとめる（描くときと同じ作り方）
    const voices = score.parts.map((part, p) => {
      const measure = part.measures[i];
      // 小節まるごとの休符は、描くときと同じく全休符で作る（ステップ13-3）
      const measureRest = isMeasureRest(measure.notes);
      const staveNotes = measure.notes.map((note, j) => createNote(VF, note, state.clefs[p], accidentalsList[p][i][j], state.key, measureRest));
      createTuplets(VF, measure.notes, staveNotes); // 連符の音符は、連符にしてから声部に入れる（長さが正しくなる）
      // 連桁も作る（連桁でつながった8分音符は旗がなくなるので、そのぶん幅が狭くなる。描くときと同じ幅で計算するため）
      createBeams(VF, measure.notes, staveNotes, state.time);
      const voice = new VF.Voice({ numBeats: state.time.beats, beatValue: state.time.beatType });
      voice.addTickables(staveNotes);
      return voice;
    });

    // 全パートの音符を縦にそろえたときの、最低の幅を計算する
    const formatter = new VF.Formatter();
    voices.forEach((voice) => formatter.joinVoices([voice]));
    const minWidth = formatter.preCalculateMinTotalWidth(voices);
    return minWidth * SPACE_RATE + SPACE_EXTRA;
  });

  lastResult = { score: score, widths: widths };
  return widths;
}
