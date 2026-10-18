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
//
// 【音の長さに合わせた幅】（後で直す候補の手直し：最低の幅だけだと、2分音符などの長い音の小節が窮屈だった）
//   ふつうの浄書の楽譜と同じく、長い音ほど少し広く取る
//   小節の中の「音の始まり」（全パートを合わせたもの）の間の長さごとに、
//     基本の幅 × (長さ ÷ 4分音符の長さ) の 0.6 乗
//   を足して、「音の長さに合わせた幅」を出す（2分音符は4分音符の約1.5倍、全音符は約2.3倍、8分音符は約0.66倍）
//   最低の幅と「音の長さに合わせた幅」のうち、広いほうを使う（細かい音符の多い小節は、今までどおり最低の幅で決まる）
// ==========================================================

import { createNote, vexStemDirection } from "./notes.js";
import { measureStemDirections } from "../stems.js"; // 決めた符尾の向き（ステップ22）
import { isMeasureRest, noteTicks, TICKS_PER_16TH } from "../model.js";
import { createTuplets, createBeams } from "./tuplets.js";

// ゆとりの付け方：最低の幅 × SPACE_RATE ＋ SPACE_EXTRA
// （最低の幅は、音符どうしがくっつくほど詰めた幅なので、少し広げて読みやすくする）
const SPACE_RATE = 1.0; // 最低の幅を何倍にするか（VexFlow の最低の幅は、もともと少しゆとりがあるので、そのまま使う）
const SPACE_EXTRA = 10; // さらに足す幅

// 音の長さに合わせた幅の決め方（後で直す候補の手直し）
const QUARTER_SPACE = 28; // 4分音符1つ分の基本の幅（控えめに広げる大きさ。4分音符の小節が今の約1.3倍になる）
const SPACE_POWER = 0.6; // 長さが2倍になったとき、幅を何倍にするか（2 の 0.6 乗 ＝ 約1.5倍）
const QUARTER_TICKS = 4 * TICKS_PER_16TH; // 4分音符1つ分のティック

// ----------------------------------------------------------
// 関数：durationWidth
// 1小節の「音の長さに合わせた幅」を計算する（後で直す候補の手直し）
//   measures … この小節の、パートごとのデータ（notes の入ったもの）
// ・全パートの「音の始まり」の位置を集めて、となり合う始まりの間の長さごとに幅を足す
//   （どこかのパートで音が始まる所には、ほかのパートが長い音でも、その分の幅を取る）
// 戻り値：幅（ピクセル）
// ----------------------------------------------------------
function durationWidth(measures) {
  const starts = new Set();
  let end = 0;
  measures.forEach((measure) => {
    let position = 0;
    measure.notes.forEach((note) => {
      starts.add(position);
      position = position + noteTicks(note);
    });
    end = Math.max(end, position);
  });
  const points = [...starts].sort((a, b) => a - b);
  points.push(end);
  let width = 0;
  for (let k = 0; k < points.length - 1; k++) {
    const gap = points[k + 1] - points[k];
    if (gap > 0) width = width + QUARTER_SPACE * Math.pow(gap / QUARTER_TICKS, SPACE_POWER);
  }
  return width;
}

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
      // 符尾の向きも、描くときと同じにする（下向きの符尾は玉の左に付くので、幅が少し変わることがある）（ステップ22）
      const stemDirs = measureStemDirections(measure.notes, state.time, state.offset);
      const staveNotes = measure.notes.map((note, j) => createNote(VF, note, state.clefs[p], accidentalsList[p][i][j], state.key, measureRest, vexStemDirection(VF, stemDirs[j])));
      createTuplets(VF, measure.notes, staveNotes); // 連符の音符は、連符にしてから声部に入れる（長さが正しくなる）
      // 連桁も作る（連桁でつながった8分音符は旗がなくなるので、そのぶん幅が狭くなる。描くときと同じ幅で計算するため）
      // （ステップ15-1：アウフタクトの小節は、描くときと同じく、拍子どおりの小節の後ろの部分として区切る）
      createBeams(VF, measure.notes, staveNotes, state.time, state.offset, stemDirs);
      // 声部はアウフタクトの長さで作る（ステップ15-1）
      const voice = new VF.Voice({ numBeats: state.voiceTime.beats, beatValue: state.voiceTime.beatType });
      voice.addTickables(staveNotes);
      return voice;
    });

    // 全パートの音符を縦にそろえたときの、最低の幅を計算する
    const formatter = new VF.Formatter();
    voices.forEach((voice) => formatter.joinVoices([voice]));
    const minWidth = formatter.preCalculateMinTotalWidth(voices);
    // 最低の幅と、音の長さに合わせた幅の、広いほう（後で直す候補の手直し）
    const byDuration = durationWidth(score.parts.map((part) => part.measures[i]));
    return Math.max(minWidth * SPACE_RATE, byDuration) + SPACE_EXTRA;
  });

  lastResult = { score: score, widths: widths };
  return widths;
}
