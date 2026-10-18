// ==========================================================
// musicxml.js
// 楽譜データと MusicXML（ほかの楽譜アプリと楽譜をやりとりするための形）を変換する
// （ステップ8-1：書き出しの基本（タイトル・作曲者・テンポ・パート・拍子・調・音部記号・音符・休符・付点・タイ））
// （ステップ8-1b：コモンタイム（C）・カットタイム（¢）の拍子記号）
// （ステップ8-2：記号（弓・指番号・スタッカートなど・フェルマータ・pizz./arco・強弱・スラー・松葉））
// （ステップ14-3：重音。1つ目の音の <note> のあとに、<chord/> を付けた <note> を低い順に並べる）
// （ステップ14-4b：アルペジオ。重音の全部の音の <notations> に <arpeggiate/> を書く）
// （ステップ14-5b：ハーモニクスのひし形の玉。その高さの <note> に <notehead>diamond</notehead> を書く）
// （ステップ14-6b：2音トレモロ。2つの <note> の組にして、<tremolo type="start">・<tremolo type="stop"> を書く）
// （ステップ15-3：アウフタクト。1小節目を <measure number="0" implicit="yes"> にして、次の小節から 1, 2, 3… と数える）
//   implicit="yes" … 「小節番号として数えない小節」という MusicXML の決まり
// （ステップ16-2：松葉に番号（number）を付けて、同じ音符での「＜の終わり → ＞の始まり」と、1つの音符の下だけの松葉を書く）
// （ステップ19-2：連桁を <beam> で書く。画面と同じつなぎ方（手で変えた所も）がほかのアプリでも同じになるように）
//   番号が 1 のときは書かない（書かなければ 1 という決まり。今までの楽譜の書き出しは変わらない）
// （ステップ22：［符尾↑］［符尾↓］で決めた符尾の向きを <stem> で書く。自動の音符には書かない（ほかのアプリが自動で決める））
//
// 【MusicXML の形（パートごとに小節を並べる「score-partwise」という形を使う）】
//   <score-partwise>
//     <work>タイトル</work>
//     <identification>作曲者</identification>
//     <part-list>パートの一覧</part-list>
//     <part id="P1">
//       <measure number="1">
//         <attributes>長さの単位・調・拍子・音部記号</attributes>
//         <direction>テンポ・強弱・pizz.・松葉など（音符の前に置く）</direction>
//         <note>音符・休符（スラー・弓・指番号などは、音符の中の <notations> に書く）</note> …
//       </measure> …
//     </part> …
//   </score-partwise>
//
// 【長さの書き方】
//   MusicXML では「4分音符をいくつに分けるか（divisions）」を先に決めて、
//   音の長さをその数で書く。divisions を 4 にすると 16分音符＝1 になる
//   連符があると 4 では割り切れないので、楽譜ごとに「全部の長さが整数になる数」を決める（ステップ10-5）
//     例：連符なし → 4、8分音符の3連符あり → 12（3連符の8分音符1つ = 4）
//
// 【連符の書き方】（ステップ10-5）
//   連符の音には <time-modification>（3連符なら「2個分に3個」）を書く
//   連符の最初の音に <tuplet type="start">、最後の音に <tuplet type="stop"> を書く（<notations> の中）
// ==========================================================

import {
  INSTRUMENTS,
  noteTicks,
  timeAt,
  keyAt,
  tempoAt,
  TICKS_PER_16TH,
  tupletGroups,
  JUMP_TEXTS,
  rehearsalLabel,
  isMeasureRest,
  notePitches,
  samePitch,
  isAlternate,
  hasPickup,
  measureNumber,
  measureOffset,
} from "./model.js";
import { measureBeamGroups, beamXmlValues } from "./beams.js"; // 連桁のつなぎ方（ステップ19-2）
import { measureStemDirections } from "./stems.js"; // 決めた符尾の向き（ステップ22）
import { computeAccidentals, keyAlters } from "./accidentals.js";
import { BOWINGS, ARTICULATIONS, STRING_MARKS, BREATHS, ORNAMENTS, FERMATA, GLISSANDO, TECHNIQUES, DYNAMICS, ARPEGGIO } from "./symbols.js";

// 4分音符1つ分のティック
const QUARTER_TICKS = 4 * TICKS_PER_16TH;

// ----------------------------------------------------------
// 関数：gcd
// 2つの整数の最大公約数（両方を割り切れる一番大きい数）を求める（ステップ10-5）
// 例：(12, 8) → 4
// ----------------------------------------------------------
function gcd(a, b) {
  while (b !== 0) {
    const r = a % b;
    a = b;
    b = r;
  }
  return a;
}

// ----------------------------------------------------------
// 関数：scoreDivisions
// この楽譜の divisions（4分音符をいくつに分けるか）を決める（ステップ10-5）
// 全部の音の長さが整数で書ける、一番小さい数にする（ただし 4 より小さくはしない）
//   考え方：音の長さ ÷ 4分音符の長さ × divisions が整数になればよい
//           → divisions は「4分音符の長さ ÷ (音の長さと4分音符の長さの最大公約数)」で割り切れればよい
//           → 全部の音について、その数の最小公倍数をとる
// 例：連符なし → 4、8分音符の3連符 → 12、16分音符の5連符 → 20
// ----------------------------------------------------------
function scoreDivisions(score) {
  let divisions = 4; // 今までと同じ 4 から始める（16分音符＝1）
  score.parts.forEach((part) => {
    part.measures.forEach((measure) => {
      measure.notes.forEach((note) => {
        const need = QUARTER_TICKS / gcd(noteTicks(note), QUARTER_TICKS);
        // 最小公倍数 = a × b ÷ 最大公約数
        divisions = (divisions * need) / gcd(divisions, need);
      });
    });
  });
  return divisions;
}

// ----------------------------------------------------------
// 音部記号の表（MusicXML では「記号の形（sign）」と「何本目の線か（line）」で書く）
//   ト音記号：G の形を第2線　アルト記号：C の形を第3線
//   テノール記号：C の形を第4線　ヘ音記号：F の形を第4線
// ----------------------------------------------------------
const CLEF_TO_XML = {
  treble: { sign: "G", line: 2 },
  alto: { sign: "C", line: 3 },
  tenor: { sign: "C", line: 4 },
  bass: { sign: "F", line: 4 },
};

// ----------------------------------------------------------
// 楽器の表（ほかのアプリが楽器を見分けられるように書いておく）
//   sound   … MusicXML で決められている楽器の名前
//   program … MIDI の楽器の番号（バイオリン 41・ビオラ 42・チェロ 43・コントラバス 44）
// （ステップ18-3：コントラバスを追加。1オクターブ下で鳴ることは、1小節目の <attributes> に <transpose> で書く）
// ----------------------------------------------------------
const INSTRUMENT_TO_XML = {
  violin: { sound: "strings.violin", program: 41 },
  viola: { sound: "strings.viola", program: 42 },
  cello: { sound: "strings.cello", program: 43 },
  contrabass: { sound: "strings.contrabass", program: 44 },
};

// ----------------------------------------------------------
// 臨時記号の表（computeAccidentals の結果 → MusicXML の名前）
// ----------------------------------------------------------
const ACCIDENTAL_TO_XML = {
  "#": "sharp",
  b: "flat",
  n: "natural",
  "##": "double-sharp",
  bb: "flat-flat",
};

// ----------------------------------------------------------
// 関数：escapeXml
// 文字の中の & < > " ' を、XML で使える書き方に置きかえる
// （タイトルに「&」などが入っていても、ファイルが壊れないようにする）
// 例："Tom & Jerry" → "Tom &amp; Jerry"
// ----------------------------------------------------------
function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;") // & は最初に置きかえる（あとで足す &lt; などの & まで変えないように）
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ----------------------------------------------------------
// 関数：todayText
// 今日の日付を「2026-10-15」の形の文字にする（MusicXML に書き出した日として入れる）
// ----------------------------------------------------------
function todayText() {
  const date = new Date();
  // padStart(2, "0")：1けたのときは前に 0 を付けて2けたにする（9 → "09"）
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

// ----------------------------------------------------------
// 関数：partListXml
// パートの一覧（<part-list>）を作る
// パートの id は上から "P1"・"P2"… にする
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function partListXml(score) {
  const lines = [];
  lines.push("  <part-list>");
  score.parts.forEach((part, p) => {
    const id = `P${p + 1}`;
    const info = INSTRUMENT_TO_XML[part.instrument];
    lines.push(`    <score-part id="${id}">`);
    lines.push(`      <part-name>${escapeXml(part.name)}</part-name>`);
    lines.push(`      <part-abbreviation>${escapeXml(part.abbreviation)}</part-abbreviation>`);
    // 楽器の情報（ほかのアプリで開いたときに、バイオリンなどの音で鳴るようにする）
    lines.push(`      <score-instrument id="${id}-I1">`);
    lines.push(`        <instrument-name>${escapeXml(INSTRUMENTS[part.instrument].name)}</instrument-name>`);
    lines.push(`        <instrument-sound>${info.sound}</instrument-sound>`);
    lines.push("      </score-instrument>");
    lines.push(`      <midi-instrument id="${id}-I1">`);
    lines.push(`        <midi-channel>${p + 1}</midi-channel>`);
    lines.push(`        <midi-program>${info.program}</midi-program>`);
    lines.push("      </midi-instrument>");
    lines.push("    </score-part>");
  });
  lines.push("  </part-list>");
  return lines;
}

// ----------------------------------------------------------
// 関数：attributesXml
// 小節の頭に書く「長さの単位・調・拍子・音部記号」（<attributes>）を作る
// 変わらないものは書かない。何も書くものがなければ空の配列を返す
//   isFirst … 1小節目か（1小節目には divisions も書く）
//   key     … 調号（変わらないときは undefined）
//   time    … 拍子（変わらないときは undefined）
//   clef    … 音部記号（変わらないときは undefined）
//   divisions … 4分音符をいくつに分けるか（scoreDivisions で決めたもの）（ステップ10-5）
//   soundOctaves … 鳴る高さが、書いた高さから何オクターブずれるか（コントラバスは −1）（ステップ18-3）
//                  1小節目で 0 でなければ <transpose> を書く（ほかのアプリが、1オクターブ下で鳴らせるように）
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function attributesXml(isFirst, key, time, clef, divisions, soundOctaves = 0) {
  if (!isFirst && key === undefined && !time && !clef) return [];

  // 書く順番は MusicXML の決まり（divisions → key → time → clef → transpose）に合わせる
  const lines = [];
  lines.push("      <attributes>");
  if (isFirst) lines.push(`        <divisions>${divisions}</divisions>`);
  if (key !== undefined) {
    // fifths：♯の数はプラス、♭の数はマイナス（このアプリの key と同じ）
    lines.push("        <key>");
    lines.push(`          <fifths>${key}</fifths>`);
    lines.push("        </key>");
  }
  if (time) {
    // コモンタイム・カットタイムは symbol で記号を指定する（数字の 4/4・2/2 も一緒に書く決まり）
    const symbol = time.symbol ? ` symbol="${time.symbol}"` : "";
    lines.push(`        <time${symbol}>`);
    lines.push(`          <beats>${time.beats}</beats>`);
    lines.push(`          <beat-type>${time.beatType}</beat-type>`);
    lines.push("        </time>");
  }
  if (clef) {
    const c = CLEF_TO_XML[clef];
    lines.push("        <clef>");
    lines.push(`          <sign>${c.sign}</sign>`);
    lines.push(`          <line>${c.line}</line>`);
    lines.push("        </clef>");
  }
  // 1オクターブ下で鳴る楽器（コントラバス）（ステップ18-3）
  //   diatonic・chromatic … 音名・半音でのずれ（オクターブだけずれるので 0）
  //   octave-change       … オクターブのずれ（−1 ＝ 1オクターブ下で鳴る）
  if (isFirst && soundOctaves !== 0) {
    lines.push("        <transpose>");
    lines.push("          <diatonic>0</diatonic>");
    lines.push("          <chromatic>0</chromatic>");
    lines.push(`          <octave-change>${soundOctaves}</octave-change>`);
    lines.push("        </transpose>");
  }
  lines.push("      </attributes>");
  return lines;
}

// ----------------------------------------------------------
// 関数：tempoMarksXml
// 2小節目からの、テンポの指示の <direction> を作る（いちばん上のパートの、小節の頭に書く）（ステップ11-6c）
//   ・途中のテンポ変更 … 1小節目と同じ形（tempoXml）
//   ・a tempo          … <words>a tempo</words>
//   ・rit.・accel.     … <words>rit.</words> と、点線の始まり <dashes type="start"/>
//                        （点線の終わりは、範囲の終わりの小節の最後に gradualEndXml で書く）
// rit.・accel. のだんだん変わる速さは、MusicXML に再生の速さとして書く決まった形がないので、文字と点線だけ書く
//   score … 楽譜データ
//   i     … 何小節目か（0 から。1小節目は tempoXml で書くので、ここでは何も書かない）
// 戻り値：XML の行の配列（何もなければ空の配列）
// ----------------------------------------------------------
function tempoMarksXml(score, i) {
  const lines = [];
  if (i === 0) return lines;
  const info = score.measures[i];

  // ① 途中のテンポ変更
  if (info.tempo !== undefined) lines.push(...tempoXml(tempoAt(score, i)));

  // ② a tempo
  if (info.aTempo) {
    lines.push(`      <direction placement="above">`);
    lines.push("        <direction-type>");
    lines.push("          <words>a tempo</words>");
    lines.push("        </direction-type>");
    lines.push("      </direction>");
  }

  // ③ rit.・accel. の始まり（文字と、点線の始まり）
  if (info.gradual) {
    const text = info.gradual === "rit" ? "rit." : "accel.";
    lines.push(`      <direction placement="above">`);
    lines.push("        <direction-type>");
    lines.push(`          <words font-style="italic">${text}</words>`);
    lines.push("        </direction-type>");
    lines.push("        <direction-type>");
    lines.push(`          <dashes type="start" number="1"/>`);
    lines.push("        </direction-type>");
    lines.push("      </direction>");
  }
  return lines;
}

// ----------------------------------------------------------
// 関数：gradualEndXml
// rit.・accel. の点線の終わり <dashes type="stop"/> を作る（範囲の終わりの小節の、最後の音のあとに書く）（ステップ11-6c）
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function gradualEndXml() {
  return ["      <direction>", "        <direction-type>", `          <dashes type="stop" number="1"/>`, "        </direction-type>", "      </direction>"];
}

// ----------------------------------------------------------
// 関数：jumpStartXml
// 小節の頭の 𝄋（Segno）・𝄌（Coda）の <direction> を作る（いちばん上のパートの、小節の頭に書く）（ステップ11-7c）
//   見た目の印（<segno/>・<coda/>）と、ほかのアプリが再生に使う印（<sound segno>・<sound coda>）を両方書く
// （ステップ11-7d：練習番号 <rehearsal> も、いちばん先に書く。四角で囲む形 enclosure="square"）
//   score … 楽譜データ（練習番号の文字を数えるのに使う）
//   i     … 何小節目か
// 戻り値：XML の行の配列（何もなければ空の配列）
// ----------------------------------------------------------
function jumpStartXml(score, i) {
  const info = score.measures[i];
  const lines = [];
  if (info.rehearsal) {
    lines.push(`      <direction placement="above">`);
    lines.push("        <direction-type>");
    lines.push(`          <rehearsal enclosure="square">${rehearsalLabel(score.measures, i)}</rehearsal>`);
    lines.push("        </direction-type>");
    lines.push("      </direction>");
  }
  if (info.segno) {
    lines.push(`      <direction placement="above">`);
    lines.push("        <direction-type>");
    lines.push("          <segno/>");
    lines.push("        </direction-type>");
    lines.push(`        <sound segno="segno"/>`);
    lines.push("      </direction>");
  }
  if (info.coda) {
    lines.push(`      <direction placement="above">`);
    lines.push("        <direction-type>");
    lines.push("          <coda/>");
    lines.push("        </direction-type>");
    lines.push(`        <sound coda="coda"/>`);
    lines.push("      </direction>");
  }
  return lines;
}

// ----------------------------------------------------------
// 関数：jumpEndXml
// 小節の終わりの To Coda・Fine・D.C.・D.S. の <direction> を作る（いちばん上のパートの、最後の音のあとに書く）（ステップ11-7c）
//   見た目の文字（<words>）と、ほかのアプリが再生に使う印（<sound>）を両方書く
//     To Coda … tocoda="coda"（𝄌 の小節へ飛ぶ）
//     Fine    … fine="yes"（ここで終わる）
//     D.C.    … dacapo="yes"（曲の頭へ戻る）
//     D.S.    … dalsegno="segno"（𝄋 へ戻る）
//   info … 小節の情報（score.measures[i]）
// 戻り値：XML の行の配列（何もなければ空の配列）
// ----------------------------------------------------------
function jumpEndXml(info) {
  // 書くものを { text: 文字, sound: <sound> に付けるもの } の形で並べる
  const items = [];
  if (info.toCoda) items.push({ text: "To Coda", sound: `tocoda="coda"` });
  if (info.fine) items.push({ text: "Fine", sound: `fine="yes"` });
  if (info.jump) {
    const sound = info.jump.startsWith("ds") ? `dalsegno="segno"` : `dacapo="yes"`;
    items.push({ text: JUMP_TEXTS[info.jump] ?? info.jump, sound: sound });
  }

  const lines = [];
  items.forEach((item) => {
    lines.push(`      <direction placement="above">`);
    lines.push("        <direction-type>");
    lines.push(`          <words font-style="italic">${escapeXml(item.text)}</words>`);
    lines.push("        </direction-type>");
    lines.push(`        <sound ${item.sound}/>`);
    lines.push("      </direction>");
  });
  return lines;
}

// ----------------------------------------------------------
// 関数：tempoXml
// テンポ（速度記号と ♩ = ○○）の <direction> を作る（1小節目の一番上のパートにだけ書く）
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function tempoXml(score) {
  const lines = [];
  lines.push(`      <direction placement="above">`);
  // 速度記号の文字（"Allegro" など。空なら書かない）
  if (score.tempoText) {
    lines.push("        <direction-type>");
    lines.push(`          <words font-weight="bold">${escapeXml(score.tempoText)}</words>`);
    lines.push("        </direction-type>");
  }
  // ♩ = ○○ の表示
  lines.push("        <direction-type>");
  lines.push("          <metronome>");
  lines.push("            <beat-unit>quarter</beat-unit>");
  lines.push(`            <per-minute>${score.tempo}</per-minute>`);
  lines.push("          </metronome>");
  lines.push("        </direction-type>");
  // 再生の速さ（表示とは別に、ほかのアプリが再生するときの速さ）
  lines.push(`        <sound tempo="${score.tempo}"/>`);
  lines.push("      </direction>");
  return lines;
}

// ----------------------------------------------------------
// 関数：noteXml
// 音符・休符1つ分の <note> を作る
//   note       … 音符・休符のデータ
//   accidental … 表示する臨時記号（"#"・"b"・"n" など。付けないときは null）
//   tieStop    … 前の音からタイでつながってきているか
//   divisions  … 4分音符をいくつに分けるか（ステップ10-5）
//   tupletMark … 連符の中の音なら { actual, normal, start, stop, bracket }、そうでなければ null（ステップ10-5）
//                start … 連符の最初の音か　stop … 連符の最後の音か　bracket … 括弧を付けるか
//   measureRest … 小節まるごとの休符か（true なら <rest measure="yes"/> にして、形 <type> は書かない）（ステップ13-3）
//   chordMember … 重音の2つ目からの音か（true なら <chord/> の印を書く。「前の音と同時に鳴る」という意味）（ステップ14-3）
//   beams     … この音に書く連桁 [{ number: 何本目か, value: "begin" など }, ...]（なければ空の配列）（ステップ19-2）
//   stem      … 決めた符尾の向き（"up"・"down"。自動なら null で、<stem> を書かない）（ステップ22）
// 重音のときは、高さ1つ分ずつの「書き出し用の音」を作って、この関数を高さの数だけ呼ぶ（partXml を参照）
//   書き出し用の音の pitch はその高さ、tie は「その高さが次の音へタイでつながるか」
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function noteXml(note, accidental, tieStop, divisions, tupletMark, measureRest = false, chordMember = false, beams = [], stem = null) {
  const lines = [];
  lines.push("      <note>");

  // 重音の2つ目からの音：高さの前に <chord/> を書く決まり（ステップ14-3）
  if (chordMember) lines.push("        <chord/>");

  // 高さ（休符なら <rest/>。小節まるごとの休符なら <rest measure="yes"/>（ステップ13-3））
  if (measureRest) {
    lines.push(`        <rest measure="yes"/>`);
  } else if (note.rest) {
    lines.push("        <rest/>");
  } else {
    const alter = note.pitch.alter ?? 0;
    lines.push("        <pitch>");
    lines.push(`          <step>${note.pitch.step}</step>`);
    if (alter !== 0) lines.push(`          <alter>${alter}</alter>`); // ♯♭がないときは書かない
    lines.push(`          <octave>${note.pitch.octave}</octave>`);
    lines.push("        </pitch>");
  }

  // 長さ（4分音符の長さを divisions とした数で書く）（ステップ10-5）
  //   例：divisions が 12 のとき、4分音符 → 12、3連符の8分音符 → 4
  lines.push(`        <duration>${(noteTicks(note) * divisions) / QUARTER_TICKS}</duration>`);

  // タイ（再生用の <tie>）。前からの「ここまで」を先に、次への「ここから」をあとに書く
  const tieStart = !note.rest && note.tie;
  if (tieStop) lines.push(`        <tie type="stop"/>`);
  if (tieStart) lines.push(`        <tie type="start"/>`);

  // 声部（このアプリは1パートに1声部だけなので、いつも 1）
  lines.push("        <voice>1</voice>");

  // 音符の形（データの名前は MusicXML と同じなので、そのまま書ける）と付点
  // 小節まるごとの休符は、形を書かない（長さ <duration> だけで決まる。ほかのアプリもこの書き方で全休符を描く）（ステップ13-3）
  if (!measureRest) {
    lines.push(`        <type>${note.duration}</type>`);
    for (let i = 0; i < (note.dots ?? 0); i++) {
      lines.push("        <dot/>");
    }
  }

  // 臨時記号（楽譜に表示するもの。このアプリの表示と同じものを書く）
  if (accidental) {
    lines.push(`        <accidental>${ACCIDENTAL_TO_XML[accidental]}</accidental>`);
  }

  // 連符：「normal 個分の長さに actual 個」（臨時記号のあとに書く決まり）（ステップ10-5）
  if (tupletMark) {
    lines.push("        <time-modification>");
    lines.push(`          <actual-notes>${tupletMark.actual}</actual-notes>`);
    lines.push(`          <normal-notes>${tupletMark.normal}</normal-notes>`);
    lines.push("        </time-modification>");
  }

  // 符尾の向き（連符の印のあと・<notehead> の前に書く決まり）（ステップ22）
  //   例：<stem>down</stem>
  //   重音のときは、高さ1つ分ずつの <note> の全部に同じ向きを書く
  if (!note.rest && !measureRest && stem) {
    lines.push(`        <stem>${stem}</stem>`);
  }

  // ひし形の玉（ハーモニクスで軽く触れる音）：玉の形を書く（ステップ14-5b）
  //   ・<notehead> は、連符の印のあと・<notations> の前に書く決まり
  //   ・意味の印 <harmonic> は書かない（ソフトによっては玉の上に「○」が出てしまうため。決めたことの A）
  //   ・重音のときは、高さ1つ分ずつの「書き出し用の音」で呼ばれるので、ひし形の高さの <note> にだけ書かれる
  if (!note.rest && !measureRest && note.pitch.diamond) {
    lines.push("        <notehead>diamond</notehead>");
  }

  // 連桁（<notehead> のあと・<notations> の前に書く決まり）（ステップ19-2）
  //   例：<beam number="1">begin</beam>
  beams.forEach((beam) => {
    lines.push(`        <beam number="${beam.number}">${beam.value}</beam>`);
  });

  // 音符に付く記号（タイの表示・スラー・アーティキュレーション・弓・指番号・フェルマータ・連符の始まりと終わり）
  lines.push(...notationsXml(note, tieStop, tieStart, tupletMark));

  lines.push("      </note>");
  return lines;
}

// 長前打音の小さな音符の形：主音の半分の長さ（画面の表示と同じ。render/notes.js を参照）（ステップ11-8b）
const HALF_TYPE = { whole: "half", half: "quarter", quarter: "eighth", eighth: "16th", "16th": "32nd", "32nd": "64th" }; // 32分音符はステップ15-5

// alter（♯♭の数） → MusicXML の臨時記号の名前（前打音の臨時記号に使う）（ステップ11-8b）
const ALTER_TO_XML = { "-2": "flat-flat", "-1": "flat", 0: "natural", 1: "sharp", 2: "double-sharp" };

// ----------------------------------------------------------
// 関数：graceXml
// 前打音の小さな音符の <note> を作る（主音の <note> のすぐ前に書く）（ステップ11-8b）
//   ・短前打音 … <grace slash="yes"/>（斜線あり）、8分音符の形
//   ・長前打音 … <grace/>（斜線なし）、主音の半分の長さの形（付点の主音なら、付点を取った形）
//   ・<duration> は書かない（前打音は小節の長さに数えない決まり）
//   ・主音とはスラーでつなぐ（ふつうのスラーと重ならないように、番号は 2）
//   ・臨時記号は、調号と違う ♯♭ のときだけ書く（画面の表示と同じ）
//   note         … 主音のデータ（note.grace に前打音が入っている）
//   keySignature … その小節の調号
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function graceXml(note, keySignature) {
  const grace = note.grace;
  const isShort = grace.type === "short";
  // 小さな音符の形
  let type = "eighth";
  if (!isShort) type = (note.dots ?? 0) > 0 ? note.duration : (HALF_TYPE[note.duration] ?? "eighth");
  const alter = grace.pitch.alter ?? 0;

  const lines = [];
  lines.push("      <note>");
  lines.push(isShort ? `        <grace slash="yes"/>` : "        <grace/>");
  lines.push("        <pitch>");
  lines.push(`          <step>${grace.pitch.step}</step>`);
  if (alter !== 0) lines.push(`          <alter>${alter}</alter>`);
  lines.push(`          <octave>${grace.pitch.octave}</octave>`);
  lines.push("        </pitch>");
  lines.push("        <voice>1</voice>");
  lines.push(`        <type>${type}</type>`);
  // 臨時記号：調号どおりでなければ書く
  if (alter !== keyAlters(keySignature)[grace.pitch.step]) {
    lines.push(`        <accidental>${ALTER_TO_XML[alter] ?? "natural"}</accidental>`);
  }
  lines.push("        <stem>up</stem>"); // 前打音の符尾は上向き（画面と同じ）
  lines.push("        <notations>");
  lines.push(`          <slur type="start" number="2"/>`);
  lines.push("        </notations>");
  lines.push("      </note>");
  return lines;
}

// ----------------------------------------------------------
// 関数：notationsXml
// 音符の中に書く記号の <notations> を作る（ステップ8-2）
//   note      … 音符・休符のデータ
//   tieStop   … 前の音からタイでつながってきているか
//   tieStart  … 次の音へタイでつながるか
//   tupletMark … 連符の情報（noteXml と同じ。連符でなければ null）（ステップ10-5）
// 中に書くもの（MusicXML の名前）
//   タイの表示 … <tied>（再生用の <tie> とは別に、表示用にも書く決まり）
//   連符       … <tuplet type="start"> ～ <tuplet type="stop">（ステップ10-5）
//   スラー     … <slur type="start"> ～ <slur type="stop">
//   スタッカートなど … <articulations> の中
//   弓・指番号 … <technical> の中（弦楽器の奏法の記号はここ）
//   フェルマータ … <fermata>
// 何もなければ空の配列を返す（<notations> 自体を書かない）
// ----------------------------------------------------------
function notationsXml(note, tieStop, tieStart, tupletMark) {
  const inner = []; // <notations> の中身

  // タイの表示
  if (tieStop) inner.push(`          <tied type="stop"/>`);
  if (tieStart) inner.push(`          <tied type="start"/>`);

  // 連符の始まりと終わり（ステップ10-5）
  if (tupletMark && tupletMark.start) {
    inner.push(`          <tuplet type="start" bracket="${tupletMark.bracket ? "yes" : "no"}"/>`);
  }
  if (tupletMark && tupletMark.stop) inner.push(`          <tuplet type="stop"/>`);

  // スラー（このアプリは同時に1本だけなので、番号はいつも 1）
  if (note.slur === "start") inner.push(`          <slur type="start" number="1"/>`);
  if (note.slur === "stop") inner.push(`          <slur type="stop" number="1"/>`);
  // 前打音から主音へのスラーの終わり（ふつうのスラーと重ならないように、番号は 2）（ステップ11-8b）
  if (!note.rest && note.grace) inner.push(`          <slur type="stop" number="2"/>`);

  // スタッカート・テヌート・アクセントなどと、ブレス・カエスーラ（symbols.js の musicxml の名前を使う）（ブレス・カエスーラはステップ11-1c）
  const articulations = note.articulations ?? [];
  if (articulations.length > 0 || note.breath) {
    inner.push("          <articulations>");
    articulations.forEach((name) => {
      inner.push(`            <${ARTICULATIONS[name].musicxml}/>`);
    });
    if (note.breath) inner.push(`            <${BREATHS[note.breath].musicxml}/>`);
    inner.push("          </articulations>");
  }

  // 弓（ダウン・アップ）と指番号、弦楽器の記号（ハーモニクス・左手ピチカート・バルトーク・ピチカート）（弦楽器の記号はステップ11-1b）
  const fingerings = note.fingerings ?? [];
  const stringMarks = note.stringMarks ?? [];
  if (note.bowing || fingerings.length > 0 || stringMarks.length > 0) {
    inner.push("          <technical>");
    if (note.bowing) inner.push(`            <${BOWINGS[note.bowing].musicxml}/>`);
    stringMarks.forEach((name) => {
      inner.push(`            <${STRING_MARKS[name].musicxml}/>`);
    });
    fingerings.forEach((finger) => {
      inner.push(`            <fingering>${finger}</fingering>`);
    });
    inner.push("          </technical>");
  }

  // 装飾（トリルなど）とトレモロ（ステップ11-3a・11-4）
  // トリルの波線は、タイから自動で描いているので書き出さない（読むアプリでは tr だけが出る）
  // トレモロは <tremolo type="single">斜線の本数</tremolo>（single：1つの音を刻むトレモロ）
  // 2音トレモロは、組の1つ目に type="start"、2つ目に type="stop"（中の数は連桁の本数）（ステップ14-6b）
  //   alternateMark は alternateParts で付けた、書き出すときだけの印（楽譜データには入っていない）
  if (note.ornament || note.tremolo || note.alternateMark) {
    inner.push("          <ornaments>");
    if (note.ornament) inner.push(`            <${ORNAMENTS[note.ornament].musicxml}/>`);
    if (note.tremolo) inner.push(`            <tremolo type="single">${note.tremolo}</tremolo>`);
    if (note.alternateMark) inner.push(`            <tremolo type="${note.alternateMark.type}">${note.alternateMark.count}</tremolo>`);
    inner.push("          </ornaments>");
  }

  // アルペジオ（ステップ14-4b）：重音のどの音にも書く（chordParts で、全部の音に arpeggio の印を付けてある）
  if (note.arpeggio) inner.push(`          <${ARPEGGIO.musicxml}/>`);

  // フェルマータ（upright：五線の上に付く、ふつうの向き）
  if (note.fermata) inner.push(`          <${FERMATA.musicxml} type="upright"/>`);

  // グリッサンド（ステップ11-5c）
  //   すべり始める音 … <glissando type="start">gliss.</glissando>（中の文字は、線の上に書く文字）
  //   次の音         … <glissando type="stop"/>
  //   line-type="solid" はまっすぐな線（このアプリのグリッサンドはいつもまっすぐな線）
  // glissStop・glissStart は、partXml で組を探して付けた印（楽譜データには入っていない）
  if (note.glissStop) inner.push(`          <${GLISSANDO.musicxml} type="stop" line-type="solid" number="1"/>`);
  if (note.glissStart) inner.push(`          <${GLISSANDO.musicxml} type="start" line-type="solid" number="1">${GLISSANDO.text}</${GLISSANDO.musicxml}>`);

  if (inner.length === 0) return [];
  return ["        <notations>", ...inner, "        </notations>"];
}

// ----------------------------------------------------------
// 関数：wedgeNumberAttr
// 松葉の <wedge> に付ける番号の文字（number="2" など）を作る（ステップ16-2）
// 番号が 1 のときは空の文字（書かなければ 1 という MusicXML の決まり）
//   number … 松葉の番号（1, 2, 3…）
// ----------------------------------------------------------
function wedgeNumberAttr(number) {
  return number && number !== 1 ? ` number="${number}"` : "";
}

// ----------------------------------------------------------
// 関数：wedgeXml
// 松葉の <direction> 1つ分を作る（ステップ16-2）
//   type   … "crescendo"（＜の始まり）・"diminuendo"（＞の始まり）・"stop"（終わり）
//   number … 松葉の番号（1 なら書かない）
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function wedgeXml(type, number) {
  return [`      <direction placement="below">`, "        <direction-type>", `          <wedge type="${type}"${wedgeNumberAttr(number)}/>`, "        </direction-type>", "      </direction>"];
}

// ----------------------------------------------------------
// 関数：wedgeNumbers
// パートの音を前から見て、松葉ごとに番号を決める（ステップ16-2）
// 同じ音符で「前の松葉の終わり」と「次の松葉の始まり」が重なるとき、どの始まりとどの終わりが組なのかを
// 番号で区別するため。番号は、そのとき使っていない、いちばん小さい数（1, 2, 3…）にする
//   partNotes … パートの音を、小節をまたいで1列に並べたもの
// 戻り値：Map（音符のデータ → { start, end, inside }）
//   start  … この音符から始まる松葉（wedge）の番号
//   end    … この音符で終わる松葉（wedgeEnd）の番号
//   inside … この音符の下だけの松葉（wedgeInside）の番号
// （松葉の付いていない音符は Map に入らない）
// ----------------------------------------------------------
function wedgeNumbers(partNotes) {
  const numbers = new Map();
  let openNumber = null; // 開いている（まだ終わっていない）松葉の番号（なければ null）

  // 使っている番号の一覧から、使っていない、いちばん小さい番号を探す
  const freeNumber = (used) => {
    let n = 1;
    while (used.includes(n)) n = n + 1;
    return n;
  };

  partNotes.forEach((note) => {
    const hasStart = note.wedge === "crescendo" || note.wedge === "diminuendo";
    const hasInside = note.wedgeInside === "crescendo" || note.wedgeInside === "diminuendo";
    if (!hasStart && !hasInside && !note.wedgeEnd) return;

    const used = openNumber === null ? [] : [openNumber]; // この音符の間、使っている番号
    const entry = {};
    // この音符から始まる松葉：前の松葉がこの音符で終わっていても、まだ使っている番号とは別にする
    if (hasStart) {
      entry.start = freeNumber(used);
      used.push(entry.start);
    }
    // この音符の下だけの松葉：開いている松葉・この音符から始まる松葉とも別にする
    if (hasInside) entry.inside = freeNumber(used);
    // この音符で終わる松葉：開いている松葉の番号（始まりがなければ 1。前と同じ書き出しになる）
    if (note.wedgeEnd) {
      entry.end = openNumber ?? 1;
      openNumber = null;
    }
    // この音符から始まった松葉は、次の音符からも開いたまま
    if (hasStart) openNumber = entry.start;

    numbers.set(note, entry);
  });

  return numbers;
}

// ----------------------------------------------------------
// 関数：directionsBeforeXml
// 音符の前に置く <direction>（強弱・pizz./arco・松葉の始まり）を作る（ステップ8-2）
// MusicXML では、強弱などは音符の中ではなく、音符の直前に「指示」として書く
//   note    … 音符・休符のデータ
//   numbers … この音符の松葉の番号 { start, end, inside }（wedgeNumbers で決めたもの。なければ空）（ステップ16-2）
// 戻り値：XML の行の配列（何もなければ空の配列）
// ----------------------------------------------------------
function directionsBeforeXml(note, numbers = {}) {
  const lines = [];

  // 強弱（pp〜ff・sf・fp）：五線の下に書く
  if (note.dynamic) {
    lines.push(`      <direction placement="below">`);
    lines.push("        <direction-type>");
    lines.push(`          <dynamics><${DYNAMICS[note.dynamic].musicxml}/></dynamics>`);
    lines.push("        </direction-type>");
    lines.push("      </direction>");
  }

  // 奏法の文字（pizz.・sul pont. など）：五線の上に文字で書く
  // pizz.・arco だけは、再生用に「はじく・弓で弾く」の印も付ける（ほかの文字は MusicXML に再生用の印がない）（ステップ11-2）
  (note.techniques ?? []).forEach((name) => {
    lines.push(`      <direction placement="above">`);
    lines.push("        <direction-type>");
    lines.push(`          <words>${escapeXml(TECHNIQUES[name].musicxml)}</words>`);
    lines.push("        </direction-type>");
    if (name === "pizz." || name === "arco") {
      const pizzicato = name === "pizz." ? "yes" : "no";
      lines.push(`        <sound pizzicato="${pizzicato}"/>`);
    }
    lines.push("      </direction>");
  });

  // 松葉の始まり（＜ は crescendo、＞ は diminuendo）：五線の下に書く
  // （ステップ16-2：番号を付ける。前の松葉がこの音符で終わっていても、ここで次の松葉を始められる）
  if (note.wedge === "crescendo" || note.wedge === "diminuendo") {
    lines.push(...wedgeXml(note.wedge, numbers.start));
  }

  // この音符の下だけの松葉の始まり（ステップ16-2）：音符のあとに同じ番号の終わりを書く（directionsAfterXml）
  if (note.wedgeInside === "crescendo" || note.wedgeInside === "diminuendo") {
    lines.push(...wedgeXml(note.wedgeInside, numbers.inside));
  }

  return lines;
}

// ----------------------------------------------------------
// 関数：directionsAfterXml
// 音符のあとに置く <direction>（松葉の終わり）を作る（ステップ8-2）
// 終わりの音の「あと」に置くと、松葉がその音の終わりまでのびる（このアプリの表示と同じ）
//   note    … 音符・休符のデータ
//   numbers … この音符の松葉の番号 { start, end, inside }（wedgeNumbers で決めたもの。なければ空）（ステップ16-2）
// 戻り値：XML の行の配列（何もなければ空の配列）
// （ステップ16-1：松葉の終わりは wedgeEnd に分けた）
// ----------------------------------------------------------
function directionsAfterXml(note, numbers = {}) {
  const lines = [];

  // この音符の下だけの松葉の終わり（ステップ16-2）
  // 前から続いてきた松葉の終わりより先に書く（読み込みで、先に「この音符の中の松葉」と分かるようにするため）
  if (note.wedgeInside === "crescendo" || note.wedgeInside === "diminuendo") {
    lines.push(...wedgeXml("stop", numbers.inside));
  }

  // 前から続いてきた松葉の終わり
  if (note.wedgeEnd) {
    lines.push(...wedgeXml("stop", numbers.end));
  }

  return lines;
}

// ----------------------------------------------------------
// 関数：barlineXml
// 小節の終わりの線（<barline>）を作る
//   isLast         … 最後の小節か（曲の終わりの線：細い線＋太い線）
//   nextKeyChanges … 次の小節で調が変わるか（複縦線：細い線2本）
// ふつうの小節線のときは空の配列を返す（書かなくてもふつうの線になる）
// （五線譜の表示（render.js）と同じ決め方）
// ----------------------------------------------------------
function barlineXml(isLast, nextKeyChanges, measureInfo = {}) {
  let style = null;
  // くり返しの終わり（:‖）は細い線＋太い線（ステップ11-7a）
  // 自分で決めた線（ステップ11-7a）：複縦線は light-light、終止線は light-heavy
  if (measureInfo.repeatEnd) style = "light-heavy";
  else if (measureInfo.barline === "double") style = "light-light";
  else if (measureInfo.barline === "final") style = "light-heavy";
  else if (isLast) style = "light-heavy";
  else if (nextKeyChanges) style = "light-light";

  // 中身（MusicXML の決まりで、線の形 → かっこ → くり返し の順に書く）
  const inner = [];
  if (style) inner.push(`        <bar-style>${style}</bar-style>`);
  // 1番・2番かっこの終わり（ステップ11-7b）：1番は閉じる（stop）、2番は開いたまま（discontinue）
  if (measureInfo.endingEnd) {
    const type = measureInfo.endingEnd === 1 ? "stop" : "discontinue";
    inner.push(`        <ending number="${measureInfo.endingEnd}" type="${type}"/>`);
  }
  // くり返しの終わりの「戻る」の印（ステップ11-7a）
  if (measureInfo.repeatEnd) inner.push(`        <repeat direction="backward"/>`);

  if (inner.length === 0) return [];
  return [`      <barline location="right">`, ...inner, "      </barline>"];
}

// ----------------------------------------------------------
// 関数：leftBarlineXml
// 小節の頭の <barline location="left"> を作る（くり返しの始まり・1番2番かっこの始まり）（ステップ11-7a・11-7b）
//   くり返しの始まり（‖:）… heavy-light（太い線＋細い線）と repeat forward（「ここから」の印）
//   かっこの始まり        … <ending number="1" type="start">1.</ending>
// 何もなければ空の配列
// ----------------------------------------------------------
function leftBarlineXml(measureInfo) {
  const inner = [];
  if (measureInfo.repeatStart) inner.push("        <bar-style>heavy-light</bar-style>");
  if (measureInfo.ending) inner.push(`        <ending number="${measureInfo.ending}" type="start">${measureInfo.ending}.</ending>`);
  if (measureInfo.repeatStart) inner.push(`        <repeat direction="forward"/>`);
  if (inner.length === 0) return [];
  return [`      <barline location="left">`, ...inner, "      </barline>"];
}

// ----------------------------------------------------------
// 関数：sameTimeSignature
// 2つの拍子記号が同じか調べる（数字に加えて、C・¢ の印も同じときだけ「同じ」）（ステップ8-1b）
// ----------------------------------------------------------
function sameTimeSignature(a, b) {
  if (!a || !b) return false;
  return a.beats === b.beats && a.beatType === b.beatType && (a.symbol ?? null) === (b.symbol ?? null);
}

// ----------------------------------------------------------
// 関数：chordParts
// 音符を、高さ1つ分ずつの「書き出し用の音」に分ける（ステップ14-3）
// 重音でなければ1つだけ。重音なら低い順に、高さの数だけ作る
//   note      … 音符のデータ（重音なら chord が付いている）
//   tiedFrom  … 前の音（タイでこの音につながってきているときだけ。つながっていなければ null）
//   nextNote  … 次の音（小節をまたいでもよい。なければ null）
// 戻り値：[{ note: 書き出し用の音, tieStop: 前からタイでつながってきた高さか }, ...]
// 決まり
//   ・1つ目（いちばん低い音）は、記号も全部付けたまま（記号は1つ目の <note> にだけ書く）
//   ・2つ目からは、高さ・長さ・連符の印だけ（記号を2回書かないため）
//   ・タイの「ここから」は、次の音に同じ高さがある高さだけ。「ここまで」は、前の音に同じ高さがある高さだけ
//   ・指番号：指番号の数と高さの数が同じなら、付けた順に下の高さから1つずつ。ちがうときは、全部を1つ目に
//   ・アルペジオ：重音なら、全部の音に書く（1音だけの音符には書かない）（ステップ14-4b）
// ----------------------------------------------------------
function chordParts(note, tiedFrom, nextNote) {
  const pitches = notePitches(note);
  const nextPitches = nextNote && !nextNote.rest ? notePitches(nextNote) : [];
  const fromPitches = tiedFrom ? notePitches(tiedFrom) : [];
  const fingerings = note.fingerings ?? [];
  const splitFingers = pitches.length > 1 && fingerings.length === pitches.length; // 指番号を1つずつ分けるか

  return pitches.map((pitch, h) => {
    const tieStart = !!note.tie && nextPitches.some((other) => samePitch(other, pitch));
    const tieStop = fromPitches.some((other) => samePitch(other, pitch));
    let piece;
    if (h === 0) {
      // 1つ目：記号も全部付けたまま。高さとタイだけ、この高さのものにする
      piece = { ...note, pitch: pitch, tie: tieStart };
      delete piece.chord;
      if (splitFingers) piece.fingerings = [fingerings[0]];
      if (pitches.length === 1) delete piece.arpeggio; // 1音だけの音符には書かない（ステップ14-4b）
    } else {
      // 2つ目から：高さ・長さ・連符の印だけ
      piece = { pitch: pitch, duration: note.duration, dots: note.dots ?? 0, tie: tieStart };
      if (note.tuplet) piece.tuplet = note.tuplet;
      if (splitFingers) piece.fingerings = [fingerings[h]];
      if (note.arpeggio) piece.arpeggio = true; // アルペジオは全部の音に書く（ステップ14-4b）
    }
    return { note: piece, tieStop: tieStop };
  });
}

// 2音トレモロの組の音に書く、連符の印（「1個分の長さに2個」。<tuplet> の括弧・数字は書かない）（ステップ14-6b）
const ALTERNATE_TIME = { actual: 2, normal: 1, start: false, stop: false, bracket: false };

// ----------------------------------------------------------
// 関数：alternateParts
// 2音トレモロの音符を、MusicXML の「2つの音符の組」に分ける（ステップ14-6b）
//   note … 2音トレモロの音符のデータ（isAlternate が true のもの）
// 戻り値：[1つ目（下の音）, 2つ目（上の音）] の書き出し用の音
// 決まり
//   ・どちらも、形（<type>）と付点は2音トレモロ全体の長さのまま
//   ・どちらも「1個分の長さに2個」の連符の印（tuplet: 2 と 1）を付けて、実際の長さを半分にする
//     （noteXml は連符の印を見て <duration> を半分にし、<time-modification> を書く）
//   ・1つ目に記号を全部付ける。2つ目は高さ・長さだけ
//   ・1つ目に <tremolo type="start">、2つ目に <tremolo type="stop">（alternateMark の印で notationsXml に伝える）
//   ・タイは付けない（2音トレモロにはタイを付けない決まり（ステップ14-6a））
// ----------------------------------------------------------
function alternateParts(note) {
  const [low, high] = notePitches(note);
  const time = { actual: 2, normal: 1 };
  const first = { ...note, pitch: low, tie: false, tuplet: time, alternateMark: { type: "start", count: note.tremolo } };
  delete first.chord;
  delete first.alternate;
  delete first.tremolo; // ふつうのトレモロ（type="single"）としては書かない
  delete first.arpeggio;
  const second = { pitch: high, duration: note.duration, dots: note.dots ?? 0, tie: false, tuplet: time, alternateMark: { type: "stop", count: note.tremolo } };
  return [first, second];
}

// ----------------------------------------------------------
// 関数：partXml
// 1つのパートの <part> を作る
//   score … 楽譜データ
//   p     … パートの番号（0 から）
//   divisions … 4分音符をいくつに分けるか（ステップ10-5）
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function partXml(score, p, divisions) {
  const part = score.parts[p];
  const lines = [];
  lines.push(`  <part id="P${p + 1}">`);

  let tiedIn = false; // 前の小節の最後の音から、タイでつながってきているか
  let tiedInNote = null; // 前の小節の最後の音（タイでつながってきているときだけ。臨時記号を決めるのに使う）（ステップ14-1）

  // グリッサンドの組を、先に全部探しておく（ステップ11-5c）
  //   glissStarts … すべり始める音（glissando の付いた音）
  //   glissStops  … その次の音（小節をまたいでもよい）
  // 次が休符・次の音がない・タイが付いている音は、組にしない（書き出さない）
  const glissStarts = new Set();
  const glissStops = new Set();
  const partNotes = part.measures.flatMap((measure) => measure.notes); // パートの音を、小節をまたいで1列に並べたもの
  partNotes.forEach((note, k) => {
    const next = partNotes[k + 1];
    if (note.glissando && !note.rest && !note.tie && next && !next.rest) {
      glissStarts.add(note);
      glissStops.add(next);
    }
  });
  // 松葉の番号を、先に全部決めておく（ステップ16-2）
  const wedgeNumberMap = wedgeNumbers(partNotes);
  const lastIndex = part.measures.length - 1;
  let noteIndex = -1; // パート全体で、今書いている音の番号（partNotes の中の番号）（ステップ14-3）

  // 1つ前の小節の拍子・調・音部記号（変わったかどうかを比べるため）（ステップ8-1b）
  let prevTime = null;
  let prevKey = null;
  let prevClef = null;

  part.measures.forEach((measure, i) => {
    const isFirst = i === 0;
    // 小節番号は、画面と同じ番号（アウフタクトがあれば、アウフタクトは 0 で、数えない小節の印 implicit="yes" を付ける）（ステップ15-3）
    const implicit = isFirst && hasPickup(score) ? ` implicit="yes"` : "";
    lines.push(`    <measure number="${measureNumber(score, i)}"${implicit}>`);
    // くり返しの始まり（‖:）は、小節のいちばん頭に書く（ステップ11-7a）
    // （ステップ11-7b：1番・2番かっこの始まりも、同じ所に書く）
    lines.push(...leftBarlineXml(score.measures[i]));

    // 小節の頭の情報（1小節目はいつも書く。途中は、前の小節と違うときだけ書く）
    // （ステップ8-1b：データに書いてあっても、前と同じなら書かない。小節の削除などで同じ拍子が残ることがあるため）
    const nowTime = timeAt(score, i);
    const nowKey = keyAt(score, i);
    const nowClef = measure.clef ?? prevClef ?? INSTRUMENTS[part.instrument].clef;
    const time = isFirst || !sameTimeSignature(nowTime, prevTime) ? nowTime : undefined;
    const key = isFirst || nowKey !== prevKey ? nowKey : undefined;
    const clef = isFirst || nowClef !== prevClef ? nowClef : undefined;
    // （ステップ18-3：コントラバスは、1小節目に1オクターブ下で鳴る印も書く）
    lines.push(...attributesXml(isFirst, key, time, clef, divisions, INSTRUMENTS[part.instrument].soundOctaves ?? 0));
    prevTime = nowTime;
    prevKey = nowKey;
    prevClef = nowClef;

    // テンポは1小節目の一番上のパートにだけ書く
    if (isFirst && p === 0) lines.push(...tempoXml(score));
    // 2小節目からのテンポの指示（途中のテンポ変更・a tempo・rit.・accel.）も、一番上のパートにだけ書く（ステップ11-6c）
    if (p === 0) lines.push(...tempoMarksXml(score, i));
    // 𝄋・𝄌・練習番号も、一番上のパートの小節の頭にだけ書く（ステップ11-7c・11-7d）
    if (p === 0) lines.push(...jumpStartXml(score, i));

    // 臨時記号を、五線譜の表示と同じ決め方で決める
    // （ステップ14-1：重音のため、高さごとの配列が返ってくる。ステップ14-3：高さごとに書く）
    const accidentals = computeAccidentals(measure.notes, keyAt(score, i), tiedInNote);

    // この小節の連符（ステップ10-5）
    const groups = tupletGroups(measure.notes);

    // この小節の連桁（画面と同じつなぎ方）と、音ごとに書く <beam> の中身（ステップ19-2）
    const beamValues = beamXmlValues(measure.notes, measureBeamGroups(measure.notes, nowTime, measureOffset(score, i)));

    // この小節の、音ごとの決めた符尾の向き（画面と同じ決め方。連桁・連符のまとまりはそろえる）（ステップ22）
    const stemDirs = measureStemDirections(measure.notes, nowTime, measureOffset(score, i));

    // 音符・休符
    let prevTie = tiedIn; // 1つ前の音が、この音にタイでつながっているか
    let prevTiedNote = tiedInNote; // 1つ前の音（タイでこの音につながっているときだけ。高さごとのタイの「ここまで」に使う）（ステップ14-3）
    measure.notes.forEach((note, k) => {
      noteIndex = noteIndex + 1; // パート全体での、この音の番号（次の音を探すのに使う）（ステップ14-3）

      // 連符の情報（連符でなければ null）（ステップ10-5）
      // 括弧は、4分音符以上の連符か、休符が入っている連符に付ける（連桁で全部つながらないとき。画面の表示と同じ）
      const group = groups.find((g) => g.start <= k && k <= g.end);
      let tupletMark = null;
      if (group) {
        const members = measure.notes.slice(group.start, group.end + 1);
        tupletMark = {
          actual: group.actual,
          normal: group.normal,
          start: k === group.start,
          stop: k === group.end,
          bracket: !["eighth", "16th", "32nd"].includes(group.duration) || members.some((n) => n.rest), // 32分音符はステップ15-5
        };
      }

      const wedgeNumber = wedgeNumberMap.get(note) ?? {}; // この音符の松葉の番号（ステップ16-2）
      lines.push(...directionsBeforeXml(note, wedgeNumber)); // 強弱・pizz.・松葉の始まり（ステップ8-2）
      // グリッサンドの組なら、書き出すときだけの印（glissStart・glissStop）を付けたものを渡す（ステップ11-5c）
      const xmlNote = glissStarts.has(note) || glissStops.has(note) ? { ...note, glissStart: glissStarts.has(note), glissStop: glissStops.has(note) } : note;
      // 前打音があれば、主音のすぐ前に小さな音符を書く（ステップ11-8b）（重音には前打音を付けない決まり（ステップ14-1））
      if (!note.rest && note.grace && !note.chord) lines.push(...graceXml(note, keyAt(score, i)));

      if (note.rest) {
        // 休符：今までどおり（小節まるごとの休符なら、その印も渡す（ステップ13-3））
        lines.push(...noteXml(xmlNote, null, false, divisions, tupletMark, isMeasureRest(measure.notes)));
      } else if (isAlternate(note)) {
        // 2音トレモロ：2つの音符の組にして書く（下の音 → 上の音）（ステップ14-6b）
        // 臨時記号は、高さごと（低い順）に決めたものを、それぞれに付ける
        alternateParts(xmlNote).forEach((piece, h) => {
          // 決めた符尾の向きは、2つの音符の両方に書く（ステップ22）
          lines.push(...noteXml(piece, accidentals[k][h] ?? null, false, divisions, ALTERNATE_TIME, false, false, [], stemDirs[k]));
        });
      } else {
        // 音符：高さごとに <note> を書く（重音でなければ1つだけ）（ステップ14-3）
        const nextNote = partNotes[noteIndex + 1] ?? null;
        chordParts(xmlNote, prevTie ? prevTiedNote : null, nextNote).forEach((piece, h) => {
          // 2つ目からの音は <chord/> を付け、連符の始まり・終わりの印は書かない（1つ目に書く）
          const mark = tupletMark && h > 0 ? { ...tupletMark, start: false, stop: false } : tupletMark;
          // 連桁は、重音の1つ目の <note> にだけ書く決まり（ステップ19-2）
          // 決めた符尾の向きは、重音の全部の <note> に書く（ステップ22）
          lines.push(...noteXml(piece.note, accidentals[k][h] ?? null, piece.tieStop, divisions, mark, false, h > 0, h === 0 ? beamValues[k] : [], stemDirs[k]));
        });
      }
      lines.push(...directionsAfterXml(note, wedgeNumber)); // 松葉の終わり（ステップ8-2。ステップ16-2：音符の下だけの松葉の終わりも）
      prevTie = !note.rest && !!note.tie;
      prevTiedNote = prevTie ? note : null;
    });
    tiedIn = prevTie; // 次の小節へ引き継ぐ
    tiedInNote = prevTiedNote; // 次の小節の臨時記号・タイのために引き継ぐ（ステップ14-1）

    // rit.・accel. の範囲の終わりの小節なら、最後の音のあとに点線の終わりを書く（一番上のパートだけ）（ステップ11-6c）
    if (p === 0 && score.measures[i].gradualEnd) lines.push(...gradualEndXml());
    // To Coda・Fine・D.C.・D.S. は、一番上のパートの、最後の音のあとに書く（ステップ11-7c）
    if (p === 0) lines.push(...jumpEndXml(score.measures[i]));

    // 小節の終わりの線
    const isLast = i === lastIndex;
    const nextKeyChanges = !isLast && score.measures[i + 1].key !== undefined && score.measures[i + 1].key !== keyAt(score, i);
    lines.push(...barlineXml(isLast, nextKeyChanges, score.measures[i])); // 小節の情報も渡す（ステップ11-7a）

    lines.push("    </measure>");
  });

  lines.push("  </part>");
  return lines;
}

// ----------------------------------------------------------
// 関数：scoreToMusicXML
// 楽譜データを MusicXML の文字にする（書き出し）
//   score … 楽譜データ（画面と連動していない、ふつうのデータを渡す）
// 戻り値：MusicXML の文字
// ----------------------------------------------------------
export function scoreToMusicXML(score) {
  const lines = [];

  // ファイルの頭の決まり文句（XML であることと、MusicXML 4.0 の形であること）
  lines.push(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>`);
  lines.push(`<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">`);
  lines.push(`<score-partwise version="4.0">`);

  // タイトル
  lines.push("  <work>");
  lines.push(`    <work-title>${escapeXml(score.title)}</work-title>`);
  lines.push("  </work>");

  // 作曲者と、書き出したアプリ・日付
  lines.push("  <identification>");
  if (score.composer) {
    lines.push(`    <creator type="composer">${escapeXml(score.composer)}</creator>`);
  }
  lines.push("    <encoding>");
  lines.push("      <software>string-score</software>");
  lines.push(`      <encoding-date>${todayText()}</encoding-date>`);
  lines.push("    </encoding>");
  lines.push("  </identification>");

  // パートの一覧と、パートごとの中身
  // divisions（4分音符をいくつに分けるか）は、楽譜全体で1つに決める（ステップ10-5）
  const divisions = scoreDivisions(score);
  lines.push(...partListXml(score));
  score.parts.forEach((_, p) => {
    lines.push(...partXml(score, p, divisions));
  });

  lines.push("</score-partwise>");
  // 行を改行でつなげて1つの文字にする（最後にも改行を付ける）
  return lines.join("\n") + "\n";
}

// ----------------------------------------------------------
// 関数：musicXMLFileName
// 書き出すファイルの名前を作る（楽譜のタイトル＋".musicxml"）
// ファイル名に使えない文字（\ / : * ? " < > |）は「_」に置きかえる
// 例："弦楽四重奏 第1番" → "弦楽四重奏 第1番.musicxml"
//     "A/B" → "A_B.musicxml"
// ----------------------------------------------------------
export function musicXMLFileName(title) {
  const safe = String(title ?? "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
  return (safe || "無題") + ".musicxml";
}
