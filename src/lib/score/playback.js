// ==========================================================
// playback.js
// 楽譜データを「鳴らす音の一覧」に直すファイル（ステップ6-1）
// 音を実際に鳴らすのは audio/sound.js の仕事。ここでは計算だけをする
// （ステップ6-3a：スタッカート・テヌート・アクセント・スラーを、音の長さと強さに反映する）
// （ステップ6-3b：フェルマータ。その音を2倍にのばし、ほかのパートもその間は待つ）
//
// 【鳴らす音の一覧の1つ分】
// {
//   part: 0,                  // 何パート目か
//   measure: 2,               // 何小節目か（鳴り始める音のある小節）
//   note: 1,                  // 小節の中の何番目の音か
//   instrument: "violin",     // 楽器（音を選ぶのに使う）
//   pitch: { step, alter, octave }, // 音の高さ
//   startTick: 24,            // 再生を始めた所から何ティック目に鳴り始めるか（16分音符 = 1）
//   ticks: 4,                 // 楽譜の上の長さ（ティック。タイでつながった音は合計した長さ）
//   soundTicks: 3.8,          // 実際に音を出す長さ（ティック。スタッカートなら短く、スラーならいっぱい）
//   connected: false,         // 次の音となめらかにつなげるか（スラーの中・テヌートなら true）
//   velocity: 80              // 音の強さ（0〜127。強弱記号とアクセントから決める）
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
// 音を出す長さの割合（楽譜の長さに対して、どれだけ鳴らすか）（ステップ6-3a）
// 音と音の間の時間は変えずに、鳴らす長さだけを変える
// ----------------------------------------------------------
const GATE_NORMAL = 0.95; // ふつう：少しだけ短くして、音と音の間に切れ目を作る
const GATE_STACCATO = 0.5; // スタッカート：半分で切る
const GATE_TENUTO = 1.0; // テヌート：いっぱいに鳴らす
const GATE_SLUR = 1.0; // スラーの中：切れ目なしでつなげる

// アクセントで強くする量（0〜127 の強さに足す）
const ACCENT_BOOST = 20;

// フェルマータでのばす倍率（2 なら、その音符の長さの2倍）（ステップ6-3b）
const FERMATA_RATE = 2;

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
// 優先する順：スタッカート → テヌート → スラー → ふつう
// （スラーの中でもスタッカートが付いていれば短く切る）
// ----------------------------------------------------------
function noteGate(note, legato) {
  const articulations = note.articulations ?? [];
  if (articulations.includes("staccato")) return GATE_STACCATO;
  if (articulations.includes("tenuto")) return GATE_TENUTO;
  if (legato) return GATE_SLUR;
  return GATE_NORMAL;
}

// ----------------------------------------------------------
// 関数：buildEvents
// 楽譜データから、鳴らす音の一覧を作る
//   score        … 楽譜データ
//   startMeasure … 何小節目から鳴らすか（0 から数える）
//   partIndex    … どのパートを鳴らすか（"all" なら全パート、数字ならそのパートだけ）
// 戻り値：{ events: 鳴らす音の一覧（鳴り始める順）, totalTicks: 最後までの長さ（ティック）, highlights: 緑にする音符の一覧 }
//   highlights の1つ分：{ part, measure, note, startTick, endTick }（その音符が鳴っている間 = startTick 以上 endTick 未満）
//   （ステップ6-2：鳴っている音符を緑にするために追加。タイでつながった後ろの音符も、その音符の時間で1つずつ入れる）
// ・休符は一覧に入れない（時間だけ進める）
// ・タイでつながった同じ高さの音は、1つの長い音にまとめる
// ・強弱とスラーは1小節目から数えておく（途中から鳴らしても、それまでの状態を引き継ぐため）
// ----------------------------------------------------------
export function buildEvents(score, startMeasure, partIndex) {
  const events = [];
  const highlights = []; // 緑にする音符の一覧（ステップ6-2）
  const fermatas = []; // フェルマータで止まる所の一覧 { at: 止まる時刻（ティック）, extra: のばす量（ティック） }（ステップ6-3b）

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
    let inSlur = false; // 今スラーの中か（スラーの始まりの音から、終わりの音の1つ前まで true）

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

        // スラーの状態を進める（鳴らさない小節でも数えておく）
        //   始まりの音 → ここから次の音とつなげる
        //   終わりの音 → この音でスラーが終わるので、次の音とはつなげない
        if (note.slur === "start") inSlur = true;
        const legato = inSlur && note.slur !== "stop";
        if (note.slur === "stop") inSlur = false;

        if (!playing) return;

        // 音を出す長さ（ティック）：楽譜の長さ × 割合
        const gate = noteGate(note, legato);
        const soundLength = length * gate;
        // いっぱいに鳴らす音（スラーの中・テヌート）は、次の音となめらかにつなげる
        const connected = gate >= 1;

        // アクセントが付いていたら、少し強くする（127 をこえないようにする）
        const accented = (note.articulations ?? []).includes("accent");
        const velocity = accented ? Math.min(127, result.velocity + ACCENT_BOOST) : result.velocity;

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
            velocity: velocity,
            fermataEnd: !!note.fermata, // この音の終わりにフェルマータがあるか（ステップ6-3b）
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

        // この音にタイが付いていなければ、つながりはここで終わり
        if (!note.tie) tiedEvent = null;

        tick = tick + length;
      });
    });
  });

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

  // 鳴り始める順に並べる（同じ時間なら上のパートから）
  events.sort((a, b) => a.startTick - b.startTick || a.part - b.part);

  return { events: events, totalTicks: totalTicks, highlights: highlights };
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
// 1ティック（16分音符1つ）が何秒かを計算する
// テンポは「♩ = ○○」なので、4分音符1つ = 60 ÷ テンポ 秒、16分音符はその 1/4
// 例：♩ = 120 → 4分音符 0.5秒 → 1ティック 0.125秒
// ----------------------------------------------------------
export function secondsPerTick(tempo) {
  return 60 / tempo / 4;
}
