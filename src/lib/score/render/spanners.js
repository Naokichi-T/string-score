// ==========================================================
// render/spanners.js
// 2つ以上の音にまたがる記号（スラー・松葉）を描く
// 「音をまたぐ記号」のことを英語で spanner（スパナー）という
// （保持線：指を押さえたままにする線（五線の下の「1 ————」）も、ここで描く）
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
const SLUR_MARK_GAP = 4; // スラーの外に書く記号（指番号・弓など）の下端と、スラーの間のすき間（ステップ25）
const HAIRPIN_HALF = 5; // 松葉の開いた側の、まん中からの幅（上下それぞれ）
const HAIRPIN_GAP = 6; // 松葉と強弱記号のすき間
const HAIRPIN_SLUR_GAP = 4; // 松葉と、下側に描いたスラーのすき間
const INSIDE_WEDGE_GAP = 8; // 音符の下だけの松葉の右の端と、次の音符のすき間（ステップ16-1）
const INSIDE_WEDGE_MIN = 16; // 音符の下だけの松葉の、いちばん短い長さ（ステップ16-1）
const GLISS_GAP = 3; // グリッサンドの線と、音符の玉（臨時記号・付点）とのすき間（ステップ11-5a）
const GLISS_TEXT_SIZE = 11; // 「gliss.」の文字の大きさ
const GLISS_TEXT_RAISE = 3; // 「gliss.」の文字を、線からどれだけ上に離すか
const GLISS_TEXT_MARGIN = 6; // 線の長さが「文字の幅＋これ」より短いときは、文字を書かない
const GLISS_TEXT_HEIGHT = 8; // 「gliss.」の文字の高さ（だいたい。符尾をよけるときの計算に使う）（後で直す候補の手直し）
const GLISS_STEM_GAP = 3; // 「gliss.」の文字と、1つ目の音の上向きの符尾とのすき間（後で直す候補の手直し）
const HOLD_TEXT_SIZE = 11; // 保持線の数字の大きさ（音符の上の指番号と同じ）（保持線）
const HOLD_TEXT_HEIGHT = 9; // 保持線の数字の高さ（だいたい。下の記号とのすき間の計算に使う）
const HOLD_ROW = 14; // 保持線が重なるときの、段（行）と段の間（上下の間）
const HOLD_GAP = 5; // 保持線の数字の上端と、すぐ上の音符・記号とのすき間
const HOLD_STAFF_GAP = 14; // 五線のいちばん下の線と、保持線の数字の上端の、いちばん小さいすき間
const HOLD_TEXT_LINE_GAP = 3; // 数字の右端と、線の始まりのすき間
const HOLD_LINE_RAISE = 4; // 線を、数字の下端からどれだけ上に引くか（数字のまん中あたりの高さにする）
const HOLD_END_EXTRA = 2; // 線の終わりを、最後の音の玉の右の端からどれだけ右へのばすか
const DYNAMIC_DESCENT = 6; // 強弱記号の文字が、文字の基準の線より下にはみ出すだいたいの量

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
//   liftsOut   … スラーの外に書く記号を持ち上げる量を入れる入れ物（Map。省略したら入れない）（ステップ25）
//                キーは "パート-小節-音"（例："0-3-1"）、値は持ち上げる量（ピクセル）
//                下書きのときに集めて、本番（とはみ出しを測り直す下書き）で音符を作るときに使う（render.js）
// ----------------------------------------------------------
export function drawSpanners(VF, context, allNotes, lineBounds, liftsOut = null) {
  allNotes.forEach((notesOfPart) => {
    // ① このパートのスラーと松葉を探す（どの音からどの音までか）
    const slurs = []; // スラーの音符の一覧の並び
    const wedges = []; // { entries: 松葉の音符の一覧, type: 種類 } の並び
    const insides = []; // 音符の下だけの松葉 { entry: その音符, next: 次の音符（なければ null）, type: 種類 } の並び（ステップ16-1）

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
      // （ステップ16-1：終わりは wedgeEnd に分けた。1つの音符では「前の松葉の終わり → 次の松葉の始まり」の順に見る）
      if (data.wedgeEnd && wedgeStart >= 0) {
        wedges.push({ entries: notesOfPart.slice(wedgeStart, k + 1), type: wedgeType });
        wedgeStart = -1;
      }
      if (data.wedge === "crescendo" || data.wedge === "diminuendo") {
        wedgeStart = k;
        wedgeType = data.wedge;
      }
      // 音符の下だけの松葉（ステップ16-1）
      if (data.wedgeInside === "crescendo" || data.wedgeInside === "diminuendo") {
        insides.push({ entry: entry, next: notesOfPart[k + 1] ?? null, type: data.wedgeInside });
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
      slurBelows.push(...drawSlurSpan(VF, context, entries, lineBounds, liftsOut));
    });

    // ③ 松葉を描く（下側のスラーにぶつからないようにする）
    // （保持線：描いた松葉の位置を wedgeBelows に集めて、保持線がその下を通るようにする）
    const wedgeBelows = [];
    wedges.forEach((wedge) => {
      wedgeBelows.push(...drawWedgeSpan(VF, context, wedge.entries, wedge.type, lineBounds, slurBelows));
    });
    // ③-2 音符の下だけの松葉を描く（ステップ16-1）
    insides.forEach((inside) => {
      wedgeBelows.push(drawInsideWedge(VF, context, inside.entry, inside.next, inside.type, lineBounds, slurBelows));
    });

    // ④ 保持線を描く（音符・強弱記号・下側のスラー・松葉より下）（保持線）
    drawHolds(VF, context, notesOfPart, lineBounds, [...slurBelows, ...wedgeBelows]);
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
// （ステップ25：スラーの外に書く記号（outsideSlur の印が付いたもの：弓・弦楽器の記号・指番号・奏法の文字・フェルマータ）はよけない。
//   スラーは玉の近くを通り、その記号のほうをスラーの上へ持ち上げる。よけるのは、スタッカートなどとトリルなどの装飾だけ）
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
    if (modifier.outsideSlur) return; // スラーの外に書く記号はよけない（ステップ25）
    if (!modifier.isRendered()) return; // まだ描いていないものは、位置が分からないので使わない
    const box = modifier.getBoundingBox();
    if (box) boxes.push(box);
  });
  return boxes;
}

// ----------------------------------------------------------
// 関数：outsideMarkBoxes
// 音符に付いた「スラーの外に書く記号」（outsideSlur の印が付いたもの）のうち、描き終わったものの四角の一覧を返す（ステップ25）
//   staveNote … VexFlow の音符（描いたあとのもの）
// 戻り値：BoundingBox の配列（getY が上端、getH が高さ）
// ----------------------------------------------------------
function outsideMarkBoxes(staveNote) {
  const boxes = [];
  staveNote.getModifiers().forEach((modifier) => {
    if (!modifier.outsideSlur || !modifier.isRendered()) return;
    const box = modifier.getBoundingBox();
    if (box) boxes.push(box);
  });
  return boxes;
}

// ----------------------------------------------------------
// 関数：recordLift
// 持ち上げる量を入れ物に入れる（同じ音符にいくつかのスラーがかかるときは、大きいほう）（ステップ25）
// ----------------------------------------------------------
function recordLift(liftsOut, entry, lift) {
  const key = `${entry.part}-${entry.measure}-${entry.note}`;
  liftsOut.set(key, Math.max(liftsOut.get(key) ?? 0, lift));
}

// ----------------------------------------------------------
// 関数：drawSlurSpan
// 1つのスラーを描く（段をまたぐときは段ごとに分けて描く）
//   entries … スラーの始まりから終わりまでの音符の一覧
//   liftsOut … スラーの外に書く記号を持ち上げる量を入れる入れ物（Map。null なら入れない）（ステップ25）
//              上側に描いたスラーの中の音符で、記号の下端がスラーの外側の線より下に入るものの量を入れる
// 戻り値：下側に描いたときの、段ごとの弧の位置 [{ line, x1, x2, bottom }, ...]
//         （上側に描いたときは空の配列。松葉をずらすのに使う）
// ----------------------------------------------------------
function drawSlurSpan(VF, context, entries, lineBounds, liftsOut = null) {
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

    // 上側に描いたとき：スラーの外に書く記号が、スラーの下に入る音符を調べて、持ち上げる量を覚えておく（ステップ25）
    //   横の位置 x でのスラーの外側の線の高さ ＝ 両端を結んだ線の高さ − 山の高さ × 3t(1−t)
    //   （drawCurve の弧は、曲がり具合を決める2つの点を両端から山の高さだけずらしているので、この形になる）
    //   記号の左の端・まん中・右の端の3か所で調べる（スラーの端の音では、スラーが斜めに上がっていくので、
    //   記号のまん中だけで調べると、記号の右（左）の端がスラーにくっついてしまうため）
    //   記号の下端が「スラーの高さ − すき間」より下なら、その差だけ持ち上げる（音符ごとに、いちばん大きい量）
    if (!below && liftsOut) {
      const slurTopAt = (x) => {
        const t = Math.min(1, Math.max(0, (x - x1) / (x2 - x1 || 1))); // スラーの外は、端の高さで考える
        return y1 + (y2 - y1) * t - height * 3 * t * (1 - t);
      };
      group.forEach((entry) => {
        if (entry.data.rest) return;
        let lift = 0;
        outsideMarkBoxes(entry.staveNote).forEach((box) => {
          const markBottom = box.getY() + box.getH();
          const xs = [box.getX(), box.getX() + box.getW() / 2, box.getX() + box.getW()];
          xs.forEach((x) => {
            lift = Math.max(lift, markBottom - (slurTopAt(x) - SLUR_MARK_GAP));
          });
        });
        if (lift > 0) recordLift(liftsOut, entry, lift);
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
// 戻り値：段ごとの松葉の位置 [{ line, x1, x2, bottom }, ...]（保持線：保持線を松葉より下に描くのに使う）
// ----------------------------------------------------------
function drawWedgeSpan(VF, context, entries, type, lineBounds, slurBelows) {
  const first = entries[0];
  const last = entries[entries.length - 1];
  const groups = groupByLine(entries);
  const placed = []; // 描いた松葉の位置（保持線）

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

    placed.push({ line: line, x1: x1, x2: x2, bottom: y + HAIRPIN_HALF }); // 保持線のために位置を覚える
  });
  return placed;
}

// ----------------------------------------------------------
// 関数：drawInsideWedge
// 1つの音符の下だけの松葉を描く（ステップ16-1）
// 音符の左から、次の音符の少し手前まで（次の音符が別の段・ないときは、段の終わりの少し手前まで）
// 高さ・強弱記号のよけ方・スラーのよけ方は、ふつうの松葉（drawWedgeSpan）と同じ
//   entry … その音符（render.js の allNotes の1つ）
//   next  … 次の音符・休符（なければ null）
//   type  … 'crescendo' か 'diminuendo'
// 戻り値：描いた松葉の位置 { line, x1, x2, bottom }（保持線：保持線を松葉より下に描くのに使う）
// ----------------------------------------------------------
function drawInsideWedge(VF, context, entry, next, type, lineBounds, slurBelows) {
  const staveNote = entry.staveNote;
  const bounds = lineBounds[entry.line];

  // 高さ：強弱記号と同じ高さ
  let y = dynamicBaselineY(VF, staveNote, staveNote.getStave()) - 6;

  // 左の端：音符の左（強弱があれば、その右から）
  let x1 = staveNote.getAbsoluteX();
  if (entry.data.dynamic && DYNAMICS[entry.data.dynamic]) {
    x1 = x1 + dynamicWidth(context, entry.data.dynamic) + HAIRPIN_GAP;
  }
  // この音符で前の松葉が終わっているときは、その終わり（玉の右の端）と重ならないように、玉の右から始める
  if (entry.data.wedgeEnd) {
    x1 = Math.max(x1, staveNote.getNoteHeadEndX() + HAIRPIN_GAP);
  }
  // 右の端：次の音符の少し手前（同じ段にないときは、段の終わりの少し手前）
  const sameLine = next && next.line === entry.line;
  let x2 = sameLine ? next.staveNote.getAbsoluteX() - INSIDE_WEDGE_GAP : bounds.endX - INSIDE_WEDGE_GAP;
  // 短すぎるときは、音符の玉の右までは描く
  x2 = Math.max(x2, staveNote.getNoteHeadEndX() + 4, x1 + INSIDE_WEDGE_MIN);

  // 下側のスラーと横の位置が重なるなら、そのスラーより下にずらす
  slurBelows.forEach((slur) => {
    if (slur.line !== entry.line) return;
    if (slur.x2 < x1 || slur.x1 > x2) return;
    const needed = slur.bottom + HAIRPIN_HALF + HAIRPIN_SLUR_GAP;
    if (y < needed) y = needed;
  });

  // ＜ は右に開く、＞ は左が開く
  const h1 = type === "crescendo" ? 0 : HAIRPIN_HALF;
  const h2 = type === "crescendo" ? HAIRPIN_HALF : 0;
  context.save();
  context.setLineWidth(1);
  context.beginPath();
  context.moveTo(x1, y - h1);
  context.lineTo(x2, y - h2);
  context.moveTo(x1, y + h1);
  context.lineTo(x2, y + h2);
  context.stroke();
  context.restore();
  return { line: entry.line, x1: x1, x2: x2, bottom: y + HAIRPIN_HALF }; // 保持線のために位置を返す
}

// ==========================================================
// ここから下は、保持線（指を押さえたままにする線）を描く関数（保持線）
// 見た目：五線の下に、始まりの音の位置で指の数字を書き、終わりの音まで実線を引く
//   例：  3 ——————————
//       1 ————————————————
// ==========================================================

// ----------------------------------------------------------
// 関数：collectHolds
// 1つのパートの音符の一覧から、保持線（どの指が、何番目の音から何番目の音までか）を集める（保持線）
//   notesOfPart … パートの音符の一覧（render.js の allNotes[p]）
// 同じ指の番号どうしで、始まり（holdStart）と終わり（holdEnd）を組にする
// 1つの音符では「前の線の終わり → 次の線の始まり」の順に見る（edit.js の cleanSpanners と同じ）
// 戻り値：[{ finger: 指の番号, from: 始まりの音の番号, to: 終わりの音の番号 }, ...]
// ----------------------------------------------------------
function collectHolds(notesOfPart) {
  const holds = [];
  const open = new Map(); // 指の番号 → 始まりの音の番号
  notesOfPart.forEach((entry, k) => {
    const data = entry.data;
    if (data.rest) return;
    (data.holdEnd ?? []).forEach((finger) => {
      if (!open.has(finger)) return; // 始まりのない終わりは描かない
      holds.push({ finger: finger, from: open.get(finger), to: k });
      open.delete(finger);
    });
    (data.holdStart ?? []).forEach((finger) => {
      open.set(finger, k);
    });
  });
  return holds;
}

// ----------------------------------------------------------
// 関数：assignHoldRows
// 重なる保持線を、上下の段（行）に分ける（保持線）
//   holds … collectHolds で集めたもの（ここに row（0 がいちばん上＝五線に近い）を書き足す）
// 決まり：あとから始まる線ほど上（五線に近い）にする（写真の楽譜のように、長く続く線が下になる）
//   → 始まりの遅い順に見て、ほかの線と重ならない、いちばん上の段に入れる
//   重なる＝音の番号の範囲が1つでも重なる（終わりの音と始まりの音が同じでも、数字と線がぶつかるので重なるとみなす）
// ----------------------------------------------------------
function assignHoldRows(holds) {
  const rows = []; // rows[r] = その段に入れた線の並び
  [...holds]
    .sort((a, b) => b.from - a.from || a.finger - b.finger)
    .forEach((hold) => {
      let r = 0;
      while (rows[r] && rows[r].some((other) => hold.from <= other.to && other.from <= hold.to)) r = r + 1;
      if (!rows[r]) rows[r] = [];
      rows[r].push(hold);
      hold.row = r;
    });
}

// ----------------------------------------------------------
// 関数：holdObstacleBottom
// 1つの段の、横の範囲 x1〜x2 の中で、保持線より上にあるもの（音符・強弱記号・下側のスラー・松葉）の
// いちばん下の位置を返す（保持線）
//   notesOfPart … パートの音符の一覧
//   line        … 何段目か
//   x1, x2      … 横の範囲
//   belows      … 下側に描いたスラー・松葉の位置 [{ line, x1, x2, bottom }, ...]
//   stave       … この段の五線（五線より上には線を引かないため）
// ----------------------------------------------------------
function holdObstacleBottom(VF, notesOfPart, line, x1, x2, belows, stave) {
  let bottom = stave.getYForLine(4) + HOLD_STAFF_GAP - HOLD_GAP; // 五線のいちばん下の線の少し下
  notesOfPart.forEach((entry) => {
    if (entry.line !== line || entry.data.rest) return;
    const x = entry.staveNote.getAbsoluteX();
    if (x > x2 || entry.staveNote.getNoteHeadEndX() < x1) return; // 横の範囲の外
    bottom = Math.max(bottom, noteBottomY(VF, entry.staveNote)); // 玉・下向きの符尾・下の記号
    if (entry.data.dynamic && DYNAMICS[entry.data.dynamic]) {
      bottom = Math.max(bottom, dynamicBaselineY(VF, entry.staveNote, entry.staveNote.getStave()) + DYNAMIC_DESCENT); // 強弱記号
    }
  });
  belows.forEach((item) => {
    if (item.line !== line || item.x2 < x1 || item.x1 > x2) return;
    bottom = Math.max(bottom, item.bottom); // 下側のスラー・松葉
  });
  return bottom;
}

// ----------------------------------------------------------
// 関数：drawHolds
// 1つのパートの保持線を全部描く（保持線）
//   notesOfPart … パートの音符の一覧（render.js の allNotes[p]）
//   lineBounds  … 段ごとの左右の端の位置
//   belows      … 下側に描いたスラー・松葉の位置（その下に線を引く）
// 流れ
//   ① 保持線を集めて（collectHolds）、重なるものを上下の段に分ける（assignHoldRows）
//   ② 線を段（五線の段）ごとに分けて、横の範囲を決める
//        始まりの段：始まりの音の玉の左から（数字を書いて、その右から線）
//        続きの段  ：段の頭から（数字は書かない）
//        終わりの段：終わりの音の玉の右まで／途中の段：段の終わりまで
//   ③ 五線の段ごとに、いちばん上の保持線の高さをそろえる（その段の保持線の範囲にある、音符・記号より下）
//   ④ 段（行）の数だけ下にずらして描く
// ----------------------------------------------------------
function drawHolds(VF, context, notesOfPart, lineBounds, belows) {
  // ① 集めて、上下の段に分ける
  const holds = collectHolds(notesOfPart);
  if (holds.length === 0) return;
  assignHoldRows(holds);

  // 数字の幅を測るための文字の設定
  context.save();
  context.setFont("Academico", HOLD_TEXT_SIZE);

  // ② 五線の段ごとの部分に分ける
  const pieces = []; // { hold, line, x1, x2, withText }
  holds.forEach((hold) => {
    const entries = notesOfPart.slice(hold.from, hold.to + 1);
    const groups = groupByLine(entries);
    groups.forEach((group, g) => {
      const line = group[0].line;
      const bounds = lineBounds[line];
      const isFirstGroup = g === 0;
      const isLastGroup = g === groups.length - 1;
      const x1 = isFirstGroup ? entries[0].staveNote.getAbsoluteX() : bounds.startX;
      const x2 = isLastGroup ? entries[entries.length - 1].staveNote.getNoteHeadEndX() + HOLD_END_EXTRA : bounds.endX - 6;
      pieces.push({ hold: hold, line: line, x1: x1, x2: x2, withText: isFirstGroup, stave: group[0].staveNote.getStave() });
    });
  });

  // ③ 五線の段ごとに、いちばん上の保持線の、数字の下端の高さ（文字の基準の線）を決める
  const baseByLine = new Map();
  pieces.forEach((piece) => {
    const bottom = holdObstacleBottom(VF, notesOfPart, piece.line, piece.x1, piece.x2, belows, piece.stave);
    const baseline = bottom + HOLD_GAP + HOLD_TEXT_HEIGHT;
    baseByLine.set(piece.line, Math.max(baseByLine.get(piece.line) ?? 0, baseline));
  });

  // ④ 描く
  context.setLineWidth(1);
  pieces.forEach((piece) => {
    const y = baseByLine.get(piece.line) + piece.hold.row * HOLD_ROW; // 数字の下端（文字の基準の線）
    let lineStart = piece.x1;
    if (piece.withText) {
      const text = String(piece.hold.finger);
      context.fillText(text, piece.x1, y);
      lineStart = piece.x1 + context.measureText(text).width + HOLD_TEXT_LINE_GAP;
    }
    if (piece.x2 > lineStart) {
      context.beginPath();
      context.moveTo(lineStart, y - HOLD_LINE_RAISE);
      context.lineTo(piece.x2, y - HOLD_LINE_RAISE);
      context.stroke();
    }
  });
  context.restore();
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

  // 1つ目の音の符尾が上向きなら、文字がその符尾に近づかないように、符尾の右の位置を渡す（後で直す候補の手直し）
  // （全音符など符尾のない音、下向きの符尾の音は、よけなくてよいので null）
  const hasUpStem = fromNote.hasStem() && fromNote.getStemDirection() === 1; // 1 は VexFlow の「上向き」（Stem.UP）
  const avoidX = hasUpStem ? fromNote.getStemX() + GLISS_STEM_GAP : null;

  // 同じ段なら、1本の線で描く
  if (from.line === to.line) {
    drawGlissLine(context, x1, y1, x2, y2, true, avoidX);
    return;
  }

  // 段をまたぐとき：五線の一番上の線からの高さで比べて、半分ずつ進める
  // （段が違うと五線の位置が違うので、そのままの y では比べられないため）
  const fromTop = fromNote.getStave().getYForLine(0);
  const toTop = toNote.getStave().getYForLine(0);
  const half = (y2 - toTop - (y1 - fromTop)) / 2; // 高さの差の半分
  const hasText = drawGlissLine(context, x1, y1, lineBounds[from.line].endX - 4, y1 + half, true, avoidX);
  // 1段目に文字が入らなかったときだけ、2段目に文字を書く
  drawGlissLine(context, lineBounds[to.line].startX - 4, y2 - half, x2, y2, !hasText);
}

// ----------------------------------------------------------
// 関数：drawGlissLine
// グリッサンドの線を1本描き、入るなら線の上に「gliss.」と書く（ステップ11-5a）
//   x1, y1 … 線の始まり
//   x2, y2 … 線の終わり
//   withText … 文字を書こうとするか（省略したら書こうとする）
//   avoidX   … 文字の左の端がこれより左に来ないようにする位置（1つ目の音の上向きの符尾の右）。null ならよけない（後で直す候補の手直し）
// 文字はふつう線のまん中に書く。線が急に上がっていて、文字の左上の角が符尾に近づくときは、
// 入る範囲で文字を線にそって右上へずらす
// 戻り値：文字を書いたら true、書かなかったら false
// ----------------------------------------------------------
function drawGlissLine(context, x1, y1, x2, y2, withText = true, avoidX = null) {
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

  // 文字の中心の位置：まずは線のまん中
  let cx = (x1 + x2) / 2;
  let cy = (y1 + y2) / 2;

  // 符尾をよける（後で直す候補の手直し）
  // 回したあとの文字の左上の角の横の位置 ＝ 中心 − (幅の半分)×cos ＋ (上に離す分＋文字の高さ)×sin
  //   （右上がりの線では sin がマイナスなので、角は中心より左に出る）
  if (avoidX !== null) {
    const rad = (angle * Math.PI) / 180;
    const cornerX = cx - (textWidth / 2) * Math.cos(rad) + (GLISS_TEXT_RAISE + GLISS_TEXT_HEIGHT) * Math.sin(rad);
    const need = avoidX - cornerX; // 右へずらしたい横の量
    if (need > 0) {
      // 線にそって動かす長さ（横に need 進むには need ÷ cos）。文字が線の終わりからはみ出さない所まで
      const room = (length - textWidth) / 2;
      const move = Math.min(need / Math.cos(rad), room);
      cx = cx + move * Math.cos(rad);
      cy = cy + move * Math.sin(rad);
    }
  }

  // 線と同じ傾きに回してから、線の少し上に書く
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
