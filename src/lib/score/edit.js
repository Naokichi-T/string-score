// ==========================================================
// edit.js
// 楽譜データを書き換える処理（音を入れる・長さを変える・小節を足す）
//
// 【大事な決まり】
// ここの関数は、渡された楽譜データを直接書き換えずに、
// 「書き換えたあとの新しい楽譜データ」を作って返す。
// こうしておくと、
//   ・画面の描き直しが確実に起きる（新しいデータに入れ替わるので）
//   ・「元に戻す」のために、前の楽譜データをそのまま取っておける
// ==========================================================

import { durationToTicks, noteTicks, timeAt, measureTicks, restsForSpan } from "./model.js";

// ----------------------------------------------------------
// 関数：cloneScore
// 楽譜データをまるごとコピーする（コピーを書き換えても、元のデータは変わらない）
// ----------------------------------------------------------
export function cloneScore(score) {
  return JSON.parse(JSON.stringify(score));
}

// ----------------------------------------------------------
// 関数：noteStart
// 小節の中の j 番目の音が、小節の頭から何ティック目に始まるかを計算する
// （ティック = 16分音符いくつ分か）
// ----------------------------------------------------------
function noteStart(notes, j) {
  let start = 0;
  for (let k = 0; k < j; k++) {
    start = start + noteTicks(notes[k]);
  }
  return start;
}

// ----------------------------------------------------------
// 関数：canFit
// 選んでいる場所に、この長さの音（休符）を置けるか調べる
// （選んでいる音の頭から小節の終わりまでに入るなら置ける）
//   duration … 長さの名前（'quarter' など）
//   dots     … 付点の数（0 か 1）
// ----------------------------------------------------------
export function canFit(score, selection, duration, dots) {
  if (!selection) return false;
  // 16分音符に付点は付けられない
  if (duration === "16th" && dots > 0) return false;

  const notes = score.parts[selection.part].measures[selection.measure].notes;
  const total = measureTicks(timeAt(score, selection.measure)); // 1小節の長さ
  const start = noteStart(notes, selection.note); // 選んでいる音の始まり
  return start + durationToTicks(duration, dots) <= total;
}

// ----------------------------------------------------------
// 関数：replaceAt
// 選んでいる場所に新しい音（休符）を置く（上書き）
//   ・新しい音が前より短い → 余った分を休符で埋める
//   ・新しい音が前より長い → 後ろの音を上書きする（上書きしきれなかった分は休符になる）
// 置ける長さかどうかは、先に canFit で調べておくこと
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function replaceAt(score, selection, newNote) {
  const newScore = cloneScore(score);
  const measure = newScore.parts[selection.part].measures[selection.measure];
  const notes = measure.notes;
  const total = measureTicks(timeAt(newScore, selection.measure));

  const start = noteStart(notes, selection.note); // 新しい音の始まり
  const end = start + noteTicks(newNote); // 新しい音の終わり

  // 新しい音より前の音は、そのまま残す
  const before = notes.slice(0, selection.note);

  // 新しい音の終わりより後ろで始まる音は、そのまま残す
  const after = [];
  let firstAfterStart = total; // 残す音のうち、一番前の音の始まり（なければ小節の終わり）
  let position = 0;
  notes.forEach((note) => {
    if (position >= end) {
      if (after.length === 0) firstAfterStart = position;
      after.push(note);
    }
    position = position + noteTicks(note);
  });

  // 新しい音の終わりから、残す音の始まりまでのすき間を休符で埋める
  const fill = restsForSpan(end, firstAfterStart - end, timeAt(newScore, selection.measure));

  measure.notes = [...before, newNote, ...fill, ...after];
  return newScore;
}

// ----------------------------------------------------------
// 関数：setDuration
// 選んでいる音（休符）の長さを変える（音の高さや記号はそのまま）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function setDuration(score, selection, duration, dots) {
  const old = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  const newNote = { ...JSON.parse(JSON.stringify(old)), duration: duration, dots: dots };
  return replaceAt(score, selection, newNote);
}

// ----------------------------------------------------------
// 関数：appendMeasure
// 楽譜の最後に、空の小節を1つ足す（全パート）
// 拍子は最後の小節と同じにして、全部休符で埋める
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function appendMeasure(score) {
  const newScore = cloneScore(score);
  const lastIndex = newScore.measures.length - 1;
  const time = timeAt(newScore, lastIndex);
  const total = measureTicks(time);

  newScore.measures.push({}); // 拍子・調は変えない
  newScore.parts.forEach((part) => {
    part.measures.push({ notes: restsForSpan(0, total, time) });
  });
  return newScore;
}

// ----------------------------------------------------------
// 関数：nextPosition
// 選んでいる場所の「次の音」の場所を返す
// 最後の小節の最後の音だったときは、空の小節を足してから、その最初の音を返す
// 戻り値：{ score: 新しい楽譜データ（小節を足したときだけ変わる）, selection: 次の場所 }
// ----------------------------------------------------------
export function nextPosition(score, selection) {
  const measures = score.parts[selection.part].measures;
  const notes = measures[selection.measure].notes;

  // 同じ小節に次の音がある
  if (selection.note + 1 < notes.length) {
    return { score: score, selection: { ...selection, note: selection.note + 1 } };
  }
  // 次の小節がある
  if (selection.measure + 1 < measures.length) {
    return { score: score, selection: { ...selection, measure: selection.measure + 1, note: 0 } };
  }
  // 最後の小節の最後の音 → 小節を足す
  const newScore = appendMeasure(score);
  return { score: newScore, selection: { ...selection, measure: selection.measure + 1, note: 0 } };
}
