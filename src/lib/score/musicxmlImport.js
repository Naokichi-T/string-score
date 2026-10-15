// ==========================================================
// musicxmlImport.js
// MusicXML のファイルを読み込んで、このアプリの楽譜データにする
// （ステップ8-3：読み込みの基本（タイトル・作曲者・テンポ・パート・拍子・調・音部記号・音符・休符・付点・タイ））
//
// 【流れ】
//   ファイル → readMusicXMLFile → MusicXML の文字
//   MusicXML の文字 → musicXMLToScore → { score: 楽譜データ, warnings: 知らせることの一覧 }
//
// 【長さの直し方】
//   MusicXML の長さは「4分音符を divisions 個に分けたうちのいくつか」で書いてある
//   divisions はファイルによって違う（このアプリは 4、MuseScore は 480 など）
//   → 長さ × 4 ÷ divisions で、このアプリのティック（16分音符＝1）に直す
//
// 【読めないもの】
//   この版では、読めない音（連符・32分音符など）がある小節は、休符で埋めて知らせる
//   （重音・2つ目の声部・記号の読み込みはステップ8-4で）
// ==========================================================

import { unzipSync } from "fflate";
import { INSTRUMENTS, measureTicks, restsForSpan, renameParts } from "./model.js";

// ----------------------------------------------------------
// ティック（16分音符＝1）→ 音の長さの名前と付点の数の表
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
  // 長さ：MusicXML の長さ → ティック（16分音符＝1）
  const rawDuration = Number(childText(noteElement, "duration"));
  const ticks = (rawDuration * 4) / divisions;
  const shape = TICKS_TO_DURATION[ticks]; // 整数でない・表にない長さは undefined
  if (!shape) return { note: null, ticks: ticks };

  // 休符
  if (childElement(noteElement, "rest")) {
    return { note: { rest: true, duration: shape.duration, dots: shape.dots }, ticks: ticks };
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
  return { note: note, ticks: ticks };
}

// ----------------------------------------------------------
// 関数：readPart
// <part> 1つ分の小節を読む
//   partElement … <part>
// 戻り値：{
//   measures: [{ notes, clef?, time?, key?, readable }]（小節ごと）
//   firstClef: 最初の音部記号
//   problems:  読めなかった小節の番号（1 から）の配列
// }
// time・key は「この小節で書いてあったもの」（変わったかどうかは、あとで全体で決める）
// ----------------------------------------------------------
function readPart(partElement) {
  let divisions = 1; // ファイルで書いていなければ 1（MusicXML の決まり）
  let firstClef = null;
  let mainVoice = null; // このパートで使う声部（最初の音の声部）
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

      // 音符・休符
      if (element.nodeName === "note") {
        // 装飾音（大きさのない音）は飛ばす
        if (childElement(element, "grace")) continue;
        // 重音の2つ目以降と、2つ目の声部は、この版では飛ばす（ステップ8-4で扱う）
        if (childElement(element, "chord")) continue;
        const voice = childText(element, "voice") ?? "1";
        if (mainVoice === null) mainVoice = voice;
        if (voice !== mainVoice) continue;

        const { note, ticks } = readNote(element, divisions);
        if (note) {
          measure.notes.push(note);
        } else {
          measure.readable = false;
        }
        measure.ticks = measure.ticks + ticks;
      }
      // <backup>・<forward>（声部を行き来する印）は、この版では見ない
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
//   ・多すぎる・読めない音があるとき … 小節を全部休符にする（読めなかったと知らせる）
// 戻り値：{ notes: 音符・休符の配列, ok: そのまま使えたか }
// ----------------------------------------------------------
function fitMeasure(read, time) {
  const total = measureTicks(time);
  if (!read.readable || read.ticks > total) {
    return { notes: restsForSpan(0, total, time), ok: false };
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
  const readParts = partElements.map((partElement) => readPart(partElement));

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

  // ⑥ パートのデータを作る
  const problemTexts = [];
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
      const fitted = fitMeasure(readMeasure, times[i]);
      if (!fitted.ok) problemTexts.push(`${i + 1}小節目の ${info.name || `${p + 1}番目のパート`}`);

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

  // パート名は、このアプリの決まりで付け直す（Violin I・Violin II…）
  renameParts(parts);

  if (problemTexts.length > 0) {
    warnings.push(`読めない音があったので、休符にしました：${problemTexts.join("、")}`);
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
