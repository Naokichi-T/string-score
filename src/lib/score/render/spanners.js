// ==========================================================
// render/spanners.js
// 2つ以上の音にまたがる記号（スラー・松葉）を描く
// 「音をまたぐ記号」のことを英語で spanner（スパナー）という
// ==========================================================

import { DYNAMICS, GLISSANDO } from "../symbols.js";
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
const HAIRPIN_SLUR_GAP = 4; // 松葉と、下側に描いたスラーのすき間
const GLISS_GAP = 3; // グリッサンドの線と、音符の玉（臨時記号・付点）とのすき間（ステップ11-5a）
const GLISS_TEXT_SIZE = 11; // 「gliss.」の文字の大きさ
const GLISS_TEXT_RAISE = 3; // 「gliss.」の文字を、線からどれだけ上に離すか
const GLISS_TEXT_MARGIN = 6; // 線の長さが「文字の幅＋これ」より短いときは、文字を書かない

// ----------------------------------------------------------
// 関数：drawSpanners
// 全パートのスラーと松葉を描く
// 先にスラーを全部描いて、下側に描いたスラーの位置を覚えておき、
// あとから描く松葉がそのスラーにぶつかるときは、松葉をスラーより下にずらす
//   VF         … VexFlow の部品一式
//   context    … 描く先
//   allNotes   … パートごとの音符の一覧（render.js で作ったもの）
//                allNotes[p] の中身：{ staveNote, data, line }
//   lineBounds … 段ごとの左右の端の位置 [{ startX, endX }, ...]
// ----------------------------------------------------------
export function drawSpanners(VF, context, allNotes, lineBounds) {
  allNotes.forEach((notesOfPart) => {
    // ① このパートのスラーと松葉を探す（どの音からどの音までか）
    const slurs = []; // スラーの音符の一覧の並び
    const wedges = []; // { entries: 松葉の音符の一覧, type: 種類 } の並び

    // 今開いている（start を見つけて、まだ stop が来ていない）スラーと松葉の始まり
    let slurStart = -1; // スラーが始まった音の番号（-1 は開いていない）
    let wedgeStart = -1; // 松葉が始まった音の番号
    let wedgeType = null; // 'crescendo' か 'diminuendo'

    notesOfPart.forEach((entry, k) => {
      const data = entry.data;
      if (data.rest) return; // 休符は無視する

      // ----- スラー -----
      if (data.slur === "stop" && slurStart >= 0) {
        slurs.push(notesOfPart.slice(slurStart, k + 1));
        slurStart = -1;
      }
      if (data.slur === "start") {
        slurStart = k;
      }

      // ----- 松葉 -----
      if (data.wedge === "stop" && wedgeStart >= 0) {
        wedges.push({ entries: notesOfPart.slice(wedgeStart, k + 1), type: wedgeType });
        wedgeStart = -1;
      }
      if (data.wedge === "crescendo" || data.wedge === "diminuendo") {
        wedgeStart = k;
        wedgeType = data.wedge;
      }
    });

    // ①-2 グリッサンドを描く（ステップ11-5a）
    // glissando の付いた音から、次の音まで線を引く
    // 次の音が休符・次の音がない・タイが付いているときは描かない
    notesOfPart.forEach((entry, k) => {
      const next = notesOfPart[k + 1];
      if (entry.data.glissando && !entry.data.rest && !entry.data.tie && next && !next.data.rest) {
        drawGlissando(context, entry, next, lineBounds);
      }
    });

    // ② スラーを描く（下側に描いたスラーの位置を集めておく）
    const slurBelows = [];
    slurs.forEach((entries) => {
      slurBelows.push(...drawSlurSpan(VF, context, entries, lineBounds));
    });

    // ③ 松葉を描く（下側のスラーにぶつからないようにする）
    wedges.forEach((wedge) => {
      drawWedgeSpan(VF, context, wedge.entries, wedge.type, lineBounds, slurBelows);
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

// スラーがよけて通る記号の種類（VexFlow の部品の種類の名前）（ステップ13-4）
//   Annotation   … 指番号・奏法の文字・フェルマータ
//   Articulation … 弓・スタッカートなど・弦楽器の記号
//   Ornament     … トリルなどの装飾
const SLUR_AVOID_CATEGORIES = ["Annotation", "Articulation", "Ornament"];

// ----------------------------------------------------------
// 関数：noteTopY / noteBottomY
// 音符の一番上・一番下の位置（符尾も含む）
// （ステップ13-4：玉より上（下）に描いた指番号・弓などの記号も含める。スラーがそれをよけて通るようにするため）
// （記号の位置は、描いたあとでないと分からない。スラーは音符を全部描いたあとに描くので、ここでは分かっている）
// ----------------------------------------------------------
function noteTopY(VF, staveNote) {
  const headTop = Math.min(...staveNote.getYs()) - 5; // 玉の上端
  let top = headTop;
  if (staveNote.hasStem() && staveNote.getStemDirection() === VF.Stem.UP) {
    top = Math.min(top, staveNote.getStemExtents().topY); // 上向きの符尾の先
  }
  // 玉より上に描いた記号の上端（ステップ13-4）
  modifierBoxes(staveNote).forEach((box) => {
    if (box.getY() < headTop) top = Math.min(top, box.getY());
  });
  return top;
}

function noteBottomY(VF, staveNote) {
  const headBottom = Math.max(...staveNote.getYs()) + 5; // 玉の下端
  let bottom = headBottom;
  if (staveNote.hasStem() && staveNote.getStemDirection() === VF.Stem.DOWN) {
    bottom = Math.max(bottom, staveNote.getStemExtents().topY); // 下向きの符尾の先
  }
  // 玉より下に描いた記号の下端（ステップ13-4）
  modifierBoxes(staveNote).forEach((box) => {
    const boxBottom = box.getY() + box.getH();
    if (boxBottom > headBottom) bottom = Math.max(bottom, boxBottom);
  });
  return bottom;
}

// ----------------------------------------------------------
// 関数：modifierBoxes
// 音符に付いた記号（指番号・弓など）のうち、描き終わったものの四角の一覧を返す（ステップ13-4）
//   staveNote … VexFlow の音符（描いたあとのもの）
// 戻り値：BoundingBox の配列（getY が上端、getH が高さ）
// ----------------------------------------------------------
function modifierBoxes(staveNote) {
  const boxes = [];
  staveNote.getModifiers().forEach((modifier) => {
    if (!SLUR_AVOID_CATEGORIES.includes(modifier.getCategory())) return;
    if (!modifier.isRendered()) return; // まだ描いていないものは、位置が分からないので使わない
    const box = modifier.getBoundingBox();
    if (box) boxes.push(box);
  });
  return boxes;
}

// ----------------------------------------------------------
// 関数：drawSlurSpan
// 1つのスラーを描く（段をまたぐときは段ごとに分けて描く）
//   entries … スラーの始まりから終わりまでの音符の一覧
// 戻り値：下側に描いたときの、段ごとの弧の位置 [{ line, x1, x2, bottom }, ...]
//         （上側に描いたときは空の配列。松葉をずらすのに使う）
// ----------------------------------------------------------
function drawSlurSpan(VF, context, entries, lineBounds) {
  const first = entries[0];
  const last = entries[entries.length - 1];

  // 弧の向き：スラーの中の音符が「ぜんぶ符尾が上向き」なら下に、それ以外は上に
  const notes = entries.filter((entry) => !entry.data.rest);
  const below = notes.every((entry) => entry.staveNote.hasStem() && entry.staveNote.getStemDirection() === VF.Stem.UP);

  // 下側に描いた弧の位置（戻り値）
  const belows = [];

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

    // 下側に描いたときは、弧の一番下の位置を覚えておく
    // （この形の弧は、山のてっぺんが両端より「高さの 3/4」だけふくらむ）
    if (below) {
      belows.push({
        line: group[0].line,
        x1: x1,
        x2: x2,
        bottom: Math.max(y1, y2) + height * 0.75,
      });
    }
  });

  return belows;
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
//   slurBelows … 下側に描いたスラーの位置 [{ line, x1, x2, bottom }, ...]（ぶつかるなら下にずらす）
// ----------------------------------------------------------
function drawWedgeSpan(VF, context, entries, type, lineBounds, slurBelows) {
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
    let y = baseline - 6; // 強弱記号の文字のまん中あたり

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

    // --- 下側のスラーと横の位置が重なるなら、そのスラーより下にずらす ---
    const line = group[0].line;
    slurBelows.forEach((slur) => {
      if (slur.line !== line) return; // 違う段のスラーは関係ない
      if (slur.x2 < x1 || slur.x1 > x2) return; // 横の位置が重ならない
      const needed = slur.bottom + HAIRPIN_HALF + HAIRPIN_SLUR_GAP;
      if (y < needed) y = needed;
    });

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
// 関数：drawGlissando
// 1つのグリッサンドを描く（ステップ11-5a）
// 1つ目の音の玉の右から、2つ目の音の玉の左まで、まっすぐな線を引き、
// 線の上に、線と同じ傾きで「gliss.」と書く（線が短くて入らないときは線だけ）
// 段をまたぐときは、スラーと同じく段の端で切って2本に分ける
//   ・1段目：1つ目の音から段の右端まで（高さは、2つ目の音の方へ半分だけ進める）
//   ・2段目：段の頭から2つ目の音まで（残りの半分）
//   from / to  … すべり始める音・次の音（render.js で作った { staveNote, data, line }）
//   lineBounds … 段ごとの左右の端の位置 [{ startX, endX }, ...]
// ----------------------------------------------------------
function drawGlissando(context, from, to, lineBounds) {
  const fromNote = from.staveNote;
  const toNote = to.staveNote;

  // 線の両端の横の位置
  // ・始まり：1つ目の音の玉の右端（付点があれば、その右）
  // ・終わり：2つ目の音の玉の左端（臨時記号があれば、その左）
  const x1 = fromNote.getNoteHeadEndX() + fromNote.getMetrics().modRightPx + GLISS_GAP;
  const x2 = toNote.getNoteHeadBeginX() - toNote.getMetrics().modLeftPx - GLISS_GAP;

  // 線の両端の高さ：それぞれの音の玉のまん中
  const y1 = fromNote.getYs()[0];
  const y2 = toNote.getYs()[0];

  // 同じ段なら、1本の線で描く
  if (from.line === to.line) {
    drawGlissLine(context, x1, y1, x2, y2);
    return;
  }

  // 段をまたぐとき：五線の一番上の線からの高さで比べて、半分ずつ進める
  // （段が違うと五線の位置が違うので、そのままの y では比べられないため）
  const fromTop = fromNote.getStave().getYForLine(0);
  const toTop = toNote.getStave().getYForLine(0);
  const half = (y2 - toTop - (y1 - fromTop)) / 2; // 高さの差の半分
  const hasText = drawGlissLine(context, x1, y1, lineBounds[from.line].endX - 4, y1 + half);
  // 1段目に文字が入らなかったときだけ、2段目に文字を書く
  drawGlissLine(context, lineBounds[to.line].startX - 4, y2 - half, x2, y2, !hasText);
}

// ----------------------------------------------------------
// 関数：drawGlissLine
// グリッサンドの線を1本描き、入るなら線の上に「gliss.」と書く（ステップ11-5a）
//   x1, y1 … 線の始まり
//   x2, y2 … 線の終わり
//   withText … 文字を書こうとするか（省略したら書こうとする）
// 戻り値：文字を書いたら true、書かなかったら false
// ----------------------------------------------------------
function drawGlissLine(context, x1, y1, x2, y2, withText = true) {
  if (x2 <= x1) return false; // 線を引く場所がない（音がくっついている）ときは描かない

  // 線を引く
  context.save();
  context.setLineWidth(1.2);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();

  if (!withText) return false;

  // 線の長さと傾き
  const length = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI; // 度（右下がりはプラス）

  // 文字の幅を測って、線に入らなければ書かない
  context.save();
  context.setFont("Academico", GLISS_TEXT_SIZE, "normal", "italic");
  const textWidth = context.measureText(GLISSANDO.text).width;
  if (length < textWidth + GLISS_TEXT_MARGIN) {
    context.restore();
    return false;
  }

  // 線のまん中を中心にして、線と同じ傾きに回してから、線の少し上に書く
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  context.openRotation(angle, cx, cy);
  context.fillText(GLISSANDO.text, cx - textWidth / 2, cy - GLISS_TEXT_RAISE);
  context.closeRotation();
  context.restore();
  return true;
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
