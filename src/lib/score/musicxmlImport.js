// ==========================================================
// musicxmlImport.js
// MusicXML のファイルを読み込んで、このアプリの楽譜データにする
// （ステップ8-3：読み込みの基本（タイトル・作曲者・テンポ・パート・拍子・調・音部記号・音符・休符・付点・タイ））
// （ステップ8-4a：記号（弓・指番号・スタッカートなど・フェルマータ・pizz./arco・強弱・スラー・松葉））
// （ステップ8-4b：重音・2つ目の声部・装飾音・アウフタクト）
// （ステップ14-3：重音を読むようにした。<chord/> の付いた音を、1つ前の音に重ねる）
// （ステップ14-4b：アルペジオ（<arpeggiate>）を読むようにした。1音だけの音符に付いていたら使わずに数える）
// （ステップ14-5b：ハーモニクスのひし形の玉を読むようにした）
//   ・<notehead>diamond</notehead> の音、<harmonic> の中に <touching-pitch/>（触れる音）がある音 → ひし形の玉
//   ・<harmonic> は、中身が空か <natural/> だけのとき（ひし形の玉でもないとき）だけ、今までどおり「○」にする
//     （<artificial/>（人工）・<touching-pitch/>・<base-pitch/>（押さえる音）がある、またはひし形の玉 → 「○」は付けない）
// （ステップ14-6b：2音トレモロ（<tremolo type="start">・<tremolo type="stop"> の組）を読むようにした）
//   ・組の2つの音を、1つの2音トレモロの音符（2音の重音＋alternate）にまとめる（下の音から並べ直す）
//   ・このアプリで扱えない形（8分音符の組・重音の組など）は、2つのふつうの音符（半分の長さ）にして知らせる
// （ステップ16-2：松葉を番号（number）ごとに組にして読むようにした）
//   ・終わり（stop）は、同じ番号で開いている松葉のうち、いちばん古いものを閉じる（番号を書かないファイルも組になる）
//   ・始まりと同じ音符で終わる松葉 → その音符の下だけの松葉（wedgeInside）
//   ・始まりと違う音符で終わる松葉 → 終わりの音符に wedgeEnd（その音符から次の松葉が始まっていてもよい）
// （ステップ19-2：連桁（<beam number="1">）を読んで、自動のつなぎ方と違う所に連桁の印（join・break）を付けるようにした）
// （ステップ20：全部のパートの最後の小節が拍子より短ければ、短い最後の小節（short）として読むようにした）
// （ステップ22：符尾の向き（<stem>）を読んで、自動の向きと違う所にだけ、決めた向き（stem）を残すようにした）
// （点線付きの cresc.・dim.：「cresc. - - -」のように点線の付いた cresc.・dim. を、松葉（＜・＞）として読むようにした）
//   ・前は、一番上のパートでテンポの自由な文字（再生では変えない rit. の仲間）になってしまっていた（不具合）
//   ・文字と点線の始まり（<dashes type="start">）のある音から、同じ番号の点線の終わり（<dashes type="stop">）の
//     前の音までを、cresc. なら＜、dim. なら＞の松葉にする（全部のパートで読む）
//   ・rit.・accel. の点線は、同じ番号の点線の終わりでだけ閉じるようにした（cresc. の点線の終わりで閉じないように）
// （途中の短い小節：曲の途中で、どのパートも拍子より短い小節を、短い小節として読むようにした）
//   ・前は、何も知らせずに後ろを休符で埋めて、拍子どおりの小節にしていた
//   ・続き（pickup。小節の後ろの部分・番号に数えない）にするもの
//       <measure implicit="yes">（番号に数えない小節の印）がある
//       または、前の小節が「前の部分」で、2つ足すとちょうど1小節になる（印を書かないアプリのファイルのため）
//   ・それ以外は、前の部分（short。小節の頭から・番号に数える）にする
//   ・長さが拍の単位で割り切れないときは、アウフタクトと同じく切り上げて知らせる
// （保持線：「指の数字（<words>1</words>）＋線の括弧（<bracket type="start" line-end="none">）」の <direction> を、
//   保持線の始まりとして読むようにした。同じ番号の <bracket type="stop"> までを、その指の保持線にする（このアプリの書き出しと同じ形））
// （注意の臨時記号：<note> に <accidental>（表示する臨時記号）が書いてあれば、高さに注意の記号の印（courtesy）を付ける）
//   ・ふつうの音符・重音の玉・前打音のどれも同じ
//   ・最後に pruneCourtesy で、決まりでもともと記号が付く音の印を外す
//     → 印が残るのは「決まりでは要らないのに、ファイルに記号が書いてあった音」（＝注意の記号）だけ
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
//   読めない長さの音（64分音符・倍全音符・付点の32分音符・読めない連符など）がある小節 … 小節ごと休符にする
//   （ステップ15-5：32分音符・付点16分音符は読めるようにした）
//   重音 … 4音までは重音として読む（5音以上なら上の4音を残す）（ステップ14-3。前は一番上の音だけ残していた）
//          ほかの音に付いていた記号は、重音全体の記号にまとめる
//   2つ目の声部 … 使わない
//   装飾音 … 前打音として、次の主音に付ける（ステップ11-8b。主音に近い1つだけ）
//            重音の前打音・前打音の指番号も読む（ステップ24-3）
//   アウフタクト（1小節目が拍子より短い）… アプリのアウフタクト（pickup）として読む（ステップ15-3。前は1小節目の前を休符で埋めていた）
//     長さが「拍子の下の数字の音符◯つ」にならないときは、その単位に切り上げて前を休符で埋め、知らせる
//   どれも、最後にまとめて知らせる
//
// 【記号の読み方】（ステップ8-4a）
//   音符の中の <notations> … スラー・スタッカートなど・弓・指番号・フェルマータ → その音符に付ける
//   音符の前の <direction> … 強弱・pizz./arco・松葉の始まり → 次の音符に付ける
//                            松葉の終わり → その前の音符に付ける
//                            （1つの音符の中で始まって終わる松葉は、次の音符まで延ばす（ステップ15-6））
//   休符には記号を付けない（このアプリの決まり。記号タブでも休符には付けられない）
//   このアプリにない記号（トリルなど）は読まずに、種類ごとの数を知らせる
// ==========================================================

import { unzipSync } from "fflate";
import {
  INSTRUMENTS,
  measureTicks,
  restsForSpan,
  renameParts,
  TICKS_PER_16TH,
  DURATION_ORDER,
  durationToTicks,
  tupletGroups,
  createPartId,
  tempoAt,
  setNotePitches,
  samePitch,
  pitchNumber,
  MAX_CHORD_NOTES,
  hasDiamond,
  ALTERNATE_DURATIONS,
  upgradeWedgeNotes,
  measureNumberLabel, // 小節番号の文字（続きの小節は "(8)"）（途中の短い小節）
  describeLength, // 短い小節の長さの文字（半拍刻みに対応。知らせの文に使う）
} from "./model.js";
import { BOWINGS, ARTICULATIONS, STRING_MARKS, BREATHS, ORNAMENTS, TECHNIQUES, DYNAMICS, HOLD_FINGERS } from "./symbols.js"; // HOLD_FINGERS：保持線に使える指（保持線）
import { cleanSpanners, cleanAlternates } from "./edit.js";
import { pruneCourtesy } from "./accidentals.js"; // 要らない注意の記号の印を外す（注意の臨時記号）
import { marksFromFile } from "./beams.js"; // 連桁の印（ステップ19-2）
import { stemsFromFile } from "./stems.js"; // 符尾の向き（ステップ22）
// 文字から、テンポの変化の意味を当てる関数と、このアプリで書き出した rit.・自由な文字の印（id の始まり）（自由な文字のテンポの指示）
import { tempoWordKind, GRADUAL_ID_PREFIX } from "./tempoWords.js";

// ----------------------------------------------------------
// 16分音符いくつ分か → 音の長さの名前と付点の数の表
// このアプリで使える長さは、この10個だけ
// （ステップ15-5：付点16分音符（1.5）と32分音符（0.5）を足した）
// ----------------------------------------------------------
const TICKS_TO_DURATION = {
  16: { duration: "whole", dots: 0 }, // 全音符
  12: { duration: "half", dots: 1 }, // 付点2分音符
  8: { duration: "half", dots: 0 }, // 2分音符
  6: { duration: "quarter", dots: 1 }, // 付点4分音符
  4: { duration: "quarter", dots: 0 }, // 4分音符
  3: { duration: "eighth", dots: 1 }, // 付点8分音符
  2: { duration: "eighth", dots: 0 }, // 8分音符
  1.5: { duration: "16th", dots: 1 }, // 付点16分音符（ステップ15-5）
  1: { duration: "16th", dots: 0 }, // 16分音符
  0.5: { duration: "32nd", dots: 0 }, // 32分音符（ステップ15-5）
};

// ----------------------------------------------------------
// パート名から楽器を決めるための言葉（小文字で比べる）
// 上から順に調べる（"violoncello" に "violin" が入っていないか、などに気をつけて
// チェロ → ビオラ → バイオリンの順にしている）
// （ステップ18-3：コントラバスを、いちばん前に追加。"Double Bass"・"Kontrabass" などは "bass" で見分ける。
//   書いてある音はどのアプリも「楽譜に書いた高さ」なので、そのまま読めばよい（<transpose> は読まなくてよい））
// ----------------------------------------------------------
const NAME_RULES = [
  { instrument: "contrabass", words: ["contrabass", "contrabbasso", "contrebasse", "kontrabass", "bass", "cb.", "d.b.", "kb.", "コントラバス"] },
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
const XML_TO_ORNAMENT = reverseTable(ORNAMENTS); // ステップ11-3a
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
  "other-dynamics": "強弱（その他）",
};

// 数えなくてよい（ほかの所で扱う・中身だけを見る）記号の名前（tuplet は連符の印。連符の小節は別に知らせる）
// （ステップ11-5c：グリッサンド（glissando・slide）は読むようにしたので、ここに入れた）
// （ステップ14-4b：アルペジオ（arpeggiate）も読むようにしたので、ここに入れた）
const IGNORED_NOTATIONS = [
  "tied",
  "slur",
  "fermata",
  "articulations",
  "technical",
  "ornaments",
  "dynamics",
  "wavy-line",
  "accidental-mark",
  "other-notation",
  "tuplet",
  "glissando",
  "slide",
  "arpeggiate",
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
  const UNIT_QUARTERS = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25, "32nd": 0.125 }; // 32分音符はステップ15-5

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
// 関数：markCourtesy
// <note> に <accidental>（表示する臨時記号）が書いてあれば、高さに注意の記号の印（courtesy）を付ける（注意の臨時記号）
//   noteElement … <note>
//   pitch       … 読んだ高さのデータ（ここに印を足す）
// ここでは、記号が書いてあれば全部に印を付ける（要らない印は、最後に pruneCourtesy で外す）
// ----------------------------------------------------------
function markCourtesy(noteElement, pitch) {
  if (childElement(noteElement, "accidental")) pitch.courtesy = true;
}

// ----------------------------------------------------------
// 関数：harmonicElements
// <note> の中の <notations> → <technical> → <harmonic> を全部集めて返す（ステップ14-5b）
//   noteElement … <note>
// 戻り値：<harmonic> の要素の配列（なければ空の配列）
// ----------------------------------------------------------
function harmonicElements(noteElement) {
  const list = [];
  childElements(noteElement, "notations").forEach((notations) => {
    childElements(notations, "technical").forEach((technical) => {
      list.push(...childElements(technical, "harmonic"));
    });
  });
  return list;
}

// ----------------------------------------------------------
// 関数：isDiamondNote
// <note> の玉が、ハーモニクスで軽く触れる音（ひし形の玉）かどうかを調べる（ステップ14-5b）
//   noteElement … <note>
// ひし形とみなすもの
//   ・<notehead>diamond</notehead>（玉の形がひし形）
//   ・<harmonic> の中に <touching-pitch/>（「この音は触れる音」という意味の印）がある
// 戻り値：true / false
// ----------------------------------------------------------
function isDiamondNote(noteElement) {
  // 玉の形（filled="yes" などの付け足しは見ない。中の文字だけを見る）
  const notehead = childElement(noteElement, "notehead");
  if (notehead && notehead.textContent.trim() === "diamond") return true;
  // 意味の印
  return harmonicElements(noteElement).some((harmonic) => childElement(harmonic, "touching-pitch"));
}

// ----------------------------------------------------------
// 関数：isCircleHarmonic
// <harmonic> を、音符の上の「○」（ナチュラルハーモニクス）として読んでよいか調べる（ステップ14-5b）
//   harmonic    … <harmonic> の要素
//   noteElement … その <harmonic> が入っている <note>
// 「○」にしないもの（ひし形の書き方のハーモニクスの一部なので）
//   ・<artificial/>（人工ハーモニクス）がある
//   ・<touching-pitch/>（触れる音）・<base-pitch/>（押さえる音）がある
//   ・玉がひし形（<notehead>diamond</notehead>）
// それ以外（中身が空・<natural/> だけ・<sounding-pitch/>（聞こえる音で書いてある））は「○」（決めたことの A）
// 戻り値：true / false
// ----------------------------------------------------------
function isCircleHarmonic(harmonic, noteElement) {
  if (childElement(harmonic, "artificial")) return false;
  if (childElement(harmonic, "touching-pitch")) return false;
  if (childElement(harmonic, "base-pitch")) return false;
  if (isDiamondNote(noteElement)) return false;
  return true;
}

// ----------------------------------------------------------
// 関数：pairTremolo
// <note> に、2音トレモロの組の印（<tremolo type="start"> か "stop"）があれば、その中身を返す（ステップ14-6b）
//   noteElement … <note>
// 戻り値：{ type: "start" か "stop", count: 連桁の本数（1〜3。4本以上は3、書いていなければ3） }（印がなければ null）
// ----------------------------------------------------------
function pairTremolo(noteElement) {
  for (const notations of childElements(noteElement, "notations")) {
    for (const ornaments of childElements(notations, "ornaments")) {
      for (const tremolo of childElements(ornaments, "tremolo")) {
        const type = tremolo.getAttribute("type");
        if (type !== "start" && type !== "stop") continue;
        const count = Number(tremolo.textContent.trim() || "3");
        return { type: type, count: Number.isInteger(count) && count >= 1 ? Math.min(count, 3) : 3 };
      }
    }
  }
  return null;
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
  // 2音トレモロの組の音（ステップ14-6b）
  //   <tremolo type="start"> か "stop" があって、「1個分の長さに2個」（actual が normal の2倍）の音
  //   形（<type>）と付点は、2音トレモロ全体の長さを表している（実際の長さはその半分）
  //   → 形と付点はそのままにして、あとで組をまとめる（finishAlternates）ための印 pairMark を付ける
  const pair = pairTremolo(noteElement);
  if (pair && modification) {
    const actual = Number(childText(modification, "actual-notes"));
    const normal = Number(childText(modification, "normal-notes"));
    const type = childText(noteElement, "type");
    const dots = childElements(noteElement, "dot").length;
    if (actual === normal * 2 && DURATION_ORDER.includes(type) && dots <= 1) {
      const pairTicks = durationToTicks(type, dots) / 2; // 実際の長さ（全体の半分）
      const restElement = childElement(noteElement, "rest");
      const pitchElement = childElement(noteElement, "pitch");
      if (!restElement && pitchElement && Number.isInteger(pairTicks)) {
        const note = {
          pitch: { step: childText(pitchElement, "step"), alter: Math.round(Number(childText(pitchElement, "alter") ?? 0)), octave: Number(childText(pitchElement, "octave")) },
          duration: type,
          dots: dots,
          tie: childElements(noteElement, "tie").some((t) => t.getAttribute("type") === "start"),
          pairMark: pair, // { type: "start" か "stop", count: 連桁の本数 }
        };
        if (isDiamondNote(noteElement)) note.pitch.diamond = true;
        markCourtesy(noteElement, note.pitch); // 臨時記号が書いてあれば、注意の記号の印（注意の臨時記号）
        return { note: note, ticks: pairTicks };
      }
    }
  }
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
  const restElement = childElement(noteElement, "rest");
  if (restElement) {
    const rest = { rest: true, duration: shape.duration, dots: shape.dots };
    if (tuplet) rest.tuplet = tuplet;
    // 小節まるごとの休符（<rest measure="yes"/>）なら、その印を付ける（全休符で描く）（ステップ13-3）
    // （小節の中にこの休符1つだけにならなかったときは、fitMeasure で印を外す）
    if (restElement.getAttribute("measure") === "yes") rest.measureRest = true;
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
  // ひし形の玉なら、高さに印を付ける（重音の2つ目からの音も、この関数で読むので、高さごとに付く）（ステップ14-5b）
  if (isDiamondNote(noteElement)) note.pitch.diamond = true;
  // 臨時記号が書いてあれば、注意の記号の印を付ける（重音の2つ目からの音も、この関数で読むので、高さごとに付く）（注意の臨時記号）
  markCourtesy(noteElement, note.pitch);
  if (tuplet) note.tuplet = tuplet; // 連符の印（ステップ10-6）
  return { note: note, ticks: ticks };
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
        } else if (child.nodeName === "harmonic" && !isCircleHarmonic(child, noteElement)) {
          // ひし形の書き方のハーモニクスの印：「○」は付けない（ひし形の玉は readNote で読んである）（ステップ14-5b）
          continue;
        } else if (XML_TO_STRING_MARK[child.nodeName]) {
          // ハーモニクス（「○」）・左手ピチカート・バルトーク・ピチカート
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

    // トリルなどの装飾（ステップ11-3a：トリルを読む。このアプリにない装飾は数える）
    // トリルの波線（wavy-line）は、タイから自動で描くので読まない
    childElements(notations, "ornaments").forEach((group) => {
      for (const child of Array.from(group.childNodes)) {
        if (child.nodeType !== 1) continue;
        if (XML_TO_ORNAMENT[child.nodeName]) {
          note.ornament = XML_TO_ORNAMENT[child.nodeName];
        } else if (child.nodeName === "tremolo") {
          // トレモロ（ステップ11-4）
          // type が single（なければ single とみなす）：1つの音を刻むトレモロ。斜線は 1〜3 本（4本以上は 3本にする）
          // それ以外（start・stop）：2つの音を行き来するトレモロ。このアプリにはないので数える
          const type = child.getAttribute("type") ?? "single";
          const count = Number(child.textContent.trim() || "3");
          if (type === "single" && Number.isInteger(count) && count >= 1) note.tremolo = Math.min(count, 3);
          else if (note.pairMark)
            continue; // 2音トレモロの組の印は readNote で読んである（ステップ14-6b）
          else report(counter, "2つの音を行き来するトレモロ");
        } else if (!IGNORED_NOTATIONS.includes(child.nodeName)) {
          report(counter, unsupportedLabel(child.nodeName));
        }
      }
    });

    // グリッサンド（ステップ11-5c）
    // <glissando type="start"> か <slide type="start">（ほかのアプリがグリッサンドを書くときの名前）があれば付ける
    // 線の形（まっすぐ・波線）は問わない。type="stop" は読まない（このアプリでは、いつも次の音までなので）
    const glissandos = [...childElements(notations, "glissando"), ...childElements(notations, "slide")];
    if (glissandos.some((element) => element.getAttribute("type") === "start")) note.glissando = true;

    // アルペジオ（ステップ14-4b）：上向き・下向きの矢印付きも、ふつうの波線として読む
    // （重音の2つ目からの音に付いていても、重音全体のアルペジオになる。1音だけの音符なら、あとで外して数える）
    if (childElement(notations, "arpeggiate")) note.arpeggio = true;

    // そのほか（アルペジオのない、このアプリにない記号）
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
// 関数：normalizeWords
// 文字の指示を比べやすい形にする（小文字にして「.」を取り、まわりと間の空白を1つにそろえる）（ステップ11-2）
// 例："Sul Pont." → "sul pont"、"s.p." → "sp"
// ----------------------------------------------------------
function normalizeWords(text) {
  return text.toLowerCase().replaceAll(".", "").replace(/\s+/g, " ").trim();
}

// 文字の指示（normalizeWords したもの） → 奏法の名前 の表（ステップ11-2）
// 例："sul ponticello" → "sul pont."
const WORDS_TO_TECHNIQUE = {};
Object.entries(TECHNIQUES).forEach(([name, info]) => {
  info.aliases.forEach((alias) => {
    WORDS_TO_TECHNIQUE[normalizeWords(alias)] = name;
  });
});

// ----------------------------------------------------------
// 関数：addTechnique
// 奏法の名前の並びに、奏法を1つ足す（同じ group のものがあれば入れ替える）（ステップ11-2）
//   list … 今の並び（なければ undefined）
//   name … 足す奏法の名前
// 戻り値：新しい並び
// ----------------------------------------------------------
function addTechnique(list, name) {
  const group = TECHNIQUES[name].group;
  const others = (list ?? []).filter((other) => TECHNIQUES[other].group !== group);
  return [...others, name];
}

// （自由な文字のテンポの指示：テンポの印の言葉の表 TEMPO_WORDS と、それを使う関数 tempoWordKind は、
//   音程チェックアプリと同じものを使えるように tempoWords.js へ移した。rall.・allarg.・stringendo なども足し、
//   「poco rit.」のように前に言葉が付いていても当たるようにした）

// rit.・accel. のボタンで付けたときと同じ文字（読み込んだ文字がこれなら、自由な文字としては持たない）（自由な文字のテンポの指示）
const GRADUAL_BUTTON_TEXTS = { rit: "rit.", accel: "accel." };

// 文字の指示（空白と「.」を取って小文字にしたもの） → D.C.・D.S.・Fine・To Coda の種類 の表（ステップ11-7c）
//   "dc" などは小節の情報の jump に入れる種類（model.js の JUMP_TEXTS）、"fine"・"toCoda" はその印
//   例："D.C. al Fine" → "dcalfine" → "dcFine"、"Dal Segno" → "dalsegno" → "ds"
const JUMP_WORDS = {
  dc: "dc",
  dacapo: "dc",
  dcalfine: "dcFine",
  dacapoalfine: "dcFine",
  dcalcoda: "dcCoda",
  dacapoalcoda: "dcCoda",
  ds: "ds",
  dalsegno: "ds",
  dsalfine: "dsFine",
  dalsegnoalfine: "dsFine",
  dsalcoda: "dsCoda",
  dalsegnoalcoda: "dsCoda",
  fine: "fine",
  tocoda: "toCoda",
};

// ----------------------------------------------------------
// 関数：jumpWordKind
// 文字の指示が、D.C.・D.S.・Fine・To Coda なら、その種類を返す（ステップ11-7c）
// 「D. C.」のように間に空白があるものも同じに見るため、空白も取ってから比べる
// 例："D.S. al Coda" → "dsCoda"、"Fine" → "fine"、"To Coda" → "toCoda"、"dolce" → null
// ----------------------------------------------------------
function jumpWordKind(text) {
  return JUMP_WORDS[normalizeWords(text).replaceAll(" ", "")] ?? null;
}

// ----------------------------------------------------------
// cresc.・dim. の言葉の表（点線付きの cresc.・dim.）
//   ・DYNAMIC_WORDS … 言葉（normalizeWords したもの。「.」はもう取れている） → 松葉の種類
//   ・DYNAMIC_MODIFIERS … いっしょに書いてあってもよい飾りの言葉（poco a poco cresc. の poco・a など）
// 飾り以外の言葉が入っているもの（"cresc e accel" など）は、cresc.・dim. とはみなさない（今までどおりに読む）
// ----------------------------------------------------------
const DYNAMIC_WORDS = {
  cres: "crescendo",
  cresc: "crescendo",
  crescendo: "crescendo",
  dim: "diminuendo",
  dimin: "diminuendo",
  diminuendo: "diminuendo",
  decres: "diminuendo",
  decresc: "diminuendo",
  decrescendo: "diminuendo",
};
// （"non"（〜しない）は入れない。"non dim." は「小さくしない」なので、松葉にしてはいけないため）
const DYNAMIC_MODIFIERS = ["poco", "a", "molto", "sempre", "più", "piu", "un", "il", "ancora", "assai", "sub", "subito", "e", "ed", "ma", "très", "tres"];

// ----------------------------------------------------------
// 関数：dynamicWordKind
// 文字の指示が cresc.・dim. の仲間なら、松葉の種類を返す（点線付きの cresc.・dim.）
//   text … <words> の文字
// 例："cresc." → "crescendo"、"sempre poco a poco cresc." → "crescendo"、"molto dim." → "diminuendo"
//     "dolce" → null、"cresc. e accel." → null（飾りではない言葉が入っているので）
// 戻り値："crescendo"（＜）・"diminuendo"（＞）・null（cresc.・dim. ではない）
// ----------------------------------------------------------
function dynamicWordKind(text) {
  const tokens = normalizeWords(text)
    .split(" ")
    .filter((token) => token !== "");
  let kind = null;
  for (const token of tokens) {
    if (DYNAMIC_WORDS[token]) {
      // cresc. と dim. の両方が書いてあるもの（"cresc. dim." など）は、どちらとも決められないので使わない
      if (kind !== null && kind !== DYNAMIC_WORDS[token]) return null;
      kind = DYNAMIC_WORDS[token];
    } else if (!DYNAMIC_MODIFIERS.includes(token)) {
      return null; // 飾りではない言葉が入っている
    }
  }
  return kind;
}

// 点線付きの cresc.・dim. から作る松葉の番号の始まり（点線付きの cresc.・dim.）
// （ふつうの松葉（<wedge>）の番号 "1" などと分けるため、"dashes-1" のようにする）
const DASHES_WEDGE_PREFIX = "dashes-";

// ----------------------------------------------------------
// 関数：readJumpMarks
// D.C.・D.S.・Fine・To Coda・𝄋（Segno）・𝄌（Coda）・練習番号を読んで、楽譜全体の小節の情報（score.measures）に入れる（ステップ11-7c）
// 一番上のパートの小節だけを見る（全パート共通の印なので）
//   ・文字（<words>）："Fine" → fine、"To Coda" → toCoda、"D.C. al Fine" など → jump
//   ・文字がなくても、<sound> の印でも読む：fine="yes" → fine、tocoda → toCoda、dacapo="yes" → D.C.、dalsegno → D.S.
//   ・<segno/> → 𝄋、<coda/> → 𝄌
//       ただし同じ <direction> に「To Coda」か tocoda があれば、𝄌 の記号は To Coda の印として使われているので To Coda にする
//       D.C.・D.S. と同じ <direction> にある記号は、その文字の飾りなので 𝄋・𝄌 にはしない
//   ・𝄋・𝄌 は楽譜に1つだけ：2つ目からは使わずに数える
//   ・<rehearsal> → 練習番号（ステップ11-7d。文字は読まず、このアプリの決め方 A, B, C… で付け直す）
//   measureElements … 一番上のパートの <measure> の並び
//   score           … 作った楽譜データ（measures に書き足す）
// 戻り値：使わなかった 𝄋・𝄌 の数
// ----------------------------------------------------------
function readJumpMarks(measureElements, score) {
  let extra = 0; // 使わなかった 𝄋・𝄌 の数
  let hasSegno = false; // もう 𝄋 を付けたか
  let hasCoda = false; // もう 𝄌 を付けたか

  measureElements.forEach((measureElement, i) => {
    if (i >= score.measures.length) return;
    const info = score.measures[i];

    // 調べるまとまり：小節の中の <direction> ごと＋小節にじかに書いてある <sound>（<direction> の外に書くアプリもある）
    const groups = childElements(measureElement, "direction").map((direction) => ({
      types: childElements(direction, "direction-type"),
      sound: childElement(direction, "sound"),
    }));
    childElements(measureElement, "sound").forEach((sound) => groups.push({ types: [], sound: sound }));

    groups.forEach(({ types, sound }) => {
      // 文字から種類を集める
      const kinds = [];
      types.forEach((type) => {
        childElements(type, "words").forEach((words) => {
          const kind = jumpWordKind(words.textContent);
          if (kind) kinds.push(kind);
        });
      });
      // <sound> の印（文字がないときのため）
      const attr = (name) => (sound ? sound.getAttribute(name) : null);
      const segnoGlyph = types.some((type) => childElements(type, "segno").length > 0) || !!attr("segno");
      const codaGlyph = types.some((type) => childElements(type, "coda").length > 0) || !!attr("coda");

      // ⓪ 練習番号（どこに付いているかだけを読む）（ステップ11-7d）
      if (types.some((type) => childElements(type, "rehearsal").length > 0)) info.rehearsal = true;

      // ① Fine・To Coda
      if (kinds.includes("fine") || attr("fine") === "yes") info.fine = true;
      const toCodaHere = kinds.includes("toCoda") || !!attr("tocoda");
      if (toCodaHere) info.toCoda = true;

      // ② D.C.・D.S.（文字があれば文字で決める。なければ <sound> の印で、ただの D.C.・D.S. にする）
      const jumpKind = kinds.find((kind) => kind !== "fine" && kind !== "toCoda");
      let jumpHere = false;
      if (jumpKind) {
        info.jump = jumpKind;
        jumpHere = true;
      } else if (attr("dacapo") === "yes") {
        info.jump = info.jump ?? "dc";
        jumpHere = true;
      } else if (attr("dalsegno")) {
        info.jump = info.jump ?? "ds";
        jumpHere = true;
      }

      // ③ 𝄋・𝄌（To Coda・D.C.・D.S. の飾りとして使われているものは除く。2つ目からは数えるだけ）
      if (jumpHere) return;
      if (segnoGlyph) {
        if (hasSegno) {
          extra = extra + 1;
        } else {
          info.segno = true;
          hasSegno = true;
        }
      }
      if (codaGlyph && !toCodaHere) {
        if (hasCoda) {
          extra = extra + 1;
        } else {
          info.coda = true;
          hasCoda = true;
        }
      }
    });
  });
  return extra;
}

// ----------------------------------------------------------
// 関数：readTempoMarks
// 2小節目からの、テンポの指示を読んで、楽譜全体の小節の情報（score.measures）に入れる（ステップ11-6c）
// 一番上のパートの小節だけを見る（テンポの指示は全パート共通なので）
//   ・♩＝○○（<metronome> か <sound tempo>）… その小節のテンポ変更（今と同じテンポなら付けない）
//                                            文字が a tempo なら、a tempo にする
//   ・文字が rit.・accel.・a tempo など       … その印
//       （自由な文字のテンポの指示：rall.・allargando なども、言葉の表（tempoWords.js）で見分けて、
//         元の文字のまま自由な文字（gradualText）として持つ。再生での扱いは、表で当たった種類にする）
//   ・表にない文字でも、点線の始まりが付いているもの … 「再生では変えない」自由な文字（gradual: "none"）
//       （点線が付いているのは、テンポの変化の可能性が高いため。表にない、点線のない文字は、今までどおり読まずに数える）
//   ・rit.・accel. の範囲の終わり             … <dashes type="stop">（点線の終わり）の小節
//       点線がない rit.・accel. は、その小節だけの範囲にする
//       （自由な文字のテンポの指示：点線がないものは、点線を引かない印 gradualDashes: false も付ける）
//       点線の終わりが来ないうちに、次の rit.・テンポ変更などが来たら、その前の小節で終わりにする
//   measureElements … 一番上のパートの <measure> の並び
//   score           … 作った楽譜データ（measures に書き足す）
// ----------------------------------------------------------
function readTempoMarks(measureElements, score) {
  let openFrom = null; // 点線の終わりを待っている rit.・accel. の始まりの小節（なければ null）
  // 待っている rit.・accel. の点線の番号（同じ番号の点線の終わりでだけ閉じる）（点線付きの cresc.・dim.）
  let openNumber = null;

  // ----------------------------------------------------------
  // 関数：closeOpen（readTempoMarks の中だけで使う）
  // 待っている rit.・accel. を、end 小節目で終わりにする
  // ----------------------------------------------------------
  function closeOpen(end) {
    if (openFrom === null) return;
    score.measures[Math.max(openFrom, end)].gradualEnd = true;
    openFrom = null;
    openNumber = null;
  }

  measureElements.forEach((measureElement, i) => {
    // （自由な文字のテンポの指示：1小節目から始まる rit.・自由な文字も読むように、1小節目は ① だけ飛ばすようにした）
    if (i >= score.measures.length) return;
    const info = score.measures[i];

    // ① テンポ変更（文字が a tempo なら a tempo）（1小節目のテンポは readTempo で読んであるので、飛ばす）
    const { tempo, tempoText } = i > 0 ? readTempo(measureElement) : { tempo: null, tempoText: "" };
    if (tempo !== null) {
      closeOpen(i - 1); // テンポが変わる所で、rit.・accel. は終わる
      if (tempoWordKind(tempoText) === "aTempo") {
        info.aTempo = true;
      } else {
        const rounded = Math.min(300, Math.max(20, Math.round(tempo))); // このアプリで使える 20〜300 に収める
        const now = tempoAt(score, i);
        if (rounded !== now.tempo || tempoText !== now.tempoText) {
          info.tempo = rounded;
          if (tempoText) info.tempoText = tempoText;
        }
      }
    }

    // ② 文字（rit.・accel.・a tempo）と、点線の終わり
    childElements(measureElement, "direction").forEach((direction) => {
      const types = childElements(direction, "direction-type");
      // 点線の始まりがあるか（あれば、終わりの印が来るまで範囲が続く）
      const hasDashes = types.some((type) => childElements(type, "dashes").some((d) => d.getAttribute("type") === "start"));
      // このアプリで書き出したものなら、id に書いた再生での扱い（自由な文字のテンポの指示）
      const typeFromId = gradualTypeFromId(direction);
      types.forEach((type) => {
        childElements(type, "words").forEach((words) => {
          const text = words.textContent.trim();
          if (text === "") return;
          // cresc.・dim. の仲間は、テンポの印にしない（点線付きなら、readDirection で松葉として読む）（点線付きの cresc.・dim.）
          // （このアプリで書き出したもの（id の印がある）は、文字が何でもテンポの印なので、そのまま読む）
          if (!typeFromId && dynamicWordKind(text)) return;
          // このアプリで書き出したものは id の扱いを、ほかのアプリのものは言葉の表で当てた扱いを使う
          const kind = typeFromId ?? tempoWordKind(text);
          if (kind === "aTempo") {
            if (i === 0) return; // 1小節目の a tempo は意味がないので読まない
            closeOpen(i - 1);
            info.aTempo = true;
          } else if (kind === "rit" || kind === "accel" || kind === "none" || (kind === null && hasDashes && !jumpWordKind(text))) {
            // テンポの印の言葉か、表にない言葉でも点線が付いているもの（D.C.・Fine などは除く）
            closeOpen(i - 1);
            info.gradual = kind ?? "none"; // 表にない言葉は「再生では変えない」
            // ボタンと同じ文字（rit.・accel.）でなければ、元の文字のまま自由な文字として持つ（自由な文字のテンポの指示）
            if (text !== GRADUAL_BUTTON_TEXTS[kind]) info.gradualText = text;
            if (hasDashes) {
              openFrom = i;
              openNumber = dashesStartNumber(direction); // 点線の番号を覚える（点線付きの cresc.・dim.）
            } else {
              info.gradualEnd = true; // 点線がない：この小節だけ
              info.gradualDashes = false; // 点線も引かない（自由な文字のテンポの指示）
            }
          }
        });
        // 点線の終わり：待っている rit.・accel. と同じ番号のときだけ閉じる
        // （cresc.・dim. などの、ほかの点線の終わりで閉じないように）（点線付きの cresc.・dim.）
        childElements(type, "dashes").forEach((dashes) => {
          if (dashes.getAttribute("type") === "stop" && (dashes.getAttribute("number") ?? "1") === openNumber) closeOpen(i);
        });
      });
    });
  });

  // 最後まで点線の終わりが来なかったら、最後の小節で終わりにする
  closeOpen(score.measures.length - 1);
}

// ----------------------------------------------------------
// 関数：readBarlines
// 小節線（<barline>）を読んで、楽譜全体の小節の情報（score.measures）に入れる（ステップ11-7a）
// 一番上のパートの小節だけを見る（小節線は全パート共通なので）
//   ・location="left" ＋ <repeat direction="forward">  … くり返しの始まり（repeatStart）
//   ・location="right"（書いていなければ right）＋ <repeat direction="backward"> … くり返しの終わり（repeatEnd）
//   ・location="right" の bar-style：light-light → 複縦線、light-heavy → 終止線
//       ただし、このアプリが自動で描く線（曲の最後の終止線・調が変わる前の複縦線）と同じものは入れない
//   measureElements … 一番上のパートの <measure> の並び
//   score           … 作った楽譜データ（measures に書き足す）
// ----------------------------------------------------------
function readBarlines(measureElements, score) {
  const last = score.measures.length - 1;
  measureElements.forEach((measureElement, i) => {
    if (i > last) return;
    const info = score.measures[i];
    childElements(measureElement, "barline").forEach((barline) => {
      const location = barline.getAttribute("location") ?? "right";
      const repeat = childElement(barline, "repeat");
      const direction = repeat ? repeat.getAttribute("direction") : null;
      const style = childText(barline, "bar-style");

      // 1番・2番かっこ（ステップ11-7b）：number の最初の数字を使う（"1, 2" のような書き方もあるため）。1・2 だけ読む
      const ending = childElement(barline, "ending");
      if (ending) {
        const number = parseInt(ending.getAttribute("number") ?? "", 10);
        const type = ending.getAttribute("type");
        if (number === 1 || number === 2) {
          if (type === "start") info.ending = number;
          if (type === "stop" || type === "discontinue") info.endingEnd = number;
        }
      }

      if (location === "left") {
        if (direction === "forward") info.repeatStart = true;
        return;
      }
      if (location !== "right") return; // まん中の線（middle）は使わない

      if (direction === "backward") {
        info.repeatEnd = true;
        delete info.barline;
        return;
      }
      if (info.repeatEnd) return; // くり返しの終わりがあれば、線の形はそちらで決まる

      // 自動で描く線と同じなら入れない（曲の最後の終止線・調が変わる前の複縦線）
      const nextKeyChanges = i < last && score.measures[i + 1].key !== undefined && score.measures[i + 1].key !== keyAtMeasures(score.measures, i);
      if (style === "light-heavy" && i !== last) info.barline = "final";
      if (style === "light-light" && !nextKeyChanges) info.barline = "double";
    });
  });

  // 組になっていない1番・2番かっこの印を外す（「ここから」だけ・「ここまで」だけが残らないように）（ステップ11-7b）
  let open = null; // 「ここから」があって、まだ「ここまで」が来ていない小節の情報
  score.measures.forEach((info) => {
    if (info.ending) {
      if (open) delete open.ending; // 前の「ここから」に「ここまで」がなかった
      open = info;
    }
    if (info.endingEnd) {
      if (open && open.ending === info.endingEnd)
        open = null; // 正しい組になった
      else delete info.endingEnd; // 「ここから」がない（番号が違う）「ここまで」は外す
    }
  });
  if (open) delete open.ending; // 最後まで「ここまで」が来なかった
}

// ----------------------------------------------------------
// 関数：keyAtMeasures
// i 小節目の調を、小節の情報から探す（前の小節にさかのぼって探す）（ステップ11-7a）
// （model.js の keyAt と同じ考え方。楽譜データを作っている途中でも使えるように、小節の情報だけで調べる）
// ----------------------------------------------------------
function keyAtMeasures(measures, i) {
  for (let k = i; k >= 0; k--) {
    if (measures[k].key !== undefined) return measures[k].key;
  }
  return 0;
}

// ----------------------------------------------------------
// 関数：gradualTypeFromId
// このアプリで書き出した rit.・accel.・自由な文字の <direction> なら、id から再生での扱いを取り出す（自由な文字のテンポの指示）
// 例：id="string-score-gradual-none-7" → "none"
//   direction … <direction> の要素
// 戻り値："rit"・"accel"・"none"（このアプリの印でなければ null）
// ----------------------------------------------------------
function gradualTypeFromId(direction) {
  const id = direction.getAttribute("id") ?? "";
  if (!id.startsWith(GRADUAL_ID_PREFIX)) return null;
  const type = id.slice(GRADUAL_ID_PREFIX.length).split("-")[0];
  return ["rit", "accel", "none"].includes(type) ? type : null;
}

// ----------------------------------------------------------
// 関数：hasDashesStart
// <direction> に、点線の始まり <dashes type="start"> があるかを調べる（自由な文字のテンポの指示）
//   direction … <direction> の要素
// 戻り値：あれば true
// ----------------------------------------------------------
function hasDashesStart(direction) {
  return childElements(direction, "direction-type").some((type) => childElements(type, "dashes").some((dashes) => dashes.getAttribute("type") === "start"));
}

// ----------------------------------------------------------
// 関数：dashesStartNumber
// <direction> の中の、点線の始まり <dashes type="start"> の番号を返す（点線付きの cresc.・dim.）
//   direction … <direction> の要素
// 戻り値：番号の文字（書いていなければ "1"（MusicXML の決まり）。点線の始まりがなければ null）
// ----------------------------------------------------------
function dashesStartNumber(direction) {
  for (const type of childElements(direction, "direction-type")) {
    for (const dashes of childElements(type, "dashes")) {
      if (dashes.getAttribute("type") === "start") return dashes.getAttribute("number") ?? "1";
    }
  }
  return null;
}

// ----------------------------------------------------------
// 関数：readDirection
// 音符の前に書いてある <direction>（強弱・pizz./arco・松葉）を読む（ステップ8-4a）
// （点線付きの cresc.・dim.：点線の付いた cresc.・dim. も松葉として読む。点線の終わりで閉じる）
//   direction … <direction>
//   state     … パートごとの読みかけの情報
//                pending … 次の音符に付ける記号 { dynamic, techniques }（techniques は奏法の名前の並び。ステップ11-2）
//                          （ステップ16-2：松葉の始まりは pending ではなく openWedges で覚える）
//                lastNote … ここまでに読んだ最後の音符（松葉の終わりを付ける）
//                wedgeStopNext … 松葉の終わりを、次の音符に付けるか（ステップ15-6。ステップ16-2 からは、
//                                1つの音符の中で始まって終わる松葉を、その音符の下だけの松葉にできないときだけ使う）
//                openWedges … 開いている（まだ終わりの来ていない）松葉の一覧（ステップ16-2）
//                             { number: 番号, kind: 種類, note: 始まりの音符（まだ音符が来ていなければ null）} を、始まった順に並べる
//                openHolds … 開いている（まだ終わりの来ていない）保持線の一覧（保持線）
//                            { finger: 指の番号, number: <bracket> の番号, note: 始まりの音符（まだ音符が来ていなければ null）}
//   counter   … 使えなかった記号を数える表
// ----------------------------------------------------------
function readDirection(direction, state, counter) {
  // テンポの指示（♩ = ○○ と Allegro など）は readTempo で読むので、ここでは見ない
  const sound = childElement(direction, "sound");
  const hasTempo = (sound && sound.getAttribute("tempo")) || direction.getElementsByTagName("metronome").length > 0;
  if (hasTempo) return;

  // 保持線の始まり（指の数字＋線の括弧の始まり）：開いている保持線の一覧に足して、ほかの読み方はしない（保持線）
  // （数字の <words> を、奏法の文字などとして数えないようにするため）
  const holdStart = holdStartOf(direction);
  if (holdStart) {
    state.openHolds.push({ finger: holdStart.finger, number: holdStart.number, note: null });
    return;
  }

  childElements(direction, "direction-type").forEach((type) => {
    // 強弱：次の音符に付ける
    childElements(type, "dynamics").forEach((dynamics) => {
      readDynamics(dynamics, state.pending, counter);
    });

    // 文字：奏法の文字（pizz.・sul pont. など）だけ使う（ほかの文字は数える）（ステップ11-2：pizz.・arco 以外も読む）
    childElements(type, "words").forEach((words) => {
      const text = normalizeWords(words.textContent);
      if (text === "") return;
      // 点線付きの cresc.・dim.：松葉の始まりとして読む（番号は "dashes-1" のように、ふつうの松葉と分ける）（点線付きの cresc.・dim.）
      // （このアプリで書き出したテンポの印（id の印がある）は除く。点線のない cresc.・dim. は、今までどおり下で数える）
      const dynamicKind = dynamicWordKind(words.textContent);
      if (dynamicKind && hasDashesStart(direction) && !gradualTypeFromId(direction)) {
        startWedge(dynamicKind, DASHES_WEDGE_PREFIX + dashesStartNumber(direction), state);
        return;
      }
      if (tempoWordKind(words.textContent)) return; // rit.・a tempo などは、楽譜全体の印として readTempoMarks で読む（ステップ11-6c）
      // 点線の始まりが付いた文字も、テンポの指示として readTempoMarks で読む（いちばん上のパートだけ）（自由な文字のテンポの指示）
      if (hasDashesStart(direction)) return;
      // このアプリで書き出した rit.・自由な文字（id の印がある）も、readTempoMarks で読む（自由な文字のテンポの指示）
      if (gradualTypeFromId(direction)) return;
      if (jumpWordKind(words.textContent)) return; // D.C.・Fine などは、楽譜全体の印として readJumpMarks で読む（ステップ11-7c）
      const name = WORDS_TO_TECHNIQUE[text];
      if (name) state.pending.techniques = addTechnique(state.pending.techniques, name);
      else report(counter, "文字の指示（dolce・cresc. など）");
    });

    // 松葉（ステップ16-2：番号ごとに組にして読む）
    childElements(type, "wedge").forEach((wedge) => {
      const kind = wedge.getAttribute("type");
      const number = wedge.getAttribute("number") || "1"; // 書いていなければ 1（MusicXML の決まり）
      if (kind === "crescendo" || kind === "diminuendo") {
        startWedge(kind, number, state);
      } else if (kind === "stop") {
        stopWedge(number, state, counter);
      }
    });

    // 線の括弧の終わり：同じ番号で開いている保持線があれば閉じる（保持線）
    // （開いていなければ、保持線ではない括弧なので、何もしない（数えない。今までと同じ））
    childElements(type, "bracket").forEach((bracket) => {
      if (bracket.getAttribute("type") !== "stop") return;
      stopHold(bracket.getAttribute("number") ?? "1", state, counter);
    });

    // 点線の終わり：点線付きの cresc.・dim. で始めた松葉が、同じ番号で開いていれば閉じる（点線付きの cresc.・dim.）
    // （開いていなければ、rit.・accel. などのほかの点線の終わりなので、何もしない（数えない））
    childElements(type, "dashes").forEach((dashes) => {
      if (dashes.getAttribute("type") !== "stop") return;
      const number = DASHES_WEDGE_PREFIX + (dashes.getAttribute("number") ?? "1");
      if (state.openWedges.some((open) => open.number === number)) stopWedge(number, state, counter);
    });
  });
}

// ----------------------------------------------------------
// 関数：holdStartOf
// <direction> が保持線の始まりかを調べる（保持線）
// 保持線の始まりとみなすもの（このアプリの書き出しと同じ形）
//   ・<words> の文字が、指の番号（1〜4）だけ
//   ・<bracket type="start"> があって、線の端の形が「なし」（line-end="none"。書いていないときも「なし」とみなす）
//   ・ほかの種類の指示（強弱・松葉など）は入っていない
//   direction … <direction> の要素
// 戻り値：{ finger: 指の番号, number: <bracket> の番号（文字）}（保持線の始まりでなければ null）
// ----------------------------------------------------------
function holdStartOf(direction) {
  const types = childElements(direction, "direction-type");
  const words = types.flatMap((type) => childElements(type, "words"));
  const brackets = types.flatMap((type) => childElements(type, "bracket"));
  // 数字1つと括弧1つだけでできているか（ほかの子の要素がないか）
  const others = types.flatMap((type) => [...type.children].filter((child) => child.nodeName !== "words" && child.nodeName !== "bracket"));
  if (words.length !== 1 || brackets.length !== 1 || others.length > 0) return null;
  const finger = Number(words[0].textContent.trim());
  if (!HOLD_FINGERS.includes(finger)) return null;
  const bracket = brackets[0];
  if (bracket.getAttribute("type") !== "start") return null;
  const lineEnd = bracket.getAttribute("line-end") ?? "none";
  if (lineEnd !== "none") return null;
  return { finger: finger, number: bracket.getAttribute("number") ?? "1" };
}

// ----------------------------------------------------------
// 関数：stopHold
// 線の括弧の終わり（<bracket type="stop">）を読んだときの処理（保持線）
// 同じ番号で開いている保持線を閉じて、始まりの音符に holdStart、ここまでに読んだ最後の音符に holdEnd を付ける
//   ・開いている保持線がなければ、保持線ではない括弧なので、何もしない
//   ・始まりのあと音符が来ていない・始まりと同じ音符で終わる（長さのない線）ときは、使わずに数える
//   number  … <bracket> の番号（文字）
//   state   … パートごとの読みかけの情報（readDirection の説明を参照）
//   counter … 使えなかった記号を数える表
// ----------------------------------------------------------
function stopHold(number, state, counter) {
  const index = state.openHolds.findIndex((open) => open.number === number);
  if (index < 0) return;
  const open = state.openHolds[index];
  state.openHolds.splice(index, 1); // 一覧から外す
  const last = state.lastNote;
  if (open.note === null || !last || open.note === last) {
    report(counter, "つなげられなかった保持線");
    return;
  }
  addHoldFinger(open.note, "holdStart", open.finger);
  addHoldFinger(last, "holdEnd", open.finger);
}

// ----------------------------------------------------------
// 関数：addHoldFinger
// 音符の holdStart か holdEnd の並びに、指の番号を足す（小さい順に並べる。同じ番号は1つだけ）（保持線）
//   note   … 音符のデータ（直接書き換える）
//   key    … "holdStart" か "holdEnd"
//   finger … 指の番号
// （edit.js の addFinger と同じ。読み込みは edit.js の関数をなるべく使わない作りなので、ここにも置いた）
// ----------------------------------------------------------
function addHoldFinger(note, key, finger) {
  const list = note[key] ?? [];
  if (!list.includes(finger)) list.push(finger);
  note[key] = list.sort((a, b) => a - b);
}

// ----------------------------------------------------------
// 関数：startWedge
// 松葉の始まり（<wedge type="crescendo"> など）を読んだときの処理（ステップ16-2）
// 開いている松葉の一覧に足すだけ（始まりの音符は、次の音符を読んだときに applyPending で覚える）
// 音符に印を付けるのは、終わりが来て「つながる松葉」か「音符の下だけの松葉」かが決まったとき（stopWedge）
// （1つの音符の前に、「つながる松葉の始まり」と「下だけの松葉の始まり」が両方来ることがあるため）
//   kind   … "crescendo"（＜）か "diminuendo"（＞）
//   number … 松葉の番号（文字）
//   state  … パートごとの読みかけの情報（readDirection の説明を参照）
// ----------------------------------------------------------
function startWedge(kind, number, state) {
  state.openWedges.push({ number: number, kind: kind, note: null });
}

// ----------------------------------------------------------
// 関数：stopWedge
// 松葉の終わり（<wedge type="stop">）を読んだときの処理（ステップ16-2）
// 同じ番号で開いている松葉のうち、いちばん古いものを閉じて、音符に印を付ける
//   ・始まりと同じ音符で終わる → その音符の下だけの松葉（wedgeInside）にする
//       ただし、その音符にもう下だけの松葉があるときは、今までどおり
//       終わりを次の音符に付ける（＝次の音符まで延ばす）（ステップ15-6）
//   ・始まりと違う音符で終わる → 始まりの音符に wedge、ここまでに読んだ最後の音符に wedgeEnd を付ける
//       （終わりの音符から次の松葉が始まっていてもよい。ステップ16-1 のデータの形でできるようになった）
//   number  … 松葉の番号（文字）
//   state   … パートごとの読みかけの情報（readDirection の説明を参照）
//   counter … 使えなかった記号を数える表
// ----------------------------------------------------------
function stopWedge(number, state, counter) {
  const index = state.openWedges.findIndex((open) => open.number === number);
  if (index < 0) {
    report(counter, "つなげられなかった松葉"); // 始まりのない終わり
    return;
  }
  const open = state.openWedges[index];
  state.openWedges.splice(index, 1); // 一覧から外す

  // 始まりのあと、音符が来ないうちに終わった松葉（長さのない松葉）・前に音符のない終わりは使わない
  const last = state.lastNote;
  if (open.note === null || !last) {
    report(counter, "つなげられなかった松葉");
    return;
  }

  // 始まりと同じ音符で終わった：その音符の下だけの松葉にする
  if (open.note === last) {
    if (last.wedgeInside === undefined) {
      last.wedgeInside = open.kind;
    } else if (last.wedge === undefined) {
      // 下だけの松葉がもうある：始まりをこの音符に付けて、終わりを次の音符に付ける（次の音符まで延ばす）（ステップ15-6）
      last.wedge = open.kind;
      state.wedgeStopNext = true;
    } else {
      report(counter, "つなげられなかった松葉");
    }
    return;
  }

  // 始まりと違う音符で終わった：始まりと終わりの印を付ける
  // （始まりの音符から、もう別の松葉が始まっている・最後の音符でもう別の松葉が終わっている ときは使えない）
  if (open.note.wedge === undefined && !last.wedgeEnd) {
    open.note.wedge = open.kind;
    last.wedgeEnd = true;
  } else {
    report(counter, "つなげられなかった松葉");
  }
}

// ----------------------------------------------------------
// 関数：applyPending
// <direction> で読んでおいた記号（強弱・pizz./arco・松葉の始まり）を、音符に付ける（ステップ8-4a）
// 休符には付けず、次の音符まで持ち越す
// ----------------------------------------------------------
function applyPending(note, state, counter) {
  if (note.rest) return;
  // 1つの音符の中で始まって終わった松葉の終わりを、この音符に付ける（次の音符まで延ばす）（ステップ15-6）
  // （ステップ16-2：終わりは wedgeEnd で付ける。この音符から次の松葉が始まっていてもよい）
  if (state.wedgeStopNext) {
    note.wedgeEnd = true;
    state.wedgeStopNext = false;
  }
  const pending = state.pending;
  if (pending.dynamic) note.dynamic = pending.dynamic;
  if (pending.techniques) note.techniques = pending.techniques;
  // 松葉の始まり：この音符の前で始まった松葉に、始まりの音符を覚える（ステップ16-2）
  // （音符に印を付けるのは、終わりが来たとき（stopWedge））
  state.openWedges.forEach((open) => {
    if (open.note === null) open.note = note;
  });
  // 保持線の始まり：この音符の前で始まった保持線に、始まりの音符を覚える（保持線）
  state.openHolds.forEach((open) => {
    if (open.note === null) open.note = note;
  });
  state.pending = {};
}

// ----------------------------------------------------------
// 関数：readGraceFingerings
// 装飾音の <note> から、指番号（<technical> の中の <fingering>）を読む（ステップ24-3）
// 0〜4 の数字だけを、書いてある順に返す（同じ数字は1つだけ）
//   element … 装飾音の <note> 要素
// 戻り値：指番号の配列（なければ空の配列）
// ----------------------------------------------------------
function readGraceFingerings(element) {
  const fingers = [];
  childElements(element, "notations").forEach((notations) => {
    childElements(notations, "technical").forEach((technical) => {
      childElements(technical, "fingering").forEach((fingering) => {
        const finger = Number(fingering.textContent.trim());
        if (Number.isInteger(finger) && finger >= 0 && finger <= 4 && !fingers.includes(finger)) fingers.push(finger);
      });
    });
  });
  return fingers;
}

// ----------------------------------------------------------
// 関数：finishGrace
// 読みためた前打音を、主音に付ける前打音のデータの形にする（ステップ24-3）
//   pending … 読みためた前打音 { type, pitches: [高さ…], fingers: [指番号…] }
//   skipped … 読まなかったものを数える入れ物（5音以上の重音の前打音を減らしたときに数える）
// 決まり
//   ・高さは低い順に並べる（いちばん低い音が pitch、残りが chord。主音の重音と同じ形）
//   ・同じ高さ（鍵盤で同じ所）は1つにまとめる
//   ・5音以上なら、上の MAX_CHORD_NOTES 音を残す（主音の重音と同じ）
//   ・指番号があれば fingerings に入れる
// 戻り値：{ type, pitch, chord?, fingerings? }
// ----------------------------------------------------------
function finishGrace(pending, skipped) {
  // 同じ高さをまとめる
  let pitches = [];
  pending.pitches.forEach((pitch) => {
    if (!pitches.some((other) => samePitch(other, pitch))) pitches.push(pitch);
  });
  // 5音以上なら、上の4音を残す
  if (pitches.length > MAX_CHORD_NOTES) {
    pitches = [...pitches].sort((a, b) => pitchNumber(a) - pitchNumber(b)).slice(pitches.length - MAX_CHORD_NOTES);
    report(skipped, `5音以上の重音の前打音（上の${MAX_CHORD_NOTES}音を残した）`);
  }
  // 低い順に並べて、pitch と chord に分ける（setNotePitches は音符と同じ形にしてくれる）
  const grace = { type: pending.type };
  setNotePitches(grace, pitches);
  if (pending.fingers.length > 0) grace.fingerings = [...pending.fingers];
  return grace;
}

// ----------------------------------------------------------
// 関数：readPart
// <part> 1つ分の小節を読む
//   partElement … <part>
//   counter     … 使えなかった記号を数える表（ステップ8-4a）
//   skipped     … 使わなかった音を数える表（ステップ8-4b）
// 戻り値：{
//   measures: [{ notes, clef?, time?, key?, readable, implicit }]（小節ごと。implicit は番号に数えない小節の印があるか（途中の短い小節））
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
  //   pendingGrace … 読んだ前打音で、次の主音に付けるもの（なければ null）（ステップ11-8b）
  //                  （ステップ24-3：重音の前打音のため、読んでいる途中は { type, pitches: [高さ…], fingers: [指番号…] } の形でためる。
  //                    主音に付けるときに finishGrace で { type, pitch, chord, fingerings } の形にする）
  //   wedgeStopNext … 松葉の終わりを次の音符に付けるか（ステップ15-6）
  //   openWedges    … 開いている松葉の一覧（ステップ16-2）
  // （保持線：openHolds … 開いている保持線の一覧 { finger, number, note }（readDirection の説明を参照））
  const state = { slurNumber: null, pending: {}, lastNote: null, pendingGrace: null, wedgeStopNext: false, openWedges: [], openHolds: [] };

  // このパートに連桁（<beam>）が1つでも書いてあったか（ステップ19-2）
  // （連桁を書かないアプリのファイルでは、全部を「つながない」にしないよう、自動のつなぎ方のままにするため）
  let hasBeams = false;

  let divisions = 1; // ファイルで書いていなければ 1（MusicXML の決まり）
  let firstClef = null;
  let mainVoice = null; // このパートで使う声部（最初の音の声部）
  // 重音にした音の一覧（小節を読み終わってから、高さを並べ直すため）（ステップ14-3）
  //   { note: 重音の音符のデータ, groups: [{ pitch: 高さ, fingers: その高さの <note> に付いていた指番号 }, ...] }
  const chords = [];
  const measures = [];
  const problems = [];

  childElements(partElement, "measure").forEach((measureElement, index) => {
    const measure = { notes: [], ticks: 0, readable: true };
    // 番号に数えない小節の印（<measure implicit="yes">）があるか（途中の短い小節）
    measure.implicit = measureElement.getAttribute("implicit") === "yes";

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
        // 装飾音（大きさのない音）：前打音として、次の主音に付ける（ステップ11-8b）
        // （ステップ8-4b では使わずに数を知らせていた。今も、使えないものは数を知らせる）
        //   ・斜線（slash="yes"）があれば短前打音、なければ長前打音
        //   ・2つ以上並んでいたら、主音にいちばん近い（最後の）1つだけを使う
        //   ・2つ目の声部の前打音・高さのないものは使わない
        //   ・前打音と主音をつなぐスラーは読まない（このアプリでは、いつも自動で描く）
        //   ・重音の前打音（<chord/> の付いた装飾音）は、1つ前の前打音に高さを足す（ステップ24-3）
        //   ・前打音の指番号も読む（ステップ24-3）
        const graceElement = childElement(element, "grace");
        if (graceElement) {
          const graceVoice = childText(element, "voice") ?? "1";
          const pitchElement = childElement(element, "pitch");
          const usable = (mainVoice === null || graceVoice === mainVoice) && pitchElement;
          if (!usable) {
            report(skipped, "装飾音");
            continue;
          }
          const gracePitch = {
            step: childText(pitchElement, "step"),
            alter: Math.round(Number(childText(pitchElement, "alter") ?? 0)),
            octave: Number(childText(pitchElement, "octave")),
          };
          markCourtesy(element, gracePitch); // 臨時記号が書いてあれば、注意の記号の印（注意の臨時記号）
          const graceFingers = readGraceFingerings(element);

          // 重音の2つ目からの前打音：1つ前の前打音に高さを足す（1つ前がなければ使わない）（ステップ24-3）
          if (childElement(element, "chord")) {
            if (!state.pendingGrace) {
              report(skipped, "装飾音");
              continue;
            }
            state.pendingGrace.pitches.push(gracePitch);
            graceFingers.forEach((finger) => {
              if (!state.pendingGrace.fingers.includes(finger)) state.pendingGrace.fingers.push(finger);
            });
            continue;
          }

          // 前に読んだ前打音がまだ主音に付いていなければ、それは使わない（近いほうを使う）
          if (state.pendingGrace) report(skipped, "装飾音");
          state.pendingGrace = {
            type: graceElement.getAttribute("slash") === "yes" ? "short" : "long",
            pitches: [gracePitch],
            fingers: graceFingers,
          };
          continue;
        }

        // 2つ目の声部は使わない（ステップ8-4b：音符の数を知らせる。休符は数えない）
        const voice = childText(element, "voice") ?? "1";
        if (mainVoice === null) mainVoice = voice;
        if (voice !== mainVoice) {
          if (!childElement(element, "rest")) report(skipped, "2つ目の声部の音");
          continue;
        }

        // 重音の2つ目以降：1つ前の音に重ねる（ステップ14-3。前は一番上の音だけ残していた）
        //   ・高さは、あとで（小節を読み終わってから）低い順に並べ直す。それまでは groups にためておく
        //   ・指番号は、高さごとに分けて覚えておく（低い音の順に並べ直すため）
        //   ・タイは、どれか1つの音に「ここから」があれば付ける（つながるのは同じ高さの音どうしだけ）
        //   ・ほかの記号（スラーなど）は、重音全体の記号にまとめる
        if (childElement(element, "chord")) {
          const base = measure.notes[measure.notes.length - 1]; // 重音の1つ目の音（もう読んである）
          if (!base || base.rest || !measure.readable) continue;
          const member = readNote(element, divisions).note;
          if (!member || member.rest) continue;

          // この重音のためた情報（はじめて重ねるときは、1つ目の音の分から作る）
          let chord = chords.find((c) => c.note === base);
          if (!chord) {
            chord = { note: base, groups: [{ pitch: base.pitch, fingers: [...(base.fingerings ?? [])] }] };
            chords.push(chord);
          }

          // 記号を読む（指番号は、読む前と後をくらべて、この音の分だけを取り出す）
          const before = [...(base.fingerings ?? [])];
          readNotations(element, base, state, counter);
          const added = (base.fingerings ?? []).filter((finger) => !before.includes(finger));

          // 同じ高さ（鍵盤で同じ所）がもうあれば、まとめる（指番号だけ足す）
          const same = chord.groups.find((group) => samePitch(group.pitch, member.pitch));
          if (same) {
            same.fingers.push(...added);
          } else {
            chord.groups.push({ pitch: member.pitch, fingers: added });
          }
          if (member.tie) base.tie = true;
          continue;
        }

        // 小節まるごとの休符で、このアプリで1つの休符にできない長さ（5拍子など）のときは、読まずに飛ばす（ステップ13-3）
        // （fitMeasure で、足りないぶんを1拍ずつの休符でうめるので、小節の休符になる）
        const restElement = childElement(element, "rest");
        if (restElement && restElement.getAttribute("measure") === "yes" && !childElement(element, "time-modification")) {
          const sixteenths = (Number(childText(element, "duration")) * 4) / divisions;
          if (!TICKS_TO_DURATION[sixteenths]) continue;
        }

        const { note, ticks } = readNote(element, divisions);

        // 前打音を、この音に付ける（休符や読めない音には付けられないので、数を知らせる）（ステップ11-8b）
        if (state.pendingGrace) {
          if (note && !note.rest)
            note.grace = finishGrace(state.pendingGrace, skipped); // 前打音の形にして付ける（ステップ24-3）
          else report(skipped, "装飾音");
          state.pendingGrace = null;
        }

        if (note) {
          // 連桁の1本目（<beam number="1">）の中身を、一時的に覚えておく（あとで marksFromFile が印にして消す）（ステップ19-2）
          // （number を書かないファイルもあるので、書いていなければ 1 とみなす）
          const beamElement = childElements(element, "beam").find((beam) => (beam.getAttribute("number") ?? "1") === "1");
          if (beamElement) {
            note.beamXml = beamElement.textContent.trim();
            hasBeams = true;
          }

          // 符尾の向き（<stem>up</stem>・<stem>down</stem>）を覚えておく（ステップ22）
          // （あとで stemsFromFile が、自動と同じ向きの所は外す。重音の2つ目からの音・前打音の向きは読まない）
          const stemText = childText(element, "stem");
          if (!note.rest && (stemText === "up" || stemText === "down")) note.stem = stemText;

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

  // 最後まで主音が来なかった前打音は使わない（ステップ11-8b）
  if (state.pendingGrace) report(skipped, "装飾音");

  // 1つの音符の中の松葉で、延ばす先の音符がなかったもの（パートの最後の音符など）は数える（ステップ15-6）
  // （始まりの印だけが残るが、あとで cleanSpanners が外す）
  if (state.wedgeStopNext) report(counter, "つなげられなかった松葉");

  // 重音を、決まりどおりの形にする（ステップ14-3）
  chords.forEach((chord) => finishChord(chord, skipped, counter));

  // 2音トレモロの組を、1つの音符にまとめる（重音をまとめたあとに行う。組の音が重音かを見るため）（ステップ14-6b）
  // （まとめられずに、書ける形がなかった小節は休符にするので、読めなかった小節の一覧にも入れる）
  measures.forEach((measure, index) => {
    const wasReadable = measure.readable;
    finishAlternates(measure, counter);
    if (wasReadable && !measure.readable) problems.push(index + 1);
  });

  // 1音だけの音符に付いたアルペジオは使わない（アルペジオは重音だけの決まり）（ステップ14-4b）
  // ひし形の玉のある音符に付いたアルペジオも使わない（ステップ14-5b）
  measures.forEach((measure) => {
    measure.notes.forEach((note) => {
      if (note.arpeggio && !note.chord) {
        delete note.arpeggio;
        report(counter, "1つの音に付いたアルペジオ");
      } else if (note.arpeggio && hasDiamond(note)) {
        // ひし形の玉のある重音（ハーモニクス）には、アルペジオを付けない（編集のときと同じ決まり）（ステップ14-5b）
        delete note.arpeggio;
        report(counter, "ハーモニクスに付いたアルペジオ");
      }
    });
  });

  return { measures: measures, firstClef: firstClef, problems: problems, hasBeams: hasBeams };
}

// 2音トレモロにまとめられなかったとき、組の音を「半分の長さの形」にする表（ステップ14-6b）
// （ステップ15-5：32分音符を足したので、16分音符の組は32分音符2つにできる。32分音符の組は、まとめられないと小節ごと休符になる）
const HALF_SHAPE = { whole: "half", half: "quarter", quarter: "eighth", eighth: "16th", "16th": "32nd" };

// ----------------------------------------------------------
// 関数：finishAlternates
// 1小節の中の、2音トレモロの組の音（pairMark の付いた音）を決まりどおりの形にする（ステップ14-6b）
//   measure … readPart で読んだ小節（notes の中身を入れ替える）
//   counter … 使えなかった記号を数える表
// ・「start の音」のすぐあとに「stop の音」が来ていて、次がそろっていれば、1つの2音トレモロの音符にまとめる
//     2つとも同じ形・同じ付点、形が全・2分・4分音符、どちらも重音ではない、ひし形の玉がない、高さが違う
//   まとめ方：1つ目の音符に、2つの高さ（下の音から）・連桁の本数・alternate を入れて、2つ目の記号も足す
// ・そろっていない組（8分音符の組・重音の組など）と、相手のいない音は、ふつうの音符（半分の長さの形）にして数える
//   （決めたことの A：長さと、鳴る音の順はくずれない）
// ----------------------------------------------------------
function finishAlternates(measure, counter) {
  if (!measure.notes.some((note) => note.pairMark)) return;
  const result = [];
  for (let j = 0; j < measure.notes.length; j++) {
    const note = measure.notes[j];
    if (!note.pairMark) {
      result.push(note);
      continue;
    }
    const next = measure.notes[j + 1];
    const isPair = note.pairMark.type === "start" && next && next.pairMark && next.pairMark.type === "stop";
    const usable =
      isPair &&
      note.duration === next.duration &&
      note.dots === next.dots &&
      ALTERNATE_DURATIONS.includes(note.duration) &&
      !note.chord &&
      !next.chord &&
      !hasDiamond(note) &&
      !hasDiamond(next) &&
      !samePitch(note.pitch, next.pitch);
    if (usable) {
      // 1つの2音トレモロの音符にまとめる
      const count = note.pairMark.count;
      const merged = mergeSymbols(note, next);
      setNotePitches(merged, [note.pitch, next.pitch]); // 下の音から並べ直す（上の音から始まる組も、下の音から）
      merged.tremolo = count;
      merged.alternate = true;
      merged.tie = false; // 2音トレモロにはタイを付けない決まり
      delete merged.pairMark;
      // 1つ目の音から始まって、2つ目の音で終わる松葉は、まとめた音符の下だけの松葉にする（ステップ16-2）
      // （そのままだと、まとめた音符に「前の松葉の終わり」と「次の松葉の始まり」が付いたことになってしまう）
      if (note.wedge && !note.wedgeEnd && next.wedgeEnd && merged.wedgeInside === undefined) {
        merged.wedgeInside = note.wedge;
        delete merged.wedge;
        delete merged.wedgeEnd;
      }
      // 2音トレモロは重音なので、重音に付けられない記号（前打音・トリルなどの装飾・グリッサンド）は外して数える
      // （外さないと、このアプリの決まりに合わないデータになり、書き出すと前打音が消える）（ステップ15-4）
      if (merged.grace) {
        delete merged.grace;
        report(counter, "2音トレモロに付いた前打音");
      }
      if (merged.ornament) {
        delete merged.ornament;
        report(counter, "重音に付いたトリルなどの装飾");
      }
      if (merged.glissando) {
        delete merged.glissando;
        report(counter, "重音のグリッサンド");
      }
      result.push(merged);
      j = j + 1; // 2つ目の音は使ったので飛ばす
      continue;
    }
    // まとめられない：組の音を（相手がいれば2つとも）ふつうの音符にする
    const pieces = isPair ? [note, next] : [note];
    pieces.forEach((piece) => {
      delete piece.pairMark;
      const shape = HALF_SHAPE[piece.duration];
      if (shape) {
        piece.duration = shape; // 付点はそのまま（半分の長さになる）
      } else {
        measure.readable = false; // 16分音符の組など：このアプリで書ける形がない
      }
      result.push(piece);
    });
    report(counter, "2つの音を行き来するトレモロ（8分音符など）");
    if (isPair) j = j + 1;
  }
  measure.notes = result;
}

// ----------------------------------------------------------
// 関数：mergeSymbols
// 2音トレモロの組の、2つ目の音の記号を1つ目の音に足した音符を作る（ステップ14-6b）
//   ・記号の一覧（スタッカートなど・指番号・奏法など）は、合わせる（同じものは1つ）
//   ・1つだけの記号（弓・強弱・スラーなど）は、1つ目になければ2つ目のものを使う
//   ・高さ・長さ・タイ・組の印は、ここでは足さない
// 戻り値：新しい音符のデータ
// ----------------------------------------------------------
function mergeSymbols(first, second) {
  const merged = { ...first };
  const SKIP = ["pitch", "chord", "duration", "dots", "tie", "pairMark", "tuplet"];
  Object.keys(second).forEach((key) => {
    if (SKIP.includes(key)) return;
    const value = second[key];
    if (Array.isArray(value)) {
      const list = [...(merged[key] ?? [])];
      value.forEach((item) => {
        if (!list.includes(item)) list.push(item);
      });
      merged[key] = list;
    } else if (merged[key] === undefined) {
      merged[key] = value;
    }
  });
  return merged;
}

// ----------------------------------------------------------
// 関数：finishChord
// 読み込んだ重音を、このアプリの重音の決まりどおりの形にする（ステップ14-3）
//   chord   … { note: 重音の音符のデータ, groups: [{ pitch, fingers }, ...] }（readPart でためたもの）
//   skipped … 使わなかった音を数える表
//   counter … 使えなかった記号を数える表
// ・高さを低い順に並べて、pitch（いちばん低い音）と chord（その上の音）に入れる
// ・5音以上なら、上の MAX_CHORD_NOTES 音を残す（減らしたことを数える）
// ・指番号を、低い音の順に並べ直す（書き出しのときと同じ順になる）
// ・重音に付けられない記号（前打音・装飾・グリッサンド）は外して数える
// ----------------------------------------------------------
function finishChord(chord, skipped, counter) {
  const note = chord.note;
  // 低い順に並べる
  let groups = [...chord.groups].sort((a, b) => pitchNumber(a.pitch) - pitchNumber(b.pitch));
  if (groups.length > MAX_CHORD_NOTES) {
    groups = groups.slice(groups.length - MAX_CHORD_NOTES); // 上の4音
    report(skipped, `5音以上の重音（上の${MAX_CHORD_NOTES}音を残した）`);
  }
  setNotePitches(
    note,
    groups.map((group) => group.pitch),
  ); // pitch（いちばん低い音）と chord（その上の音）に入れる

  // 指番号：低い音の順に並べ直す（同じ数字は1つだけ）
  const fingers = [];
  groups.forEach((group) => {
    group.fingers.forEach((finger) => {
      if (!fingers.includes(finger)) fingers.push(finger);
    });
  });
  if (fingers.length > 0) {
    note.fingerings = fingers;
  } else {
    delete note.fingerings;
  }

  // 1音だけになったとき（同じ高さどうしだった）は、ふつうの音符なので、ここまで
  if (!note.chord) return;

  // 重音に付けられない記号を外す
  // （ステップ24-3：前打音は重音にも付けられるようになったので、外さない）
  if (note.ornament) {
    delete note.ornament;
    report(counter, "重音に付いたトリルなどの装飾");
  }
  if (note.glissando) {
    delete note.glissando;
    report(counter, "重音のグリッサンド");
  }
}

// ----------------------------------------------------------
// 関数：isMeasureRestOnly
// 読んだ1小節分が、小節まるごとの休符（<rest measure="yes"/>）だけか調べる（ステップ15-3）
// （ソフトによっては、アウフタクトの小節の全休符を、1小節ぶんの長さで書くことがあるので、
//   アウフタクトの長さを決めるときには数えない）
//   read … readPart で読んだ1小節分
// 戻り値：true か false
// ----------------------------------------------------------
function isMeasureRestOnly(read) {
  return !!read && read.readable && read.notes.length > 0 && read.notes.every((note) => note.rest && note.measureRest);
}

// ----------------------------------------------------------
// 関数：fitMeasure
// 読んだ音を、小節の長さに合わせる
//   ・足りないとき … 残りを1拍ずつの休符で埋める
//                    （アウフタクトの1小節目は前を、それ以外は後ろを埋める）（ステップ8-4b）
//   ・多すぎる・読めない音があるとき … 小節を全部休符にする（読めなかったと知らせる）
//   read        … readPart で読んだ1小節分
//   time        … その小節の拍子
//   isPickup    … アウフタクトの1小節目か
//   pickupTicks … アウフタクトの長さ（ティック）（ステップ15-3）
//                 0 より大きいときは、小節の長さを拍子どおりではなく、この長さにする
//                 （0 のときは、アウフタクトでも拍子どおりの長さにして、前を休符で埋める（前と同じ））
//   endTicks    … 短い最後の小節の長さ（ティック）（ステップ20）
//                 0 より大きいときは、小節の長さをこの長さにする（足りない分は、ふつうの小節と同じく後ろを埋める）
// （途中の短い小節：続きの小節は isPickup・pickupTicks に、前の部分の小節は endTicks に、その長さを渡して使う）
// 戻り値：{ notes: 音符・休符の配列, ok: そのまま使えたか }
// ----------------------------------------------------------
function fitMeasure(read, time, isPickup = false, pickupTicks = 0, endTicks = 0) {
  const total = isPickup && pickupTicks > 0 ? pickupTicks : endTicks > 0 ? endTicks : measureTicks(time);
  // 短い最後の小節の全休符で、長さが合わないもの（1小節ぶんの長さで書いてあるなど）は、
  // 短い長さの、拍ごとの休符にする（アウフタクトと同じ）（ステップ20）
  if (endTicks > 0 && isMeasureRestOnly(read) && read.ticks !== total) {
    return { notes: restsForSpan(0, total, time), ok: true };
  }
  // アウフタクトの小節の全休符で、長さが合わないもの（1小節ぶんの長さで書いてあるなど）は、
  // アウフタクトの長さの、拍ごとの休符にする（ステップ15-3）
  if (isPickup && isMeasureRestOnly(read) && read.ticks !== total) {
    return { notes: restsForSpan(0, total, time), ok: true };
  }
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
  // 小節まるごとの休符の印は、小節の中にその休符1つだけのときだけ残す（ステップ13-3）
  if (notes.length !== 1) {
    notes.forEach((note) => {
      delete note.measureRest;
    });
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
  // （ステップ15-3：全休符だけのパートは数えない。全部のパートが全休符だけなら、全部で調べる）
  const firstTotal = measureTicks(times[0]);
  const firstReads = readParts.map((read) => read.measures[0]);
  const counted = firstReads.some((read) => read && !isMeasureRestOnly(read)) ? firstReads.filter((read) => !isMeasureRestOnly(read)) : firstReads;
  const firstLengths = counted.map((read) => (read && read.readable ? read.ticks : 0));
  const longestFirst = Math.max(...firstLengths);
  const isPickup = longestFirst > 0 && longestFirst < firstTotal;

  // アウフタクトの長さを、「拍子の下の数字の音符◯つ」で決める（ステップ15-3）
  //   ちょうど割り切れないときは切り上げる（例：4/4 で8分音符1つ → 4分音符1つ分。前は8分休符で埋める）
  //   切り上げると1小節と同じ長さになるときは、アウフタクトにはせず、前と同じく前を休符で埋める
  let pickupTicks = 0; // アウフタクトの長さ（ティック）。アウフタクトにしないときは 0
  if (isPickup) {
    const unit = firstTotal / times[0].beats; // 拍子の下の数字の音符1つ分
    // （半拍刻みに対応：半拍の単位で切り上げる。4/4 の8分音符1つ → 0.5 拍のアウフタクト）
    const count = Math.ceil(longestFirst / (unit / 2)) / 2;
    if (count < times[0].beats) {
      measures[0].pickup = count;
      pickupTicks = count * unit;
      if (pickupTicks !== longestFirst) {
        warnings.push(`1小節目（アウフタクト）の長さが半拍の単位で割り切れないので、${describeLength(times[0].beatType, count)}分のアウフタクトにして、前を休符で埋めました`);
      }
    } else {
      warnings.push("1小節目が短い（アウフタクト）ので、前を休符で埋めて拍子どおりの長さにしました");
    }
  }

  // ⑤-2 短い最後の小節か調べる（ステップ20）
  // 最後の小節で、どのパートも拍子より短い（読めた音の長さが一番長いパートでも足りない）なら、短い最後の小節
  // （アウフタクトと同じく、全休符だけのパートは数えない。長さは拍の単位で切り上げる）
  // 小節が1つだけでアウフタクトになったときは調べない
  const lastIndex = measureCount - 1;
  let endTicks = 0; // 短い最後の小節の長さ（ティック）。短くしないときは 0
  if (lastIndex > 0 || !(isPickup && pickupTicks > 0)) {
    const lastTotal = measureTicks(times[lastIndex]);
    const lastReads = readParts.map((read) => read.measures[lastIndex]);
    const countedLast = lastReads.some((read) => read && !isMeasureRestOnly(read)) ? lastReads.filter((read) => read && !isMeasureRestOnly(read)) : [];
    const longestLast = Math.max(0, ...countedLast.map((read) => (read.readable ? read.ticks : lastTotal)));
    if (longestLast > 0 && longestLast < lastTotal) {
      const unit = lastTotal / times[lastIndex].beats; // 拍子の下の数字の音符1つ分
      const count = Math.ceil(longestLast / (unit / 2)) / 2; // 半拍の単位で切り上げる（半拍刻みに対応）
      if (count < times[lastIndex].beats) {
        measures[lastIndex].short = count;
        endTicks = count * unit;
        if (endTicks !== longestLast) {
          warnings.push(`最後の小節の長さが半拍の単位で割り切れないので、${describeLength(times[lastIndex].beatType, count)}分の小節にして、後ろを休符で埋めました`);
        }
      }
    }
  }

  // ⑤-3 途中の短い小節か調べる（途中の短い小節）
  // 1小節目・最後の小節以外で、どのパートも拍子より短い小節を、短い小節にする
  // （アウフタクトと同じく、全休符だけのパートは数えない。全部のパートが全休符だけなら、全部で調べる。長さは拍の単位で切り上げる）
  //   frontTicks[i] … 前の部分（short）の長さ（ティック）。違うときは 0（最後の小節の endTicks もここに入れる）
  //   backTicks[i]  … 続き（pickup）の長さ（ティック）。違うときは 0（1小節目の pickupTicks もここに入れる）
  const frontTicks = Array(measureCount).fill(0);
  const backTicks = Array(measureCount).fill(0);
  backTicks[0] = pickupTicks;
  frontTicks[lastIndex] = endTicks;
  const roundedMeasures = []; // 拍の単位に切り上げた途中の短い小節の番号（0 から）（知らせるため）
  for (let i = 1; i < lastIndex; i++) {
    const total = measureTicks(times[i]);
    const reads = readParts.map((read) => read.measures[i]).filter((read) => read);
    if (reads.length === 0) continue;
    const countedMid = reads.some((read) => !isMeasureRestOnly(read)) ? reads.filter((read) => !isMeasureRestOnly(read)) : reads;
    // 読めない音のある小節は、拍子どおりの長さとみなす（短い小節にはしない）
    const longest = Math.max(0, ...countedMid.map((read) => (read.readable ? read.ticks : total)));
    if (longest <= 0 || longest >= total) continue;
    const unit = total / times[i].beats; // 拍子の下の数字の音符1つ分
    const count = Math.ceil(longest / (unit / 2)) / 2; // 半拍の単位で切り上げる（半拍刻みに対応）
    if (count >= times[i].beats) continue; // 切り上げると1小節になる：今までどおり拍子どおりの小節にする
    const length = count * unit;
    // 続きにするか：番号に数えない小節の印があるか、前の小節が「前の部分」で、足すとちょうど1小節になるか
    const implicit = readParts[0].measures[i]?.implicit === true;
    const pairsWithPrev = frontTicks[i - 1] > 0 && frontTicks[i - 1] + length === total;
    if (implicit || pairsWithPrev) {
      measures[i].pickup = count;
      backTicks[i] = length;
    } else {
      measures[i].short = count;
      frontTicks[i] = length;
    }
    if (length !== longest) roundedMeasures.push(i);
  }
  if (roundedMeasures.length > 0) {
    // 画面と同じ小節番号で書く（続きの小節は "(8)" のように）
    const labels = roundedMeasures.map((i) => measureNumberLabel({ measures: measures }, i));
    const shown = labels.slice(0, 5).join("・") + (labels.length > 5 ? " 小節目 …" : " 小節目");
    warnings.push(`途中の短い小節で、長さが半拍の単位で割り切れないので、切り上げて休符で埋めた小節：${roundedMeasures.length}か所（${shown}）`);
  }

  // ⑥ パートのデータを作る
  const problemMeasures = new Set(); // 休符にした小節の番号（0 から数えたデータの順番。同じ小節は1回だけ）（ステップ8-4c。ステップ15-3：1 からの番号から変えた）
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
      // （ステップ20：短い最後の小節は、その長さに合わせる）
      // （途中の短い小節：続きの小節はアウフタクトと同じく前を、前の部分の小節は短い最後の小節と同じく後ろを埋める）
      //   1小節目は、アウフタクトにならなかった（切り上げて1小節になった）ときも、今までどおり前を埋める
      const isBack = (i === 0 && isPickup) || backTicks[i] > 0;
      const fitted = fitMeasure(readMeasure, times[i], isBack, backTicks[i], frontTicks[i]);
      if (!fitted.ok) problemMeasures.add(i);

      const measure = { notes: fitted.notes };
      // 音部記号：1小節目は必ず書く。途中は変わったときだけ
      const clef = i === 0 ? (readMeasure.clef ?? read.firstClef ?? INSTRUMENTS[instrument].clef) : readMeasure.clef;
      if (clef && clef !== lastClef) {
        measure.clef = clef;
        lastClef = clef;
      }
      partMeasures.push(measure);
    }

    // 連桁：ファイルのつなぎ方を、このアプリの印（join・break）にする（ステップ19-2）
    //   ・パートに <beam> が1つもなければ、自動のつなぎ方のまま（一時的な印 beamXml を消すだけ）
    //   ・アウフタクトの小節は、拍子どおりの小節の後ろの部分として区切る（画面と同じ）
    partMeasures.forEach((measure, i) => {
      if (read.hasBeams) {
        // （途中の短い小節：続きの小節も、アウフタクトと同じく後ろの部分として区切る）
        const offset = backTicks[i] > 0 ? measureTicks(times[i]) - backTicks[i] : 0;
        marksFromFile(measure.notes, times[i], offset);
      } else {
        measure.notes.forEach((note) => delete note.beamXml);
      }
    });

    // 符尾の向き：自動と同じ向きの所は外して、違う所だけ残す（ステップ22）
    //   ・連桁が決まってから行う（連桁でつながった音符は、まとまりで向きが決まるため）
    //   ・小節ごとに、その小節の音部記号で計算する（音部記号で、五線の上の位置が変わるため）
    let nowClef = INSTRUMENTS[instrument].clef;
    partMeasures.forEach((measure, i) => {
      if (measure.clef) nowClef = measure.clef;
      // （途中の短い小節：続きの小節も、アウフタクトと同じく後ろの部分として計算する）
      const offset = backTicks[i] > 0 ? measureTicks(times[i]) - backTicks[i] : 0;
      stemsFromFile(measure.notes, nowClef, times[i], offset);
    });

    // パートの最後の音からタイが出ていたら外す（つながる先がない）
    const lastNotes = partMeasures[partMeasures.length - 1].notes;
    const lastNote = lastNotes[lastNotes.length - 1];
    if (lastNote && lastNote.tie) lastNote.tie = false;

    // id はパートの名札（ステップ12-3）
    return { id: createPartId(), name: "", abbreviation: "", instrument: instrument, measures: partMeasures };
  });

  // タイの相手が休符・違う高さになっている所は外す（つながる先がない）
  // （ステップ14-3：重音なら、同じ高さの音が1つでもあれば残す。重音へのグリッサンドも外す（重音にはすべらせない決まり））
  parts.forEach((part) => {
    const flat = part.measures.flatMap((m) => m.notes);
    flat.forEach((note, k) => {
      const next = flat[k + 1];
      if (note.glissando && next && next.chord) delete note.glissando;
      if (!note.tie) return;
      const nextPitches = next && !next.rest ? [next.pitch, ...(next.chord ?? [])] : [];
      const hasSame = [note.pitch, ...(note.chord ?? [])].some((pitch) => nextPitches.some((other) => samePitch(other, pitch)));
      if (!hasSame) note.tie = false;
    });
  });

  // 相手のいないスラー・松葉を外す（読めなかった小節で片方が消えたときなど）（ステップ8-4a）
  // （ステップ16-1：松葉の終わりを新しい形（wedgeEnd）に直してから、相手のいない印を外す）
  // （ステップ16-2：読み方を直したので、読み込みでは古い形（wedge: "stop"）はもう作らない。念のため直す処理は残しておく）
  parts.forEach((part) => {
    part.measures.forEach((measure) => {
      measure.notes = upgradeWedgeNotes(measure.notes);
    });
  });
  parts.forEach((part) => cleanSpanners(part));

  // パート名は、このアプリの決まりで付け直す（Violin I・Violin II…）
  renameParts(parts);

  // 休符にした小節を「12か所（12・36・53・120・122 小節目 …）」の形で知らせる（6つ目からは「…」）（ステップ8-4c）
  if (problemMeasures.size > 0) {
    const numbers = [...problemMeasures].sort((a, b) => a - b);
    // 画面と同じ小節番号で書く（アウフタクトがあれば、アウフタクトは「アウフタクト」、次の小節から 1, 2…）（ステップ15-3）
    // （途中の短い小節：続きの小節を数えない番号にする。続きの小節は "(8)" のように書く）
    const labels = numbers.map((i) => (i === 0 && pickupTicks > 0 ? "アウフタクト" : measureNumberLabel({ measures: measures }, i)));
    const shown = labels.slice(0, 5).join("・") + (labels.length > 5 ? " 小節目 …" : " 小節目");
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

  // ⑧ 2小節目からのテンポの指示（途中のテンポ変更・rit.・accel.・a tempo）（ステップ11-6c）
  readTempoMarks(childElements(partElements[0], "measure"), score);

  // ⑨ 小節線とくり返し（ステップ11-7a）
  readBarlines(childElements(partElements[0], "measure"), score);

  // ⑩ D.C.・D.S.・Fine・To Coda・𝄋・𝄌（ステップ11-7c）
  const extraJumpMarks = readJumpMarks(childElements(partElements[0], "measure"), score);
  if (extraJumpMarks > 0) {
    warnings.push(`𝄋・𝄌 が2つ以上あったので、最初のものだけを使いました（使わなかったもの：${extraJumpMarks}個）`);
  }

  // ⑪ 2音トレモロの音符にかかるタイなどを、決まりどおりに直す（直すものがなければそのまま）（ステップ14-6b）
  const cleaned = cleanAlternates(score);

  // ⑫ 要らない注意の記号の印を外す（決まりでもともと記号が付く音の印）（注意の臨時記号）
  // （pruneCourtesy は楽譜データを直接書き換える。読み込みで作ったばかりの楽譜データなので、書き換えてよい）
  pruneCourtesy(cleaned);
  return { score: cleaned, warnings: warnings };
}
