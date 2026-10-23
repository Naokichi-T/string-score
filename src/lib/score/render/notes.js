// ==========================================================
// render/notes.js
// 音符・休符1つ分のデータから VexFlow の音符を作る
// ==========================================================

import { DURATIONS, CLEFS, pitchToVexKey, notePitches, isAlternate } from "../model.js";
import { addSymbols } from "./symbols.js";
import { attachAlternate } from "./alternate.js";
import { keyAlters } from "../accidentals.js";
import { GRACES } from "../symbols.js";

// 前打音の小さな音符の長さ（VexFlow の書き方）（ステップ11-8a）
//   長前打音は主音の半分の長さで描く：主音の長さ → 1つ短い長さ
//   （付点の主音では、主音の3分の2 ＝ 付点を取った長さ。例：付点4分音符 → 4分音符）
const HALF_DURATION = { whole: "h", half: "q", quarter: "8", eighth: "16", "16th": "32", "32nd": "64" }; // 32分音符はステップ15-5

// alter（♯♭の数） → VexFlow の臨時記号の書き方（前打音の臨時記号に使う）（ステップ11-8a）
const ALTER_TO_VF = { "-2": "bb", "-1": "b", 0: "n", 1: "#", 2: "##" };

// ----------------------------------------------------------
// 関数：vexStemDirection
// 決めた符尾の向き（"up"・"down"・null）を、VexFlow の書き方にする（ステップ22）
//   VF  … VexFlow の部品一式
//   dir … stems.js の measureStemDirections で決めた向き
// 戻り値：VF.Stem.UP・VF.Stem.DOWN・null（null は自動で決める）
// ----------------------------------------------------------
export function vexStemDirection(VF, dir) {
  if (dir === "up") return VF.Stem.UP;
  if (dir === "down") return VF.Stem.DOWN;
  return null;
}

// ----------------------------------------------------------
// 関数：createNote
// 音符・休符1つ分のデータから VexFlow の音符を作る
//   VF         … VexFlow の部品一式
//   note       … 音符1つ分のデータ
//   clef       … 今の音部記号（'treble' など）
//   accidentals … 高さごと（低い順）に付ける臨時記号の配列（'#'・'b'・'n' など。付けない高さは null）
//                 （ステップ14-1：重音のため、1つの記号から配列に変えた。accidentals.js の computeAccidentals で決めたもの）
//   keySignature … 今の調号（前打音の臨時記号を決めるのに使う）（ステップ11-8a）
//   measureRest  … 小節まるごとの休符として描くか（model.js の isMeasureRest で調べたもの）（ステップ13-3）
//   stemDirection … 符尾の向き（VF.Stem.UP・VF.Stem.DOWN）。省略したら自動で決める（2音トレモロで使う）（ステップ14-6a）
//                   （ステップ22：［符尾↑］［符尾↓］で決めた向きも、ここで渡す。stems.js の measureStemDirections で決めたもの）
// 2音トレモロの音符は、下の音の音符を返す。上の音の音符は、その音符の alternate に入れておく（render/alternate.js）
// ----------------------------------------------------------
export function createNote(VF, note, clef, accidentals = [], keySignature = 0, measureRest = false, stemDirection = null) {
  // 小節まるごとの休符：拍子に関係なく、全休符を小節のまん中に描く（ステップ13-3）
  if (measureRest) return createMeasureRest(VF, note, clef);

  // 2音トレモロ：下の音と上の音を、別々の音符として作る（ステップ14-6a）
  // （ステップ22：決めた符尾の向きがあれば、それも渡す）
  if (isAlternate(note)) return createAlternate(VF, note, clef, accidentals, keySignature, stemDirection);

  // VexFlow での長さの書き方（例：'q'）
  let duration = DURATIONS[note.duration].vf;
  // 付点の数だけ 'd' を付ける（例：'qd' は付点4分音符）
  // これで VexFlow が音の長さを正しく計算できる
  duration = duration + "d".repeat(note.dots ?? 0);
  // 休符なら後ろに 'r' を付ける（例：'qr' は4分休符）
  if (note.rest) {
    duration = duration + "r";
  }

  // 音の高さ（休符は五線のまん中に置く）
  // 重音なら、高さを低い順に全部並べる（VexFlow は keys に並べた高さの玉を、1本の符尾にまとめて描く）（ステップ14-1）
  const keys = note.rest ? [CLEFS[clef].restKey] : notePitches(note).map((pitch) => pitchToVexKey(pitch));
  // ハーモニクスで軽く触れる玉（diamond の付いた高さ）を、白抜きのひし形にする（ステップ14-5a）
  //   VexFlow では、高さのうしろに「/玉の形の記号」を付けると玉の形を変えられる
  //   D1 … 白抜きのひし形（2分音符の形）、D0 … 全音符のひし形（触れる音は、長さにかかわらず白抜きで書く決まり）
  if (!note.rest) {
    notePitches(note).forEach((pitch, k) => {
      if (pitch.diamond) keys[k] = keys[k] + (note.duration === "whole" ? "/D0" : "/D1");
    });
  }

  // VexFlow の音符を作る
  const staveNote = new VF.StaveNote({
    keys: keys, // 音の高さ（重音なら2つ以上）
    duration: duration, // 長さ
    clef: CLEFS[clef].vf, // 音部記号（これで五線上の位置が決まる）
    // 符尾（棒）の向き：決めてあればその向き、なければ自動で決める（ステップ14-6a）
    ...(stemDirection ? { stemDirection: stemDirection } : { autoStem: true }),
  });

  // 全音符のひし形の玉を、ふつうの全音符の玉のまん中にそろえる（後で直す候補の手直し）
  if (!note.rest && note.duration === "whole") centerWholeDiamonds(VF, staveNote, note);

  // 臨時記号を、高さごとに付ける（addModifier の2つ目の数は「keys の何番目の玉か」）（ステップ14-1）
  // 重音で臨時記号が重なるときは、VexFlow が左右にずらして並べてくれる
  (accidentals ?? []).forEach((accidental, index) => {
    if (accidental) staveNote.addModifier(new VF.Accidental(accidental), index);
  });

  // 付点の「点」を描くための部品を付ける（長さの計算は上の 'd' で済んでいる）
  // all: true … 重音なら、全部の玉に点を付ける（ステップ14-1）
  for (let i = 0; i < (note.dots ?? 0); i++) {
    VF.Dot.buildAndAttach([staveNote], { all: true });
  }

  // 記号（弓・指番号・アーティキュレーションなど）を付ける（休符には付けない）
  if (!note.rest) {
    addSymbols(VF, staveNote, note);
  }

  // 前打音を付ける（休符には付けない）（ステップ11-8a）
  if (!note.rest && note.grace) {
    addGraceNote(VF, staveNote, note, clef, keySignature);
  }

  return staveNote;
}

// ----------------------------------------------------------
// 関数：centerWholeDiamonds
// 全音符のひし形の玉（D0）を、ふつうの全音符の玉のまん中にそろえる（後で直す候補の手直し）
//   VexFlow は玉の「左の端」をそろえて描く。全音符のひし形は、ふつうの全音符の玉より細い（約11px と約17px）ので、
//   そのままだと、まん中が少し左にずれて見える（人工ハーモニクスで、下のふつうの玉とくらべると目立つ）
//   → 玉の幅の差の半分だけ、右へずらす（setXShift）
//   （2分音符のひし形 D1 は、ふつうの2分音符の玉とほぼ同じ幅なので、ずらさない）
//   VexFlow は、符尾の向きを決め直すとき（連桁を作る Beam.generateBeams など）に reset で玉を作り直し、
//   ずらした量が消えてしまう → この音符の reset を包んで、作り直したあとにもう一度ずらす
//   VF        … VexFlow の部品一式
//   staveNote … 作った VexFlow の音符
//   note      … 音符1つ分のデータ
// ----------------------------------------------------------
function centerWholeDiamonds(VF, staveNote, note) {
  const pitches = notePitches(note);
  if (!pitches.some((pitch) => pitch.diamond)) return; // ひし形の玉がなければ何もしない

  // ふつうの全音符の玉の幅（仮の音符を作って測る）
  const wholeWidth = new VF.StaveNote({ keys: ["b/4"], duration: "w" }).noteHeads[0].getWidth();

  // ひし形の玉をずらす（noteHeads は keys と同じ順（低い順）に並んでいる）
  const shiftHeads = () => {
    pitches.forEach((pitch, k) => {
      if (!pitch.diamond) return;
      const head = staveNote.noteHeads[k];
      head.setXShift((wholeWidth - head.getWidth()) / 2);
    });
  };
  shiftHeads();

  // 玉が作り直されたら、もう一度ずらす（元の reset を呼んでから shiftHeads）
  const originalReset = staveNote.reset.bind(staveNote);
  staveNote.reset = () => {
    const result = originalReset();
    shiftHeads();
    return result;
  };
}

// ----------------------------------------------------------
// 関数：createAlternate
// 2音トレモロの音符を、下の音と上の音の2つの VexFlow の音符にする（ステップ14-6a）
//   ・符尾の向きは、2つの音をまとめて自動で決めた向きにそろえる
//     （ステップ22：stemDirection（［符尾↑］［符尾↓］で決めた向き）が渡されたら、その向きにする）
//   ・記号（弓・指番号・強弱など）は、下の音の音符にだけ付ける
//   ・トレモロの斜線は描かない（2つの音符の間の連桁で表す。render/alternate.js で描く）
//   ・臨時記号は、高さごと（低い順）に決めたものを、それぞれの音符に付ける
// 戻り値：下の音の VexFlow の音符（上の音の音符は alternate に入っている）
// ----------------------------------------------------------
function createAlternate(VF, note, clef, accidentals, keySignature, stemDirection = null) {
  const [lowPitch, highPitch] = notePitches(note);
  const marks = accidentals ?? [];

  // 2つの音をまとめた向き（重音として仮に作って、VexFlow に決めさせる）
  const duration = DURATIONS[note.duration].vf + "d".repeat(note.dots ?? 0);
  const probe = new VF.StaveNote({ keys: [pitchToVexKey(lowPitch), pitchToVexKey(highPitch)], duration: duration, clef: CLEFS[clef].vf, autoStem: true });
  // 決めた向きがあれば、そちらを使う（ステップ22）
  const direction = stemDirection ?? probe.getStemDirection();

  // 下の音：記号も付ける（重音・2音トレモロ・トレモロの印は外したデータで作る）
  const lowData = { ...note, pitch: lowPitch };
  delete lowData.chord;
  delete lowData.alternate;
  delete lowData.tremolo;
  const mainNote = createNote(VF, lowData, clef, [marks[0] ?? null], keySignature, false, direction);

  // 上の音：高さ・長さだけ（記号は付けない）
  const highData = { pitch: highPitch, duration: note.duration, dots: note.dots ?? 0 };
  const partnerNote = createNote(VF, highData, clef, [marks[1] ?? null], keySignature, false, direction);

  attachAlternate(mainNote, partnerNote, note.tremolo, !!marks[1], note.dots ?? 0, note.duration === "whole");
  return mainNote;
}

// ----------------------------------------------------------
// 関数：createMeasureRest
// 小節まるごとの休符を作る（ステップ13-3）
//   ・見た目は全休符（第4線からぶら下げる）で、小節のまん中に置く（alignCenter）
//   ・長さは、データの長さ（3拍子なら付点2分休符の長さ）にする
//     （全休符の長さのままだと、3拍子の小節に入りきらないと VexFlow に言われてしまうため。setIntrinsicTicks で長さだけ入れ替える）
//   note … 休符のデータ
//   clef … 今の音部記号
// ----------------------------------------------------------
function createMeasureRest(VF, note, clef) {
  // データどおりの長さの休符を仮に作って、その長さ（VexFlow のティック）を調べる
  const duration = DURATIONS[note.duration].vf + "d".repeat(note.dots ?? 0) + "r";
  const ticks = new VF.StaveNote({ keys: [CLEFS[clef].restKey], duration: duration, clef: CLEFS[clef].vf }).getTicks().value();

  // 全休符を作って、長さだけデータどおりにする
  const staveNote = new VF.StaveNote({
    keys: [CLEFS[clef].measureRestKey],
    duration: "wr",
    clef: CLEFS[clef].vf,
    alignCenter: true, // 小節のまん中に置く
  });
  staveNote.setIntrinsicTicks(ticks);
  return staveNote;
}

// ----------------------------------------------------------
// 関数：addGraceNote
// 主音のすぐ左に、前打音の小さな音符を付ける（主音とはスラーでつなぐ）（ステップ11-8a）
//   ・短前打音 … 斜線の付いた小さな8分音符
//   ・長前打音 … 斜線のない小さな音符（主音の半分の長さ。付点の主音なら付点を取った長さ）
// 臨時記号は、調号と違う ♯♭ のときだけ付ける（小節の中の、前の臨時記号は見ない）
// （ステップ24-2：前打音の重音（grace.chord）も描く。臨時記号は玉ごとに決める。前打音の指番号（grace.fingerings）も上に書く）
//   staveNote … 主音（VexFlow の音符）
//   note      … 主音のデータ（note.grace に前打音が入っている）
//   clef      … 今の音部記号
//   keySignature … 今の調号
// ----------------------------------------------------------
function addGraceNote(VF, staveNote, note, clef, keySignature) {
  const grace = note.grace;
  const isShort = grace.type === "short";
  // 小さな音符の長さ
  let duration = "8";
  if (!isShort) {
    duration = (note.dots ?? 0) > 0 ? DURATIONS[note.duration].vf : (HALF_DURATION[note.duration] ?? "8");
  }

  // 前打音の高さ（重音なら低い順に全部。前打音も { pitch, chord } の形なので notePitches が使える）（ステップ24-2）
  const gracePitches = notePitches(grace);
  const graceNote = new VF.GraceNote({
    keys: gracePitches.map((pitch) => pitchToVexKey(pitch)),
    duration: duration,
    clef: CLEFS[clef].vf,
    slash: GRACES[grace.type]?.slash ?? isShort, // 短前打音だけ斜線
    stemDirection: VF.Stem.UP, // 前打音の符尾は上向きにそろえる
  });

  // 臨時記号：調号どおりでなければ付ける（重音なら玉ごとに。addModifier の2つ目の数は「何番目の玉か」）（ステップ24-2）
  gracePitches.forEach((pitch, index) => {
    const alter = pitch.alter ?? 0;
    if (alter !== keyAlters(keySignature)[pitch.step]) {
      graceNote.addModifier(new VF.Accidental(ALTER_TO_VF[alter] ?? "n"), index);
    }
  });

  // 前打音の指番号：前打音の上に小さい数字で書く（複数あれば、付けた順に下から積み重ねる）（ステップ24-2）
  for (const number of grace.fingerings ?? []) {
    const fingering = new VF.Annotation(String(number));
    fingering.setFont("Academico", 11);
    fingering.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    graceNote.addModifier(fingering, 0);
  }

  // 前打音のまとまりを作って、主音に付ける（true：主音とスラーでつなぐ）
  const group = new VF.GraceNoteGroup([graceNote], true);

  // まとまりの「囲む四角」を、前打音の小さな音符の四角にする
  // （VexFlow のままだと、まとまり自体には位置がないので (0, 0) からの四角になり、
  //   主音の四角が楽譜の左上まで広がってしまう。そうなると、クリックの当たり判定や、
  //   かっこ・テンポの指示の高さを決めるときに、ずれてしまう）
  // 前打音がまだ描かれていない（位置が決まっていない）ときは、主音の玉の所の点にしておく
  group.getBoundingBox = () => {
    if (graceNote.isRendered()) return graceNote.getBoundingBox();
    return new VF.BoundingBox(staveNote.getAbsoluteX(), staveNote.getYs()[0], 0, 0);
  };

  staveNote.addModifier(group, 0);

  // 主音に、前打音の小さな音符を覚えさせておく（ステップ24-1）
  // （前打音を選んだときに青くする・クリックの当たり判定を作るのに、render.js で使う。graceOf で取り出す）
  staveNote.graceNote = graceNote;
}

// ----------------------------------------------------------
// 関数：graceOf
// 主音（VexFlow の音符）に付けた、前打音の小さな音符を返す（前打音がなければ null）（ステップ24-1）
// ----------------------------------------------------------
export function graceOf(staveNote) {
  return staveNote.graceNote ?? null;
}
