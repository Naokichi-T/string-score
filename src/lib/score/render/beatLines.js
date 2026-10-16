// ==========================================================
// render/beatLines.js
// 拍の線を描く（ステップ12-7）
// 1小節の中の、拍の頭ごとに、五線の上に色の付いた短い縦線を引く
//   ・1拍目は赤、ほかの拍は青（うすい色）
//   ・線は音符の後ろに描く（音符の玉が線をおおうので、音符はいつもどおり見える）
//   ・拍の位置：その拍で始まる音符があれば、その玉の真ん中。
//     なければ、前後の音符の間を、時間の割合で分けた所
// ==========================================================

import { noteTicks, measureTicks } from "../model.js";
import { beatTicks } from "../playback.js";

// 線の色（1拍目と、ほかの拍）と太さ
const STRONG_COLOR = "rgba(220, 38, 38, 0.45)"; // 赤（うすい）
const BEAT_COLOR = "rgba(37, 99, 235, 0.35)"; // 青（うすい）
const LINE_WIDTH = 2;

// 線を五線の上下に、どれだけはみ出させるか（ピクセル）
const OVERHANG = 4;

// ----------------------------------------------------------
// 関数：drawBeatLines
// 1小節ぶんの拍の線を描く
//   context  … 描く先
//   staves   … この小節の、パートごとの五線
//   voices   … この小節の、パートごとの声部（音符の横の位置が決まったあとのもの）
//   measures … この小節の、パートごとの楽譜データ（notes の入ったもの）
//   time     … この小節の拍子 { beats, beatType }
// ----------------------------------------------------------
export function drawBeatLines(context, staves, voices, measures, time) {
  // ----- 1. 音符が始まる時刻（小節の頭から何ティックか）と、その横の位置を集める -----
  // 同じ時刻に複数のパートの音符があるときは、上のパートのものを使う（全パートで横の位置はそろっている）
  const positions = new Map(); // 時刻 → 横の位置
  measures.forEach((measure, p) => {
    const tickables = voices[p].getTickables();
    let tick = 0;
    measure.notes.forEach((note, j) => {
      if (!positions.has(tick)) {
        const tickable = tickables[j];
        // 玉の真ん中 ＝ 音符の左の位置 ＋ 玉の幅の半分
        positions.set(tick, tickable.getAbsoluteX() + tickable.getGlyphWidth() / 2);
      }
      tick = tick + noteTicks(note);
    });
  });

  // 小節の終わり（音符を並べる所の右の端）も入れておく（最後の拍の位置を割り出すため）
  const length = measureTicks(time);
  if (!positions.has(length)) positions.set(length, staves[0].getNoteEndX());

  // 時刻の順に並べる [[時刻, 横の位置], ...]
  const points = [...positions.entries()].sort((a, b) => a[0] - b[0]);

  // ----- 2. 線を、音符の後ろになるようにまとめて描く -----
  // まとめるための箱（グループ）を開いて、その中に描く
  const group = context.openGroup("beat-lines");
  const beat = beatTicks(time);
  for (let b = 0; b < length; b = b + beat) {
    const x = xAtTick(points, b);
    if (x === null) continue;
    context.save();
    context.setStrokeStyle(b === 0 ? STRONG_COLOR : BEAT_COLOR);
    context.setLineWidth(LINE_WIDTH);
    staves.forEach((stave) => {
      context.beginPath();
      context.moveTo(x, stave.getYForLine(0) - OVERHANG); // 五線のいちばん上の線より少し上から
      context.lineTo(x, stave.getYForLine(4) + OVERHANG); // いちばん下の線より少し下まで
      context.stroke();
    });
    context.restore();
  }
  context.closeGroup();

  // 箱を SVG のいちばん最初に動かす（SVG はあとに書いたものが上に重なるので、最初に置くと一番後ろになる）
  const svg = group.ownerSVGElement;
  svg.insertBefore(group, svg.firstChild);
}

// ----------------------------------------------------------
// 関数：xAtTick
// ある時刻の横の位置を返す
//   points … 時刻の順に並んだ [[時刻, 横の位置], ...]
//   tick   … 調べる時刻
// ちょうどその時刻に音符があれば、その位置。なければ、前後の音符の間を時間の割合で分けた位置
// 見つからなければ null
// ----------------------------------------------------------
function xAtTick(points, tick) {
  for (let k = 0; k < points.length; k++) {
    if (points[k][0] === tick) return points[k][1];
  }
  for (let k = 0; k < points.length - 1; k++) {
    const [t1, x1] = points[k];
    const [t2, x2] = points[k + 1];
    if (t1 < tick && tick < t2) {
      return x1 + ((tick - t1) / (t2 - t1)) * (x2 - x1);
    }
  }
  return null;
}
