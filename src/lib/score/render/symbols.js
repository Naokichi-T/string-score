// ==========================================================
// render/symbols.js
// 音符に記号（弓・指番号・アーティキュレーション・強弱など）を付ける・描く
// （記号の一覧表は ../symbols.js にある）
// ==========================================================

import { BOWINGS, ARTICULATIONS, STRING_MARKS, BREATHS, ORNAMENTS, FERMATA, TECHNIQUES, DYNAMICS } from "../symbols.js";

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

  // ②-3 装飾（トリルなど）（ステップ11-3a）
  //      いつも五線の上。VexFlow は、弓などの記号の上・指番号などの文字の下に積み重ねる
  if (note.ornament && ORNAMENTS[note.ornament]) {
    const ornament = new VF.Ornament(ORNAMENTS[note.ornament].vf);
    ornament.setPosition(ABOVE);
    staveNote.addModifier(ornament, 0);
  }

  // ②-4 トレモロ（符尾に斜線。符尾のない全音符は玉の上か下に描かれる）（ステップ11-4）
  //      8分音符などの旗・連桁と重ならないようにする調整は、位置が決まってから shiftTremolo で行う
  if (note.tremolo) {
    staveNote.addModifier(new VF.Tremolo(note.tremolo), 0);
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

  // ④-2 アルペジオ（重音の左に縦の波線。重音のときだけ）（ステップ14-4a）
  //      ARPEGGIO_DIRECTIONLESS … 矢印のない波線
  //      allVoices: false … この音符の玉だけにかかる長さにする（ほかの音符まで波線をのばさない）
  if (note.arpeggio && note.chord) {
    staveNote.addModifier(new VF.Stroke(VF.Stroke.Type.ARPEGGIO_DIRECTIONLESS, { allVoices: false }), 0);
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

// 旗・連桁1本ぶんの太さとすき間（ピクセル）（トレモロの斜線をずらす量）（ステップ11-4）
const BEAM_SPACE = 8;

// 旗・連桁の数（ステップ11-4）
const FLAG_COUNT = { whole: 0, half: 0, quarter: 0, eighth: 1, "16th": 2 };

// ----------------------------------------------------------
// 関数：shiftTremolo
// トレモロの斜線を、旗・連桁と重ならない所までずらす（ステップ11-4）
// VexFlow は斜線を符尾の先から描くので、8分音符・16分音符では旗や連桁に重なってしまう
// 連桁が付くと符尾の向きが変わることがあるので、音符の位置が決まったあと（描く前）に呼ぶ
//   VF        … VexFlow の部品一式
//   staveNote … VexFlow の音符
//   note      … 音符のデータ
// ----------------------------------------------------------
export function shiftTremolo(VF, staveNote, note) {
  if (!note.tremolo) return;
  const tremolo = staveNote.getModifiersByType("Tremolo")[0];
  if (!tremolo) return;
  // 符尾が上向きなら下へ（玉のほうへ）、下向きなら上へずらす
  const direction = staveNote.getStemDirection() === VF.Stem.UP ? 1 : -1;
  tremolo.setYShift((FLAG_COUNT[note.duration] ?? 0) * BEAM_SPACE * direction);
}

// トリルの波線を、tr の文字の基準線からどれだけ上に描くか（ピクセル）（ステップ11-3a）
const TRILL_LINE_RAISE = 7;

// ----------------------------------------------------------
// 関数：drawTrillLine
// トリルの波線を、音符1つ分だけ描く（ステップ11-3a）
// トリルの音が次の音にタイでつながっているとき、タイの最後の音まで波線をのばす
// 小節・段をまたいでも続くように、音符1つ分ずつ描いて、続きの情報を次の音符に渡す
//   VF            … VexFlow の部品一式
//   context       … 描く先
//   staveNote     … VexFlow の音符（位置が決まったあとのもの）
//   nextStaveNote … 同じ小節の次の音符（小節の最後の音符なら null）
//   stave         … その音符の五線
//   note          … 音符のデータ
//   active        … 前の音符から続いている波線 { dy }（続いていなければ null）
//                   dy … 五線の一番上の線から、波線までの高さの差（段が変わっても同じ高さに描くため）
// 戻り値：次の音符に続く波線 { dy }（ここで終わるなら null）
// ----------------------------------------------------------
export function drawTrillLine(VF, context, staveNote, nextStaveNote, stave, note, active) {
  const topLineY = stave.getYForLine(0);
  let startX; // 波線を描き始める横の位置
  let dy; // 五線の一番上の線から、波線までの高さの差

  if (note.ornament === "trill") {
    // トリルの始まり：次の音にタイでつながっていなければ、波線はいらない
    if (!note.tie) return null;
    const ornament = staveNote.getModifiersByType("Ornament")[0];
    if (!ornament) return null;
    // tr の文字の右から描き始める（getX・getY は、描いたあとの tr の文字の左端・基準線）
    startX = ornament.getX() + ornament.getWidth() + 3;
    dy = ornament.getY() - TRILL_LINE_RAISE - topLineY;
  } else if (active) {
    // タイで続いている音：小節の最初の音なら、小節の中で音符が始まる所から描く（小節線のすぐ後ろからつなげる）
    const isFirstInMeasure = staveNote.getVoice().getTickables()[0] === staveNote;
    startX = isFirstInMeasure ? stave.getNoteStartX() - 4 : staveNote.getAbsoluteX();
    dy = active.dy;
  } else {
    return null;
  }

  // 描き終わる横の位置：次の音符の所まで（小節の最後の音符なら小節の終わりまで）
  // この音でタイが終わるなら、次の音符の少し手前で止める
  const last = !note.tie;
  const endX = nextStaveNote ? nextStaveNote.getAbsoluteX() : stave.getX() + stave.getWidth();
  drawWavyLine(context, startX, last ? endX - 8 : endX, topLineY + dy);

  return last ? null : { dy: dy };
}

// ----------------------------------------------------------
// 関数：drawWavyLine
// 横向きのギザギザの線（波線）を描く（ステップ11-3a）
//   context … 描く先
//   x1, x2  … 描き始める・描き終わる横の位置
//   y       … 線のまん中の高さ
// ----------------------------------------------------------
function drawWavyLine(context, x1, x2, y) {
  if (x2 - x1 < 6) return; // 短すぎるときは描かない
  context.save();
  context.setLineWidth(1.4);
  context.beginPath();
  context.moveTo(x1, y);
  let x = x1;
  let up = true; // 次に上へ行くか、下へ行くか
  while (x + 3 <= x2) {
    x = x + 3;
    context.lineTo(x, up ? y - 2.5 : y + 2.5);
    up = !up;
  }
  context.stroke();
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
