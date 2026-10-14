// ==========================================================
// playback.js
// 楽譜データを「鳴らす音の一覧」に直すファイル（ステップ6-1）
// 音を実際に鳴らすのは audio/sound.js の仕事。ここでは計算だけをする
//
// 【鳴らす音の一覧の1つ分】
// {
//   part: 0,                  // 何パート目か
//   measure: 2,               // 何小節目か（鳴り始める音のある小節）
//   note: 1,                  // 小節の中の何番目の音か
//   instrument: "violin",     // 楽器（音を選ぶのに使う）
//   pitch: { step, alter, octave }, // 音の高さ
//   startTick: 24,            // 再生を始めた所から何ティック目に鳴り始めるか（16分音符 = 1）
//   ticks: 4,                 // 鳴らす長さ（ティック。タイでつながった音は合計した長さ）
//   velocity: 80              // 音の強さ（0〜127。強弱記号から決める）
// }
// ==========================================================

import { measureTicks, noteTicks, timeAt } from "./model.js";

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
// 関数：buildEvents
// 楽譜データから、鳴らす音の一覧を作る
//   score        … 楽譜データ
//   startMeasure … 何小節目から鳴らすか（0 から数える）
//   partIndex    … どのパートを鳴らすか（"all" なら全パート、数字ならそのパートだけ）
// 戻り値：{ events: 鳴らす音の一覧（鳴り始める順）, totalTicks: 最後までの長さ（ティック） }
// ・休符は一覧に入れない（時間だけ進める）
// ・タイでつながった同じ高さの音は、1つの長い音にまとめる
// ・強弱は1小節目から数えておく（途中から鳴らしても、それまでの強弱を引き継ぐため）
// ----------------------------------------------------------
export function buildEvents(score, startMeasure, partIndex) {
  const events = [];

  // 再生を始める小節から最後の小節までの長さ（ティック）
  let totalTicks = 0;
  for (let i = startMeasure; i < score.measures.length; i++) {
    totalTicks = totalTicks + measureTicks(timeAt(score, i));
  }

  score.parts.forEach((part, p) => {
    // 鳴らさないパートは飛ばす
    if (partIndex !== "all" && partIndex !== p) return;

    let dynamic = DEFAULT_DYNAMIC; // 今の強弱
    let tick = 0; // 再生を始めた所から何ティック目か（始める小節より前は数えない）
    let tiedEvent = null; // 前の音からタイでつながっているときの、その音（まとめる先）

    part.measures.forEach((measure, i) => {
      const playing = i >= startMeasure; // この小節は鳴らすか

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

        if (!playing) return;

        if (tiedEvent && pitchToMidi(tiedEvent.pitch) === pitchToMidi(note.pitch)) {
          // 前の音とタイでつながっている：前の音を長くするだけ（鳴らし直さない）
          tiedEvent.ticks = tiedEvent.ticks + length;
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
            velocity: result.velocity,
          };
          events.push(event);
          tiedEvent = event;
        }

        // この音にタイが付いていなければ、つながりはここで終わり
        if (!note.tie) tiedEvent = null;

        tick = tick + length;
      });
    });
  });

  // 鳴り始める順に並べる（同じ時間なら上のパートから）
  events.sort((a, b) => a.startTick - b.startTick || a.part - b.part);

  return { events: events, totalTicks: totalTicks };
}

// ----------------------------------------------------------
// 関数：secondsPerTick
// 1ティック（16分音符1つ）が何秒かを計算する
// テンポは「♩ = ○○」なので、4分音符1つ = 60 ÷ テンポ 秒、16分音符はその 1/4
// 例：♩ = 120 → 4分音符 0.5秒 → 1ティック 0.125秒
// ----------------------------------------------------------
export function secondsPerTick(tempo) {
  return 60 / tempo / 4;
}
