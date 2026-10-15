// ==========================================================
// tuplets.js
// 連符を作る処理（ステップ10-2）
//
// 【連符の作り方】（Flat と同じ）
//   1. 連符の中の1つの音の長さで、音（休符）を入れて選ぶ（例：8分音符）
//   2. ［3連符］を押す
//   3. 選んだ音が連符の1つ目になり、残りは同じ長さの休符で埋まる
//      例：8分音符の3連符 → 8分音符2つ分の長さに、8分音符を3つ入れる
//
// 【連符の解除】（ステップ10-3）
//   連符の中の音を選んで［連符を解除］を押すと、ふつうの音符に戻る
//
// edit.js と同じく、楽譜データを直接書き換えずに、新しい楽譜データを作って返す
// ==========================================================

import { durationToTicks, noteTicks, timeAt, measureTicks, tupletNormal, tupletGroups, restsForSpan } from "./model.js";
import { replaceWith, cloneScore, cleanSpanners } from "./edit.js";

// ----------------------------------------------------------
// 関数：tupletError
// 選んでいる音を連符にできるかを調べる
//   selection … 選んでいる場所
//   actual    … 連符の数字（3連符なら 3）
// 戻り値：できないときは、その理由の文。できるときは空の文字（""）
// ----------------------------------------------------------
export function tupletError(score, selection, actual) {
  if (!selection) return "先に、連符にしたい音（休符）を選んでください";

  const notes = score.parts[selection.part].measures[selection.measure].notes;
  const note = notes[selection.note];
  if (note.tuplet) return "選んでいる音は、もう連符になっています";
  if ((note.dots ?? 0) > 0) return "付点の音は連符にできません。付点を外してから押してください";

  // 連符全体の長さ = 1つ分の長さ × 何個分の長さに入れるか
  // 例：8分音符の3連符 → 8分音符 × 2
  const groupTicks = durationToTicks(note.duration, 0) * tupletNormal(actual);

  // 選んでいる音の頭から、小節の終わりまでに入るか
  let start = 0;
  for (let k = 0; k < selection.note; k++) {
    start = start + noteTicks(notes[k]);
  }
  const total = measureTicks(timeAt(score, selection.measure));
  if (start + groupTicks > total) return "連符が小節に入りきりません。短い長さの音を選んでから押してください";

  return "";
}

// ----------------------------------------------------------
// 関数：makeTuplet
// 選んでいる音を、連符の1つ目にする（残りは同じ長さの休符で埋める）
//   selection … 選んでいる場所
//   actual    … 連符の数字（3連符なら 3）
// 作れるかどうかは、先に tupletError で調べておくこと
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function makeTuplet(score, selection, actual) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];

  // 連符の印（何個分の長さに入れるかは、ふつうの決まりで決める）
  const tuplet = { actual: actual, normal: tupletNormal(actual) };

  // 1つ目：選んでいた音（高さ・記号はそのまま）に連符の印を付ける
  const first = { ...JSON.parse(JSON.stringify(note)), dots: 0, tuplet: { ...tuplet } };

  // 2つ目から：同じ長さの休符
  const others = [];
  for (let k = 1; k < actual; k++) {
    others.push({ rest: true, duration: note.duration, dots: 0, tuplet: { ...tuplet } });
  }

  // 選んでいる音の頭から、連符の音を並べて置く（後ろの音は上書きされ、すき間は休符で埋まる）
  return replaceWith(score, selection, [first, ...others]);
}

// ----------------------------------------------------------
// 関数：removeTuplet
// 選んでいる音が入っている連符を解除して、ふつうの音符に戻す（ステップ10-3）
//   selection … 選んでいる場所（連符の中のどれか1つ）
// ・連符の中の音を、前から「入るだけ」ふつうの音符として残す
//     例：8分音符の3連符（ド・レ・ミ）→ 8分音符2つ分の場所なので、ド・レを残す（ミは消える）
// ・残した音のあとのすき間は、休符で埋める（2連符のときなど）
// 戻り値：{ score: 新しい楽譜データ, selection: 新しい選択（連符だった所の最初の音） }
// ----------------------------------------------------------
export function removeTuplet(score, selection) {
  const newScore = cloneScore(score);
  const part = newScore.parts[selection.part];
  const measure = part.measures[selection.measure];
  const notes = measure.notes;

  // 選んでいる音が入っている連符を探す
  const group = tupletGroups(notes).find((g) => g.start <= selection.note && selection.note <= g.end);
  if (!group) return { score: score, selection: selection };

  // 連符が始まる位置（小節の頭から何ティックか）
  let groupStart = 0;
  for (let k = 0; k < group.start; k++) {
    groupStart = groupStart + noteTicks(notes[k]);
  }

  // 連符だった場所の長さと、1つ分の長さ
  const unit = durationToTicks(group.duration, 0);
  const span = unit * group.normal;

  // 前から入るだけ残す（連符の印を外す）
  const memberCount = group.end - group.start + 1;
  const keepCount = Math.min(group.normal, memberCount);
  const kept = notes.slice(group.start, group.start + keepCount).map((note) => {
    const plain = { ...note };
    delete plain.tuplet; // 連符の印を外す
    return plain;
  });
  // 消える音へのタイは外す
  if (keepCount < memberCount && kept[keepCount - 1].tie) kept[keepCount - 1].tie = false;

  // 残した音のあとのすき間を休符で埋める
  const keptTicks = unit * keepCount;
  const fill = restsForSpan(groupStart + keptTicks, span - keptTicks, timeAt(newScore, selection.measure));

  measure.notes = [...notes.slice(0, group.start), ...kept, ...fill, ...notes.slice(group.end + 1)];

  // 消えた音に付いていたスラー・松葉の片方が残らないように整える
  cleanSpanners(part);

  return { score: newScore, selection: { ...selection, note: group.start } };
}
