// ==========================================================
// playback.js
// 楽譜データを「鳴らす音の一覧」に直すファイル（ステップ6-1）
// 音を実際に鳴らすのは audio/sound.js の仕事。ここでは計算だけをする
// （ステップ6-3a：スタッカート・テヌート・アクセント・スラーを、音の長さと強さに反映する）
// （ステップ6-3b：フェルマータ。その音を2倍にのばし、ほかのパートもその間は待つ）
// （ステップ6-3c：pizz.／arco。pizz. から arco までの音に印を付ける（ピチカートの音で鳴らすため））
// （ステップ6-3d：松葉（＜ ＞）。始まりから終わりまで、だんだん強く・弱くする）
// （ステップ14-6a：2音トレモロ。下の音と上の音を、連桁の本数の細かさで交互に鳴らす）
//
// 【鳴らす音の一覧の1つ分】
// {
//   part: 0,                  // 何パート目か
//   measure: 2,               // 何小節目か（鳴り始める音のある小節）
//   note: 1,                  // 小節の中の何番目の音か
//   instrument: "violin",     // 楽器（音を選ぶのに使う）
//   pitch: { step, alter, octave }, // 音の高さ
//   startTick: 24,            // 再生を始めた所から何ティック目に鳴り始めるか（ティックは model.js の TICKS_PER_16TH を参照）
//   ticks: 4,                 // 楽譜の上の長さ（ティック。タイでつながった音は合計した長さ）
//   soundTicks: 3.8,          // 実際に音を出す長さ（ティック。スタッカートなら短く、スラーならいっぱい）
//   connected: false,         // 次の音となめらかにつなげるか（スラーの中・テヌートなら true）
//   pizz: false,              // ピチカートで鳴らすか（pizz. から arco までの音なら true）
//   velocity: 80              // 音の強さ（0〜127。強弱記号とアクセントから決める）
// }
// ==========================================================

import { measureTicks, measureLength, measureOffset, noteTicks, timeAt, keyAt, TICKS_PER_16TH, notePitches, hasDiamond, INSTRUMENTS, isAlternate } from "./model.js";
import { HARMONIC_SOUNDS } from "./symbols.js";
import { keyAlters } from "./accidentals.js";
import { mixerOf, isAudible } from "./mixer.js";

// ----------------------------------------------------------
// 強弱記号ごとの音の強さ（0〜127。MIDI と同じ決め方）
// 強弱記号がまだ1つも出てきていないときは mf にする
// ----------------------------------------------------------
const DYNAMIC_VELOCITY = {
  pp: 35,
  p: 50,
  mp: 65,
  mf: 80,
  f: 100,
  ff: 118,
};

// sf（スフォルツァンド）：その音だけ強くする強さ（そのあとは前の強さに戻る）
const SF_VELOCITY = 120;

// fp（フォルテピアノ）：その音は f、そのあとは p
const FP_VELOCITY = DYNAMIC_VELOCITY.f;
const FP_AFTER = "p";

// 強弱記号が出てくる前の強さ
const DEFAULT_DYNAMIC = "mf";

// ----------------------------------------------------------
// 音を出す長さの割合（楽譜の長さに対して、どれだけ鳴らすか）（ステップ6-3a）
// 音と音の間の時間は変えずに、鳴らす長さだけを変える
// ----------------------------------------------------------
const GATE_NORMAL = 0.95; // ふつう：少しだけ短くして、音と音の間に切れ目を作る
const GATE_STACCATO = 0.5; // スタッカート：半分で切る
const GATE_STACCATISSIMO = 0.25; // スタッカーティシモ：4分の1で切る（ステップ11-1a）
const GATE_TENUTO = 1.0; // テヌート：いっぱいに鳴らす
const GATE_SLUR = 1.0; // スラーの中：切れ目なしでつなげる
const GATE_BREATH = 0.7; // ブレス・カエスーラの付いた音：7割で切って、弓を上げる間を作る（ステップ11-1c）

// カエスーラであける間（ティック）：4分音符1つ分（ステップ11-1c）
const CAESURA_PAUSE = TICKS_PER_16TH * 4;

// アクセントで強くする量（0〜127 の強さに足す）
const ACCENT_BOOST = 20;

// マルカートで強くする量（アクセントより強くする）（ステップ11-1a）
const MARCATO_BOOST = 30;

// フェルマータでのばす倍率（2 なら、その音符の長さの2倍）（ステップ6-3b）
const FERMATA_RATE = 2;

// 強弱の段階（弱い順）（ステップ6-3d）
// 松葉の終わりに強弱記号がないとき、ここから2段階上げる・下げる
const DYNAMIC_LEVELS = ["pp", "p", "mp", "mf", "f", "ff"];

// 松葉の終わりに強弱記号がないとき、何段階変えるか
const WEDGE_STEPS = 2;

// ----------------------------------------------------------
// 関数：pitchToMidi
// 音の高さを MIDI の番号にする（ド4 = 60、ラ4 = 69）
// タイの相手が同じ高さかどうかを比べるのに使う
// ----------------------------------------------------------
const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pitchToMidi(pitch) {
  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
}

// ----------------------------------------------------------
// 関数：applyDynamic
// 音符に付いている強弱記号から、「その音の強さ」と「次からの強弱」を決める
//   dynamic … 音符に付いている強弱記号（なければ undefined）
//   current … 今の強弱（"mf" など）
// 戻り値：{ velocity: その音の強さ, next: 次の音からの強弱 }
// ----------------------------------------------------------
function applyDynamic(dynamic, current) {
  if (dynamic === "sf") {
    // その音だけ強く、そのあとは元の強弱のまま
    return { velocity: SF_VELOCITY, next: current };
  }
  if (dynamic === "fp") {
    // その音は f、そのあとは p
    return { velocity: FP_VELOCITY, next: FP_AFTER };
  }
  if (dynamic && DYNAMIC_VELOCITY[dynamic] !== undefined) {
    // pp〜ff：その音から強弱が変わる
    return { velocity: DYNAMIC_VELOCITY[dynamic], next: dynamic };
  }
  // 強弱記号なし：今の強弱のまま
  return { velocity: DYNAMIC_VELOCITY[current], next: current };
}

// ----------------------------------------------------------
// 関数：noteGate
// 音符の記号から、音を出す長さの割合を決める（ステップ6-3a）
//   note   … 音符のデータ
//   legato … スラーの中で、次の音とつなげるか
// 優先する順：スタッカーティシモ → スタッカート → テヌート → スラー → ふつう
// （スラーの中でもスタッカートが付いていれば短く切る）
// ----------------------------------------------------------
function noteGate(note, legato) {
  const articulations = note.articulations ?? [];
  if (articulations.includes("staccatissimo")) return GATE_STACCATISSIMO;
  if (articulations.includes("staccato")) return GATE_STACCATO;
  return GATE_NORMAL;
}

// ----------------------------------------------------------
// 関数：nextPizz
// 音符に付いている奏法（pizz.・arco）から、この音符からピチカートかどうかを決める（ステップ6-3c）
//   note    … 音符のデータ
//   current … 前の音符までピチカートだったか
// 戻り値：この音符（と、このあと arco が出てくるまで）がピチカートなら true
// ----------------------------------------------------------
function nextPizz(note, current) {
  const techniques = note.techniques ?? [];
  if (techniques.includes("pizz.")) return true;
  if (techniques.includes("arco")) return false;
  return current;
}

// 装飾で行き来する1回分の長さ（ティック）：32分音符（ステップ11-3a）
const TRILL_STEP = TICKS_PER_16TH / 2;

// 音名の並び（1つ上・1つ下の音を決めるのに使う）（ステップ11-3a）
const STEP_NAMES = ["C", "D", "E", "F", "G", "A", "B"];

// ----------------------------------------------------------
// 関数：neighborPitch
// 音符の「1つ上の音」か「1つ下の音」を返す（装飾で行き来する音）（ステップ11-3a。1つ下はステップ11-3b）
// ♯♭は、調号と、同じ小節でその音より前に出てきた同じ高さの音に合わせる
// （例：ト長調のミの1つ上 → ファ♯。同じ小節の前にファ♮があれば → ファ♮）
//   score     … 楽譜データ
//   part      … パートのデータ
//   i         … 何小節目か（0 から）
//   j         … 小節の中で何番目の音か（0 から）
//   direction … 1 なら1つ上、-1 なら1つ下
// 戻り値：音の高さ { step, octave, alter }
// ----------------------------------------------------------
function neighborPitch(score, part, i, j, direction) {
  const pitch = part.measures[i].notes[j].pitch;
  const index = STEP_NAMES.indexOf(pitch.step);
  const step = STEP_NAMES[(index + direction + 7) % 7]; // シの1つ上はド、ドの1つ下はシ
  let octave = pitch.octave;
  if (direction === 1 && index === 6) octave = octave + 1; // シからドに上がるときはオクターブも上がる
  if (direction === -1 && index === 0) octave = octave - 1; // ドからシに下がるときはオクターブも下がる

  // まず調号の ♯♭
  let alter = keyAlters(keyAt(score, i))[step];
  // 同じ小節で、前に同じ高さ（音名とオクターブ）の音があれば、その音の ♯♭ が続いている
  part.measures[i].notes.slice(0, j).forEach((n) => {
    if (!n.rest && n.pitch.step === step && n.pitch.octave === octave) alter = n.pitch.alter ?? 0;
  });
  return { step: step, octave: octave, alter: alter };
}

// 旗・連桁の数（トレモロの刻む細かさを決めるのに使う）（ステップ11-4）
const FLAG_COUNT = { whole: 0, half: 0, quarter: 0, eighth: 1, "16th": 2, "32nd": 3 }; // 32分音符はステップ15-5

// ----------------------------------------------------------
// 関数：tremoloStep
// トレモロで刻む1回分の長さ（ティック）を決める（ステップ11-4）
// 「音符の旗・連桁の数 ＋ 斜線の本数」で細かさが決まる（楽譜の決まり）
//   1 → 8分音符、2 → 16分音符、3 以上 → 32分音符（できるだけ細かく）
// 連符の中の音なら、連符の割合（3連符なら 2/3）も掛ける
//   note … 音符のデータ（tremolo に斜線の本数が入っているもの）
// ----------------------------------------------------------
function tremoloStep(note) {
  const level = (FLAG_COUNT[note.duration] ?? 0) + note.tremolo;
  let step = TRILL_STEP; // 3 以上：32分音符
  if (level === 1) step = TICKS_PER_16TH * 2; // 8分音符
  if (level === 2) step = TICKS_PER_16TH; // 16分音符
  if (note.tuplet) step = (step * note.tuplet.normal) / note.tuplet.actual;
  return step;
}

// ----------------------------------------------------------
// 関数：ornamentPitches
// 装飾の付いた音について、すばやく鳴らす音の並びを決める（ステップ11-3b）
// （最後に主の音を残りの長さぶん鳴らすので、ここにはその前の音だけを入れる）
//   event … 鳴らす音（ornament・upper・lower が入っているもの）
// 戻り値：音の高さの並び
//   プラルトリラー … 主の音 → 上の音（→ 主の音）
//   モルデント     … 主の音 → 下の音（→ 主の音）
//   ターン         … 上の音 → 主の音 → 下の音（→ 主の音）
// ----------------------------------------------------------
function ornamentPitches(event) {
  if (event.ornament === "prall") return [event.pitch, event.upper];
  if (event.ornament === "mordent") return [event.pitch, event.lower];
  if (event.ornament === "turn") return [event.upper, event.pitch, event.lower];
  return [];
}

// ----------------------------------------------------------
// 関数：ornamentPieces
// 装飾の付いた音を、すばやく行き来する短い音（かけら）に分ける（ステップ11-3a。トリル以外はステップ11-3b）
//   トリル：主の音と1つ上の音を 32分音符ずつ行き来する
//           最後が主の音になるように、かけらの数が偶数なら上の音から始める
//   プラルトリラー・モルデント・ターン：始めに 32分音符ずつすばやく鳴らして、残りは主の音をのばす
//           （音が短くて入りきらないときは、かけらを短くして収める）
//   トレモロ：同じ音を tremoloStep ずつ刻む（ステップ11-4）
//   event … 鳴らす音（ornament に装飾の名前、または tremoloStep にトレモロの長さが入っているもの）
// 戻り値：分けた音の一覧
// ----------------------------------------------------------
function ornamentPieces(event) {
  const total = event.soundTicks; // 音を出す長さ全体（フェルマータでのびたぶんも入っている）

  // かけらの音の高さと長さの並び { pitch, length } を作る
  const parts = [];
  if (event.tremoloStep && event.alternatePitch) {
    // 2音トレモロ：下の音と上の音を、決まった細かさで交互に鳴らす（下の音から）（ステップ14-6a）
    // かけらの数：楽譜の長さ（音を出す長さより少し長い）で数える（行き来するので、少なくとも2つ）
    // （音を出す長さで数えると、スタッカートなどで短くなったぶん、数が1つ減って「上の音」で終わらなくなるため）
    const count = Math.max(2, Math.round(Math.max(event.ticks, total) / event.tremoloStep));
    const step = total / count; // 1つ分の長さ（音を出す長さを、ちょうど等分する）
    for (let k = 0; k < count; k++) {
      parts.push({ pitch: k % 2 === 0 ? event.pitch : event.alternatePitch, length: step });
    }
  } else if (event.tremoloStep) {
    // トレモロ：同じ音を、決まった細かさで刻む（ステップ11-4）
    const count = Math.max(1, Math.round(total / event.tremoloStep)); // 刻む回数
    for (let k = 0; k < count; k++) {
      const isLast = k === count - 1;
      parts.push({ pitch: event.pitch, length: isLast ? total - k * event.tremoloStep : event.tremoloStep });
    }
  } else if (event.ornament === "trill") {
    // 1回分の長さ：32分音符（その所のテンポに合わせて伸び縮みさせる）（ステップ11-6b）
    const trillStep = TRILL_STEP * (event.tempoFactor ?? 1);
    const count = Math.max(1, Math.floor(total / trillStep)); // かけらの数
    for (let k = 0; k < count; k++) {
      const isLast = k === count - 1;
      // 最後から数えて偶数番目（最後・最後から3つ目…）が主の音
      const isMain = (count - 1 - k) % 2 === 0;
      // 最後のかけらは、残りの長さを全部鳴らす
      parts.push({ pitch: isMain ? event.pitch : event.upper, length: isLast ? total - k * trillStep : trillStep });
    }
  } else {
    const quick = ornamentPitches(event);
    // 1つ分の長さ：32分音符（その所のテンポに合わせる）（ステップ11-6b）。入りきらないときは「すばやい音＋最後の主の音」で等分する
    const step = Math.min(TRILL_STEP * (event.tempoFactor ?? 1), total / (quick.length + 1));
    quick.forEach((pitch) => parts.push({ pitch: pitch, length: step }));
    parts.push({ pitch: event.pitch, length: total - step * quick.length }); // 残りは主の音
  }

  // かけらを、鳴らす音の形にする
  const pieces = [];
  let start = event.startTick;
  parts.forEach((part, k) => {
    const isLast = k === parts.length - 1;
    pieces.push({
      ...event,
      pitch: part.pitch,
      startTick: start,
      ticks: part.length,
      soundTicks: part.length,
      connected: isLast ? event.connected : false, // 最後のかけら以外は、次のかけらと重ねずに切る
      ornamentPiece: true, // 装飾で分けたかけら（sound.js で、余韻を短くして重ならないようにする）
    });
    start = start + part.length;
  });
  return pieces;
}

// ----------------------------------------------------------
// 関数：glissandoTarget
// グリッサンドの付いた音の「次の音」の高さを返す（すべって行く先）（ステップ11-5b）
// 小節をまたいでもよい。次が休符・次の音がないときは null（すべらない）
//   part … パートのデータ
//   i    … 何小節目か（0 から）
//   j    … 小節の中で何番目の音か（0 から）
// ----------------------------------------------------------
function glissandoTarget(part, i, j) {
  let next = part.measures[i].notes[j + 1]; // 同じ小節の次の音
  if (!next && i + 1 < part.measures.length) next = part.measures[i + 1].notes[0]; // 小節の最後なら、次の小節の最初の音
  if (!next || next.rest) return null;
  return next.pitch;
}

// MIDI の番号から音の高さに直すための表（黒鍵は ♯ で書く）（ステップ11-5b）
const MIDI_STEPS = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
const MIDI_ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

// ----------------------------------------------------------
// 関数：midiToPitch
// MIDI の番号を音の高さにする（pitchToMidi の逆。黒鍵は ♯ で書く）（ステップ11-5b）
// 例：61 → { step: "C", alter: 1, octave: 4 }（ド♯4）
// ----------------------------------------------------------
function midiToPitch(midi) {
  const index = ((midi % 12) + 12) % 12; // 0〜11（ドからシまでのどこか）
  return { step: MIDI_STEPS[index], alter: MIDI_ALTERS[index], octave: Math.floor(midi / 12) - 1 };
}

// ----------------------------------------------------------
// 関数：glissStartTick
// グリッサンドで、すべり始める時刻（ティック）を返す（ステップ11-5b）
// グリッサンドの音（タイの最後の音）の「後半」ですべる
// フェルマータが付いていたら、のびたあとの後半ですべる（のびた音の長さは FERMATA_RATE 倍）
//   event … 鳴らす音（glissTo・glissLastTicks が入っているもの。フェルマータでずらしたあとのもの）
// （電子音で周波数を変えるときにも使うので、ほかのファイルから使えるようにした（export））
// ----------------------------------------------------------
export function glissStartTick(event) {
  const glide = (event.glissLastTicks / 2) * (event.fermataEnd ? FERMATA_RATE : 1); // すべる長さ
  return event.startTick + event.ticks - glide;
}

// ----------------------------------------------------------
// 関数：glissandoPieces
// グリッサンドの付いた音を、半音ずつのかけらに分ける（楽器の音で鳴らすとき）（ステップ11-5b）
// （録音した楽器の音は、鳴らし始めたあとで高さを変えられないため、間の半音を順に鳴らす）
//   ・すべる所（後半）を「高さの差（半音の数）」で等分する
//   ・最初のかけら：もとの音（前半＋すべる所の最初の1つ分）
//   ・そのあと：間の半音を1つずつ（行く先の音は、次の音がふつうに鳴る）
//   例：ド4 → ミ4（半音4つ分）なら、ド4・ド♯4・レ4・レ♯4 のあとにミ4（次の音）
//   event … 鳴らす音（glissTo が入っているもの）
// 戻り値：分けた音の一覧（高さの差が半音1つ以下なら、間の音がないので分けずにそのまま）
// ----------------------------------------------------------
export function glissandoPieces(event) {
  const from = pitchToMidi(event.pitch);
  const diff = pitchToMidi(event.glissTo) - from; // 高さの差（上がるならプラス）
  const count = Math.abs(diff); // 半音の数
  if (count < 2) return [event];

  const direction = diff > 0 ? 1 : -1;
  const glideStart = glissStartTick(event); // すべり始める時刻
  const end = event.startTick + event.ticks; // 次の音が鳴り始める時刻
  const step = (end - glideStart) / count; // かけら1つ分の長さ

  const pieces = [];
  for (let k = 0; k < count; k++) {
    // かけらの始まりと終わり（最初のかけらだけ、音の頭から始まる）
    const start = k === 0 ? event.startTick : glideStart + step * k;
    const pieceEnd = glideStart + step * (k + 1);
    const isLast = k === count - 1;
    pieces.push({
      ...event,
      pitch: midiToPitch(from + direction * k), // k = 0 はもとの音
      startTick: start,
      ticks: pieceEnd - start,
      // 音を出す長さ：最後のかけらは、もとの音の終わりまで（次の音とつなげる）
      soundTicks: isLast ? event.startTick + event.soundTicks - start : pieceEnd - start,
      // 最後のかけら以外は、余韻を短くして次のかけらと少しだけ重ねる（ornamentPiece のしくみを使う）
      connected: isLast ? event.connected : false,
      ornamentPiece: !isLast,
      glissTo: null, // 分けたかけらは、もうすべらない
    });
  }
  return pieces;
}

// 弱音器（con sord.）を付けている間の音の強さの割合（ステップ11-2）
const MUTE_RATE = 0.75;

// ----------------------------------------------------------
// 関数：nextMute
// 音符に付いている奏法（con sord.・senza sord.）から、この音符から弱音器を付けているかを決める（ステップ11-2）
//   note    … 音符のデータ
//   current … 前の音符まで弱音器を付けていたか
// 戻り値：この音符（と、このあと senza sord. が出てくるまで）が弱音器付きなら true
// ----------------------------------------------------------
function nextMute(note, current) {
  const techniques = note.techniques ?? [];
  if (techniques.includes("con sord.")) return true;
  if (techniques.includes("senza sord.")) return false;
  return current;
}

// ----------------------------------------------------------
// 関数：isPizzAt
// 楽譜のある場所の音が、ピチカートの範囲かどうかを調べる（鍵盤を押したときの音を決めるのに使う）（ステップ6-3c）
//   score    … 楽譜データ
//   position … 場所 { part, measure, note }
// 1小節目からその場所の音まで（その音に付いている pizz.・arco も含めて）数える
// ----------------------------------------------------------
export function isPizzAt(score, position) {
  const part = score.parts[position.part];
  let pizz = false;
  for (let i = 0; i <= position.measure; i++) {
    const notes = part.measures[i].notes;
    const last = i === position.measure ? position.note : notes.length - 1; // その小節で、どこまで数えるか
    for (let j = 0; j <= last && j < notes.length; j++) {
      if (!notes[j].rest) pizz = nextPizz(notes[j], pizz);
    }
  }
  return pizz;
}

// ----------------------------------------------------------
// 関数：stepLevel
// 強弱を何段階か上げる・下げる（pp より下・ff より上には行かない）（ステップ6-3d）
//   dynamic … 今の強弱（"mf" など）
//   steps   … 上げる段階の数（マイナスなら下げる）
// 例：("mf", 2) → "ff"、("mf", -2) → "p"、("f", 2) → "ff"
// ----------------------------------------------------------
function stepLevel(dynamic, steps) {
  const index = DYNAMIC_LEVELS.indexOf(dynamic);
  const next = Math.min(DYNAMIC_LEVELS.length - 1, Math.max(0, index + steps));
  return DYNAMIC_LEVELS[next];
}

// ----------------------------------------------------------
// 関数：computeWedges
// 1つのパートの松葉（＜ ＞）を調べて、松葉の中の音の強さを決める（ステップ6-3d）
//   part … パートのデータ
// 戻り値：Map（キー "小節番号-音の番号" → { velocity: その音の強さ, after: 松葉のあとの強弱 }）
//   after は松葉の終わりの音にだけ入る（終わりの音に強弱記号がないとき、そこから続く強弱）
// 決め方
//   ・始まりの強さ ＝ 始まりの音の強さ（今の強弱）
//   ・終わりの強さ ＝ 終わりの音に強弱記号（pp〜ff）があればその強さ
//                    なければ ＜ は2段階上、＞ は2段階下
//   ・間の音は、始まりの音からの時間の割合で、だんだん変える
// ----------------------------------------------------------
function computeWedges(part) {
  // パートの音を、1小節目からの時刻（ティック）といっしょに1列に並べる
  const list = [];
  let tick = 0;
  part.measures.forEach((measure, i) => {
    measure.notes.forEach((note, j) => {
      list.push({ key: `${i}-${j}`, note: note, tick: tick });
      tick = tick + noteTicks(note);
    });
  });

  const wedges = new Map();
  let dynamic = DEFAULT_DYNAMIC; // 今の強弱（buildEvents と同じ数え方をする）

  for (let k = 0; k < list.length; k++) {
    const item = list[k];
    if (item.note.rest) continue;

    // 強弱を進める
    const result = applyDynamic(item.note.dynamic, dynamic);
    dynamic = result.next;
    const before = wedges.get(item.key); // 前の松葉で、この音の強さが決まっているか
    if (before && before.after) dynamic = before.after;

    // 松葉の始まりの音でなければ次へ
    const kind = item.note.wedge;
    if (kind !== "crescendo" && kind !== "diminuendo") continue;

    // 終わりの音（wedgeEnd の印のある音符）を先まで探す（ステップ16-1：終わりは wedgeEnd に分けた）
    // （音符の下だけの松葉 wedgeInside は、1つの音の途中ではふくらまない決まりなので、音を変えない（ステップ16-1））
    let endK = -1;
    for (let m = k + 1; m < list.length; m++) {
      if (!list[m].note.rest && list[m].note.wedgeEnd) {
        endK = m;
        break;
      }
    }
    if (endK < 0) continue; // 終わりが見つからなければ何もしない

    // 始まりの強さ（前の松葉の終わりと重なっていれば、その強さから）
    const startVelocity = before ? before.velocity : result.velocity;

    // 終わりの強さ
    const endNote = list[endK].note;
    let target;
    let after;
    if (endNote.dynamic && DYNAMIC_VELOCITY[endNote.dynamic] !== undefined) {
      // 終わりの音に強弱記号がある：その強さ（そのあとの強弱は applyDynamic で変わる）
      target = DYNAMIC_VELOCITY[endNote.dynamic];
    } else {
      // ない：＜ は2段階上、＞ は2段階下。松葉のあとも、その強弱が続く
      after = stepLevel(dynamic, kind === "crescendo" ? WEDGE_STEPS : -WEDGE_STEPS);
      target = DYNAMIC_VELOCITY[after];
    }

    // 始まりの音から終わりの音まで、時間の割合でだんだん変える
    const startTick = item.tick;
    const endTick = list[endK].tick;
    for (let m = k; m <= endK; m++) {
      if (list[m].note.rest) continue;
      const rate = endTick === startTick ? 1 : (list[m].tick - startTick) / (endTick - startTick);
      const velocity = Math.round(startVelocity + (target - startVelocity) * rate);
      wedges.set(list[m].key, { velocity: velocity, after: m === endK ? after : undefined });
    }
  }

  return wedges;
}

// ハーモニクス（ひし形の玉のある音符）を鳴らす強さの割合（ハーモニクスはやわらかく小さめの音なので）（ステップ14-5a）
const HARMONIC_RATE = 0.75;

// ----------------------------------------------------------
// 関数：soundingPitches
// 音符を鳴らすときに、実際に鳴らす高さの並び（低い順）を返す（ステップ14-5a）
//   ・ひし形の玉がない音符 … 楽譜どおりの高さ（notePitches と同じ）
//   ・ひし形の玉がある音符 … ハーモニクスで聞こえる音
//       ひし形のすぐ下にふつうの玉がある → その2つの間の音程から、聞こえる音を決める（HARMONIC_SOUNDS）
//                                         （人工ハーモニクスも、開放弦＋ひし形の自然ハーモニクスも同じ）
//       ひし形の下にふつうの玉がない     → その音符に「sul G」などの弦の指定があれば、その弦の開放弦から決める
//                                         なければ、ひし形の高さをそのまま鳴らす（正しい音でないこともある）
//       表にない音程                      → ひし形の高さをそのまま鳴らす
//     ひし形の下で使ったふつうの玉は鳴らさない（押さえる・開放弦の音で、ハーモニクスのもとになる音なので）
//     使わなかったふつうの玉は、そのまま鳴らす
//   note       … 音符のデータ
//   instrument … 楽器（"violin" など。弦の指定から開放弦を決めるのに使う。省略したら弦の指定は見ない）
// （鍵盤や ▲▼ で音を確かめるときにも使うので、ほかのファイルから使えるようにした（export））
// ----------------------------------------------------------
export function soundingPitches(note, instrument = null) {
  const pitches = notePitches(note);
  if (!hasDiamond(note)) return pitches;

  const used = new Set(); // ハーモニクスのもとに使ったふつうの玉の番号
  const sounds = [];
  pitches.forEach((pitch, k) => {
    if (!pitch.diamond) return;
    // もとになる音：すぐ下のふつうの玉（なければ、弦の指定の開放弦）
    let base = null;
    for (let m = k - 1; m >= 0; m--) {
      if (!pitches[m].diamond) {
        base = pitches[m];
        used.add(m);
        break;
      }
    }
    if (!base) base = openStringOf(note, instrument);
    const interval = base ? pitchToMidi(pitch) - pitchToMidi(base) : null;
    const sound = interval !== null ? HARMONIC_SOUNDS[interval] : undefined;
    // 表にない・もとの音がないときは、書いた高さをそのまま（ひし形の印は外す）
    sounds.push(sound !== undefined ? midiToPitch(pitchToMidi(base) + sound) : { step: pitch.step, alter: pitch.alter ?? 0, octave: pitch.octave });
  });
  // 使わなかったふつうの玉は、そのまま鳴らす
  pitches.forEach((pitch, k) => {
    if (!pitch.diamond && !used.has(k)) sounds.push(pitch);
  });
  return sounds.sort((a, b) => pitchToMidi(a) - pitchToMidi(b));
}

// ----------------------------------------------------------
// 関数：openStringOf
// 音符に付いている弦の指定（「sul G」など）から、その弦の開放弦の高さを返す（ステップ14-5a）
//   note       … 音符のデータ
//   instrument … 楽器（"violin" など）
// 戻り値：音の高さ { step, alter, octave }（弦の指定がない・楽器にない弦なら null）
// ----------------------------------------------------------
function openStringOf(note, instrument) {
  const info = INSTRUMENTS[instrument];
  if (!info) return null;
  for (const name of note.techniques ?? []) {
    const match = /^sul ([A-G])$/.exec(name); // 「sul G」の G の部分
    if (!match) continue;
    const index = info.strings.indexOf(match[1]);
    if (index >= 0) return { step: match[1], alter: 0, octave: info.openOctaves[index] };
  }
  return null;
}

// アルペジオで、1音ごとにずらす時間（秒）（ステップ14-4a）
// テンポに関係なく、弓でさっと弾いたくらいの速さにする
const ARPEGGIO_SECONDS = 0.06;

// 3音・4音の重音で、下の2音を鳴らす長さ（ティック）：16分音符1つ分（ステップ14-4a）
// （バイオリンは3音・4音を同時にのばせないので、下の2音を短く弾いてから上の2音をのばす）
const BROKEN_CHORD_TICKS = TICKS_PER_16TH;

// ----------------------------------------------------------
// 関数：brokenRole
// 3音・4音の重音を弦楽器の弾き方で鳴らすとき、その高さの音をどう鳴らすかを決める（ステップ14-4a）
//   index … 何番目の高さか（低い順。0 から）
//   count … 重音の音の数
// 戻り値：
//   "short" … 下の2音のうち、上の2音に入らない音：頭で短く鳴らす
//   "late"  … 上の2音のうち、下の2音に入らない音：少し遅れて鳴らし始め、のばす
//   "full"  … 下の2音にも上の2音にも入る音（3音のまん中）：頭から鳴らし、のばす
// 例：4音 → [short, short, late, late]、3音 → [short, full, late]
// ----------------------------------------------------------
function brokenRole(index, count) {
  const inLower = index < 2;
  const inUpper = index >= count - 2;
  if (inLower && inUpper) return "full";
  if (inLower) return "short";
  return "late";
}

// 短前打音を鳴らす長さ（ティック）：32分音符1つ分（ステップ11-8a）
const SHORT_GRACE_TICKS = TICKS_PER_16TH / 2;

// ----------------------------------------------------------
// 関数：graceLength
// 前打音を鳴らす長さ（ティック）を決める（ステップ11-8a）
//   ・短前打音 … 32分音符の長さ。ただし主音の半分より長くはしない
//   ・長前打音 … 主音の半分。付点の音符なら3分の2（付点4分音符なら4分音符ぶん）
//   note   … 主音のデータ（note.grace に前打音が入っている）
//   length … 主音の長さ（ティック）
// 戻り値：前打音の長さ（ティック）
// ----------------------------------------------------------
export function graceLength(note, length) {
  if (note.grace.type === "short") return Math.min(SHORT_GRACE_TICKS, length / 2);
  return (note.dots ?? 0) > 0 ? (length * 2) / 3 : length / 2;
}

// ----------------------------------------------------------
// 関数：playOrder
// 楽譜のくり返し（‖: 〜 :‖）をたどって、鳴らす小節の順番を作る（ステップ11-7a）
//   例：1 2 ‖: 3 4 :‖ 5 → [0, 1, 2, 3, 2, 3, 4]（小節の番号は 0 から）
//   ・:‖ に来て、まだくり返していなければ、戻る（2回目はそのまま次へ進む）
//   ・戻る先：前にある ‖:（その前に別の :‖ があれば、その :‖ のすぐあと。どちらもなければ曲の頭）
// （ステップ11-7b：1番・2番かっこ）
//   ・今が何回目か（pass）を数える。:‖ で戻ると 2回目になる
//   ・その回と番号の違うかっこは、かっこの終わりの小節まで飛ばす
//     例：‖: 1 2 [1. 3 :‖] [2. 4] 5 → 1 2 3 1 2 4 5
//   ・2番かっこを弾き終わったら、1回目に戻す（その先に別のくり返しがあってもよいように）
//   ・‖: に、戻ってきたのではなく前から進んできたときも、1回目に戻す
// （ステップ11-7c：D.C.・D.S.・Fine・To Coda・Coda）
//   ・D.C.・D.S. の小節を弾き終わったら、D.C. は曲の頭、D.S. は 𝄋 の小節へ戻る（戻るのは1回だけ）
//     𝄋 がないときは、曲の頭へ戻る
//   ・戻ったあとは、くり返し（:‖）では戻らず、かっこは2番だけ弾く（いつも2回目として数える）
//   ・戻ったあとで、Fine の小節を弾き終わったら終わり。To Coda の小節を弾き終わったら 𝄌 の小節へ飛ぶ
//     （𝄌 がないときは、飛ばずにそのまま進む）
//   ・戻る前の Fine・To Coda は、何もせずにそのまま進む
//     例：1 2 3 [𝄋 4] 5 [6 To Coda] 7 [8 D.S. al Coda] [𝄌 9] 10 → 1 2 3 4 5 6 7 8 4 5 6 9 10
//   score        … 楽譜データ
//   startMeasure … 何小節目から鳴らすか（そこから順番を作る。前の ‖: へ戻ることもある）
//   endMeasure   … 何小節目まで鳴らすか（区間リピートのとき）。指定したときは、くり返しはたどらず、まっすぐ並べる
// 戻り値：小節の番号の配列
// ----------------------------------------------------------
export function playOrder(score, startMeasure, endMeasure = null) {
  const order = [];
  // 区間リピート：範囲の中は、楽譜のくり返しをたどらずに、まっすぐ並べる
  if (endMeasure !== null) {
    for (let i = startMeasure; i <= endMeasure; i++) order.push(i);
    return order;
  }

  const measures = score.measures;
  const repeated = new Set(); // もうくり返した :‖ の小節（2回目は戻らない）
  let pass = 1; // 今が何回目か（1番・2番かっこで使う）（ステップ11-7b）
  let jumpedTo = null; // :‖ で戻った先の小節（そこの ‖: では、回数を1に戻さない）
  let jumped = false; // D.C.・D.S. で戻ったあとか（ステップ11-7c）
  let codaJumped = false; // To Coda から 𝄌 へ飛んだあとか（2回は飛ばない）（ステップ11-7c）
  // 𝄋・𝄌 の小節（なければ -1）（ステップ11-7c）
  const segnoMeasure = measures.findIndex((info) => info.segno);
  const codaMeasure = measures.findIndex((info) => info.coda);
  let i = startMeasure;
  while (i < measures.length) {
    const info = measures[i];

    // 前から進んできて ‖: に来た：新しいくり返しなので、1回目にする（ステップ11-7b）
    // （D.C.・D.S. で戻ったあとは、いつも2回目のまま）（ステップ11-7c）
    if (info.repeatStart && i !== jumpedTo && !jumped) pass = 1;
    jumpedTo = null;

    // その回と番号の違うかっこ：かっこの終わりの小節まで飛ばす（ステップ11-7b）
    if (info.ending && info.ending !== pass) {
      let end = i;
      while (end < measures.length - 1 && !measures[end].endingEnd) end = end + 1;
      i = end + 1;
      continue;
    }

    order.push(i);
    // くり返しの終わり：まだくり返していなければ戻る（D.C.・D.S. で戻ったあとは戻らない）
    if (info.repeatEnd && !repeated.has(i) && !jumped) {
      repeated.add(i);
      // 戻る先を探す：前へさかのぼって ‖: を探す（別の :‖ に当たったら、そのすぐあと）
      let target = 0;
      for (let k = i; k >= 0; k--) {
        if (measures[k].repeatStart) {
          target = k;
          break;
        }
        if (k < i && measures[k].repeatEnd) {
          target = k + 1;
          break;
        }
      }
      pass = pass + 1; // 次は2回目（ステップ11-7b）
      jumpedTo = target;
      i = target;
      continue;
    }

    // D.C.・D.S. で戻ったあと：Fine なら終わり、To Coda なら 𝄌 へ飛ぶ（ステップ11-7c）
    if (jumped && info.fine) break;
    if (jumped && info.toCoda && !codaJumped && codaMeasure >= 0) {
      codaJumped = true;
      i = codaMeasure;
      continue;
    }

    // D.C.・D.S.：まだ戻っていなければ、曲の頭か 𝄋 へ戻る（ステップ11-7c）
    if (info.jump && !jumped) {
      jumped = true;
      pass = 2; // 戻ったあとは、いつも2回目として数える（かっこは2番だけ）
      const isSegno = info.jump.startsWith("ds");
      const target = isSegno && segnoMeasure >= 0 ? segnoMeasure : 0;
      jumpedTo = target;
      i = target;
      continue;
    }

    // 2番かっこ（1番より後ろの番号のかっこ）を弾き終わったら、1回目に戻す（ステップ11-7b）
    // （D.C.・D.S. で戻ったあとは、2回目のまま）（ステップ11-7c）
    if (info.endingEnd && info.endingEnd >= 2 && !jumped) pass = 1;
    i = i + 1;
  }
  return order;
}

// rit.・accel. で、範囲の終わりまでに何倍の速さにするか（ステップ11-6b）
const RIT_RATE = 0.7; // rit.：元の 7割の速さまで遅くする
const ACCEL_RATE = 1.3; // accel.：元の 1.3倍の速さまで速くする

// テンポの倍率を決める細かさ：1小節をこの数に分けて、分けた所ごとに倍率を決める（ステップ11-6b）
// （rit.・accel. で、小節の中でもなめらかに速さが変わるようにするため）
const WARP_STEPS = 16;

// ----------------------------------------------------------
// 関数：makeTempoWarp
// 途中でテンポが変わる楽譜のために、「ティックの数を伸び縮みさせる」しくみを作る（ステップ11-6a）
// 再生では、1ティックが何秒かを1小節目のテンポ（score.tempo）で決めたまま変えない。
// そのかわり、テンポの違う所では、ティックの数を「1小節目のテンポ ÷ その所のテンポ」倍にして並べ直す
//   例：1小節目 ♩＝120、3小節目から ♩＝60 → 3小節目からは2倍のティックにする（＝半分の速さで鳴る）
// （ステップ11-6b：rit.・accel.・a tempo も入れた。1小節を WARP_STEPS に分けて、分けた所ごとに速さを決める）
//   ・rit.・accel. の範囲：範囲の頭の速さから、範囲の終わりで RIT_RATE・ACCEL_RATE 倍まで、だんだん変える
//   ・範囲のあと：その速さのまま（a tempo かテンポ変更が来るまで）
//   ・a tempo・テンポ変更：その小節のテンポ（tempoAt と同じもの）に戻る
// （ステップ11-7a：小節を、くり返しをたどった順番（order）で並べる。くり返しで戻ったときは、1回目にその小節に来たときの速さに戻す）
//   score        … 楽譜データ
//   startMeasure … 再生を始める小節（ここを 0 ティックとして数える）
//   order        … 鳴らす小節の順番（playOrder で作ったもの）
// 戻り値：{ at, factorAt }
//   at(tick)             … 伸び縮みさせる前の時刻（ティック）を、伸び縮みさせたあとの時刻にする
//   factorAt(tick, left) … その時刻の倍率（left が true なら、区切りのちょうど頭では前の区切りの倍率）
//                          （フェルマータのように「その音の終わり」で測るものは、left を true にする）
// ----------------------------------------------------------
function makeTempoWarp(score, startMeasure, order) {
  // 細かい区切りごとの { from: 伸び縮みさせる前の始まり, warpedFrom: 伸び縮みさせたあとの始まり, factor: 倍率 }
  const segments = [];
  let tempo = score.tempo; // 今のテンポ（テンポ変更をたどる）
  let rate = 1; // rit.・accel. で変わった速さの割合（1 なら元の速さ）
  let gradual = null; // 今の rit.・accel. の範囲 { startTick, length, fromRate, toRate, to }（なければ null）
  let tick = 0; // 曲の頭から何ティック目か（伸び縮みさせる前）
  let raw = 0; // 再生を始める所から何ティック目か（伸び縮みさせる前）
  let warped = 0; // 伸び縮みさせたあと

  // たどる小節の並び：始める小節より前（速さをたどるだけ）＋ 鳴らす小節の順番（ステップ11-7a）
  const sequence = [];
  for (let i = 0; i < startMeasure; i++) sequence.push(i);
  sequence.push(...order);
  const firstVisit = new Map(); // 小節の番号 → 1回目にその小節に来たときの { tempo, rate }（くり返しで戻ったときに使う）

  sequence.forEach((i, s) => {
    const info = score.measures[i];
    const length = measureLength(score, i); // アウフタクトなら短い長さ（ステップ15-2）

    // くり返しで戻ったとき（前の小節のすぐ次ではないとき）：1回目にこの小節に来たときの速さに戻す（ステップ11-7a）
    if (s > 0 && i !== sequence[s - 1] + 1 && firstVisit.has(i)) {
      const saved = firstVisit.get(i);
      tempo = saved.tempo;
      rate = saved.rate;
      gradual = null;
    }

    // テンポ変更・a tempo：その小節のテンポ・元の速さに戻る（rit.・accel. の途中でも、そこで終わる）
    if (i > 0 && info.tempo !== undefined) tempo = info.tempo;
    if ((i > 0 && info.tempo !== undefined) || info.aTempo) {
      rate = 1;
      gradual = null;
    }

    // rit.・accel. の始まり：終わりの小節を探して、範囲の長さを数える
    if (info.gradual) {
      let to = i;
      while (to < score.measures.length - 1 && !score.measures[to].gradualEnd) to = to + 1;
      let rangeLength = 0;
      for (let k = i; k <= to; k++) rangeLength = rangeLength + measureLength(score, k); // アウフタクトなら短い長さ（ステップ15-2）
      const toRate = rate * (info.gradual === "rit" ? RIT_RATE : ACCEL_RATE);
      gradual = { startTick: tick, length: rangeLength, fromRate: rate, toRate: toRate, to: to };
    }

    // 1回目に来たときの速さを覚えておく（この小節のテンポ変更などを当てたあと）
    if (!firstVisit.has(i)) firstVisit.set(i, { tempo: tempo, rate: rate });

    // この小節を WARP_STEPS に分けて、分けた所ごとの倍率を決める（始める小節より前は、たどるだけ）
    if (s >= startMeasure) {
      const step = length / WARP_STEPS;
      for (let k = 0; k < WARP_STEPS; k++) {
        let nowRate = rate;
        if (gradual) {
          // 分けた所のまん中が、範囲のどのあたりか（0〜1）で、速さの割合を決める
          const middle = tick + step * (k + 0.5);
          const progress = (middle - gradual.startTick) / gradual.length;
          nowRate = gradual.fromRate + (gradual.toRate - gradual.fromRate) * progress;
        }
        const factor = score.tempo / (tempo * nowRate);
        segments.push({ from: raw, warpedFrom: warped, factor: factor });
        raw = raw + step;
        warped = warped + step * factor;
      }
    }

    tick = tick + length;

    // rit.・accel. の範囲の終わり：そのあとは、変わった速さのまま
    if (gradual && gradual.to === i) {
      rate = gradual.toRate;
      gradual = null;
    }
  });

  // ----------------------------------------------------------
  // 関数：segmentAt（makeTempoWarp の中だけで使う）
  // その時刻が入っている区切りを返す（最後の区切りより後ろは、最後の区切り）
  // ----------------------------------------------------------
  function segmentAt(tick, left) {
    let found = segments[0];
    for (const segment of segments) {
      if (segment.from < tick || (!left && segment.from === tick)) found = segment;
    }
    return found;
  }

  return {
    at: (tick) => {
      const segment = segmentAt(tick, false);
      return segment.warpedFrom + (tick - segment.from) * segment.factor;
    },
    factorAt: (tick, left = false) => segmentAt(tick, left).factor,
  };
}

// ----------------------------------------------------------
// 関数：buildEvents
// 楽譜データから、鳴らす音の一覧を作る
//   score        … 楽譜データ
//   startMeasure … 何小節目から鳴らすか（0 から数える）
//   mixer        … パートごとの音量の設定（くわしくは mixer.js）（ステップ12-3b）
//                  ミュート・ソロで鳴らさないパートは鳴らす音の一覧に入れず、鳴らすパートは音の強さに音量（0〜100%）をかける
//                  （ステップ12-4a2）緑にする音符の一覧には、鳴らすパートに加えて、ミュートしたパートも入れる
//                  （ミュート＝自分で弾くので音を消す、という使い方のため。ソロで外れたパートは入れない）
//                  フェルマータは、鳴らさないパートのものも数える（ほかのパートも、その間は待つ）
//   endMeasure   … 何小節目まで鳴らすか（0 から数える。この小節も鳴らす。省略したら最後の小節まで）（ステップ12-5a）
//                  区間リピートで、範囲の分だけ作るのに使う。範囲の外へのタイは、範囲の終わりで切る
//                  （ステップ11-7a：省略したときは、楽譜のくり返しをたどる。指定したときは、範囲をまっすぐ並べる）
// 戻り値：{ events: 鳴らす音の一覧（鳴り始める順）, totalTicks: 最後までの長さ（ティック）, highlights: 緑にする音符の一覧,
//          measureStarts: 小節ごとの始まりの時刻 }
//   highlights の1つ分：{ part, measure, note, startTick, endTick }（その音符が鳴っている間 = startTick 以上 endTick 未満）
//   （ステップ6-2：鳴っている音符を緑にするために追加。タイでつながった後ろの音符も、その音符の時間で1つずつ入れる）
//   measureStarts の1つ分：{ measure, startTick }（再生中に、今何小節目かを調べるのに使う。フェルマータのぶんもずらしてある）（ステップ12-3b）
//   clicks の1つ分：{ startTick, strong }（メトロノームのクリック。strong は1拍目なら true。フェルマータのぶんもずらしてある）（ステップ12-4a）
// ・休符は一覧に入れない（時間だけ進める）
// ・タイでつながった同じ高さの音は、1つの長い音にまとめる
// ・強弱・スラー・pizz.・松葉は1小節目から数えておく（途中から鳴らしても、それまでの状態を引き継ぐため）
// ・重音は、高さごとに鳴らす音を作って、同時に鳴らす（タイも高さごとにつなぐ）（ステップ14-1）
// ・アルペジオの重音は、下の音から ARPEGGIO_SECONDS 秒ずつずらして鳴らし始める（ステップ14-4a）
// ・アルペジオのない3音・4音の重音は、弦楽器の弾き方に近づける（下の2音を短く → 上の2音をのばす）（ステップ14-4a）
// ----------------------------------------------------------
export function buildEvents(score, startMeasure, mixer = {}, endMeasure = null) {
  // 鳴らす小節の順番（ステップ11-7a：くり返しをたどる。区間リピートのときは範囲をまっすぐ）
  const order = playOrder(score, startMeasure, endMeasure);
  // let：あとで、鳴らすパート・緑にするパートの分だけに入れ替えるため（ステップ12-4a2）
  let events = [];
  let highlights = []; // 緑にする音符の一覧（ステップ6-2）
  const fermatas = []; // フェルマータで止まる所の一覧 { at: 止まる時刻（ティック）, extra: のばす量（ティック） }（ステップ6-3b）

  // 再生を始める小節から最後の小節までの長さ（ティック）
  // （ステップ15-2：アウフタクトの小節は、アウフタクトの長さで数える）
  let totalTicks = 0;
  order.forEach((i) => {
    totalTicks = totalTicks + measureLength(score, i);
  });

  // 小節をたどる並び：始める小節より前（強弱などの状態を数えるだけ）＋ 鳴らす小節の順番（ステップ11-7a）
  const sequence = [];
  for (let i = 0; i < startMeasure; i++) sequence.push({ i: i, playing: false });
  order.forEach((i) => sequence.push({ i: i, playing: true }));

  // 鳴らすパートと、緑にするパートの番号（ステップ12-4a2）
  // 全パートを計算してから、最後にこの2つで分ける（フェルマータを全パートで数えるため）
  const audibleParts = new Set(); // 鳴らすパート
  const highlightParts = new Set(); // 緑にするパート（鳴らすパート＋ミュートしたパート）

  score.parts.forEach((part, p) => {
    // 鳴らすか・緑にするかを決めておく（ステップ12-4a2：ここで飛ばすのをやめた）
    const setting = mixerOf(mixer, part.id);
    const audible = isAudible(mixer, score.parts, part.id);
    if (audible) audibleParts.add(p);
    if (audible || setting.mute) highlightParts.add(p);
    // このパートの音量の割合（100 なら 1、80 なら 0.8）（ステップ12-3b）
    const volumeRate = setting.volume / 100;

    let dynamic = DEFAULT_DYNAMIC; // 今の強弱
    let tick = 0; // 再生を始めた所から何ティック目か（始める小節より前は数えない）
    // 前の音からタイでつながっているときの、その音（まとめる先）
    // （ステップ14-1：重音のため、1つの音から「高さの番号（MIDI）→ 鳴らす音」の表にした。つながっていなければ空の表）
    let tiedEvents = new Map();
    let inSlur = false; // 今スラーの中か（スラーの始まりの音から、終わりの音の1つ前まで true）
    let pizz = false; // 今ピチカートか（pizz. の付いた音から、arco の付いた音の1つ前まで true）
    let muted = false; // 今弱音器を付けているか（con sord. の付いた音から、senza sord. の付いた音の1つ前まで true）（ステップ11-2）
    const wedges = computeWedges(part); // 松葉の中の音の強さ（ステップ6-3d）
    const firstVisit = new Map(); // 小節の番号 → 1回目にその小節に来たときの状態（くり返しで戻ったときに使う）（ステップ11-7a）

    sequence.forEach(({ i, playing }, s) => {
      const measure = part.measures[i];

      // 鳴らし始める小節の頭と、くり返しで戻った所（前の小節のすぐ次ではない所）では、タイを切る（頭の音を鳴らし直す）
      const jumped = s > 0 && i !== sequence[s - 1].i + 1;
      if (playing && (s === startMeasure || jumped)) tiedEvents = new Map();

      // くり返しで戻ったときは、強弱・スラー・pizz.・弱音器を、1回目にこの小節に来たときの状態に戻す（ステップ11-7a）
      if (jumped && firstVisit.has(i)) {
        const saved = firstVisit.get(i);
        dynamic = saved.dynamic;
        inSlur = saved.inSlur;
        pizz = saved.pizz;
        muted = saved.muted;
      }
      if (!firstVisit.has(i)) firstVisit.set(i, { dynamic: dynamic, inSlur: inSlur, pizz: pizz, muted: muted });

      measure.notes.forEach((note, j) => {
        const length = noteTicks(note);

        // 休符：時間だけ進める。タイのつながりも切る
        if (note.rest) {
          if (playing) tick = tick + length;
          tiedEvents = new Map();
          return;
        }

        // 強弱を決める（鳴らさない小節でも、強弱の変化だけは数えておく）
        const result = applyDynamic(note.dynamic, dynamic);
        dynamic = result.next;

        // 松葉の中の音なら、松葉で決めた強さにする。松葉の終わりなら、そのあとの強弱も変える（ステップ6-3d）
        let baseVelocity = result.velocity;
        const wedge = wedges.get(`${i}-${j}`);
        if (wedge) {
          baseVelocity = wedge.velocity;
          if (wedge.after) dynamic = wedge.after;
        }

        // スラーの状態を進める（鳴らさない小節でも数えておく）
        //   始まりの音 → ここから次の音とつなげる
        //   終わりの音 → この音でスラーが終わるので、次の音とはつなげない
        if (note.slur === "start") inSlur = true;
        const legato = inSlur && note.slur !== "stop";
        if (note.slur === "stop") inSlur = false;

        // ピチカートかどうかを進める（鳴らさない小節でも数えておく）
        pizz = nextPizz(note, pizz);

        // 弱音器を付けているかを進める（鳴らさない小節でも数えておく）（ステップ11-2）
        muted = nextMute(note, muted);

        if (!playing) return;

        // 左手ピチカート・バルトーク・ピチカートの音は、その音だけピチカートで鳴らす（ステップ11-1b）
        const stringMarks = note.stringMarks ?? [];
        const plucked = pizz || stringMarks.includes("lhpizz") || stringMarks.includes("snappizz");

        // 音を出す長さ（ティック）：楽譜の長さ × 割合
        // ピチカートは、はじいた音が自然に消えていくので、長さの記号（スタッカート・スラーなど）は効かせない
        let gate = plucked ? GATE_NORMAL : noteGate(note, legato);
        // ブレス・カエスーラの付いた音は、スタッカートなどでもっと短くなっていなければ 7割で切る（ピチカートは除く）（ステップ11-1c）
        if (note.breath && !plucked) gate = Math.min(gate, GATE_BREATH);
        // グリッサンドの付いた音：次の音の高さへすべらせて、切れ目なしでつなげる（ステップ11-5b）
        // （ピチカートの音・トリルやトレモロも付いている音は、すべらせない）
        // （重音の音も、すべらせない）（ステップ14-1）
        const glissTo = note.glissando && !note.tie && !plucked && !note.ornament && !note.tremolo && !note.chord ? glissandoTarget(part, i, j) : null;
        if (glissTo) gate = 1;
        const soundLength = length * gate;
        // いっぱいに鳴らす音（スラーの中・テヌート）は、次の音となめらかにつなげる
        const connected = gate >= 1;

        // アクセント・マルカートが付いていたら、強くする（127 をこえないようにする）（マルカートはステップ11-1a）
        const articulations = note.articulations ?? [];
        let boost = 0;
        if (articulations.includes("accent")) boost = ACCENT_BOOST;
        if (articulations.includes("marcato")) boost = MARCATO_BOOST;
        // バルトーク・ピチカートは強くはじくので、アクセントと同じだけ強くする（ステップ11-1b）
        if (stringMarks.includes("snappizz")) boost = Math.max(boost, ACCENT_BOOST);
        let velocity = Math.min(127, baseVelocity + boost);
        // 弱音器を付けている間は、少し小さくする（ステップ11-2）
        if (muted) velocity = Math.round(velocity * MUTE_RATE);
        // 「再生」タブの音量をかける（ステップ12-3b）
        velocity = Math.round(velocity * volumeRate);
        // ハーモニクス（ひし形の玉のある音符）は、少し小さく鳴らす（ステップ14-5a）
        if (hasDiamond(note)) velocity = Math.round(velocity * HARMONIC_RATE);

        // 高さごとに、鳴らす音を作る（重音でなければ1つだけ）（ステップ14-1）
        // nowEvents … この音符の高さごとの鳴らす音（次の音がタイでつながってきたときに、まとめる先になる）
        const nowEvents = new Map();
        const pitches = soundingPitches(note, part.instrument); // ハーモニクスなら、聞こえる音（ステップ14-5a）
        // 弦楽器の弾き方で鳴らすか：アルペジオがなく、3音以上の重音で、はじく音・トレモロでないとき（ステップ14-4a）
        const broken = !note.arpeggio && pitches.length >= 3 && !plucked && !note.tremolo;
        // 2音トレモロ：下の音の鳴らす音1つだけを作り、上の音は alternatePitch に入れて交互に鳴らす（ステップ14-6a）
        // （2音トレモロにはタイを付けない決まりなので、タイの続きにはならない）
        const alternate = isAlternate(note);
        pitches.forEach((pitch, k) => {
          if (alternate && k > 0) return; // 上の音は、下の音の鳴らす音の中で鳴らす
          const midi = pitchToMidi(pitch);
          const tiedEvent = tiedEvents.get(midi); // 前の音から、同じ高さでタイがつながっているか
          if (tiedEvent) {
            // 前の音とタイでつながっている：前の音を長くするだけ（鳴らし直さない）
            // 音を出す長さは「前の音の楽譜の長さいっぱい ＋ この音の音を出す長さ」
            tiedEvent.soundTicks = tiedEvent.ticks + soundLength;
            tiedEvent.ticks = tiedEvent.ticks + length;
            tiedEvent.connected = connected; // つなげるかどうかは、タイの最後の音で決める
            tiedEvent.fermataEnd = !!note.fermata; // 最後の音にフェルマータがあるか
            tiedEvent.glissTo = glissTo; // タイの最後の音にグリッサンドがあれば、その音の後半ですべる（ステップ11-5b）
            tiedEvent.glissLastTicks = length;
            nowEvents.set(midi, tiedEvent);
          } else {
            // 新しく鳴らす音
            const event = {
              part: p,
              measure: i,
              note: j,
              instrument: part.instrument,
              pitch: pitch, // この高さ（重音なら、高さごとに1つずつ作る）（ステップ14-1）
              startTick: tick,
              ticks: length,
              soundTicks: soundLength,
              connected: connected,
              pizz: plucked, // ピチカートで鳴らすか（ステップ6-3c。左手・バルトーク・ピチカートはステップ11-1b）
              velocity: velocity,
              fermataEnd: !!note.fermata, // この音の終わりにフェルマータがあるか（ステップ6-3b）
              ornament: note.ornament ?? null, // 装飾（トリルなど）の名前（ステップ11-3a）
              upper: note.ornament ? neighborPitch(score, part, i, j, 1) : null, // 装飾で行き来する1つ上の音（ステップ11-3a）
              lower: note.ornament ? neighborPitch(score, part, i, j, -1) : null, // 装飾で行き来する1つ下の音（ステップ11-3b）
              tremoloStep: note.tremolo ? tremoloStep(note) : null, // トレモロで刻む1回分の長さ（ステップ11-4）
              alternatePitch: alternate ? pitches[1] : null, // 2音トレモロで、交互に鳴らす上の音（ステップ14-6a）
              glissTo: glissTo, // グリッサンドですべって行く先の高さ（すべらないときは null）（ステップ11-5b）
              glissLastTicks: length, // グリッサンドの音の楽譜の長さ（この後半ですべる）（ステップ11-5b）
              rollIndex: note.arpeggio && note.chord ? k : 0, // アルペジオで、何音分ずらして鳴らし始めるか（あとで秒に合わせてずらす）（ステップ14-4a）
            };
            // 3音・4音の重音：下の2音を短く → 上の2音をのばす（ステップ14-4a）
            const role = broken ? brokenRole(k, pitches.length) : "full";
            const brokenTicks = Math.min(BROKEN_CHORD_TICKS, length / 2); // 下の2音を鳴らす長さ（短い音符なら、その半分まで）
            if (role === "short") {
              // 頭で短く鳴らすだけ（のばさないので、フェルマータでものびない。タイでもつながない）
              event.ticks = brokenTicks;
              event.soundTicks = Math.min(soundLength, brokenTicks);
              event.connected = false;
              event.fermataEnd = false;
            } else if (role === "late") {
              // 少し遅れて鳴らし始める（終わりは同じ）
              event.startTick = event.startTick + brokenTicks;
              event.ticks = event.ticks - brokenTicks;
              event.soundTicks = Math.max(soundLength - brokenTicks, 1);
            }
            // 前打音：主音の頭の一部を借りて、先に前打音を鳴らす（ステップ11-8a）
            //   短前打音 … 32分音符の長さ（主音が短いときは、主音の半分まで）
            //   長前打音 … 主音の半分（付点の音符なら3分の2）
            if (note.grace && k === 0) {
              const graceTicks = graceLength(note, length);
              events.push({
                ...event,
                pitch: note.grace.pitch,
                ticks: graceTicks,
                soundTicks: graceTicks,
                connected: true, // 主音とつなげて鳴らす
                fermataEnd: false,
                ornament: null, // 装飾・トレモロ・グリッサンドは主音のほうだけ
                upper: null,
                lower: null,
                tremoloStep: null,
                alternatePitch: null,
                glissTo: null,
              });
              // 主音は、借りたぶんだけ遅く始めて、短くする
              event.startTick = event.startTick + graceTicks;
              event.ticks = event.ticks - graceTicks;
              event.soundTicks = Math.max(event.soundTicks - graceTicks, 1);
              event.glissLastTicks = event.glissLastTicks - graceTicks;
            }
            events.push(event);
            if (role !== "short") nowEvents.set(midi, event); // 短く鳴らす音は、次の音とタイでつながない
          }
        });

        // 緑にする音符の一覧に入れる（タイの後ろの音符も、その音符の時間だけ緑にする）
        highlights.push({ part: p, measure: i, note: j, startTick: tick, endTick: tick + length, fermataEnd: !!note.fermata });

        // フェルマータ：この音符が終わる所で止まり、この音符の長さぶん（2倍になるように）のばす
        if (note.fermata) {
          fermatas.push({ at: tick + length, extra: length * (FERMATA_RATE - 1) });
        }

        // カエスーラ：この音符が終わる所で、4分音符1つ分の間をあける（ステップ11-1c）
        // フェルマータと同じ仕組みで時間をずらす。この音ののばす印（fermataEnd）は付けないので、音はのびずに無音の間になる
        if (note.breath === "caesura") {
          fermatas.push({ at: tick + length, extra: CAESURA_PAUSE });
        }

        // この音にタイが付いていれば、次の音のために高さごとの鳴らす音を覚えておく。付いていなければ、つながりはここで終わり
        tiedEvents = note.tie ? nowEvents : new Map();

        tick = tick + length;
      });
    });
  });

  // 鳴らすパートの音だけを残し、緑にするパートの音符だけを残す（ステップ12-4a2）
  // （フェルマータ（fermatas）は全パートのものをそのまま使う）
  events = events.filter((event) => audibleParts.has(event.part));
  highlights = highlights.filter((h) => highlightParts.has(h.part));

  // テンポの変化のぶん、ティックの数を伸び縮みさせる（ステップ11-6a）
  // （フェルマータでずらす前に行う。フェルマータでのばす量も、その所のテンポに合わせる）
  const warp = makeTempoWarp(score, startMeasure, order);
  events.forEach((event) => {
    const start = event.startTick;
    const end = start + event.ticks;
    const soundEnd = start + event.soundTicks;
    event.startTick = warp.at(start);
    event.ticks = warp.at(end) - event.startTick;
    event.soundTicks = warp.at(soundEnd) - event.startTick;
    if (event.tremoloStep) event.tremoloStep = event.tremoloStep * warp.factorAt(start); // トレモロの刻む細かさ
    event.tempoFactor = warp.factorAt(start); // トリルなどの細かさに使う倍率（ステップ11-6b）
    if (event.glissTo) event.glissLastTicks = event.glissLastTicks * warp.factorAt(end, true); // グリッサンドのすべる長さ
  });
  highlights.forEach((h) => {
    h.startTick = warp.at(h.startTick);
    h.endTick = warp.at(h.endTick);
  });
  fermatas.forEach((f) => {
    f.extra = f.extra * warp.factorAt(f.at, true); // のばす量（フェルマータの音のテンポで）
    f.at = warp.at(f.at);
  });
  totalTicks = warp.at(totalTicks);

  // フェルマータのぶん、時間をずらす（ステップ6-3b）
  const points = mergeFermatas(fermatas);
  events.forEach((event) => {
    const start = event.startTick;
    const end = start + event.ticks;
    const newStart = start + shiftBefore(points, start, true);
    const newEnd = end + shiftBefore(points, end, event.fermataEnd);
    // のびたぶん（またいでいる音・フェルマータの音）だけ、音を出す長さも足す
    event.soundTicks = event.soundTicks + (newEnd - newStart - event.ticks);
    event.startTick = newStart;
    event.ticks = newEnd - newStart;
  });
  highlights.forEach((h) => {
    const newStart = h.startTick + shiftBefore(points, h.startTick, true);
    const newEnd = h.endTick + shiftBefore(points, h.endTick, h.fermataEnd);
    h.startTick = newStart;
    h.endTick = newEnd;
  });
  points.forEach((point) => {
    totalTicks = totalTicks + point.extra; // 曲の終わりも、のばしたぶんだけ後ろになる
  });

  // アルペジオ：下の音から順に、決まった時間ずつずらして鳴らし始める（終わりは同じ）（ステップ14-4a）
  // テンポの伸び縮み・フェルマータのあとに行う（ここでのティックは「1小節目のテンポ」の秒に合っているので、決まった秒にできる）
  // ずらしすぎないように、その音の長さの半分までにする
  const rollTicks = ARPEGGIO_SECONDS / secondsPerTick(score.tempo);
  events.forEach((event) => {
    if (!event.rollIndex) return;
    const shift = Math.min(event.rollIndex * rollTicks, event.ticks / 2);
    event.startTick = event.startTick + shift;
    event.ticks = event.ticks - shift;
    event.soundTicks = Math.max(event.soundTicks - shift, 1);
  });

  // 小節ごとの始まりの時刻（フェルマータのぶんもずらす）（ステップ12-3b）
  // メトロノームのクリックの時刻も、ここでいっしょに作る（ステップ12-4a）
  const measureStarts = [];
  const clicks = [];
  let measureTick = 0; // 再生を始めた所から何ティック目か（ずらす前）
  order.forEach((i) => {
    // テンポの変化のぶん伸び縮みさせてから、フェルマータのぶんずらす（ステップ11-6a）
    const measureStart = warp.at(measureTick);
    measureStarts.push({ measure: i, startTick: measureStart + shiftBefore(points, measureStart, true) });
    // この小節の拍の頭ごとにクリックを1つ（1拍目は strong）
    // （ステップ15-2：アウフタクトの小節では、拍子どおりの拍の位置で鳴らす（拍の線と同じ考え方））
    //   offset … 小節の頭が、拍子どおりの1小節の中のどこにあたるか（アウフタクトでなければ 0）
    //   例：4/4・1拍のアウフタクト → offset は3拍分。小節の頭（4拍目）に弱いクリックが1つ。1拍目の強いクリックはない
    const time = timeAt(score, i);
    const beat = beatTicks(time); // 1拍の長さ
    const full = measureTicks(time); // 拍子どおりの1小節の長さ
    const length = measureLength(score, i); // この小節の長さ（アウフタクトなら短い）
    const offset = measureOffset(score, i);
    const first = (beat - (offset % beat)) % beat; // 小節の頭から、最初の拍の頭までの長さ
    for (let b = first; b < length; b = b + beat) {
      const t = warp.at(measureTick + b);
      clicks.push({ startTick: t + shiftBefore(points, t, true), strong: (b + offset) % full === 0 });
    }
    measureTick = measureTick + length;
  });

  // 装飾・トレモロの付いた音を、短い音に分ける（フェルマータでのびたあとの長さで分ける）（ステップ11-3a・11-3b・11-4）
  const played = [];
  events.forEach((event) => {
    if (event.ornament || event.tremoloStep) {
      played.push(...ornamentPieces(event));
    } else {
      played.push(event);
    }
  });

  // 鳴り始める順に並べる（同じ時間なら上のパートから）
  played.sort((a, b) => a.startTick - b.startTick || a.part - b.part);

  return { events: played, totalTicks: totalTicks, highlights: highlights, measureStarts: measureStarts, clicks: clicks };
}

// ----------------------------------------------------------
// 関数：beatTicks
// メトロノームの1拍の長さ（ティック）を、拍子から決める（ステップ12-4a）
//   time … 拍子 { beats, beatType }
//   ・ふつうは、拍子の下の数字の音符1つ分（4/4 → 4分音符、2/2 → 2分音符、3/8 → 8分音符）
//   ・6/8・9/8・12/8 のように、下が 8 で上が 6 以上の 3 の倍数のときは、付点4分音符1つ分
//     （6/8 は「8分音符3つ」を1拍として2拍で数えるため）
// （ステップ12-7：拍の線でも使うので、ほかのファイルから使えるようにした（export））
// ----------------------------------------------------------
export function beatTicks(time) {
  const unit = (16 * TICKS_PER_16TH) / time.beatType; // 拍子の下の数字の音符1つ分
  if (time.beatType === 8 && time.beats >= 6 && time.beats % 3 === 0) {
    return unit * 3; // 付点4分音符1つ分
  }
  return unit;
}

// ----------------------------------------------------------
// 関数：addCountIn
// buildEvents の結果の前に、カウントイン（1小節ぶんのクリックだけの前打ち）を足す（ステップ12-4b）
//   result       … buildEvents の結果
//   score        … 楽譜データ
//   startMeasure … 再生を始める小節（この小節の拍子で1小節ぶん数える）
// （ステップ15-2：アウフタクトから再生するとき）
//   1小節ぶん数えてから、アウフタクトが始まる拍まで続けて数える（＝ 1小節 ＋ offset の長さ）
//   例：4/4・1拍のアウフタクト → 「1 2 3 4 | 1 2 3」と数えて、4拍目からアウフタクトが鳴る
// 戻り値：result と同じ形で、次のように変えたもの
//   ・楽器の音・緑の音符・小節の始まり・メトロノームのクリックの時刻を、カウントインの長さだけ後ろにずらす
//   ・最後までの長さ（totalTicks）も、カウントインの長さだけ長くする
//   ・countInClicks（カウントインのクリックの一覧）を足す
//     （メトロノームが切でもカウントインは鳴らすので、clicks とは分けておく）
// ----------------------------------------------------------
export function addCountIn(result, score, startMeasure) {
  const time = timeAt(score, startMeasure);
  // 始める小節のテンポに合わせて、伸び縮みさせる（ステップ11-6a）
  // （拍を数えるのは伸び縮みさせる前の数で行い、クリックの時刻だけ倍にする。小数の足し算の誤差で、拍が1つ増えないようにするため）
  const factor = makeTempoWarp(score, startMeasure, [startMeasure]).factorAt(0);
  const full = measureTicks(time); // 拍子どおりの1小節の長さ
  // 数える長さ（伸び縮みさせる前）：1小節 ＋ アウフタクトが始まる位置まで（アウフタクトでなければ 1小節だけ）（ステップ15-2）
  const countTicks = full + measureOffset(score, startMeasure);
  const length = countTicks * factor; // カウントインの長さ
  const beat = beatTicks(time); // 1拍の長さ（伸び縮みさせる前）

  // カウントインのクリック（小節の頭の拍は strong）
  const countInClicks = [];
  for (let b = 0; b < countTicks; b = b + beat) {
    countInClicks.push({ startTick: b * factor, strong: b % full === 0 });
  }

  // 時刻を1小節ぶん後ろにずらした、新しいものを作る（もとの result は変えない）
  return {
    events: result.events.map((event) => ({ ...event, startTick: event.startTick + length })),
    totalTicks: result.totalTicks + length,
    highlights: result.highlights.map((h) => ({ ...h, startTick: h.startTick + length, endTick: h.endTick + length })),
    measureStarts: result.measureStarts.map((m) => ({ ...m, startTick: m.startTick + length })),
    clicks: result.clicks.map((click) => ({ ...click, startTick: click.startTick + length })),
    countInClicks: countInClicks,
  };
}

// ----------------------------------------------------------
// 関数：mergeFermatas
// フェルマータで止まる所の一覧を、時刻の順に並べて、同じ時刻のものを1つにまとめる（ステップ6-3b）
// 同じ時刻に複数のパートでフェルマータがあるときは、のばす量の一番大きいものにする
// （全パートにフェルマータがあっても、待つのは1回だけにするため）
//   fermatas … [{ at, extra }, ...]
// 戻り値：時刻の順に並んだ [{ at, extra }, ...]
// ----------------------------------------------------------
function mergeFermatas(fermatas) {
  const byTime = new Map(); // 時刻 → のばす量
  fermatas.forEach((f) => {
    const before = byTime.get(f.at) ?? 0;
    byTime.set(f.at, Math.max(before, f.extra));
  });
  return [...byTime.entries()].map(([at, extra]) => ({ at: at, extra: extra })).sort((a, b) => a.at - b.at);
}

// ----------------------------------------------------------
// 関数：shiftBefore
// ある時刻より前にあるフェルマータで、どれだけ後ろにずれるかを合計する（ステップ6-3b）
//   points    … mergeFermatas で作った一覧
//   tick      … 調べる時刻（ティック）
//   inclusive … ちょうど同じ時刻のフェルマータも数えるか
//               ・音の始まり：数える（フェルマータで待ったあとに始まるので）
//               ・音の終わり：その音自身にフェルマータがあるときだけ数える
//                 （同じ時刻に終わるだけの、ほかの音はのばさない）
// 戻り値：ずれる量（ティック）
// ----------------------------------------------------------
function shiftBefore(points, tick, inclusive) {
  let shift = 0;
  points.forEach((point) => {
    if (point.at < tick || (inclusive && point.at === tick)) {
      shift = shift + point.extra;
    }
  });
  return shift;
}

// ----------------------------------------------------------
// 関数：secondsPerTick
// 1ティックが何秒かを計算する
// テンポは「♩ = ○○」なので、4分音符1つ = 60 ÷ テンポ 秒、16分音符はその 1/4、
// 1ティックは 16分音符のさらに 1/TICKS_PER_16TH（ステップ10-1）
// 例：♩ = 120 → 4分音符 0.5秒 → 16分音符 0.125秒 → 1ティック 0.125 ÷ 27720 秒
// ----------------------------------------------------------
export function secondsPerTick(tempo) {
  return 60 / tempo / 4 / TICKS_PER_16TH;
}
