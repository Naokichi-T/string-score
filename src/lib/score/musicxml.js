// ==========================================================
// musicxml.js
// 楽譜データと MusicXML（ほかの楽譜アプリと楽譜をやりとりするための形）を変換する
// （ステップ8-1：書き出しの基本（タイトル・作曲者・テンポ・パート・拍子・調・音部記号・音符・休符・付点・タイ））
//
// 【MusicXML の形（パートごとに小節を並べる「score-partwise」という形を使う）】
//   <score-partwise>
//     <work>タイトル</work>
//     <identification>作曲者</identification>
//     <part-list>パートの一覧</part-list>
//     <part id="P1">
//       <measure number="1">
//         <attributes>長さの単位・調・拍子・音部記号</attributes>
//         <direction>テンポ</direction>
//         <note>音符・休符</note> …
//       </measure> …
//     </part> …
//   </score-partwise>
//
// 【長さの書き方】
//   MusicXML では「4分音符をいくつに分けるか（divisions）」を先に決めて、
//   音の長さをその数で書く。divisions を 4 にすると 16分音符＝1 になり、
//   このアプリのティック（16分音符＝1）をそのまま使える
// ==========================================================

import { INSTRUMENTS, noteTicks, timeAt, keyAt } from "./model.js";
import { computeAccidentals } from "./accidentals.js";

// 4分音符をいくつに分けるか（16分音符＝1 にするので 4）
const DIVISIONS = 4;

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
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function attributesXml(isFirst, key, time, clef) {
  if (!isFirst && key === undefined && !time && !clef) return [];

  // 書く順番は MusicXML の決まり（divisions → key → time → clef）に合わせる
  const lines = [];
  lines.push("      <attributes>");
  if (isFirst) lines.push(`        <divisions>${DIVISIONS}</divisions>`);
  if (key !== undefined) {
    // fifths：♯の数はプラス、♭の数はマイナス（このアプリの key と同じ）
    lines.push("        <key>");
    lines.push(`          <fifths>${key}</fifths>`);
    lines.push("        </key>");
  }
  if (time) {
    lines.push("        <time>");
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
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function noteXml(note, accidental, tieStop) {
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

  // 長さ（16分音符＝1 のティックをそのまま書ける。divisions を 4 にしているため）
  lines.push(`        <duration>${noteTicks(note)}</duration>`);

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

  // タイ（表示用の <tied>。MusicXML では再生用と表示用の両方を書く決まり）
  if (tieStop || tieStart) {
    lines.push("        <notations>");
    if (tieStop) lines.push(`          <tied type="stop"/>`);
    if (tieStart) lines.push(`          <tied type="start"/>`);
    lines.push("        </notations>");
  }

  lines.push("      </note>");
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
function barlineXml(isLast, nextKeyChanges) {
  let style = null;
  if (isLast) style = "light-heavy";
  else if (nextKeyChanges) style = "light-light";
  if (!style) return [];
  return [`      <barline location="right">`, `        <bar-style>${style}</bar-style>`, "      </barline>"];
}

// ----------------------------------------------------------
// 関数：partXml
// 1つのパートの <part> を作る
//   score … 楽譜データ
//   p     … パートの番号（0 から）
// 戻り値：XML の行の配列
// ----------------------------------------------------------
function partXml(score, p) {
  const part = score.parts[p];
  const lines = [];
  lines.push(`  <part id="P${p + 1}">`);

  let tiedIn = false; // 前の小節の最後の音から、タイでつながってきているか
  const lastIndex = part.measures.length - 1;

  part.measures.forEach((measure, i) => {
    const isFirst = i === 0;
    const info = score.measures[i]; // 全パート共通の小節の情報（拍子・調）
    lines.push(`    <measure number="${i + 1}">`);

    // 小節の頭の情報（1小節目はいつも書く。途中は変わったときだけ）
    const key = isFirst ? keyAt(score, 0) : info.key;
    const time = isFirst ? timeAt(score, 0) : info.time;
    const clef = isFirst ? (measure.clef ?? INSTRUMENTS[part.instrument].clef) : measure.clef;
    lines.push(...attributesXml(isFirst, key, time, clef));

    // テンポは1小節目の一番上のパートにだけ書く
    if (isFirst && p === 0) lines.push(...tempoXml(score));

    // 臨時記号を、五線譜の表示と同じ決め方で決める
    const accidentals = computeAccidentals(measure.notes, keyAt(score, i), tiedIn);

    // 音符・休符
    let prevTie = tiedIn; // 1つ前の音が、この音にタイでつながっているか
    measure.notes.forEach((note, k) => {
      const tieStop = prevTie && !note.rest;
      lines.push(...noteXml(note, accidentals[k], tieStop));
      prevTie = !note.rest && !!note.tie;
    });
    tiedIn = prevTie; // 次の小節へ引き継ぐ

    // 小節の終わりの線
    const isLast = i === lastIndex;
    const nextKeyChanges = !isLast && score.measures[i + 1].key !== undefined && score.measures[i + 1].key !== keyAt(score, i);
    lines.push(...barlineXml(isLast, nextKeyChanges));

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
  lines.push(...partListXml(score));
  score.parts.forEach((_, p) => {
    lines.push(...partXml(score, p));
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
