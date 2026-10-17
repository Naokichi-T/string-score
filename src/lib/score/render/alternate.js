// ==========================================================
// render/alternate.js
// 2つの音を行き来するトレモロ（2音トレモロ）を描く（ステップ14-6a）
//
// 【描き方】
//   データは1つの音符（2音の重音）だが、楽譜では2つの音符として描く
//     ・1つ目（下の音）… ふつうの音符として声部（Voice）に入れる（記号もこちらに付ける）
//     ・2つ目（上の音）… 声部には入れずに、1つ目と次の音符の間に自分で置いて描く
//   2つの音符の間には、符尾から離した連桁（太い線）を、トレモロの本数だけ引く
//     ・2分・4分音符 … 符尾の先のあたりに、符尾と符尾の間だけ
//     ・全音符       … 符尾がないので、2つの玉の間に
//
// 【1つ目と2つ目の音符を、声部の音符の番号とずらさないために】
//   声部の音符の番号（tickables[j]）は、データの音符の番号（notes[j]）と同じにしておく決まり
//   （強弱・拍の線・当たり判定などが、この決まりで動いているため）
//   そのため2つ目は声部に入れず、1つ目の VexFlow の音符に「alternate」という名前で持たせておく
// ==========================================================

// 2つ目の音符を置くために、1つ目の音符の右に空けておく幅（ピクセル）
//   玉1つ分 ＋ すき間（臨時記号・付点があれば、そのぶん足す）
const SPACE_BASE = 30; // 玉とすき間
const SPACE_WHOLE = 6; // 全音符の玉は大きいので、少し足す
const SPACE_ACCIDENTAL = 12; // 臨時記号1つ分
const SPACE_DOT = 6; // 付点1つ分

// 連桁の見た目
const BEAM_THICKNESS = 5; // 太さ
const BEAM_SPACE = 8; // 連桁どうしの間（1本目の上端から2本目の上端まで）
const BEAM_INSET = 4; // 符尾から離す横のすき間
const BEAM_MAX_RISE = 10; // 連桁の傾きの最大（左右の高さの差。これより急なら、ここまでにする）
const HEAD_GAP = 5; // 全音符のとき、玉と連桁の間の横のすき間

// ----------------------------------------------------------
// 関数：attachAlternate
// 1つ目の音符（下の音）に、2つ目の音符（上の音）と連桁の本数を持たせて、
// 2つ目を置く幅を空けるようにする
//   mainNote      … 1つ目の VexFlow の音符（声部に入れるほう）
//   partnerNote   … 2つ目の VexFlow の音符（上の音。声部には入れない）
//   beams         … 連桁の本数（1〜3）
//   hasAccidental … 2つ目の音符に臨時記号が付くか
//   dots          … 付点の数
//   whole         … 全音符か
// （符尾の向きは、作ったときの向き（2つの音をまとめて決めた向き）を覚えておく。restoreAlternateStem を参照）
// ----------------------------------------------------------
export function attachAlternate(mainNote, partnerNote, beams, hasAccidental, dots, whole) {
  // 2つ目を置くのに要る幅
  const extra = SPACE_BASE + (whole ? SPACE_WHOLE : 0) + (hasAccidental ? SPACE_ACCIDENTAL : 0) + dots * SPACE_DOT;
  mainNote.alternate = { note: partnerNote, beams: beams, extra: extra, whole: whole, color: null, stemDirection: mainNote.getStemDirection() };

  // VexFlow が音符を並べるときに使う「音符の幅の情報」に、右側の幅を足す
  // （右に付く記号（付点など）が、そのぶん広いことにする。これで次の音符との間が広がる）
  const original = mainNote.getMetrics.bind(mainNote);
  mainNote.getMetrics = () => {
    const metrics = original();
    return { ...metrics, width: metrics.width + extra, modRightPx: metrics.modRightPx + extra };
  };
}

// ----------------------------------------------------------
// 関数：restoreAlternateStem
// 1つ目の音符の符尾の向きを、作ったときの向きに戻す
// VexFlow の連桁を作る処理（Beam.generateBeams）は、連桁を付けない2分・4分音符の符尾の向きも
// 1音ずつ決め直してしまうので、連桁を作ったあとに呼ぶ（2つの音符の符尾の向きがそろうように）
//   staveNote … VexFlow の音符（2音トレモロでなければ何もしない）
// ----------------------------------------------------------
export function restoreAlternateStem(staveNote) {
  if (!staveNote.alternate) return;
  staveNote.setStemDirection(staveNote.alternate.stemDirection);
}

// ----------------------------------------------------------
// 関数：setAlternateStyle
// 2音トレモロの2つの音符と連桁の色を決める（選択・再生中の色）
//   mainNote … 1つ目の VexFlow の音符（alternate を持っているもの）
//   mainStyle    … 1つ目の音符の色 { fillStyle, strokeStyle }
//   partnerStyle … 2つ目の音符の色（省略したら1つ目と同じ）
//   beamColor    … 連桁の色（省略したら1つ目と同じ）
// ----------------------------------------------------------
export function setAlternateStyle(mainNote, mainStyle, partnerStyle = mainStyle, beamColor = mainStyle.fillStyle) {
  mainNote.setStyle(mainStyle);
  if (!mainNote.alternate) return;
  mainNote.alternate.note.setStyle(partnerStyle);
  mainNote.alternate.color = beamColor;
}

// ----------------------------------------------------------
// 関数：drawAlternate
// 2つ目の音符を置いて描き、2つの音符の間に連桁を引く
// 1つ目の音符の位置が決まって、描いたあとに呼ぶ
//   VF       … VexFlow の部品一式
//   context  … 描く先
//   mainNote … 1つ目の VexFlow の音符（alternate を持っているもの）
//   stave    … その小節の五線
//   nextX    … 次の音符の横の位置（小節の最後の音符なら、音符を並べる所の右端）
// ----------------------------------------------------------
export function drawAlternate(VF, context, mainNote, stave, nextX) {
  const info = mainNote.alternate;
  if (!info) return;
  const partner = info.note;

  // ① 2つ目の音符を置く横の位置
  //   1つ目と次の音符のまん中（狭いときは、1つ目のすぐ右の、空けておいた幅の中）
  const mainX = mainNote.getAbsoluteX();
  const nearest = mainX + mainNote.getGlyphWidth() + (info.extra - SPACE_BASE) + 12; // 臨時記号・付点のぶんも空ける
  const middle = mainX + (nextX - mainX) / 2;
  const partnerX = Math.max(nearest, middle);

  // ② 2つ目の音符を、その位置で描く（声部に入っていないので、自分で並べる）
  //   ・臨時記号・付点を並べるために、記号の置き場所（ModifierContext）を作る
  //   ・横の位置は TickContext で決める（1つ目と同じ五線を使うので、1つ目からの差だけ足す）
  const modifierContext = new VF.ModifierContext();
  partner.addToModifierContext(modifierContext);
  const tickContext = new VF.TickContext();
  tickContext.addTickable(partner);
  partner.setTickContext(tickContext);
  tickContext.preFormat();
  tickContext.setX(mainNote.getTickContext().getX() + (partnerX - mainX));
  partner.setStave(stave);
  partner.setContext(context).drawWithStyle();

  // ③ 連桁を引く
  context.save();
  const color = info.color ?? "#000";
  context.setFillStyle(color);
  context.setStrokeStyle(color);
  if (info.whole) {
    drawWholeBeams(context, mainNote, partner, info.beams);
  } else {
    drawStemBeams(VF, context, mainNote, partner, info.beams);
  }
  context.restore();
}

// ----------------------------------------------------------
// 関数：partnerOf
// 1つ目の VexFlow の音符から、2つ目の音符を返す（2音トレモロでなければ null）
// （当たり判定の四角と、玉の高さを調べるのに使う）
// ----------------------------------------------------------
export function partnerOf(mainNote) {
  return mainNote.alternate ? mainNote.alternate.note : null;
}

// ----------------------------------------------------------
// 関数：drawStemBeams
// 2分・4分音符の2音トレモロの連桁を引く
// 符尾の先の高さを結んだ線にそって、符尾と符尾の間に、符尾から少し離して引く
//   1本目は符尾の先、2本目からは玉のほうへ BEAM_SPACE ずつずらす
// ----------------------------------------------------------
function drawStemBeams(VF, context, first, second, count) {
  const stemUp = first.getStemDirection() === VF.Stem.UP;
  const x1 = first.getStemX() + BEAM_INSET;
  const x2 = second.getStemX() - BEAM_INSET;
  if (x2 <= x1) return; // 間がない（ふつうは起きない）

  // 符尾の先の高さ（上向きなら上の端、下向きなら下の端）
  const tip = (note) => {
    const extents = note.getStemExtents();
    return stemUp ? Math.min(extents.topY, extents.baseY) : Math.max(extents.topY, extents.baseY);
  };
  let y1 = tip(first);
  let y2 = tip(second);
  ({ y1, y2 } = limitRise(y1, y2));

  // 1本ずつ引く（上向きの符尾なら下へ、下向きなら上へ積む）
  const toward = stemUp ? 1 : -1; // 玉のほうへ向かう向き
  for (let k = 0; k < count; k++) {
    const shift = k * BEAM_SPACE * toward;
    // 太さは、符尾の先から玉のほうへ向かって付ける
    const top1 = stemUp ? y1 + shift : y1 + shift - BEAM_THICKNESS;
    const top2 = stemUp ? y2 + shift : y2 + shift - BEAM_THICKNESS;
    fillBeam(context, x1, top1, x2, top2);
  }
}

// ----------------------------------------------------------
// 関数：drawWholeBeams
// 全音符の2音トレモロの連桁を引く
// 符尾がないので、2つの玉のまん中を結んだ線にそって、玉と玉の間に引く（本数ぶんを、線の上下にふり分ける）
// ----------------------------------------------------------
function drawWholeBeams(context, first, second, count) {
  const x1 = first.getAbsoluteX() + first.getGlyphWidth() + HEAD_GAP;
  const x2 = second.getAbsoluteX() - HEAD_GAP;
  if (x2 <= x1) return;

  let y1 = first.getYs()[0];
  let y2 = second.getYs()[0];
  ({ y1, y2 } = limitRise(y1, y2));

  for (let k = 0; k < count; k++) {
    // まん中の線から、本数に合わせて上下にずらす（例：3本なら -8・0・+8）
    const shift = (k - (count - 1) / 2) * BEAM_SPACE;
    fillBeam(context, x1, y1 + shift - BEAM_THICKNESS / 2, x2, y2 + shift - BEAM_THICKNESS / 2);
  }
}

// ----------------------------------------------------------
// 関数：limitRise
// 連桁の傾きが急になりすぎないように、左右の高さの差を BEAM_MAX_RISE までにする
// （まん中の高さは変えずに、両はしを近づける）
// 戻り値：{ y1, y2 }
// ----------------------------------------------------------
function limitRise(y1, y2) {
  const rise = y2 - y1;
  if (Math.abs(rise) <= BEAM_MAX_RISE) return { y1, y2 };
  const middle = (y1 + y2) / 2;
  const half = (BEAM_MAX_RISE / 2) * Math.sign(rise);
  return { y1: middle - half, y2: middle + half };
}

// ----------------------------------------------------------
// 関数：fillBeam
// 連桁1本（傾いた太い線）を、四角形をぬって描く
//   x1, top1 … 左はしの上端　x2, top2 … 右はしの上端
// ----------------------------------------------------------
function fillBeam(context, x1, top1, x2, top2) {
  context.beginPath();
  context.moveTo(x1, top1);
  context.lineTo(x2, top2);
  context.lineTo(x2, top2 + BEAM_THICKNESS);
  context.lineTo(x1, top1 + BEAM_THICKNESS);
  context.closePath();
  context.fill();
}
