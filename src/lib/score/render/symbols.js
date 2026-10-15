// ==========================================================
// render/symbols.js
// 音符に記号（弓・指番号・アーティキュレーション・強弱など）を付ける・描く
// （記号の一覧表は ../symbols.js にある）
// ==========================================================

import { BOWINGS, ARTICULATIONS, STRING_MARKS, BREATHS, FERMATA, TECHNIQUES, DYNAMICS } from "../symbols.js";

// フェルマータを持ち上げる量（ピクセル。マイナスが上）
const FERMATA_LIFT = -6;

// 下向きの符尾の先から、強弱記号の文字の下端までの間（ピクセル）
const STEM_GAP = 22;

// ----------------------------------------------------------
// 関数：addSymbols
// 音符に、五線の上や音符の近くに付く記号を付ける
// （強弱は五線の下にそろえて描きたいので、ここでは付けずに drawDynamic で描く）
// 付けた順番に、音符から近い順に積み重なる
//   VF        … VexFlow の部品一式
//   staveNote … 記号を付ける VexFlow の音符
//   note      … 音符1つ分のデータ
// ----------------------------------------------------------
export function addSymbols(VF, staveNote, note) {
  const ABOVE = VF.Modifier.Position.ABOVE; // 上に付ける
  const BELOW = VF.Modifier.Position.BELOW; // 下に付ける

  // ① アーティキュレーション（スタッカートなど）
  //    符尾が上向きの音符は玉の下に、下向きの音符は玉の上に付ける
  const stemUp = staveNote.getStemDirection() === VF.Stem.UP;
  for (const name of note.articulations ?? []) {
    const symbol = ARTICULATIONS[name];
    if (!symbol) continue; // 表にない名前は無視する
    const articulation = new VF.Articulation(symbol.vf);
    articulation.setPosition(stemUp ? BELOW : ABOVE);
    staveNote.addModifier(articulation, 0);
  }

  // ② 弓の記号（いつも五線の上）
  if (note.bowing && BOWINGS[note.bowing]) {
    const bowing = new VF.Articulation(BOWINGS[note.bowing].vf);
    bowing.setPosition(ABOVE);
    staveNote.addModifier(bowing, 0);
  }

  // ②-2 弦楽器の記号（ハーモニクス・左手ピチカート・バルトーク・ピチカート）（ステップ11-1b）
  //      弓の記号と同じく、いつも五線の上に付ける
  for (const name of note.stringMarks ?? []) {
    const symbol = STRING_MARKS[name];
    if (!symbol) continue; // 表にない名前は無視する
    const mark = new VF.Articulation(symbol.vf);
    mark.setPosition(ABOVE);
    staveNote.addModifier(mark, 0);
  }

  // ③ 指番号（弓の記号の上に小さい数字で書く。複数あれば、付けた順に下から積み重ねる）
  for (const number of note.fingerings ?? []) {
    const fingering = new VF.Annotation(String(number));
    fingering.setFont("Academico", 11);
    fingering.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    staveNote.addModifier(fingering, 0);
  }

  // ④ 奏法の文字（pizz.・arco など。斜めの文字で上に書く。複数あれば積み重ねる）
  for (const name of note.techniques ?? []) {
    if (!TECHNIQUES[name]) continue; // 表にない名前は無視する
    const technique = new VF.Annotation(TECHNIQUES[name].text);
    technique.setFont("Academico", 13, "normal", "italic");
    technique.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    staveNote.addModifier(technique, 0);
  }

  // ⑤ フェルマータ（一番上）
  //    VexFlow は「アーティキュレーション」を先に、「文字（Annotation）」をあとに積み重ねるので、
  //    アーティキュレーションとして付けると、指番号（文字）より下に来てしまう。
  //    そこで、楽譜用フォントの文字として付けて、指番号や奏法の文字より上に積み重ねる
  if (note.fermata) {
    const fermata = new VF.Annotation(FERMATA.icon);
    fermata.setFont("Bravura", 24);
    fermata.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    // 文字として置くと、五線より高い音では玉に近すぎるので、少し上に持ち上げる
    fermata.setYShift(FERMATA_LIFT);
    staveNote.addModifier(fermata, 0);
  }
}

// ----------------------------------------------------------
// 関数：drawBreath
// ブレス（'）・カエスーラ（//）を、音符の右上（次の音符との間）に描く（ステップ11-1c）
//   VF            … VexFlow の部品一式
//   context       … 描く先
//   staveNote     … 記号を付ける VexFlow の音符（位置が決まったあとのもの）
//   nextStaveNote … 同じ小節の次の音符（小節の最後の音符なら null）
//   stave         … その音符の五線
//   breath        … 'breath' か 'caesura'
// 横の位置：この音符の玉の右端と、次の音符（なければ小節の終わり）の、まん中
// 縦の位置：五線の一番上の線にかかる高さ
// ----------------------------------------------------------
export function drawBreath(VF, context, staveNote, nextStaveNote, stave, breath) {
  const symbol = BREATHS[breath];
  if (!symbol) return; // 表にない名前は無視する

  // 横の位置：まん中に記号の左端を置くと右に寄って見えるので、記号の幅の半分くらい（4px）左にずらす
  const left = staveNote.getNoteHeadEndX();
  const right = nextStaveNote ? nextStaveNote.getAbsoluteX() : stave.getNoteEndX();
  const x = (left + right) / 2 - 4;

  // 縦の位置（文字の基準線）：ブレスは上の線のすぐ上、カエスーラは上の線をまたぐように少し下げる
  const topLineY = stave.getYForLine(0);
  const y = breath === "caesura" ? topLineY + 6 : topLineY - 4;

  context.save();
  context.setFont("Bravura", 24); // 楽譜用フォントで記号の形を描く
  context.fillText(symbol.icon, x, y);
  context.restore();
}

// ----------------------------------------------------------
// 関数：dynamicBaselineY
// 強弱記号を描く高さ（文字の下端の位置）を決める
// 松葉（クレッシェンドなど）も同じ高さにそろえるので、別の関数にしている
//   基本：五線の一番下の線から少し下
//   音符の玉が低いときは、その下にずらす
//   （玉の下にアクセントなどの記号が付いているときは、そのぶんもさらに下げる）
// ----------------------------------------------------------
export function dynamicBaselineY(VF, staveNote, stave) {
  let y = stave.getYForLine(4) + 32;
  const belowCount = staveNote.getModifiersByType("Articulation").filter((a) => a.getPosition() === VF.Modifier.Position.BELOW).length;
  const lowestNoteY = Math.max(...staveNote.getYs()) + belowCount * 12;
  if (lowestNoteY + 26 > y) y = lowestNoteY + 26;

  // 符尾が下向きのときは、符尾の先（連桁があれば連桁）より下にする
  // （高い音から低い音まで連桁でつながると、符尾が五線の下まで伸びて、強弱記号や松葉と重なるため）
  // getStemExtents：符尾の両端の高さ { topY, baseY }。下向きの符尾では、大きいほうが先の高さ
  if (staveNote.hasStem() && staveNote.getStemDirection() === VF.Stem.DOWN) {
    const extents = staveNote.getStemExtents();
    const stemTipY = Math.max(extents.topY, extents.baseY);
    if (stemTipY + STEM_GAP > y) y = stemTipY + STEM_GAP;
  }
  return y;
}

// ----------------------------------------------------------
// 関数：drawDynamic
// 強弱記号を、音符の下・五線の下にそろえて描く
// （音符が五線より低いときは、ぶつからないようにさらに下に描く）
//   VF        … VexFlow の部品一式
//   context   … 描く先
//   staveNote … 強弱を付ける VexFlow の音符（位置が決まったあとのもの）
//   stave     … その音符の五線
//   dynamic   … 強弱の名前（'mf' など）
// ----------------------------------------------------------
export function drawDynamic(VF, context, staveNote, stave, dynamic) {
  const symbol = DYNAMICS[dynamic];
  if (!symbol) return; // 表にない名前は無視する

  // 高さ（文字の下端の位置）
  const y = dynamicBaselineY(VF, staveNote, stave);

  // 横の位置：音符の玉の左端にそろえる
  const x = staveNote.getAbsoluteX();

  context.save();
  context.setFont("Bravura", 24); // 楽譜用フォントで強弱記号の形を描く
  context.fillText(symbol.glyph, x, y);
  context.restore();
}
