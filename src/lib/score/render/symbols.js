// ==========================================================
// render/symbols.js
// 音符に記号（弓・指番号・アーティキュレーション・強弱など）を付ける・描く
// （記号の一覧表は ../symbols.js にある）
// ==========================================================

import { BOWINGS, ARTICULATIONS, FERMATA, TECHNIQUES, DYNAMICS } from "../symbols.js";

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

  // ③ 指番号（弓の記号の上に小さい数字で書く）
  if (note.fingering !== undefined && note.fingering !== null) {
    const fingering = new VF.Annotation(String(note.fingering));
    fingering.setFont("Academico", 11);
    fingering.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    staveNote.addModifier(fingering, 0);
  }

  // ④ 奏法の文字（pizz.・arco。斜めの文字で上に書く）
  if (note.technique && TECHNIQUES[note.technique]) {
    const technique = new VF.Annotation(TECHNIQUES[note.technique].text);
    technique.setFont("Academico", 13, "normal", "italic");
    technique.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    staveNote.addModifier(technique, 0);
  }

  // ⑤ フェルマータ（一番上）
  if (note.fermata) {
    const fermata = new VF.Articulation(FERMATA.vf);
    fermata.setPosition(ABOVE);
    staveNote.addModifier(fermata, 0);
  }
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

  // 基本の高さ：五線の一番下の線から少し下
  let y = stave.getYForLine(4) + 32;
  // 音符の玉が低いときは、その下にずらす
  // （玉の下にアクセントなどの記号が付いているときは、そのぶんもさらに下げる）
  const belowCount = staveNote.getModifiersByType("Articulation").filter((a) => a.getPosition() === VF.Modifier.Position.BELOW).length;
  const lowestNoteY = Math.max(...staveNote.getYs()) + belowCount * 12;
  if (lowestNoteY + 26 > y) y = lowestNoteY + 26;

  // 横の位置：音符の玉の左端にそろえる
  const x = staveNote.getAbsoluteX();

  context.save();
  context.setFont("Bravura", 24); // 楽譜用フォントで強弱記号の形を描く
  context.fillText(symbol.glyph, x, y);
  context.restore();
}
