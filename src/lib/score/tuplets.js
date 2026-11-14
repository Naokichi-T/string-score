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
// 【連符の中の長さを変える】（ステップ28）
//   連符の中の音を選んで、長さのボタン・［付点］を押すと、連符の中だけで長さを変える
//     例：8分音符の3連符（ド・レ・ミ）で、レに［付点］→ レが付点8分音符になり、ミの前半を上書き
//         → 残りの16分音符1つ分は16分休符になる（8分＋付点8分＋16分の3連符）
//   連符の終わりを越える長さは選べない（連符の外の音は動かさない）
//
// edit.js と同じく、楽譜データを直接書き換えずに、新しい楽譜データを作って返す
// ==========================================================

import { durationToTicks, noteTicks, timeAt, measureLength, tupletNormal, tupletGroups, restsForSpan, tupletUnit, tupletRawTicks, tupletRests, NO_DOT_DURATIONS } from "./model.js";
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
  const total = measureLength(score, selection.measure); // アウフタクトなら短い長さ（ステップ15-1）
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
  // unit（1つ分の長さ）も書いておく。あとで中の長さを変えても、連符の区切りがわかるように（ステップ28）
  const tuplet = { actual: actual, normal: tupletNormal(actual), unit: note.duration };

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
//     （ステップ28：長さがまじった連符もあるので、数ではなく長さで「入るだけ」残す）
//     例：8分・付点8分・16分の3連符 → 8分＋付点8分は 8分音符2.5個分で入らないので、8分だけ残す
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

  // 連符だった場所の長さ（1つ分 × normal）
  const unit = durationToTicks(group.unit, 0);
  const span = unit * group.normal;

  // 前から、長さの合計が span をこえない所まで残す（連符の印を外す）
  const members = notes.slice(group.start, group.end + 1);
  const kept = [];
  let keptTicks = 0; // 残した音の長さの合計（ふつうの音符の長さで）
  for (const note of members) {
    const ticks = tupletRawTicks(note);
    if (keptTicks + ticks > span) break;
    const plain = { ...note };
    delete plain.tuplet; // 連符の印を外す
    kept.push(plain);
    keptTicks = keptTicks + ticks;
  }
  // 消える音へのタイは外す
  if (kept.length < members.length && kept.length > 0 && kept[kept.length - 1].tie) kept[kept.length - 1].tie = false;

  // 残した音のあとのすき間を休符で埋める
  const fill = restsForSpan(groupStart + keptTicks, span - keptTicks, timeAt(newScore, selection.measure));

  measure.notes = [...notes.slice(0, group.start), ...kept, ...fill, ...notes.slice(group.end + 1)];

  // 消えた音に付いていたスラー・松葉の片方が残らないように整える
  cleanSpanners(part);

  return { score: newScore, selection: { ...selection, note: group.start } };
}

// ----------------------------------------------------------
// 関数：tupletResizeError
// 連符の中の音の長さを、この長さに変えられるかを調べる（ステップ28）
//   selection … 選んでいる場所（連符の中の音）
//   duration  … 新しい長さの名前（"eighth" など）
//   dots      … 付点の数（0 か 1）
// 戻り値：できないときは、その理由の文。できるときは空の文字（""）
// ----------------------------------------------------------
export function tupletResizeError(score, selection, duration, dots) {
  const notes = score.parts[selection.part].measures[selection.measure].notes;
  const group = tupletGroups(notes).find((g) => g.start <= selection.note && selection.note <= g.end);
  if (!group) return "連符の中の音ではありません";

  // 16分・32分音符には付点を付けない（連符の外と同じ）
  if (NO_DOT_DURATIONS.includes(duration) && dots > 0) return `${duration === "32nd" ? "32" : "16"}分音符には付点を付けられません`;

  // 選んでいる音の始まり（連符の頭から、連符にする前の長さで）
  let offset = 0;
  for (let k = group.start; k < selection.note; k++) {
    offset = offset + tupletRawTicks(notes[k]);
  }
  // 連符の終わりを越えないか
  if (offset + durationToTicks(duration, dots) > group.capacity) return "その長さは連符の中に入りきりません。短い長さを選んでください";
  return "";
}

// ----------------------------------------------------------
// 関数：resizeInTuplet
// 連符の中の音の長さを変える（連符の中だけで、後ろの音を上書きしたり休符で埋めたりする）（ステップ28）
//   selection … 選んでいる場所（連符の中の音）
//   duration  … 新しい長さの名前
//   dots      … 付点の数（0 か 1）
// ・長くする → 後ろの音のうち、かかった音は消える（かかった所の残りは休符で埋める）
// ・短くする → あいた所を休符で埋める
// ・連符の外の音は動かさない
// 変えられるかどうかは、先に tupletResizeError で調べておくこと
// 戻り値：新しい楽譜データ（選んでいる音の番号は変わらない）
// ----------------------------------------------------------
export function resizeInTuplet(score, selection, duration, dots) {
  const newScore = cloneScore(score);
  const part = newScore.parts[selection.part];
  const measure = part.measures[selection.measure];
  const notes = measure.notes;
  const group = tupletGroups(notes).find((g) => g.start <= selection.note && selection.note <= g.end);
  if (!group) return score;

  // 連符の印（1つ分の長さ unit を必ず書く。古いデータには unit がないため）
  const tuplet = { actual: group.actual, normal: group.normal, unit: group.unit };

  // 連符の中の音を、印を付け直して取り出す
  const members = notes.slice(group.start, group.end + 1).map((note) => ({ ...note, tuplet: { ...tuplet } }));
  const index = selection.note - group.start; // 連符の中で何番目か

  // 選んでいる音より前（そのまま）
  const before = members.slice(0, index);
  let offset = 0;
  before.forEach((note) => {
    offset = offset + tupletRawTicks(note);
  });

  // 選んでいる音（長さだけ変える。高さ・記号はそのまま）
  const changed = { ...members[index], duration: duration, dots: dots };
  const end = offset + durationToTicks(duration, dots); // 新しい長さの終わり

  // 選んでいる音より後ろ：新しい終わりより後ろで始まる音だけ残す
  const after = [];
  let firstAfterStart = group.capacity; // 残す音のうち、いちばん前の音の始まり（なければ連符の終わり）
  let position = offset + tupletRawTicks(members[index]);
  for (let k = index + 1; k < members.length; k++) {
    if (position >= end) {
      if (after.length === 0) firstAfterStart = position;
      after.push(members[k]);
    }
    position = position + tupletRawTicks(members[k]);
  }

  // 新しい終わりから、残す音の始まりまでを休符で埋める
  const fill = tupletRests(end, firstAfterStart - end, tuplet);

  // すぐ後ろが埋めた休符になるときは、タイでつなぐ相手がいないので、タイは外す
  if (fill.length > 0) changed.tie = false;

  measure.notes = [...notes.slice(0, group.start), ...before, changed, ...fill, ...after, ...notes.slice(group.end + 1)];

  // 消えた音に付いていたスラー・松葉の片方が残らないように整える
  cleanSpanners(part);

  return newScore;
}
