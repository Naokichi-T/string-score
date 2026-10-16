// ==========================================================
// playback.js
// 楽譜データを「鳴らす音の一覧」に直すファイル（ステップ6-1）
// 音を実際に鳴らすのは audio/sound.js の仕事。ここでは計算だけをする
// （ステップ6-3a：スタッカート・テヌート・アクセント・スラーを、音の長さと強さに反映する）
// （ステップ6-3b：フェルマータ。その音を2倍にのばし、ほかのパートもその間は待つ）
// （ステップ6-3c：pizz.／arco。pizz. から arco までの音に印を付ける（ピチカートの音で鳴らすため））
// （ステップ6-3d：松葉（＜ ＞）。始まりから終わりまで、だんだん強く・弱くする）
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

import { measureTicks, noteTicks, timeAt, keyAt, TICKS_PER_16TH } from "./model.js";
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
const FLAG_COUNT = { whole: 0, half: 0, quarter: 0, eighth: 1, "16th": 2 };

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
  if (event.tremoloStep) {
    // トレモロ：同じ音を、決まった細かさで刻む（ステップ11-4）
    const count = Math.max(1, Math.round(total / event.tremoloStep)); // 刻む回数
    for (let k = 0; k < count; k++) {
      const isLast = k === count - 1;
      parts.push({ pitch: event.pitch, length: isLast ? total - k * event.tremoloStep : event.tremoloStep });
    }
  } else if (event.ornament === "trill") {
    const count = Math.max(1, Math.floor(total / TRILL_STEP)); // かけらの数
    for (let k = 0; k < count; k++) {
      const isLast = k === count - 1;
      // 最後から数えて偶数番目（最後・最後から3つ目…）が主の音
      const isMain = (count - 1 - k) % 2 === 0;
      // 最後のかけらは、残りの長さを全部鳴らす
      parts.push({ pitch: isMain ? event.pitch : event.upper, length: isLast ? total - k * TRILL_STEP : TRILL_STEP });
    }
  } else {
    const quick = ornamentPitches(event);
    // 1つ分の長さ：32分音符。入りきらないときは「すばやい音＋最後の主の音」で等分する
    const step = Math.min(TRILL_STEP, total / (quick.length + 1));
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

    // 終わりの音（"stop" の印のある音符）を先まで探す
    let endK = -1;
    for (let m = k + 1; m < list.length; m++) {
      if (!list[m].note.rest && list[m].note.wedge === "stop") {
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
// 戻り値：{ events: 鳴らす音の一覧（鳴り始める順）, totalTicks: 最後までの長さ（ティック）, highlights: 緑にする音符の一覧,
//          measureStarts: 小節ごとの始まりの時刻 }
//   highlights の1つ分：{ part, measure, note, startTick, endTick }（その音符が鳴っている間 = startTick 以上 endTick 未満）
//   （ステップ6-2：鳴っている音符を緑にするために追加。タイでつながった後ろの音符も、その音符の時間で1つずつ入れる）
//   measureStarts の1つ分：{ measure, startTick }（再生中に、今何小節目かを調べるのに使う。フェルマータのぶんもずらしてある）（ステップ12-3b）
//   clicks の1つ分：{ startTick, strong }（メトロノームのクリック。strong は1拍目なら true。フェルマータのぶんもずらしてある）（ステップ12-4a）
// ・休符は一覧に入れない（時間だけ進める）
// ・タイでつながった同じ高さの音は、1つの長い音にまとめる
// ・強弱・スラー・pizz.・松葉は1小節目から数えておく（途中から鳴らしても、それまでの状態を引き継ぐため）
// ----------------------------------------------------------
export function buildEvents(score, startMeasure, mixer = {}, endMeasure = null) {
  // 鳴らす最後の小節（省略したら楽譜の最後の小節）（ステップ12-5a）
  const lastMeasure = endMeasure ?? score.measures.length - 1;
  // let：あとで、鳴らすパート・緑にするパートの分だけに入れ替えるため（ステップ12-4a2）
  let events = [];
  let highlights = []; // 緑にする音符の一覧（ステップ6-2）
  const fermatas = []; // フェルマータで止まる所の一覧 { at: 止まる時刻（ティック）, extra: のばす量（ティック） }（ステップ6-3b）

  // 再生を始める小節から最後の小節までの長さ（ティック）
  let totalTicks = 0;
  for (let i = startMeasure; i <= lastMeasure; i++) {
    totalTicks = totalTicks + measureTicks(timeAt(score, i));
  }

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
    let tiedEvent = null; // 前の音からタイでつながっているときの、その音（まとめる先）
    let inSlur = false; // 今スラーの中か（スラーの始まりの音から、終わりの音の1つ前まで true）
    let pizz = false; // 今ピチカートか（pizz. の付いた音から、arco の付いた音の1つ前まで true）
    let muted = false; // 今弱音器を付けているか（con sord. の付いた音から、senza sord. の付いた音の1つ前まで true）（ステップ11-2）
    const wedges = computeWedges(part); // 松葉の中の音の強さ（ステップ6-3d）

    part.measures.forEach((measure, i) => {
      const playing = i >= startMeasure && i <= lastMeasure; // この小節は鳴らすか（ステップ12-5a：終わりの小節より後ろも鳴らさない）

      // 始める小節の頭では、前の小節からのタイは切る（頭の音を鳴らし直す）
      if (i === startMeasure) tiedEvent = null;

      measure.notes.forEach((note, j) => {
        const length = noteTicks(note);

        // 休符：時間だけ進める。タイのつながりも切る
        if (note.rest) {
          if (playing) tick = tick + length;
          tiedEvent = null;
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

        if (tiedEvent && pitchToMidi(tiedEvent.pitch) === pitchToMidi(note.pitch)) {
          // 前の音とタイでつながっている：前の音を長くするだけ（鳴らし直さない）
          // 音を出す長さは「前の音の楽譜の長さいっぱい ＋ この音の音を出す長さ」
          tiedEvent.soundTicks = tiedEvent.ticks + soundLength;
          tiedEvent.ticks = tiedEvent.ticks + length;
          tiedEvent.connected = connected; // つなげるかどうかは、タイの最後の音で決める
          tiedEvent.fermataEnd = !!note.fermata; // 最後の音にフェルマータがあるか
        } else {
          // 新しく鳴らす音
          const event = {
            part: p,
            measure: i,
            note: j,
            instrument: part.instrument,
            pitch: note.pitch,
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
          };
          events.push(event);
          tiedEvent = event;
        }

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

        // この音にタイが付いていなければ、つながりはここで終わり
        if (!note.tie) tiedEvent = null;

        tick = tick + length;
      });
    });
  });

  // 鳴らすパートの音だけを残し、緑にするパートの音符だけを残す（ステップ12-4a2）
  // （フェルマータ（fermatas）は全パートのものをそのまま使う）
  events = events.filter((event) => audibleParts.has(event.part));
  highlights = highlights.filter((h) => highlightParts.has(h.part));

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

  // 小節ごとの始まりの時刻（フェルマータのぶんもずらす）（ステップ12-3b）
  // メトロノームのクリックの時刻も、ここでいっしょに作る（ステップ12-4a）
  const measureStarts = [];
  const clicks = [];
  let measureTick = 0; // 再生を始めた所から何ティック目か（ずらす前）
  for (let i = startMeasure; i <= lastMeasure; i++) {
    measureStarts.push({ measure: i, startTick: measureTick + shiftBefore(points, measureTick, true) });
    // この小節の拍の頭ごとにクリックを1つ（1拍目は strong）
    const time = timeAt(score, i);
    const beat = beatTicks(time); // 1拍の長さ
    for (let b = 0; b < measureTicks(time); b = b + beat) {
      const t = measureTick + b;
      clicks.push({ startTick: t + shiftBefore(points, t, true), strong: b === 0 });
    }
    measureTick = measureTick + measureTicks(time);
  }

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
// 戻り値：result と同じ形で、次のように変えたもの
//   ・楽器の音・緑の音符・小節の始まり・メトロノームのクリックの時刻を、1小節ぶん後ろにずらす
//   ・最後までの長さ（totalTicks）も、1小節ぶん長くする
//   ・countInClicks（カウントインのクリックの一覧）を足す
//     （メトロノームが切でもカウントインは鳴らすので、clicks とは分けておく）
// ----------------------------------------------------------
export function addCountIn(result, score, startMeasure) {
  const time = timeAt(score, startMeasure);
  const length = measureTicks(time); // カウントインの長さ（1小節ぶん）
  const beat = beatTicks(time); // 1拍の長さ

  // カウントインのクリック（1拍目は strong）
  const countInClicks = [];
  for (let b = 0; b < length; b = b + beat) {
    countInClicks.push({ startTick: b, strong: b === 0 });
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
