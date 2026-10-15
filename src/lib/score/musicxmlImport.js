// ==========================================================
// musicxmlImport.js
// MusicXML のファイルを読み込んで、このアプリの楽譜データにする
// （ステップ8-3：読み込みの基本（タイトル・作曲者・テンポ・パート・拍子・調・音部記号・音符・休符・付点・タイ））
// （ステップ8-4a：記号（弓・指番号・スタッカートなど・フェルマータ・pizz./arco・強弱・スラー・松葉））
// （ステップ8-4b：重音・2つ目の声部・装飾音・アウフタクト）
//
// 【流れ】
//   ファイル → readMusicXMLFile → MusicXML の文字
//   MusicXML の文字 → musicXMLToScore → { score: 楽譜データ, warnings: 知らせることの一覧 }
//
// 【長さの直し方】
//   MusicXML の長さは「4分音符を divisions 個に分けたうちのいくつか」で書いてある
//   divisions はファイルによって違う（このアプリは 4、MuseScore は 480 など）
//   → 長さ × 4 ÷ divisions で「16分音符いくつ分か」に直して、長さの名前を表から探す
//   → そのあと TICKS_PER_16TH を掛けて、このアプリのティックにする（ステップ10-1）
//
// 【連符の読み方】（ステップ10-6）
//   <time-modification> のある音は連符の音。長さは <type>（音符の形）と連符の数から決める
//   （ファイルの <duration> は、割り切れずに丸めてあることがあるので使わない）
//   連符の数（2〜12）・付点なし・1つの連符の中が全部同じ長さ、のときだけ読める
//   それ以外の連符（付点の連符・長さがまちまちの連符など）がある小節は、休符にする
//
// 【このアプリで扱えないもの】（ステップ8-4b）
//   読めない長さの音（32分音符・読めない連符など）がある小節 … 小節ごと休符にする
//   重音 … 一番上の音だけ残す（ほかの音に付いていた記号は、残した音にまとめる）
//   2つ目の声部・装飾音 … 使わない
//   アウフタクト（1小節目が拍子より短い）… 1小節目の前を休符で埋める
//   どれも、最後にまとめて知らせる
//
// 【記号の読み方】（ステップ8-4a）
//   音符の中の <notations> … スラー・スタッカートなど・弓・指番号・フェルマータ → その音符に付ける
//   音符の前の <direction> … 強弱・pizz./arco・松葉の始まり → 次の音符に付ける
//                            松葉の終わり → その前の音符に付ける
//   休符には記号を付けない（このアプリの決まり。記号タブでも休符には付けられない）
//   このアプリにない記号（トリルなど）は読まずに、種類ごとの数を知らせる
// ==========================================================

import { unzipSync } from "fflate";
import { INSTRUMENTS, measureTicks, restsForSpan, renameParts, TICKS_PER_16TH, DURATION_ORDER, durationToTicks, tupletGroups } from "./model.js";
import { BOWINGS, ARTICULATIONS, STRING_MARKS, BREATHS, DYNAMICS } from "./symbols.js";
import { cleanSpanners } from "./edit.js";

// ----------------------------------------------------------
// 16分音符いくつ分か → 音の長さの名前と付点の数の表
// このアプリで使える長さは、この8つだけ
// ----------------------------------------------------------
const TICKS_TO_DURATION = {
  16: { duration: "whole", dots: 0 }, // 全音符
  12: { duration: "half", dots: 1 }, // 付点2分音符
  8: { duration: "half", dots: 0 }, // 2分音符
  6: { duration: "quarter", dots: 1 }, // 付点4分音符
  4: { duration: "quarter", dots: 0 }, // 4分音符
  3: { duration: "eighth", dots: 1 }, // 付点8分音符
  2: { duration: "eighth", dots: 0 }, // 8分音符
  1: { duration: "16th", dots: 0 }, // 16分音符
};

// ドレミファソラシの、ドからの半音の数（重音でどの音が一番上かを比べるのに使う）（ステップ8-4b）
const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ----------------------------------------------------------
// パート名から楽器を決めるための言葉（小文字で比べる）
// 上から順に調べる（"violoncello" に "violin" が入っていないか、などに気をつけて
// チェロ → ビオラ → バイオリンの順にしている）
// ----------------------------------------------------------
const NAME_RULES = [
  { instrument: "cello", words: ["violoncello", "cello", "vc.", "vlc", "チェロ"] },
  { instrument: "viola", words: ["viola", "vla", "alto", "ビオラ", "ヴィオラ"] },
  { instrument: "violin", words: ["violin", "violino", "vln", "vn.", "バイオリン", "ヴァイオリン"] },
];

// ----------------------------------------------------------
// MusicXML の記号の名前 → このアプリの名前 の表（ステップ8-4a）
// symbols.js の表の musicxml から、逆向きの表を作る
// （記号を symbols.js に足せば、読み込みにも自動で使われる）
// 例：XML_TO_BOWING["down-bow"] → "down"
// ----------------------------------------------------------
function reverseTable(table) {
  const result = {};
  Object.entries(table).forEach(([name, info]) => {
    result[info.musicxml] = name;
  });
  return result;
}
const XML_TO_BOWING = reverseTable(BOWINGS);
const XML_TO_ARTICULATION = reverseTable(ARTICULATIONS);
const XML_TO_STRING_MARK = reverseTable(STRING_MARKS); // ステップ11-1b
const XML_TO_BREATH = reverseTable(BREATHS); // ステップ11-1c
const XML_TO_DYNAMIC = reverseTable(DYNAMICS);

// ----------------------------------------------------------
// このアプリにない記号の、知らせるときの日本語の名前（ステップ8-4a）
// 表にないものは、MusicXML の名前をそのまま出す
// ----------------------------------------------------------
const UNSUPPORTED_LABELS = {
  "trill-mark": "トリル",
  turn: "ターン",
  "inverted-turn": "ターン",
  mordent: "モルデント",
  "inverted-mordent": "モルデント",
  tremolo: "トレモロ",
  staccatissimo: "スタッカーティシモ",
  spiccato: "スピッカート",
  "strong-accent": "マルカート",
  "detached-legato": "ポルタート",
  "breath-mark": "ブレス",
  caesura: "カエスーラ",
  harmonic: "ハーモニクス",
  "open-string": "開放弦の記号",
  "thumb-position": "親指の位置",
  string: "弦の指定",
  glissando: "グリッサンド",
  slide: "グリッサンド",
  arpeggiate: "アルペジオ",
  "other-dynamics": "強弱（その他）",
};

// 数えなくてよい（ほかの所で扱う・中身だけを見る）記号の名前（tuplet は連符の印。連符の小節は別に知らせる）
const IGNORED_NOTATIONS = ["tied", "slur", "fermata", "articulations", "technical", "ornaments", "dynamics", "wavy-line", "accidental-mark", "other-notation", "tuplet"];

// ----------------------------------------------------------
// 関数：childElements
// XML の要素の「すぐ下」にある、指定した名前の要素を全部返す
//   element … 親の要素
//   name    … 子の要素の名前（例："measure"）
// （getElementsByTagName は孫やその下まで探してしまうので、すぐ下だけを見る）
// ----------------------------------------------------------
function childElements(element, name) {
  const result = [];
  if (!element) return result;
  for (const node of Array.from(element.childNodes)) {
    // nodeType 1 は「要素」（文字や改行ではないもの）
    if (node.nodeType === 1 && node.nodeName === name) result.push(node);
  }
  return result;
}

// ----------------------------------------------------------
// 関数：childElement
// すぐ下にある、指定した名前の最初の要素を返す（なければ null）
// ----------------------------------------------------------
function childElement(element, name) {
  return childElements(element, name)[0] ?? null;
}

// ----------------------------------------------------------
// 関数：childText
// すぐ下にある要素の中の文字を返す（なければ null）
// 例：<pitch><step>C</step></pitch> で childText(pitch, "step") → "C"
// ----------------------------------------------------------
function childText(element, name) {
  const child = childElement(element, name);
  return child ? child.textContent.trim() : null;
}

// ----------------------------------------------------------
// 関数：report
// このアプリで使えなかった記号などを数える（ステップ8-4a）
//   counter … 名前 → 数 の表
//   label   … 知らせるときの名前
// ----------------------------------------------------------
function report(counter, label) {
  counter[label] = (counter[label] ?? 0) + 1;
}

// ----------------------------------------------------------
// 関数：unsupportedLabel
// このアプリにない記号の、知らせるときの名前を返す（ステップ8-4a）
// ----------------------------------------------------------
function unsupportedLabel(name) {
  return UNSUPPORTED_LABELS[name] ?? name;
}

// ----------------------------------------------------------
// 関数：decodeText
// バイトの並びを文字に直す（UTF-8 と UTF-16 の両方に対応する）
// 古いソフトで作った MusicXML には、UTF-16 という形で保存されたものがある
// どちらの形かは、ファイルの頭の数バイトで見分ける
//   EF BB BF … UTF-8（BOM という目印付き）
//   FF FE    … UTF-16（小さい桁が先）
//   FE FF    … UTF-16（大きい桁が先）
//   3C 00    … 目印はないが UTF-16（小さい桁が先）の「<」
//   00 3C    … 目印はないが UTF-16（大きい桁が先）の「<」
// ----------------------------------------------------------
function decodeText(bytes) {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  else if (bytes[0] === 0x3c && bytes[1] === 0x00) encoding = "utf-16le";
  else if (bytes[0] === 0x00 && bytes[1] === 0x3c) encoding = "utf-16be";
  // TextDecoder は、頭の目印（BOM）を自動で取り除いてくれる
  return new TextDecoder(encoding).decode(bytes);
}

// ----------------------------------------------------------
// 関数：readMusicXMLFile
// 選ばれたファイルから、MusicXML の文字を取り出す
//   file … ファイルを選ぶ窓で選ばれたファイル
// .mxl（zip で圧縮した形）なら解凍して、中の楽譜のファイルを取り出す
// 戻り値：MusicXML の文字（Promise。await で受け取る）
// 読めないときはエラーを投げる（メッセージは画面に出せる日本語）
// ----------------------------------------------------------
export async function readMusicXMLFile(file) {
  // ファイルの中身を「バイトの並び」として読む
  const bytes = new Uint8Array(await file.arrayBuffer());

  // zip のファイルは、頭の2文字が "PK" になっている（拡張子が違っていても見分けられる）
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    // ふつうの MusicXML：文字に直すだけ
    return decodeText(bytes);
  }

  // .mxl：解凍する（中のファイルの名前 → 中身 の表になる）
  let files;
  try {
    files = unzipSync(bytes);
  } catch (error) {
    throw new Error("圧縮されたファイル（.mxl）を開けませんでした");
  }

  // 楽譜のファイルの場所は、META-INF/container.xml の rootfile に書いてある決まり
  let path = null;
  if (files["META-INF/container.xml"]) {
    const container = new DOMParser().parseFromString(decodeText(files["META-INF/container.xml"]), "application/xml");
    const rootfile = container.getElementsByTagName("rootfile")[0];
    if (rootfile) path = rootfile.getAttribute("full-path");
  }
  // 書いていなければ、META-INF 以外で .xml・.musicxml で終わる最初のファイルを使う
  if (!path || !files[path]) {
    path = Object.keys(files).find((name) => !name.startsWith("META-INF/") && /\.(xml|musicxml)$/i.test(name));
  }
  if (!path) throw new Error("圧縮されたファイル（.mxl）の中に楽譜が見つかりませんでした");

  return decodeText(files[path]);
}

// ----------------------------------------------------------
// 関数：titleFromFileName
// ファイルの名前から拡張子を除いて、タイトルの代わりにする
// 例："sonata.musicxml" → "sonata"
// ----------------------------------------------------------
export function titleFromFileName(fileName) {
  return String(fileName ?? "")
    .replace(/\.(musicxml|mxl|xml)$/i, "")
    .trim();
}

// ----------------------------------------------------------
// 関数：instrumentFromName
// パート名などの文字から楽器を決める（決まらなければ null）
// ----------------------------------------------------------
function instrumentFromName(text) {
  const lower = String(text ?? "").toLowerCase();
  if (!lower) return null;
  for (const rule of NAME_RULES) {
    if (rule.words.some((word) => lower.includes(word))) return rule.instrument;
  }
  return null;
}

// ----------------------------------------------------------
// 関数：instrumentFromClef
// 音部記号から楽器を決める（ト音記号 → バイオリン、ハ音記号 → ビオラ、ヘ音記号 → チェロ）
// ----------------------------------------------------------
function instrumentFromClef(clef) {
  if (clef === "alto" || clef === "tenor") return "viola";
  if (clef === "bass") return "cello";
  return "violin";
}

// ----------------------------------------------------------
// 関数：clefFromXml
// MusicXML の <clef> を、このアプリの音部記号の名前にする
//   G の第2線 → "treble"、C の第3線 → "alto"、C の第4線 → "tenor"、F の第4線 → "bass"
// それ以外（ソプラノ記号など、このアプリにないもの）は null
// ----------------------------------------------------------
function clefFromXml(clefElement) {
  const sign = childText(clefElement, "sign");
  const line = childText(clefElement, "line");
  if (sign === "G" && (line === "2" || line === null)) return "treble";
  if (sign === "C" && line === "3") return "alto";
  if (sign === "C" && line === "4") return "tenor";
  if (sign === "F" && (line === "4" || line === null)) return "bass";
  return null;
}

// ----------------------------------------------------------
// 関数：timeFromXml
// MusicXML の <time> を、このアプリの拍子にする
// 例：<time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>
//     → { beats: 4, beatType: 4, symbol: "common" }
// このアプリで使えない拍子（下の数字が 2・4・8 以外、3+2 のような書き方など）は null
// ----------------------------------------------------------
function timeFromXml(timeElement) {
  const beats = Number(childText(timeElement, "beats"));
  const beatType = Number(childText(timeElement, "beat-type"));
  if (!Number.isInteger(beats) || beats < 1 || ![2, 4, 8].includes(beatType)) return null;

  const time = { beats: beats, beatType: beatType };
  const symbol = timeElement.getAttribute("symbol");
  // C は 4/4、¢ は 2/2 のときだけ記号の印を付ける
  if (symbol === "common" && beats === 4 && beatType === 4) time.symbol = "common";
  if (symbol === "cut" && beats === 2 && beatType === 2) time.symbol = "cut";
  return time;
}

// ----------------------------------------------------------
// 関数：sameTime
// 2つの拍子が同じか調べる（C・¢ の印も比べる）
// ----------------------------------------------------------
function sameTime(a, b) {
  if (!a || !b) return false;
  return a.beats === b.beats && a.beatType === b.beatType && (a.symbol ?? null) === (b.symbol ?? null);
}

// ----------------------------------------------------------
// 関数：readTempo
// テンポ（♩ = ○○）と速度記号の文字を探す
// 一番上のパートの1小節目の <direction> から探す
//   ・♩ = ○○ … <metronome> の <per-minute>（4分音符以外が基準なら4分音符に直す）
//                なければ <sound tempo="…">
//   ・速度記号 … テンポと同じ <direction> の中の <words>（"Allegro" など）
// 戻り値：{ tempo: 数字か null, tempoText: 文字 }
// ----------------------------------------------------------
function readTempo(firstMeasure) {
  // 基準の音符の、4分音符に対する長さ（付点なし）
  const UNIT_QUARTERS = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25 };

  for (const direction of childElements(firstMeasure, "direction")) {
    let tempo = null;
    const words = [];

    childElements(direction, "direction-type").forEach((type) => {
      // ♩ = ○○
      const metronome = childElement(type, "metronome");
      if (metronome) {
        const unit = UNIT_QUARTERS[childText(metronome, "beat-unit")];
        const perMinute = Number(childText(metronome, "per-minute"));
        if (unit && perMinute > 0) {
          // 付点が付いた基準（♩. = 60 など）は 1.5 倍の長さ
          const dotted = childElements(metronome, "beat-unit-dot").length > 0 ? 1.5 : 1;
          tempo = perMinute * unit * dotted;
        }
      }
      // 文字
      childElements(type, "words").forEach((w) => {
        if (w.textContent.trim()) words.push(w.textContent.trim());
      });
    });

    // <metronome> がなければ、再生用の速さを使う
    if (tempo === null) {
      const sound = childElement(direction, "sound");
      const soundTempo = sound ? Number(sound.getAttribute("tempo")) : NaN;
      if (soundTempo > 0) tempo = soundTempo;
    }

    // テンポが見つかった <direction> を使う（文字だけの指示は、速度記号とは限らないので使わない）
    if (tempo !== null) {
      return { tempo: tempo, tempoText: words.join(" ") };
    }
  }
  return { tempo: null, tempoText: "" };
}

// ----------------------------------------------------------
// 関数：readNote
// <note> 1つを、このアプリの音符・休符のデータにする
//   noteElement … <note>
//   divisions   … 今の divisions
// 戻り値：{ note: データ, ticks: 長さ }（このアプリで扱えない長さなら note は null）
// ----------------------------------------------------------
function readNote(noteElement, divisions) {
  // 長さ：MusicXML の長さ → 16分音符いくつ分か → ティック（ステップ10-1）
  const rawDuration = Number(childText(noteElement, "duration"));
  const sixteenths = (rawDuration * 4) / divisions; // 16分音符いくつ分か
  let ticks = sixteenths * TICKS_PER_16TH; // このアプリのティック
  let shape = TICKS_TO_DURATION[sixteenths]; // 整数でない・表にない長さは undefined

  // 連符の音（<time-modification> がある）（ステップ10-6）
  // 長さは、音符の形（<type>）と「normal 個分の長さに actual 個」から決める
  let tuplet = null;
  const modification = childElement(noteElement, "time-modification");
  if (modification) {
    const actual = Number(childText(modification, "actual-notes"));
    const normal = Number(childText(modification, "normal-notes"));
    const type = childText(noteElement, "type"); // 音符の形（"eighth" など）
    const dotted = childElements(noteElement, "dot").length > 0;
    // このアプリで使える連符か（2〜12連符・使える音符の形・付点なし）
    const usable = actual >= 2 && actual <= 12 && normal >= 1 && DURATION_ORDER.includes(type) && !dotted;
    if (!usable) return { note: null, ticks: ticks };
    tuplet = { actual: actual, normal: normal };
    shape = { duration: type, dots: 0 };
    ticks = (durationToTicks(type, 0) * normal) / actual;
    if (!Number.isInteger(ticks)) return { note: null, ticks: ticks }; // 念のため（整数にならない連符は使えない）
  }

  if (!shape) return { note: null, ticks: ticks };

  // 休符（連符の中なら、連符の印も付ける）
  if (childElement(noteElement, "rest")) {
    const rest = { rest: true, duration: shape.duration, dots: shape.dots };
    if (tuplet) rest.tuplet = tuplet;
    return { note: rest, ticks: ticks };
  }

  // 音符：高さ
  const pitchElement = childElement(noteElement, "pitch");
  if (!pitchElement) return { note: null, ticks: ticks }; // 打楽器の音符など
  const step = childText(pitchElement, "step");
  const alter = Math.round(Number(childText(pitchElement, "alter") ?? 0)); // 1/4音などは近い半音にする
  const octave = Number(childText(pitchElement, "octave"));

  // タイ：<tie type="start"> があれば、次の音とつながる
  const tie = childElements(noteElement, "tie").some((t) => t.getAttribute("type") === "start");

  const note = { pitch: { step: step, alter: alter, octave: octave }, duration: shape.duration, dots: shape.dots, tie: tie };
  if (tuplet) note.tuplet = tuplet; // 連符の印（ステップ10-6）
  return { note: note, ticks: ticks };
}

// ----------------------------------------------------------
// 関数：pitchNumber
// 音の高さを、比べられる1つの数にする（半音1つで 1 ちがう）（ステップ8-4b）
// 例：ド4 → 48、ド♯4 → 49、レ4 → 50
// ----------------------------------------------------------
function pitchNumber(pitch) {
  return pitch.octave * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
}

// ----------------------------------------------------------
// 関数：readNotations
// 音符の中の <notations> を読んで、記号を音符のデータに付ける（ステップ8-4a）
//   noteElement … <note>
//   note        … readNote で作った音符のデータ（ここに記号を足す）
//   state       … パートごとの読みかけの情報（スラーが開いているかなど）
//   counter     … 使えなかった記号を数える表
// 休符に付いた記号は使わずに数える
// ----------------------------------------------------------
function readNotations(noteElement, note, state, counter) {
  childElements(noteElement, "notations").forEach((notations) => {
    // 休符：記号は付けない（タイの表示・スラー・連符の印以外を数える）
    // （連符が休符から始まる・休符で終わるときは、休符に連符の印が付く）（ステップ10-6）
    if (note.rest) {
      for (const child of Array.from(notations.childNodes)) {
        if (child.nodeType === 1 && child.nodeName !== "tied" && child.nodeName !== "slur" && child.nodeName !== "tuplet") report(counter, "休符に付いた記号");
      }
      return;
    }

    // スラー：「ここまで」を先に、「ここから」をあとに見る
    // （1つの音で前のスラーが終わり、次のスラーが始まる書き方があるため）
    // このアプリのスラーは同時に1本だけなので、開いているスラーと同じ番号の「ここまで」だけを使う
    const slurs = childElements(notations, "slur");
    slurs.forEach((slur) => {
      const number = slur.getAttribute("number") ?? "1";
      if (slur.getAttribute("type") === "stop" && state.slurNumber === number && note.slur === undefined) {
        note.slur = "stop";
        state.slurNumber = null;
      }
    });
    slurs.forEach((slur) => {
      if (slur.getAttribute("type") !== "start") return;
      if (state.slurNumber === null && note.slur === undefined) {
        note.slur = "start";
        state.slurNumber = slur.getAttribute("number") ?? "1";
      } else {
        report(counter, "重なったスラー"); // 2本目のスラー・終わりと同じ音から始まるスラー
      }
    });

    // スタッカート・テヌート・アクセントなどと、ブレス・カエスーラ（ブレス・カエスーラはステップ11-1c）
    childElements(notations, "articulations").forEach((group) => {
      for (const child of Array.from(group.childNodes)) {
        if (child.nodeType !== 1) continue;
        const name = XML_TO_ARTICULATION[child.nodeName];
        if (name) {
          note.articulations = note.articulations ?? [];
          if (!note.articulations.includes(name)) note.articulations.push(name);
        } else if (XML_TO_BREATH[child.nodeName]) {
          // ブレス・カエスーラは1つだけ（両方あれば、あとのほう）
          note.breath = XML_TO_BREATH[child.nodeName];
        } else {
          report(counter, unsupportedLabel(child.nodeName));
        }
      }
    });

    // 弓・指番号・弦楽器の記号（弦楽器の記号はステップ11-1b）
    childElements(notations, "technical").forEach((group) => {
      for (const child of Array.from(group.childNodes)) {
        if (child.nodeType !== 1) continue;
        if (XML_TO_BOWING[child.nodeName]) {
          note.bowing = XML_TO_BOWING[child.nodeName];
        } else if (XML_TO_STRING_MARK[child.nodeName]) {
          // ハーモニクス・左手ピチカート・バルトーク・ピチカート
          // 同じ group の記号（左手ピチカートとバルトーク・ピチカート）がもう付いていたら、あとのほうは入れない
          const name = XML_TO_STRING_MARK[child.nodeName];
          const group = STRING_MARKS[name].group;
          const list = note.stringMarks ?? [];
          const sameGroup = list.some((other) => group && STRING_MARKS[other].group === group);
          if (!list.includes(name) && !sameGroup) note.stringMarks = [...list, name];
        } else if (child.nodeName === "fingering") {
          // 指番号は 0〜4 だけ（同じ数字は1つだけ）
          const finger = Number(child.textContent.trim());
          if (Number.isInteger(finger) && finger >= 0 && finger <= 4) {
            note.fingerings = note.fingerings ?? [];
            if (!note.fingerings.includes(finger)) note.fingerings.push(finger);
          } else {
            report(counter, "指番号（0〜4 以外）");
          }
        } else {
          report(counter, unsupportedLabel(child.nodeName));
        }
      }
    });

    // フェルマータ
    if (childElement(notations, "fermata")) note.fermata = true;

    // 強弱（ふつうは <direction> に書くが、音符の中に書くソフトもある）
    childElements(notations, "dynamics").forEach((dynamics) => {
      readDynamics(dynamics, note, counter);
    });

    // トリルなどの装飾（このアプリにはないので数える）
    childElements(notations, "ornaments").forEach((group) => {
      for (const child of Array.from(group.childNodes)) {
        if (child.nodeType === 1 && !IGNORED_NOTATIONS.includes(child.nodeName)) report(counter, unsupportedLabel(child.nodeName));
      }
    });

    // そのほか（グリッサンド・アルペジオなど）
    for (const child of Array.from(notations.childNodes)) {
      if (child.nodeType === 1 && !IGNORED_NOTATIONS.includes(child.nodeName)) report(counter, unsupportedLabel(child.nodeName));
    }
  });
}

// ----------------------------------------------------------
// 関数：readDynamics
// <dynamics> の中の強弱を読んで、target の dynamic に入れる（ステップ8-4a）
// このアプリにない強弱（ppp・sfz など）は数える
// ----------------------------------------------------------
function readDynamics(dynamics, target, counter) {
  for (const child of Array.from(dynamics.childNodes)) {
    if (child.nodeType !== 1) continue;
    const name = XML_TO_DYNAMIC[child.nodeName];
    if (name) target.dynamic = name;
    else report(counter, child.nodeName === "other-dynamics" ? unsupportedLabel(child.nodeName) : `強弱 ${child.nodeName}`);
  }
}

// ----------------------------------------------------------
// 関数：readDirection
// 音符の前に書いてある <direction>（強弱・pizz./arco・松葉）を読む（ステップ8-4a）
//   direction … <direction>
//   state     … パートごとの読みかけの情報
//                pending … 次の音符に付ける記号 { dynamic, technique, wedge }
//                lastNote … ここまでに読んだ最後の音符（松葉の終わりを付ける）
//   counter   … 使えなかった記号を数える表
// ----------------------------------------------------------
function readDirection(direction, state, counter) {
  // テンポの指示（♩ = ○○ と Allegro など）は readTempo で読むので、ここでは見ない
  const sound = childElement(direction, "sound");
  const hasTempo = (sound && sound.getAttribute("tempo")) || direction.getElementsByTagName("metronome").length > 0;
  if (hasTempo) return;

  childElements(direction, "direction-type").forEach((type) => {
    // 強弱：次の音符に付ける
    childElements(type, "dynamics").forEach((dynamics) => {
      readDynamics(dynamics, state.pending, counter);
    });

    // 文字：pizz.・arco だけ使う（ほかの文字は数える）
    childElements(type, "words").forEach((words) => {
      const text = words.textContent.trim().toLowerCase();
      if (text === "") return;
      if (/^pizz\.?$/.test(text)) state.pending.technique = "pizz.";
      else if (/^arco\.?$/.test(text)) state.pending.technique = "arco";
      else report(counter, "文字の指示（dolce・cresc. など）");
    });

    // 松葉
    childElements(type, "wedge").forEach((wedge) => {
      const kind = wedge.getAttribute("type");
      if (kind === "crescendo" || kind === "diminuendo") {
        // 始まり：次の音符に付ける
        state.pending.wedge = kind;
      } else if (kind === "stop") {
        // 終わり：ここまでに読んだ最後の音符に付ける（その音符に別の印があれば使えない）
        if (state.lastNote && state.lastNote.wedge === undefined) state.lastNote.wedge = "stop";
        else report(counter, "つなげられなかった松葉");
      }
    });
  });
}

// ----------------------------------------------------------
// 関数：applyPending
// <direction> で読んでおいた記号（強弱・pizz./arco・松葉の始まり）を、音符に付ける（ステップ8-4a）
// 休符には付けず、次の音符まで持ち越す
// ----------------------------------------------------------
function applyPending(note, state, counter) {
  if (note.rest) return;
  const pending = state.pending;
  if (pending.dynamic) note.dynamic = pending.dynamic;
  if (pending.technique) note.techniques = [pending.technique];
  if (pending.wedge) {
    // 同じ音符で前の松葉が終わっていたら、このアプリでは付けられない
    if (note.wedge === undefined) note.wedge = pending.wedge;
    else report(counter, "つなげられなかった松葉");
  }
  state.pending = {};
}

// ----------------------------------------------------------
// 関数：readPart
// <part> 1つ分の小節を読む
//   partElement … <part>
//   counter     … 使えなかった記号を数える表（ステップ8-4a）
//   skipped     … 使わなかった音を数える表（ステップ8-4b）
// 戻り値：{
//   measures: [{ notes, clef?, time?, key?, readable }]（小節ごと）
//   firstClef: 最初の音部記号
//   problems:  読めなかった小節の番号（1 から）の配列
// }
// time・key は「この小節で書いてあったもの」（変わったかどうかは、あとで全体で決める）
// ----------------------------------------------------------
function readPart(partElement, counter, skipped) {
  // 読みかけの記号の情報（ステップ8-4a）
  //   slurNumber … 開いているスラーの番号（開いていなければ null）
  //   pending    … <direction> で読んで、次の音符に付ける記号
  //   lastNote   … ここまでに読んだ最後の音符（松葉の終わりを付ける）
  const state = { slurNumber: null, pending: {}, lastNote: null };

  let divisions = 1; // ファイルで書いていなければ 1（MusicXML の決まり）
  let firstClef = null;
  let mainVoice = null; // このパートで使う声部（最初の音の声部）
  let countedChord = null; // 重音として数えた最後の音（同じ重音を2回数えないため）（ステップ8-4b）
  const measures = [];
  const problems = [];

  childElements(partElement, "measure").forEach((measureElement, index) => {
    const measure = { notes: [], ticks: 0, readable: true };

    for (const element of Array.from(measureElement.childNodes)) {
      if (element.nodeType !== 1) continue;

      // 小節の頭の情報
      if (element.nodeName === "attributes") {
        const div = Number(childText(element, "divisions"));
        if (div > 0) divisions = div;

        const keyElement = childElement(element, "key");
        const fifths = keyElement ? childText(keyElement, "fifths") : null;
        if (fifths !== null) measure.key = Math.max(-7, Math.min(7, Number(fifths)));

        const timeElement = childElement(element, "time");
        if (timeElement) {
          const time = timeFromXml(timeElement);
          if (time) measure.time = time;
          else measure.readable = false; // このアプリで使えない拍子
        }

        const clefElement = childElement(element, "clef");
        if (clefElement) {
          const clef = clefFromXml(clefElement);
          if (clef) {
            measure.clef = clef;
            if (firstClef === null) firstClef = clef;
          }
        }
        continue;
      }

      // 強弱・pizz./arco・松葉（ステップ8-4a）
      if (element.nodeName === "direction") {
        readDirection(element, state, counter);
        continue;
      }

      // 声部を進める印（見えない休符）：使っている声部のものだけ、休符にする（ステップ8-4b）
      if (element.nodeName === "forward") {
        const voice = childText(element, "voice");
        if (voice !== null && voice === mainVoice) {
          const sixteenths = (Number(childText(element, "duration")) * 4) / divisions; // 16分音符いくつ分か
          const ticks = sixteenths * TICKS_PER_16TH; // このアプリのティック（ステップ10-1）
          const shape = TICKS_TO_DURATION[sixteenths];
          if (shape) measure.notes.push({ rest: true, duration: shape.duration, dots: shape.dots });
          else measure.readable = false;
          measure.ticks = measure.ticks + ticks;
        }
        continue;
      }

      // 音符・休符
      if (element.nodeName === "note") {
        // 装飾音（大きさのない音）は使わない（ステップ8-4b：数を知らせる）
        if (childElement(element, "grace")) {
          report(skipped, "装飾音");
          continue;
        }

        // 2つ目の声部は使わない（ステップ8-4b：音符の数を知らせる。休符は数えない）
        const voice = childText(element, "voice") ?? "1";
        if (mainVoice === null) mainVoice = voice;
        if (voice !== mainVoice) {
          if (!childElement(element, "rest")) report(skipped, "2つ目の声部の音");
          continue;
        }

        // 重音の2つ目以降：一番上の音だけ残す（ステップ8-4b）
        if (childElement(element, "chord")) {
          const base = measure.notes[measure.notes.length - 1]; // 重音の1つ目の音（もう読んである）
          if (!base || base.rest || !measure.readable) continue;
          const member = readNote(element, divisions).note;
          if (!member || member.rest) continue;
          if (pitchNumber(member.pitch) > pitchNumber(base.pitch)) {
            // こちらのほうが高い：高さとタイを入れ替える
            base.pitch = member.pitch;
            base.tie = member.tie;
          }
          // この音に付いていた記号（スラーなど）は、残した音にまとめる
          readNotations(element, base, state, counter);
          // 重音1つにつき1回だけ数える（3つ以上の音の重音でも1回）
          if (countedChord !== base) {
            report(skipped, "重音（一番上の音だけ残した）");
            countedChord = base;
          }
          continue;
        }

        const { note, ticks } = readNote(element, divisions);
        if (note) {
          // 記号を付ける（ステップ8-4a）
          applyPending(note, state, counter);
          readNotations(element, note, state, counter);
          if (!note.rest) state.lastNote = note;
          measure.notes.push(note);
        } else {
          measure.readable = false;
        }
        measure.ticks = measure.ticks + ticks;
      }
      // <backup>（声部をさかのぼる印）は見ない（2つ目の声部は使わないため）
    }

    // 連符がそろっているか調べる（ステップ10-6）
    // 1つの連符の中で長さがまちまち・数が足りない連符は、このアプリでは扱えないので、小節ごと休符にする
    if (measure.readable && tupletGroups(measure.notes).some((g) => g.end - g.start + 1 !== g.actual)) {
      measure.readable = false;
    }

    if (!measure.readable) problems.push(index + 1);
    measures.push(measure);
  });

  return { measures: measures, firstClef: firstClef, problems: problems };
}

// ----------------------------------------------------------
// 関数：fitMeasure
// 読んだ音を、小節の長さに合わせる
//   ・足りないとき … 残りを1拍ずつの休符で埋める
//                    （アウフタクトの1小節目は前を、それ以外は後ろを埋める）（ステップ8-4b）
//   ・多すぎる・読めない音があるとき … 小節を全部休符にする（読めなかったと知らせる）
//   read     … readPart で読んだ1小節分
//   time     … その小節の拍子
//   isPickup … アウフタクトの1小節目か
// 戻り値：{ notes: 音符・休符の配列, ok: そのまま使えたか }
// ----------------------------------------------------------
function fitMeasure(read, time, isPickup = false) {
  const total = measureTicks(time);
  if (!read.readable || read.ticks > total) {
    return { notes: restsForSpan(0, total, time), ok: false };
  }
  // アウフタクト：足りない分の休符を前に置いてから、読んだ音を並べる
  if (isPickup && read.ticks < total) {
    return { notes: [...restsForSpan(0, total - read.ticks, time), ...read.notes], ok: true };
  }
  const notes = [...read.notes];
  if (read.ticks < total) {
    // 終わりが音符でタイが出ていたら外す（休符とはつなげない）
    const last = notes[notes.length - 1];
    if (last && last.tie) last.tie = false;
    notes.push(...restsForSpan(read.ticks, total - read.ticks, time));
  }
  return { notes: notes, ok: true };
}

// ----------------------------------------------------------
// 関数：musicXMLToScore
// MusicXML の文字を、このアプリの楽譜データにする（読み込み）
//   text          … MusicXML の文字
//   fallbackTitle … タイトルがないときに使う名前（ファイルの名前など）
// 戻り値：{ score: 楽譜データ, warnings: 知らせることの文の配列 }
// 楽譜として読めないときはエラーを投げる（メッセージは画面に出せる日本語）
// ----------------------------------------------------------
export function musicXMLToScore(text, fallbackTitle = "") {
  // ① 文字 → XML の木（ブラウザにもともとある DOMParser を使う）
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("ファイルの形が正しくないため、読み込めませんでした");
  }
  const root = doc.documentElement;
  if (root.nodeName === "score-timewise") {
    throw new Error("この形（score-timewise）の MusicXML にはまだ対応していません");
  }
  if (root.nodeName !== "score-partwise") {
    throw new Error("MusicXML のファイルではないようです");
  }

  const warnings = [];

  // ② タイトル・作曲者
  const work = childElement(root, "work");
  const title = childText(work, "work-title") || childText(root, "movement-title") || fallbackTitle || "無題";
  const identification = childElement(root, "identification");
  const composerElement = childElements(identification, "creator").find((c) => c.getAttribute("type") === "composer");
  const composer = composerElement ? composerElement.textContent.trim() : "";

  // ③ パートの一覧（id → パート名・楽器の名前）
  const partInfo = {};
  childElements(childElement(root, "part-list"), "score-part").forEach((scorePart) => {
    const instrumentElement = childElement(scorePart, "score-instrument");
    partInfo[scorePart.getAttribute("id")] = {
      name: childText(scorePart, "part-name") ?? "",
      sound: instrumentElement ? (childText(instrumentElement, "instrument-sound") ?? "") : "",
      instrumentName: instrumentElement ? (childText(instrumentElement, "instrument-name") ?? "") : "",
    };
  });

  // ④ パートごとに小節を読む
  const partElements = childElements(root, "part");
  if (partElements.length === 0) throw new Error("ファイルの中にパートが見つかりませんでした");
  const counter = {}; // このアプリで使えなかった記号などの数（ステップ8-4a）
  const skipped = {}; // 使わなかった音の数（ステップ8-4b）
  const readParts = partElements.map((partElement) => readPart(partElement, counter, skipped));

  // 小節の数は、一番多いパートに合わせる（最低1小節）
  const measureCount = Math.max(1, ...readParts.map((read) => read.measures.length));

  // ⑤ 楽譜全体の小節の情報（拍子・調）を、一番上のパートから決める（変わる所だけ書く）
  const measures = [];
  let currentTime = { beats: 4, beatType: 4 };
  let currentKey = 0;
  const times = []; // 小節ごとの拍子（音を小節に合わせるときに使う）
  for (let i = 0; i < measureCount; i++) {
    const read = readParts[0].measures[i];
    const prevTime = currentTime; // 1つ前の小節の拍子
    const prevKey = currentKey; // 1つ前の小節の調
    if (read && read.time) currentTime = read.time;
    if (read && read.key !== undefined) currentKey = read.key;

    const info = {};
    if (i === 0) {
      // 1小節目には必ず書く
      info.time = currentTime;
      info.key = currentKey;
    } else {
      // 途中は、前の小節と違うときだけ書く
      if (!sameTime(currentTime, prevTime)) info.time = currentTime;
      if (currentKey !== prevKey) info.key = currentKey;
    }
    times.push(currentTime);
    measures.push(info);
  }

  // アウフタクトか調べる（ステップ8-4b）
  // 1小節目で、どのパートも拍子より短い（読めた音の長さが一番長いパートでも足りない）ならアウフタクト
  const firstTotal = measureTicks(times[0]);
  const firstLengths = readParts.map((read) => (read.measures[0] && read.measures[0].readable ? read.measures[0].ticks : 0));
  const longestFirst = Math.max(...firstLengths);
  const isPickup = longestFirst > 0 && longestFirst < firstTotal;
  if (isPickup) {
    warnings.push("1小節目が短い（アウフタクト）ので、前を休符で埋めて拍子どおりの長さにしました");
  }

  // ⑥ パートのデータを作る
  const problemMeasures = new Set(); // 休符にした小節の番号（1 から。同じ小節は1回だけ）（ステップ8-4c）
  const parts = readParts.map((read, p) => {
    const id = partElements[p].getAttribute("id");
    const info = partInfo[id] ?? { name: "", sound: "", instrumentName: "" };

    // 楽器を決める：パート名 → 楽器の名前 → 楽器の種類（instrument-sound）→ 音部記号
    let instrument = instrumentFromName(info.name) ?? instrumentFromName(info.instrumentName) ?? instrumentFromName(info.sound);
    if (!instrument) {
      instrument = instrumentFromClef(read.firstClef);
      const label = info.name || `${p + 1}番目のパート`;
      warnings.push(`「${label}」は${INSTRUMENTS[instrument].label}として読み込みました`);
    }

    // 小節を作る（音を小節の長さに合わせる）
    let lastClef = null;
    const partMeasures = [];
    for (let i = 0; i < measureCount; i++) {
      const readMeasure = read.measures[i] ?? { notes: [], ticks: 0, readable: true };
      const fitted = fitMeasure(readMeasure, times[i], i === 0 && isPickup);
      if (!fitted.ok) problemMeasures.add(i + 1);

      const measure = { notes: fitted.notes };
      // 音部記号：1小節目は必ず書く。途中は変わったときだけ
      const clef = i === 0 ? (readMeasure.clef ?? read.firstClef ?? INSTRUMENTS[instrument].clef) : readMeasure.clef;
      if (clef && clef !== lastClef) {
        measure.clef = clef;
        lastClef = clef;
      }
      partMeasures.push(measure);
    }

    // パートの最後の音からタイが出ていたら外す（つながる先がない）
    const lastNotes = partMeasures[partMeasures.length - 1].notes;
    const lastNote = lastNotes[lastNotes.length - 1];
    if (lastNote && lastNote.tie) lastNote.tie = false;

    return { name: "", abbreviation: "", instrument: instrument, measures: partMeasures };
  });

  // タイの相手が休符・違う高さになっている所は外す（つながる先がない）
  parts.forEach((part) => {
    const flat = part.measures.flatMap((m) => m.notes);
    flat.forEach((note, k) => {
      if (!note.tie) return;
      const next = flat[k + 1];
      const samePitch = next && !next.rest && next.pitch.step === note.pitch.step && next.pitch.alter === note.pitch.alter && next.pitch.octave === note.pitch.octave;
      if (!samePitch) note.tie = false;
    });
  });

  // 相手のいないスラー・松葉を外す（読めなかった小節で片方が消えたときなど）（ステップ8-4a）
  parts.forEach((part) => cleanSpanners(part));

  // パート名は、このアプリの決まりで付け直す（Violin I・Violin II…）
  renameParts(parts);

  // 休符にした小節を「12か所（12・36・53・120・122 小節目 …）」の形で知らせる（6つ目からは「…」）（ステップ8-4c）
  if (problemMeasures.size > 0) {
    const numbers = [...problemMeasures].sort((a, b) => a - b);
    const shown = numbers.slice(0, 5).join("・") + (numbers.length > 5 ? " 小節目 …" : " 小節目");
    warnings.push(`連符などの読めない音があったので、休符にした小節：${numbers.length}か所（${shown}）`);
  }

  // 使わなかった音を、多い順に知らせる（ステップ8-4b）
  const skippedList = Object.entries(skipped).sort((a, b) => b[1] - a[1]);
  if (skippedList.length > 0) {
    warnings.push(`使わなかった音：${skippedList.map(([label, count]) => `${label} ${count}か所`).join("、")}`);
  }

  // 使えなかった記号を、多い順に「トリル 12個、…」の形で知らせる（ステップ8-4a）
  const unsupported = Object.entries(counter).sort((a, b) => b[1] - a[1]);
  if (unsupported.length > 0) {
    warnings.push(`読み込めなかった記号：${unsupported.map(([label, count]) => `${label} ${count}個`).join("、")}`);
  }

  // ⑦ テンポ（見つからなければ 80。このアプリで使える 20〜300 に収める）
  const { tempo, tempoText } = readTempo(childElements(partElements[0], "measure")[0]);
  const roundedTempo = tempo === null ? 80 : Math.min(300, Math.max(20, Math.round(tempo)));

  const score = {
    title: title,
    composer: composer,
    tempoText: tempoText,
    tempo: roundedTempo,
    measures: measures,
    parts: parts,
  };
  return { score: score, warnings: warnings };
}
