// ==========================================================
// transpose.js
// 楽譜全体の移調（ステップ17-1）
// ==========================================================
//
// 【移調のしかた】
// ・行き先の調と向き（近いほう・上へ・下へ）から「音程」を決めて、
//   全パート・全小節の音を、その音程で動かす
// ・音程で動かすので、♯♭の書き方も正しく変わる
//   例：長2度上 … ファ♯ → ソ♯、シ♭ → ド（半音の数だけで動かすと、ソ♯ が ラ♭ になることがある）
// ・楽譜の中の調（途中で変わる調も）は、全部同じだけずらす
//   1小節目は選んだ調にする。途中の調で ♯♭ が7つ以上になったら、
//   同じ音で記号の少ない調に読み替える（例：嬰ハ長調（♯7つ）→ 変ニ長調（♭5つ））
// ・動かすのは、音符の高さ（pitch）・重音の上の音（chord）・前打音の高さ（grace.pitch）・前打音の重音の上の音（grace.chord。ステップ24-2）
//   ひし形の印（diamond）はそのまま残す
//
// 【5度圏の番号（tpc）を使う理由】
// 音名と ♯♭ を、5度ずつ並べた番号で表す（ド = 0、ソ = 1、レ = 2 … ファ = -1、シ♭ = -2 …）
//   ・調号も同じ並び（♯1つ = 1、♭1つ = -1）なので、調を ○ だけずらす ＝ 音の番号も ○ だけずらす、で済む
//   ・12 ずらすと、同じ高さで書き方だけが変わる（ド♯ = 7、レ♭ = -5）
// ==========================================================

import { cloneScore } from "./edit.js";
import { keyAt, pitchNumber, INSTRUMENTS } from "./model.js";
import { pitchToJapanese } from "./selection.js";

// 5度ずつ並べた音名（ファ・ド・ソ・レ・ラ・ミ・シ）。ファの番号が -1、ドが 0
const FIFTHS_ORDER = ["F", "C", "G", "D", "A", "E", "B"];

// ドからの半音の数（オクターブを計算するのに使う）
const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 音名の並び（何度の音程かを数えるのに使う）
const STEP_ORDER = ["C", "D", "E", "F", "G", "A", "B"];

// 高さを変えられる範囲（MIDI の番号。ド1 = 24、ド8 = 108。edit.js の ▲▼ と同じ）
const LOWEST_MIDI = 24;
const HIGHEST_MIDI = 108;

// 途中の調で、ここまでの ♯♭ の数なら読み替えない（7つになったら読み替える。決定 4. A）
const MAX_AUTO_KEY = 6;

// ----------------------------------------------------------
// 関数：pitchToTpc
// 音名と ♯♭ を、5度圏の番号にする
// 例：ド → 0、ソ → 1、ファ♯ → 6、シ♭ → -2
// ----------------------------------------------------------
function pitchToTpc(pitch) {
  return FIFTHS_ORDER.indexOf(pitch.step) - 1 + 7 * (pitch.alter ?? 0);
}

// ----------------------------------------------------------
// 関数：tpcToName
// 5度圏の番号を、音名と ♯♭ に戻す（pitchToTpc の反対）
// 例：6 → { step: "F", alter: 1 }、-2 → { step: "B", alter: -1 }
// ----------------------------------------------------------
function tpcToName(tpc) {
  const index = (((tpc + 1) % 7) + 7) % 7; // 0〜6 に収める（マイナスでも）
  return { step: FIFTHS_ORDER[index], alter: Math.floor((tpc + 1) / 7) };
}

// ----------------------------------------------------------
// 関数：transposeInterval
// 今の調・行き先の調・向きから、動かす量を決める
//   fromKey   … 今の調（1小節目の調。♯の数がプラス、♭の数がマイナス）
//   toKey     … 行き先の調
//   direction … "nearest"（近いほう）・"up"（上へ）・"down"（下へ）
// 戻り値：{ fifths: 5度圏でずらす数, semitones: 動かす半音の数 }
//   例：ニ長調（2）→ ホ長調（4）・上へ → { fifths: 2, semitones: 2 }（長2度上）
//   同じ調なら fifths も semitones も 0
// 「近いほう」で、ちょうど真ん中（増4度・減5度＝半音6つ）のときは上へ（決定 3. A）
// ----------------------------------------------------------
export function transposeInterval(fromKey, toKey, direction) {
  const fifths = toKey - fromKey;
  // 5度ずらすと半音7つ動く → 12で割った余り（0〜11）が「上へ」のときの半音の数
  const up = (((fifths * 7) % 12) + 12) % 12;

  // 余りが 0 のとき：同じ高さで書き方だけ変える（例：嬰ハ長調 → 変ニ長調）か、同じ調
  if (up === 0) return { fifths: fifths, semitones: 0 };

  let semitones;
  if (direction === "up") {
    semitones = up;
  } else if (direction === "down") {
    semitones = up - 12;
  } else {
    semitones = up <= 6 ? up : up - 12; // 近いほう（6 は上へ）
  }
  return { fifths: fifths, semitones: semitones };
}

// ----------------------------------------------------------
// 関数：intervalName
// 動かす量を、音程の名前にする（画面に「長2度上（半音2個上）」のように出すため）
//   interval … transposeInterval の戻り値
// 戻り値：音程の名前の文字（同じ調なら空の文字）
// 例：{ fifths: 2, semitones: 2 } → "長2度上（半音2個上）"
//     { fifths: -12, semitones: 0 } → "同じ高さで、書き方だけを変える"
// ----------------------------------------------------------
export function intervalName(interval) {
  if (interval.fifths === 0) return "";
  if (interval.semitones === 0) return "同じ高さで、書き方だけを変える";

  // ド4 を動かしてみて、音名がいくつ進んだか（何度か）を数える
  const moved = transposePitch({ step: "C", alter: 0, octave: 4 }, interval.fifths, interval.semitones);
  const steps = Math.abs(moved.octave * 7 + STEP_ORDER.indexOf(moved.step) - 4 * 7);
  const degree = steps + 1; // 同じ音名が1度、となりが2度…

  // 何度かごとの「完全・長」の音程の半音の数（1度〜8度）
  const REFERENCE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 };
  const isPerfect = [1, 4, 5, 8].includes(degree); // 完全の音程（1・4・5・8度）
  const diff = Math.abs(interval.semitones) - REFERENCE[degree];

  let quality;
  if (isPerfect) {
    quality = diff === 0 ? "完全" : diff > 0 ? "増" : "減";
  } else {
    quality = diff === 0 ? "長" : diff === -1 ? "短" : diff > 0 ? "増" : "減";
  }
  const way = interval.semitones > 0 ? "上" : "下";
  return `${quality}${degree}度${way}（半音${Math.abs(interval.semitones)}個${way}）`;
}

// ----------------------------------------------------------
// 関数：transposePitch
// 1つの音の高さを動かす
//   pitch     … 音の高さ { step, alter, octave }（ひし形なら diamond: true）
//   fifths    … 5度圏でずらす数（音名と ♯♭ が決まる）
//   semitones … 動かす半音の数（オクターブが決まる）
// 戻り値：新しい音の高さ（ひし形の印は残す）
// ♯♭ が3つ以上（トリプルシャープなど）になるときは、同じ高さの別の書き方にする
// ----------------------------------------------------------
function transposePitch(pitch, fifths, semitones) {
  let tpc = pitchToTpc(pitch) + fifths;
  // ♯♭ は2つ（ダブルシャープ・ダブルフラット）までにする（12 ずらすと同じ高さで書き方だけ変わる）
  while (tpcToName(tpc).alter > 2) tpc = tpc - 12;
  while (tpcToName(tpc).alter < -2) tpc = tpc + 12;

  const name = tpcToName(tpc);
  const midi = pitchNumber(pitch) + semitones; // 動かしたあとの高さ（MIDI の番号）
  // 高さと音名から、オクターブを逆算する（ド♭ や シ♯ のように、オクターブの境目をまたぐ音も合う）
  const octave = (midi - STEP_SEMITONES[name.step] - name.alter) / 12 - 1;
  return { step: name.step, alter: name.alter, octave: octave, ...(pitch.diamond ? { diamond: true } : {}) };
}

// ----------------------------------------------------------
// 関数：newKeysAndShifts
// 小節ごとに、移調したあとの調と、音をずらす5度圏の数を決める
//   score    … 楽譜データ
//   toKey    … 1小節目の行き先の調
//   fifths   … 5度圏でずらす数（transposeInterval の fifths）
// 戻り値：{ keys: 調が書いてある小節の新しい調（書いていない小節は undefined）, shifts: 小節ごとの5度圏でずらす数 }
// 途中の調で ♯♭ が7つ以上になったら、12 ずらして記号の少ない調にする（その区間の音も同じだけずらす）
// ----------------------------------------------------------
function newKeysAndShifts(score, toKey, fifths) {
  const keys = [];
  const shifts = [];
  let shift = fifths; // 今の区間で、音をずらす数

  score.measures.forEach((info, m) => {
    if (m === 0) {
      // 1小節目は、選んだ調そのものにする（♯7つ・♭7つを選んでもそのまま）
      keys.push(toKey);
      shift = fifths;
    } else if (info.key !== undefined) {
      // 途中で調が変わる小節：同じだけずらして、多すぎたら読み替える
      let key = info.key + fifths;
      shift = fifths;
      if (key > MAX_AUTO_KEY) {
        key = key - 12;
        shift = shift - 12;
      } else if (key < -MAX_AUTO_KEY) {
        key = key + 12;
        shift = shift + 12;
      }
      keys.push(key);
    } else {
      keys.push(undefined);
    }
    shifts.push(shift);
  });

  return { keys: keys, shifts: shifts };
}

// ----------------------------------------------------------
// 関数：lowestOpenString
// 楽器のいちばん低い開放弦の高さを返す（バイオリン：ソ3、ビオラ：ド3、チェロ：ド2）
// ----------------------------------------------------------
function lowestOpenString(instrument) {
  const info = INSTRUMENTS[instrument];
  return { step: info.strings[0], alter: 0, octave: info.openOctaves[0] };
}

// ----------------------------------------------------------
// 関数：transposeScore
// 楽譜全体を移調する（全パート・全小節。調号も変える）
//   score     … 楽譜データ
//   toKey     … 行き先の調（1小節目の調になる）
//   direction … "nearest"（近いほう）・"up"（上へ）・"down"（下へ）
// 戻り値：{ score: 新しい楽譜データ, error: 移調できなかったときの知らせ（できたら空の文字）, warnings: 知らせることの一覧 }
//   ・同じ調のとき、ド1〜ド8 の外に出る音があるときは、移調しない（score は元のまま、error に文）
//   ・楽器のいちばん低い開放弦より低い音ができたら、移調はして warnings にパートごとの数を入れる（決定 5. A）
// ----------------------------------------------------------
export function transposeScore(score, toKey, direction) {
  const fromKey = keyAt(score, 0);
  const interval = transposeInterval(fromKey, toKey, direction);
  if (interval.fifths === 0) {
    return { score: score, error: "今と同じ調です", warnings: [] };
  }

  const { keys, shifts } = newKeysAndShifts(score, toKey, interval.fifths);
  const newScore = cloneScore(score);
  let outside = false; // ド1〜ド8 の外に出る音があったか
  const warnings = [];

  // ① 楽譜全体の小節の情報に、新しい調を書く
  newScore.measures.forEach((info, m) => {
    if (keys[m] !== undefined) info.key = keys[m];
  });

  // ② 全パートの音を動かす
  newScore.parts.forEach((part) => {
    const lowest = lowestOpenString(part.instrument);
    let lowCount = 0; // いちばん低い開放弦より低い音の数

    // 1つの高さを動かして、範囲を調べる関数
    const move = (pitch, m) => {
      const moved = transposePitch(pitch, shifts[m], interval.semitones);
      const midi = pitchNumber(moved);
      if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) outside = true;
      if (midi < pitchNumber(lowest)) lowCount = lowCount + 1;
      return moved;
    };

    part.measures.forEach((measure, m) => {
      measure.notes.forEach((note) => {
        if (note.rest) return;
        note.pitch = move(note.pitch, m);
        if (note.chord) note.chord = note.chord.map((pitch) => move(pitch, m));
        if (note.grace && note.grace.pitch) note.grace = { ...note.grace, pitch: move(note.grace.pitch, m) };
        // 前打音の重音の上の音も動かす（ステップ24-2）
        if (note.grace && note.grace.chord) note.grace = { ...note.grace, chord: note.grace.chord.map((pitch) => move(pitch, m)) };
      });
    });

    if (lowCount > 0) {
      warnings.push(`${part.name}：いちばん低い開放弦（${pitchToJapanese(lowest)}）より低い音が ${lowCount} 個あります（音や範囲を選んで ⌘ / Ctrl＋↑ で1オクターブ上げられます）`);
    }
  });

  if (outside) {
    return { score: score, error: "ド1〜ド8 の外に出る音があるので、移調できません（向きを変えてみてください）", warnings: [] };
  }
  return { score: newScore, error: "", warnings: warnings };
}
