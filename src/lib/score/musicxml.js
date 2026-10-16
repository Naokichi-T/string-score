// ==========================================================
// musicxml.js
// 楽譜データと MusicXML（ほかの楽譜アプリと楽譜をやりとりするための形）を変換する
// （ステップ8-1：書き出しの基本（タイトル・作曲者・テンポ・パート・拍子・調・音部記号・音符・休符・付点・タイ））
// （ステップ8-1b：コモンタイム（C）・カットタイム（¢）の拍子記号）
// （ステップ8-2：記号（弓・指番号・スタッカートなど・フェルマータ・pizz./arco・強弱・スラー・松葉））
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

import { INSTRUMENTS, noteTicks, timeAt, keyAt, tempoAt, TICKS_PER_16TH, tupletGroups } from "./model.js";
import { computeAccidentals } from "./accidentals.js";
import { BOWINGS, ARTICULATIONS, STRING_MARKS, BREATHS, ORNAMENTS, FERMATA, GLISSANDO, TECHNIQUES, DYNAMICS } from "./symbols.js";

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
//   program … MIDI の楽器の番号（バイオリン 41・ビオラ 42・チェロ 43）
// ----------------------------------------------------------
const INSTRUMENT_TO_XML = {
  violin: { sound: "strings.violin", program: 41 },
  viola: { sound: "strings.viola", program: 42 },
  cello: { sound: "strings.cello", program: 43 },
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
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function attributesXml(isFirst, key, time, clef, divisions) {
  if (!isFirst && key === undefined && !time && !clef) return [];

  // 書く順番は MusicXML の決まり（divisions → key → time → clef）に合わせる
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
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function noteXml(note, accidental, tieStop, divisions, tupletMark) {
  const lines = [];
  lines.push("      <note>");

  // 高さ（休符なら <rest/>）
  if (note.rest) {
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
  lines.push(`        <type>${note.duration}</type>`);
  for (let i = 0; i < (note.dots ?? 0); i++) {
    lines.push("        <dot/>");
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

  // 音符に付く記号（タイの表示・スラー・アーティキュレーション・弓・指番号・フェルマータ・連符の始まりと終わり）
  lines.push(...notationsXml(note, tieStop, tieStart, tupletMark));

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
  if (note.ornament || note.tremolo) {
    inner.push("          <ornaments>");
    if (note.ornament) inner.push(`            <${ORNAMENTS[note.ornament].musicxml}/>`);
    if (note.tremolo) inner.push(`            <tremolo type="single">${note.tremolo}</tremolo>`);
    inner.push("          </ornaments>");
  }

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
// 関数：directionsBeforeXml
// 音符の前に置く <direction>（強弱・pizz./arco・松葉の始まり）を作る（ステップ8-2）
// MusicXML では、強弱などは音符の中ではなく、音符の直前に「指示」として書く
//   note … 音符・休符のデータ
// 戻り値：XML の行の配列（何もなければ空の配列）
// ----------------------------------------------------------
function directionsBeforeXml(note) {
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
  if (note.wedge === "crescendo" || note.wedge === "diminuendo") {
    lines.push(`      <direction placement="below">`);
    lines.push("        <direction-type>");
    lines.push(`          <wedge type="${note.wedge}"/>`);
    lines.push("        </direction-type>");
    lines.push("      </direction>");
  }

  return lines;
}

// ----------------------------------------------------------
// 関数：directionsAfterXml
// 音符のあとに置く <direction>（松葉の終わり）を作る（ステップ8-2）
// 終わりの音の「あと」に置くと、松葉がその音の終わりまでのびる（このアプリの表示と同じ）
//   note … 音符・休符のデータ
// 戻り値：XML の行の配列（何もなければ空の配列）
// ----------------------------------------------------------
function directionsAfterXml(note) {
  if (note.wedge !== "stop") return [];
  return [`      <direction placement="below">`, "        <direction-type>", `          <wedge type="stop"/>`, "        </direction-type>", "      </direction>"];
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
  // くり返しの終わり（:‖）：細い線＋太い線と、「戻る」の印（ステップ11-7a）
  if (measureInfo.repeatEnd) {
    return [`      <barline location="right">`, "        <bar-style>light-heavy</bar-style>", `        <repeat direction="backward"/>`, "      </barline>"];
  }
  let style = null;
  // 自分で決めた線（ステップ11-7a）：複縦線は light-light、終止線は light-heavy
  if (measureInfo.barline === "double") style = "light-light";
  else if (measureInfo.barline === "final") style = "light-heavy";
  else if (isLast) style = "light-heavy";
  else if (nextKeyChanges) style = "light-light";
  if (!style) return [];
  return [`      <barline location="right">`, `        <bar-style>${style}</bar-style>`, "      </barline>"];
}

// ----------------------------------------------------------
// 関数：repeatStartXml
// くり返しの始まり（‖:）の <barline location="left"> を作る（小節の頭に書く）（ステップ11-7a）
//   heavy-light … 太い線＋細い線、repeat forward … 「ここから」の印
// ----------------------------------------------------------
function repeatStartXml() {
  return [`      <barline location="left">`, "        <bar-style>heavy-light</bar-style>", `        <repeat direction="forward"/>`, "      </barline>"];
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
  const lastIndex = part.measures.length - 1;

  // 1つ前の小節の拍子・調・音部記号（変わったかどうかを比べるため）（ステップ8-1b）
  let prevTime = null;
  let prevKey = null;
  let prevClef = null;

  part.measures.forEach((measure, i) => {
    const isFirst = i === 0;
    lines.push(`    <measure number="${i + 1}">`);
    // くり返しの始まり（‖:）は、小節のいちばん頭に書く（ステップ11-7a）
    if (score.measures[i].repeatStart) lines.push(...repeatStartXml());

    // 小節の頭の情報（1小節目はいつも書く。途中は、前の小節と違うときだけ書く）
    // （ステップ8-1b：データに書いてあっても、前と同じなら書かない。小節の削除などで同じ拍子が残ることがあるため）
    const nowTime = timeAt(score, i);
    const nowKey = keyAt(score, i);
    const nowClef = measure.clef ?? prevClef ?? INSTRUMENTS[part.instrument].clef;
    const time = isFirst || !sameTimeSignature(nowTime, prevTime) ? nowTime : undefined;
    const key = isFirst || nowKey !== prevKey ? nowKey : undefined;
    const clef = isFirst || nowClef !== prevClef ? nowClef : undefined;
    lines.push(...attributesXml(isFirst, key, time, clef, divisions));
    prevTime = nowTime;
    prevKey = nowKey;
    prevClef = nowClef;

    // テンポは1小節目の一番上のパートにだけ書く
    if (isFirst && p === 0) lines.push(...tempoXml(score));
    // 2小節目からのテンポの指示（途中のテンポ変更・a tempo・rit.・accel.）も、一番上のパートにだけ書く（ステップ11-6c）
    if (p === 0) lines.push(...tempoMarksXml(score, i));

    // 臨時記号を、五線譜の表示と同じ決め方で決める
    const accidentals = computeAccidentals(measure.notes, keyAt(score, i), tiedIn);

    // この小節の連符（ステップ10-5）
    const groups = tupletGroups(measure.notes);

    // 音符・休符
    let prevTie = tiedIn; // 1つ前の音が、この音にタイでつながっているか
    measure.notes.forEach((note, k) => {
      const tieStop = prevTie && !note.rest;

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
          bracket: !["eighth", "16th"].includes(group.duration) || members.some((n) => n.rest),
        };
      }

      lines.push(...directionsBeforeXml(note)); // 強弱・pizz.・松葉の始まり（ステップ8-2）
      // グリッサンドの組なら、書き出すときだけの印（glissStart・glissStop）を付けたものを渡す（ステップ11-5c）
      const xmlNote = glissStarts.has(note) || glissStops.has(note) ? { ...note, glissStart: glissStarts.has(note), glissStop: glissStops.has(note) } : note;
      lines.push(...noteXml(xmlNote, accidentals[k], tieStop, divisions, tupletMark));
      lines.push(...directionsAfterXml(note)); // 松葉の終わり（ステップ8-2）
      prevTie = !note.rest && !!note.tie;
    });
    tiedIn = prevTie; // 次の小節へ引き継ぐ

    // rit.・accel. の範囲の終わりの小節なら、最後の音のあとに点線の終わりを書く（一番上のパートだけ）（ステップ11-6c）
    if (p === 0 && score.measures[i].gradualEnd) lines.push(...gradualEndXml());

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
