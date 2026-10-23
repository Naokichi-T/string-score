// ==========================================================
// render/symbols.js
// 音符に記号（弓・指番号・アーティキュレーション・強弱など）を付ける・描く
// （記号の一覧表は ../symbols.js にある）
// ==========================================================

import { BOWINGS, ARTICULATIONS, STRING_MARKS, BREATHS, ORNAMENTS, FERMATA, TECHNIQUES, DYNAMICS } from "../symbols.js";

// フェルマータを持ち上げる量（ピクセル。マイナスが上）
const FERMATA_LIFT = -6;

// ----------------------------------------------------------
// 関数：placeOutsideSlur
// スラーの外（上）に書く記号の印を付けて、スラーの下に入らないように持ち上げる（ステップ25）
// スラーの外に書く記号：弓・弦楽器の記号（ハーモニクスなど）・指番号・奏法の文字・フェルマータ
// （スタッカート・テヌート・アクセントなどとトリルなどの装飾は、スラーの内側（玉の近く）に書く）
//   mark     … 記号（VF.Articulation か VF.Annotation）
//   slurLift … 持ち上げる量（ピクセル。スラーがかかっていなければ 0）
//              render/spanners.js の drawSpanners で、下書きのときに測ったもの
// 印（outsideSlur）は、スラーの通り道を決めるときに「この記号はよけない」ことを知らせるのに使う
// ----------------------------------------------------------
function placeOutsideSlur(mark, slurLift) {
  mark.outsideSlur = true;
  if (slurLift > 0) mark.setYShift(mark.getYShift() - slurLift); // 上へずらす（マイナスが上）
}

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
//   slurLift  … スラーの外に書く記号を持ち上げる量（ピクセル。省略したら 0）（ステップ25）
// ----------------------------------------------------------
export function addSymbols(VF, staveNote, note, slurLift = 0) {
  const ABOVE = VF.Modifier.Position.ABOVE; // 上に付ける
  const BELOW = VF.Modifier.Position.BELOW; // 下に付ける

  // ⓪ 全音符のような符尾のない音符では、見えない符尾の長さを 0 として数えさせる（記号が五線の中に入らないように）
  fixStemlessHeight(staveNote);

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
    // アップボウ（V）は縦に長いので、ダウンボウと同じ高さにそろえる
    if (note.bowing === "up") fitUpBow(VF, bowing);
    placeOutsideSlur(bowing, slurLift); // スラーの外に書く（ステップ25）
    staveNote.addModifier(bowing, 0);
  }

  // ②-2 弦楽器の記号（ハーモニクス・左手ピチカート・バルトーク・ピチカート）（ステップ11-1b）
  //      弓の記号と同じく、いつも五線の上に付ける
  for (const name of note.stringMarks ?? []) {
    const symbol = STRING_MARKS[name];
    if (!symbol) continue; // 表にない名前は無視する
    const mark = new VF.Articulation(symbol.vf);
    mark.setPosition(ABOVE);
    placeOutsideSlur(mark, slurLift); // スラーの外に書く（ステップ25）
    staveNote.addModifier(mark, 0);
  }

  // ②-3 装飾（トリルなど）（ステップ11-3a）
  //      いつも五線の上。VexFlow は、弓などの記号の上・指番号などの文字の下に積み重ねる
  if (note.ornament && ORNAMENTS[note.ornament]) {
    const ornament = new VF.Ornament(ORNAMENTS[note.ornament].vf);
    ornament.setPosition(ABOVE);
    // tr などが五線のいちばん上の線に乗ってしまうときは、少し上へずらす
    keepOffTopLine(ornament, staveNote);
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
    // 弓・アクセント・トリルなどに近すぎるときは、上へずらす
    keepAboveMarks(VF, fingering, staveNote);
    placeOutsideSlur(fingering, slurLift); // スラーの外に書く（ステップ25）
    staveNote.addModifier(fingering, 0);
  }

  // ④ 奏法の文字（pizz.・arco など。斜めの文字で上に書く。複数あれば積み重ねる）
  for (const name of note.techniques ?? []) {
    if (!TECHNIQUES[name]) continue; // 表にない名前は無視する
    const technique = new VF.Annotation(TECHNIQUES[name].text);
    technique.setFont("Academico", 13, "normal", "italic");
    technique.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    // 弓・アクセント・トリルなどに近すぎるときは、上へずらす（指番号をずらしたら、同じだけずらす）
    keepAboveMarks(VF, technique, staveNote);
    placeOutsideSlur(technique, slurLift); // スラーの外に書く（ステップ25）
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
    // 指番号などをずらしたら、同じだけずらす
    keepAboveMarks(VF, fermata, staveNote);
    placeOutsideSlur(fermata, slurLift); // スラーの外に書く（FERMATA_LIFT に足して持ち上げる）（ステップ25）
    staveNote.addModifier(fermata, 0);
  }
}

// ----------------------------------------------------------
// 関数：fixStemlessHeight
// 全音符のような符尾のない音符で、見えない符尾の長さを 0 にする
// 【なぜ】VexFlow の音符は、全音符でも見えない符尾のデータを持っている。
//   記号（指番号・弓など）をどの高さに積むかを決めるとき、VexFlow はその見えない符尾の長さまで数えてしまう。
//   いっぽう、実際に描くときは玉の位置から測るので、記号が五線の中に入ってしまっていた
//   → 符尾のない音符では、符尾の長さを聞かれたら 0 と答えるようにする
//   （符尾の長さ（getHeight）は、記号の高さを決めるところでしか使われない。符尾は描かれないので見た目は変わらない）
//   staveNote … VexFlow の音符
// ----------------------------------------------------------
function fixStemlessHeight(staveNote) {
  if (staveNote.hasStem()) return; // 符尾がある音符はそのまま
  const stem = staveNote.getStem();
  if (stem) stem.getHeight = () => 0;
}

// 指番号などの文字の下端と、その下の記号（弓・アクセント・トリルなど）の上端の間に、最低これだけ空ける（ピクセル）
const MARK_GAP = 4;

// ----------------------------------------------------------
// 関数：keepAboveMarks
// 五線の上に書く文字（指番号・奏法の文字・フェルマータ）が、その下の記号（弓・アクセント・トリルなど）に
// 近すぎるとき（重なるとき）は、上へずらす
// 【なぜ】VexFlow は、アクセントなどを五線の線の間に収まるように少し動かす。
//   その動かした分は、文字の高さを決めるときに数えられていないので、文字がくっついてしまうことがあった
// 【しくみ】VexFlow は、付けた順に記号を描く（弓などの記号 → 文字）。
//   そこで、文字を描く直前（renderText）に、もう描き終わった記号の上端を調べて、足りない分だけ上へずらす。
//   1つの音符で文字をずらしたら、その上に積む文字も同じだけずらす（積んだ並びがくずれないように）
//   VF         … VexFlow の部品一式
//   annotation … 文字（VF.Annotation）
//   staveNote  … その文字を付ける VexFlow の音符
// ----------------------------------------------------------
function keepAboveMarks(VF, annotation, staveNote) {
  const originalRenderText = annotation.renderText.bind(annotation);
  annotation.renderText = (context, x, y) => {
    // もう描き終わった、上に付く記号（弓・アクセントなど・トリルなど）の、いちばん上の高さ
    let marksTop = Infinity;
    staveNote.getModifiers().forEach((modifier) => {
      const category = modifier.getCategory();
      if (category !== "Articulation" && category !== "Ornament") return;
      if (!modifier.isRendered()) return; // まだ描いていないものは、位置が分からないので使わない
      if (modifier.getPosition() !== VF.Modifier.Position.ABOVE) return; // 玉の下に付いたものは関係ない
      marksTop = Math.min(marksTop, modifier.getBoundingBox().getY());
    });

    // 文字の下端（数字には下にはみ出す部分がないので、文字の基準線を下端とする）
    const bottom = annotation.y + annotation.getYShift();
    // 足りない分（この音符で前の文字をずらしていれば、少なくともそれと同じだけ）
    const needed = marksTop === Infinity ? 0 : bottom - (marksTop - MARK_GAP);
    const lift = Math.max(staveNote.liftAboveMarks ?? 0, needed);
    if (lift > 0) {
      staveNote.liftAboveMarks = lift; // この音符で次に描く文字にも使う
      annotation.setYShift(annotation.getYShift() - lift); // 上へずらす（マイナスが上）
    }
    originalRenderText(context, x, y);
  };
}

// トリルなどの装飾の下端と、五線のいちばん上の線の間に、最低これだけ空ける（ピクセル）
const LINE_GAP = 3;

// ----------------------------------------------------------
// 関数：keepOffTopLine
// トリルなどの装飾（tr など）が五線のいちばん上の線にかかるときは、線から離れる所まで上へずらす
// （VexFlow のままだと、五線の中の音では tr が上の線に乗ってしまう）
// トリルの波線は、ずらしたあとの tr の位置から描くので、いっしょに上がる（drawTrillLine）
//   ornament  … 装飾（VF.Ornament）
//   staveNote … その装飾を付ける VexFlow の音符
// ----------------------------------------------------------
function keepOffTopLine(ornament, staveNote) {
  const originalRenderText = ornament.renderText.bind(ornament);
  ornament.renderText = (context, x, y) => {
    const topLineY = staveNote.checkStave().getYForLine(0); // 五線のいちばん上の線の高さ
    const box = ornament.getBoundingBox();
    const over = box.getY() + box.getH() - (topLineY - LINE_GAP); // 線に近すぎる分
    if (over > 0) ornament.setYShift(ornament.getYShift() - over); // 上へずらす（マイナスが上）
    originalRenderText(context, x, y);
  };
}

// アップボウ（V）の線の太さ（ピクセル）
const UP_BOW_LINE_WIDTH = 1.3;

// ----------------------------------------------------------
// 関数：fitUpBow
// アップボウ（V）の高さを、ダウンボウ（⊓）と同じにする（幅は今のまま）
// 【なぜ】楽譜用フォントの V はダウンボウより縦に長い（約20px と約13px）ので、
//   その上に付ける指番号が高くなり、楽譜が縦に長くなってしまう
// 【しくみ】
//   ① 文字の大きさを小さくして、VexFlow が記号を積むときの高さをダウンボウと同じにする
//   ② 描くときは、小さくした文字のかわりに、元の V の幅で2本の線を描く
//      （文字を縦だけ縮めることはできないため。線で描けば、パートの間の自動調整でも大きさを正しく測れる）
//   VF     … VexFlow の部品一式
//   bowing … アップボウの記号（VF.Articulation）
// ----------------------------------------------------------
function fitUpBow(VF, bowing) {
  const width = bowing.getWidth(); // 元の V の幅
  const downHeight = new VF.Articulation(BOWINGS.down.vf).getHeight(); // ダウンボウの高さ

  // ① 高さがダウンボウと同じになるように、文字の大きさを小さくする
  bowing.setFontSize(bowing.fontInfo.size * (downHeight / bowing.getHeight()));

  // ② 文字のかわりに、V の形の2本の線を描く
  bowing.renderText = (context) => {
    // 小さくした文字を囲む四角（VexFlow が決めた位置）
    const box = bowing.getBoundingBox();
    const centerX = box.getX() + box.getW() / 2; // 横のまん中
    const top = box.getY(); // V の上の端
    const bottom = box.getY() + box.getH(); // V の下の先

    context.save();
    context.setLineWidth(UP_BOW_LINE_WIDTH);
    context.beginPath();
    context.moveTo(centerX - width / 2, top); // 左上
    context.lineTo(centerX, bottom); // 下の先
    context.lineTo(centerX + width / 2, top); // 右上
    context.stroke();
    context.restore();
  };
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
const FLAG_COUNT = { whole: 0, half: 0, quarter: 0, eighth: 1, "16th": 2, "32nd": 3 }; // 32分音符はステップ15-5

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
