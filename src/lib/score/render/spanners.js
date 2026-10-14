// ==========================================================
// render/spanners.js
// 2つ以上の音にまたがる記号（スラー・松葉）を描く
// 「音をまたぐ記号」のことを英語で spanner（スパナー）という
// ==========================================================

import { DYNAMICS } from "../symbols.js";
import { dynamicBaselineY } from "./symbols.js";

// ----------------------------------------------------------
// 見た目の設定（単位はピクセル）
// ----------------------------------------------------------
const SLUR_GAP = 5; // 音符とスラーのすき間
const SLUR_MIN_HEIGHT = 8; // スラーの山の最低の高さ
const SLUR_MAX_HEIGHT = 22; // スラーの山の最高の高さ
const SLUR_THICKNESS = 2; // スラーのまん中の太さ
const HAIRPIN_HALF = 5; // 松葉の開いた側の、まん中からの幅（上下それぞれ）
const HAIRPIN_GAP = 6; // 松葉と強弱記号のすき間

// ----------------------------------------------------------
// 関数：drawSpanners
// 全パートのスラーと松葉を描く
//   VF         … VexFlow の部品一式
//   context    … 描く先
//   allNotes   … パートごとの音符の一覧（render.js で作ったもの）
//                allNotes[p] の中身：{ staveNote, data, line }
//   lineBounds … 段ごとの左右の端の位置 [{ startX, endX }, ...]
// ----------------------------------------------------------
export function drawSpanners(VF, context, allNotes, lineBounds) {
  allNotes.forEach((notesOfPart) => {
    // 今開いている（start を見つけて、まだ stop が来ていない）スラーと松葉の始まり
    let slurStart = -1; // スラーが始まった音の番号（-1 は開いていない）
    let wedgeStart = -1; // 松葉が始まった音の番号
    let wedgeType = null; // 'crescendo' か 'diminuendo'

    notesOfPart.forEach((entry, k) => {
      const data = entry.data;
      if (data.rest) return; // 休符は無視する

      // ----- スラー -----
      if (data.slur === "stop" && slurStart >= 0) {
        // 始まりから今の音までを描く
        drawSlurSpan(VF, context, notesOfPart.slice(slurStart, k + 1), lineBounds);
        slurStart = -1;
      }
      if (data.slur === "start") {
        slurStart = k;
      }

      // ----- 松葉 -----
      if (data.wedge === "stop" && wedgeStart >= 0) {
        drawWedgeSpan(VF, context, notesOfPart.slice(wedgeStart, k + 1), wedgeType, lineBounds);
        wedgeStart = -1;
      }
      if (data.wedge === "crescendo" || data.wedge === "diminuendo") {
        wedgeStart = k;
        wedgeType = data.wedge;
      }
    });
  });
}

// ----------------------------------------------------------
// 関数：noteCenterX
// 音符の玉のまん中の横の位置
// ----------------------------------------------------------
function noteCenterX(staveNote) {
  return (staveNote.getNoteHeadBeginX() + staveNote.getNoteHeadEndX()) / 2;
}

// ----------------------------------------------------------
// 関数：noteTopY / noteBottomY
// 音符の一番上・一番下の位置（符尾も含む）
// ----------------------------------------------------------
function noteTopY(VF, staveNote) {
  let top = Math.min(...staveNote.getYs()) - 5; // 玉の上端
  if (staveNote.hasStem() && staveNote.getStemDirection() === VF.Stem.UP) {
    top = Math.min(top, staveNote.getStemExtents().topY); // 上向きの符尾の先
  }
  return top;
}

function noteBottomY(VF, staveNote) {
  let bottom = Math.max(...staveNote.getYs()) + 5; // 玉の下端
  if (staveNote.hasStem() && staveNote.getStemDirection() === VF.Stem.DOWN) {
    bottom = Math.max(bottom, staveNote.getStemExtents().topY); // 下向きの符尾の先
  }
  return bottom;
}

// ----------------------------------------------------------
// 関数：drawSlurSpan
// 1つのスラーを描く（段をまたぐときは段ごとに分けて描く）
//   entries … スラーの始まりから終わりまでの音符の一覧
// ----------------------------------------------------------
function drawSlurSpan(VF, context, entries, lineBounds) {
  const first = entries[0];
  const last = entries[entries.length - 1];

  // 弧の向き：始まりの音の符尾が上向きなら下に、それ以外は上に
  const firstNote = first.staveNote;
  const below = firstNote.hasStem() && firstNote.getStemDirection() === VF.Stem.UP;

  // 段ごとに分ける（同じ段なら1つのまとまり）
  const groups = groupByLine(entries);

  groups.forEach((group, g) => {
    const isFirstGroup = g === 0;
    const isLastGroup = g === groups.length - 1;
    const bounds = lineBounds[group[0].line];

    // 弧の端の位置
    // ・本当の始まり・終わりの音 → その音の玉の上（下）
    // ・段の途中で切れたところ → 段の端
    const startEntry = isFirstGroup ? first : null;
    const endEntry = isLastGroup ? last : null;

    const edgeY = (entry) => (below ? noteBottomY(VF, entry.staveNote) + SLUR_GAP : noteTopY(VF, entry.staveNote) - SLUR_GAP);

    const x1 = startEntry ? noteCenterX(startEntry.staveNote) : bounds.startX - 4;
    const x2 = endEntry ? noteCenterX(endEntry.staveNote) : bounds.endX - 4;
    // 段の端で切れた側は、もう片方の端と同じ高さにする
    const y1 = startEntry ? edgeY(startEntry) : edgeY(endEntry ?? group[group.length - 1]);
    const y2 = endEntry ? edgeY(endEntry) : edgeY(startEntry ?? group[0]);

    // 間の音にぶつからない山の高さを決める
    let height = Math.min(Math.max((x2 - x1) * 0.12, SLUR_MIN_HEIGHT), SLUR_MAX_HEIGHT);
    group.forEach((entry) => {
      if (entry === startEntry || entry === endEntry) return;
      const x = noteCenterX(entry.staveNote);
      const t = (x - x1) / (x2 - x1 || 1); // 弧の中のどのあたりか（0〜1）
      const baseY = y1 + (y2 - y1) * t; // 両端を結んだ線の高さ
      const needed = below ? noteBottomY(VF, entry.staveNote) + SLUR_GAP - baseY : baseY - (noteTopY(VF, entry.staveNote) - SLUR_GAP);
      // 弧の山は端から離れるほど高いので、端に近い音ほど多めに必要
      const curveRate = 4 * t * (1 - t) * 0.75 || 0.1;
      if (needed / curveRate > height) height = needed / curveRate;
    });

    drawCurve(context, x1, y1, x2, y2, below ? height : -height);
  });
}

// ----------------------------------------------------------
// 関数：drawCurve
// 両端が細く、まん中が少し太い弧を描く（楽譜のスラーらしい形）
//   height … 山の高さ（プラスなら下にふくらむ、マイナスなら上にふくらむ）
// ----------------------------------------------------------
function drawCurve(context, x1, y1, x2, y2, height) {
  // 曲がり具合を決める2つの点（両端から 1/4 と 3/4 の位置）
  const cx1 = x1 + (x2 - x1) * 0.25;
  const cx2 = x1 + (x2 - x1) * 0.75;
  const cy1 = y1 + height;
  const cy2 = y2 + height;
  // 太さのぶん、内側の線を少しずらす
  const t = height > 0 ? -SLUR_THICKNESS : SLUR_THICKNESS;

  context.beginPath();
  context.moveTo(x1, y1);
  context.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2); // 外側の線
  context.bezierCurveTo(cx2, cy2 + t, cx1, cy1 + t, x1, y1); // 内側の線で戻る
  context.closePath();
  context.fill();
}

// ----------------------------------------------------------
// 関数：drawWedgeSpan
// 1つの松葉を描く（段をまたぐときは段ごとに分けて描く）
//   entries … 松葉の始まりから終わりまでの音符の一覧
//   type    … 'crescendo'（だんだん強く ＜）か 'diminuendo'（だんだん弱く ＞）
// ----------------------------------------------------------
function drawWedgeSpan(VF, context, entries, type, lineBounds) {
  const first = entries[0];
  const last = entries[entries.length - 1];
  const groups = groupByLine(entries);

  groups.forEach((group, g) => {
    const isFirstGroup = g === 0;
    const isLastGroup = g === groups.length - 1;
    const bounds = lineBounds[group[0].line];

    // --- 高さ：強弱記号と同じ高さ（この段の中で一番低いところ）にそろえる ---
    let baseline = 0;
    group.forEach((entry) => {
      const stave = entry.staveNote.getStave();
      const y = dynamicBaselineY(VF, entry.staveNote, stave);
      if (y > baseline) baseline = y;
    });
    const y = baseline - 6; // 強弱記号の文字のまん中あたり

    // --- 左の端 ---
    let x1;
    if (isFirstGroup) {
      x1 = first.staveNote.getAbsoluteX();
      // 始まりの音に強弱があれば、その右から始める
      if (first.data.dynamic && DYNAMICS[first.data.dynamic]) {
        x1 = x1 + dynamicWidth(context, first.data.dynamic) + HAIRPIN_GAP;
      }
    } else {
      x1 = bounds.startX; // 段の頭から
    }

    // --- 右の端 ---
    let x2;
    if (isLastGroup) {
      x2 = last.staveNote.getNoteHeadEndX();
      // 終わりの音に強弱があれば、その手前で終わる
      if (last.data.dynamic && DYNAMICS[last.data.dynamic]) {
        x2 = last.staveNote.getAbsoluteX() - HAIRPIN_GAP;
      }
    } else {
      x2 = bounds.endX - 6; // 段の終わりまで
    }

    // --- 開き具合（段で分かれたときは、途中まで開いた形にする） ---
    const total = groups.length;
    const openStart = g / total; // この部分の始まりの開き（0〜1）
    const openEnd = (g + 1) / total; // この部分の終わりの開き（0〜1）
    // クレッシェンドは だんだん開く、デクレッシェンドは だんだん閉じる
    const h1 = HAIRPIN_HALF * (type === "crescendo" ? openStart : 1 - openStart);
    const h2 = HAIRPIN_HALF * (type === "crescendo" ? openEnd : 1 - openEnd);

    // 2本の線を描く
    context.save();
    context.setLineWidth(1);
    context.beginPath();
    context.moveTo(x1, y - h1);
    context.lineTo(x2, y - h2);
    context.moveTo(x1, y + h1);
    context.lineTo(x2, y + h2);
    context.stroke();
    context.restore();
  });
}

// ----------------------------------------------------------
// 関数：dynamicWidth
// 強弱記号の文字の幅を測る（drawDynamic と同じ大きさで測る）
// ----------------------------------------------------------
function dynamicWidth(context, dynamic) {
  context.save();
  context.setFont("Bravura", 24);
  const width = context.measureText(DYNAMICS[dynamic].glyph).width;
  context.restore();
  return width;
}

// ----------------------------------------------------------
// 関数：groupByLine
// 音符の一覧を、段ごとのまとまりに分ける
// 例：[1段目の音, 1段目の音, 2段目の音] → [[1段目の音, 1段目の音], [2段目の音]]
// ----------------------------------------------------------
function groupByLine(entries) {
  const groups = [];
  entries.forEach((entry) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0].line === entry.line) {
      lastGroup.push(entry);
    } else {
      groups.push([entry]);
    }
  });
  return groups;
}
