// ==========================================================
// beams.js
// 連桁（8分音符などをつなぐ横棒）のつなぎ方を決める処理と、
// ［連桁にする］［連桁を解除］のボタンの処理（ステップ19-1）
//
// 【データの持ち方】
//   音符ごとに「前の音符とのつながり」を beam に覚える（印がない音符は、自動で決まる）
//     beam: "join"  … 前の音符と、拍をまたいでもつなぐ
//     beam: "break" … 前の音符とは、つながずに切る
//
// 【つなぎ方の決め方】
//   ① 拍子で自動のまとまりを作る（VexFlow の Beam.generateBeams と同じ決め方をまねる）
//   ② となり合う2つの音符ごとに、印があれば印のほうを使う
//   ③ 休符・4分音符より長い音符・連符の中・小節線は、印があってもいつも切る
//      （連符の中は、今までどおりいつも全部つなぐ）
//
// VexFlow を使わずに計算するので、画面（render/tuplets.js）と MusicXML の書き出し・読み込み（ステップ19-2）の両方で使える
// edit.js と同じく、楽譜データを直接書き換えずに、新しい楽譜データを作って返す
// ==========================================================

import { noteTicks, tupletGroups, timeAt, measureOffset, TICKS_PER_16TH } from "./model.js";
import { cloneScore } from "./edit.js";

// 全音符1つ分のティック
const WHOLE_TICKS = 16 * TICKS_PER_16TH;

// 連桁でつなげない長さ（4分音符と、それより長いもの）
const LONG_DURATIONS = ["whole", "half", "quarter"];

// ----------------------------------------------------------
// 拍子ごとの「連桁を区切る長さ」（VexFlow の Beam.getDefaultBeamGroups と同じ表）
// 例："4/4": [[1, 4]] … 4分音符ごとに区切る
// 表にない拍子は、getDefaultGroups の中で決める（VexFlow と同じ決め方）
// ----------------------------------------------------------
const DEFAULT_GROUPS = {
  "1/2": [[1, 2]],
  "2/2": [[1, 2]],
  "3/2": [[1, 2]],
  "4/2": [[1, 2]],
  "1/4": [[1, 4]],
  "2/4": [[1, 4]],
  "3/4": [[1, 4]],
  "4/4": [[1, 4]],
  "1/8": [[1, 8]],
  "2/8": [[2, 8]],
  "3/8": [[3, 8]],
  "4/8": [[2, 8]],
  "1/16": [[1, 16]],
  "2/16": [[2, 16]],
  "3/16": [[3, 16]],
  "4/16": [[2, 16]],
};

// ----------------------------------------------------------
// 関数：getDefaultGroups
// 拍子から、連桁を区切る長さ（ティック）の並びを返す（VexFlow と同じ決め方）
//   例：4/4 → [4分音符のティック]、6/8 → [付点4分音符のティック]
// ----------------------------------------------------------
function getDefaultGroups(time) {
  const key = `${time.beats}/${time.beatType}`;
  let fractions = DEFAULT_GROUPS[key];
  if (!fractions) {
    if (time.beats % 3 === 0) {
      fractions = [[3, time.beatType]]; // 3拍子の仲間（6/8・9/8・12/8 など）：3つずつ
    } else if (time.beatType > 4) {
      fractions = [[2, time.beatType]]; // 8分の5拍子など：2つずつ
    } else {
      fractions = [[1, time.beatType]]; // 4分の5拍子など：1拍ずつ
    }
  }
  return fractions.map(([numerator, denominator]) => (numerator * WHOLE_TICKS) / denominator);
}

// ----------------------------------------------------------
// 関数：beatGridPoints
// 拍子に合わせた「連桁を区切る位置」の一覧を作る（render/tuplets.js の同じ名前の関数と同じ計算）
//   time          … 拍子
//   measureLength … 拍子どおりの1小節の長さ（ティック）
// 戻り値：小節の頭から何ティックかの配列（小節の頭は入れない。最後は小節の終わり）
// ----------------------------------------------------------
function beatGridPoints(time, measureLength) {
  const lengths = getDefaultGroups(time);
  const points = [];
  let position = 0;
  let k = 0;
  while (position < measureLength) {
    position = Math.min(position + lengths[k % lengths.length], measureLength);
    points.push(position);
    k = k + 1;
  }
  return points;
}

// ----------------------------------------------------------
// 関数：isShort
// 連桁でつなげる音符か（休符でなく、8分音符より短い（同じも入る）長さ）
// ----------------------------------------------------------
export function isShort(note) {
  return !!note && !note.rest && !LONG_DURATIONS.includes(note.duration);
}

// ----------------------------------------------------------
// 関数：autoGroups
// 連符でない音の並びを、VexFlow の Beam.generateBeams と同じ決め方で、連桁のまとまりに分ける
//   notes   … 音の並び（連符は入らない）
//   lengths … まとまりの長さ（ティック）の並び（render/tuplets.js の createBeams が渡すものと同じ）
// 戻り値：まとまりごとの「音の番号（notes の中の何番目か）」の配列の配列（2つ以上のまとまりだけ）
// （VexFlow の決め方のくせ（はみ出した音を次のまとまりに回したときの数え方など）も、そのまままねている）
// ----------------------------------------------------------
export function autoGroups(notes, lengths) {
  // ① 長さで区切る（VexFlow の createGroups）
  let groups = [];
  let current = [];
  let carry = 0; // 前のまとまりからはみ出した長さ
  let cursor = 0; // 今どの長さ（lengths の何番目）で区切っているか
  const nextCursor = () => (cursor < lengths.length - 1 ? cursor + 1 : 0);

  notes.forEach((note, i) => {
    let next = [];
    current.push(i);
    const limit = lengths[cursor];
    let total = current.reduce((sum, k) => sum + noteTicks(notes[k]), 0) + carry;
    const unbeamable = LONG_DURATIONS.includes(note.duration);
    if (total > limit) {
      // 入りきらない：短い音なら次のまとまりに回す
      if (!unbeamable) next.push(current.pop());
      groups.push(current);
      do {
        total = total - lengths[cursor];
        carry = total;
        cursor = nextCursor();
      } while (carry >= lengths[cursor]);
      current = next;
    } else if (total === limit) {
      // ちょうど埋まった：ここで区切る
      groups.push(current);
      carry = 0;
      current = next;
      cursor = nextCursor();
    }
  });
  if (current.length > 0) groups.push(current);

  // ② 休符で切る（VexFlow の sanitizeGroups）
  const split = [];
  groups.forEach((group) => {
    let temp = [];
    group.forEach((k) => {
      if (notes[k].rest) {
        if (temp.length > 0) split.push(temp);
        temp = [];
      } else {
        temp.push(k);
      }
    });
    if (temp.length > 0) split.push(temp);
  });

  // ③ 2つ以上で、4分音符より長い音が入っていないものだけ残す（VexFlow の getBeamGroups）
  return split.filter((group) => group.length > 1 && group.every((k) => !LONG_DURATIONS.includes(notes[k].duration)));
}

// ----------------------------------------------------------
// 関数：applyMarks
// 自動のまとまりに、音符の印（join・break）を当てはめて、最後のまとまりを決める
//   notes  … 音の並び（連符は入らない）
//   groups … autoGroups で作ったまとまり
// ・となり合う2つの音符（i-1 と i）ごとに、つなぐかどうかを決める
//     印 "join"  … どちらも短い音符ならつなぐ
//     印 "break" … 切る
//     印なし     … 自動のまとまりのとおり
// 戻り値：まとまりごとの音の番号の配列の配列（2つ以上のまとまりだけ）
// ----------------------------------------------------------
export function applyMarks(notes, groups) {
  // 自動でつながっている組（i-1 と i）を覚える
  const autoJoined = new Set();
  groups.forEach((group) => {
    for (let k = 1; k < group.length; k++) autoJoined.add(group[k]);
  });

  // 前から順に、つなぐ・切るを決めてまとまりを作る
  const result = [];
  let current = [];
  notes.forEach((note, i) => {
    let joined = autoJoined.has(i);
    if (i > 0 && isShort(notes[i - 1]) && isShort(note)) {
      if (note.beam === "join") joined = true;
      if (note.beam === "break") joined = false;
    } else {
      joined = joined && note.beam !== "break";
    }
    if (joined && current.length > 0) {
      current.push(i);
    } else {
      if (current.length > 1) result.push(current);
      current = [i];
    }
  });
  if (current.length > 1) result.push(current);
  return result;
}

// ----------------------------------------------------------
// 関数：segmentsOf
// 小節を「連符」と「連符でない所」に区切る（render/tuplets.js の createBeams と同じ区切り方）
// 戻り値：[{ from: 最初の音の番号, to: 最後の音の番号, isTuplet }, ...]
// ----------------------------------------------------------
function segmentsOf(notes) {
  const segments = [];
  let j = 0;
  tupletGroups(notes).forEach((group) => {
    if (j < group.start) segments.push({ from: j, to: group.start - 1, isTuplet: false });
    segments.push({ from: group.start, to: group.end, isTuplet: true, duration: group.duration });
    j = group.end + 1;
  });
  if (j < notes.length) segments.push({ from: j, to: notes.length - 1, isTuplet: false });
  return segments;
}

// ----------------------------------------------------------
// 関数：segmentLengths
// 連符でない区切りの「まとまりの長さ」の並びを作る（render/tuplets.js の createBeams と同じ計算）
//   starts     … 音ごとの、小節の頭からの始まり（ティック）
//   gridPoints … 小節の頭からの、連桁を区切る位置
//   from, to   … 区切りの最初と最後の音の番号
//   measureEnd … 小節の長さ
// ----------------------------------------------------------
export function segmentLengths(starts, gridPoints, from, to, measureEnd) {
  const segmentStart = starts[from];
  const segmentEnd = to + 1 < starts.length ? starts[to + 1] : measureEnd;
  const points = [segmentStart, ...gridPoints.filter((p) => p > segmentStart && p < segmentEnd), segmentEnd];
  const lengths = [];
  for (let k = 0; k < points.length - 1; k++) {
    lengths.push(points[k + 1] - points[k]);
  }
  return lengths;
}

// ----------------------------------------------------------
// 関数：measureBeamGroups
// 1小節の連桁のまとまりを、印も当てはめて決める（VexFlow を使わない計算）
//   notes  … 小節の音のデータの並び
//   time   … 小節の拍子
//   offset … 小節の頭が、拍子どおりの1小節の中のどの位置にあたるか（アウフタクトの小節だけ 0 より大きい）
//   useMarks … false なら印を使わない（自動のまとまりだけ。印が自動と同じかを調べるのに使う）
// 戻り値：まとまりごとの「小節の中の音の番号」の配列の配列（連符のまとまりも入る）
// ----------------------------------------------------------
export function measureBeamGroups(notes, time, offset = 0, useMarks = true) {
  const starts = [];
  let position = 0;
  notes.forEach((note) => {
    starts.push(position);
    position = position + noteTicks(note);
  });
  const measureEnd = position;
  const fullLength = (time.beats * WHOLE_TICKS) / time.beatType;
  const gridPoints = beatGridPoints(time, fullLength)
    .map((point) => point - offset)
    .filter((point) => point > 0);

  const result = [];
  segmentsOf(notes).forEach((segment) => {
    const indexes = [];
    for (let k = segment.from; k <= segment.to; k++) indexes.push(k);
    if (segment.isTuplet) {
      // 連符の中は全部1本でつなぐ（4分音符以上の連符には連桁がない）
      if (!LONG_DURATIONS.includes(segment.duration) && indexes.length > 1) result.push(indexes);
      return;
    }
    const segmentNotes = indexes.map((k) => notes[k]);
    const lengths = segmentLengths(starts, gridPoints, segment.from, segment.to, measureEnd);
    const groups = autoGroups(segmentNotes, lengths);
    const finalGroups = useMarks ? applyMarks(segmentNotes, groups) : groups;
    finalGroups.forEach((group) => result.push(group.map((k) => indexes[k])));
  });
  return result;
}

// ----------------------------------------------------------
// 関数：hasMarks
// 音の並びの中に、連桁の印（join・break）が1つでもあるか（最初の音の印は数えない）
// （印がない小節は、今までどおり VexFlow の自動のつなぎ方で描くため）
// ----------------------------------------------------------
export function hasMarks(notes) {
  return notes.some((note, k) => k > 0 && !!note.beam);
}

// ----------------------------------------------------------
// 関数：cleanMarks
// 1小節の印を整える
//   ・印がなくても同じつなぎ方になる印は外す（データをすっきりさせるため）
//   ・小節の最初の音の印は外す（前の音は前の小節なので、意味がない）
// （notes を直接書き換える。cloneScore したあとのデータに使う）
// ----------------------------------------------------------
function cleanMarks(notes, time, offset) {
  if (notes.length > 0) delete notes[0].beam;
  // 自動のつなぎ方で、つながっている音（前の音とつながっているもの）
  const autoJoined = new Set();
  measureBeamGroups(notes, time, offset, false).forEach((group) => {
    for (let k = 1; k < group.length; k++) autoJoined.add(group[k]);
  });
  const tupletIndexes = new Set();
  tupletGroups(notes).forEach((group) => {
    for (let k = group.start; k <= group.end; k++) tupletIndexes.add(k);
  });
  notes.forEach((note, i) => {
    if (i === 0 || !note.beam) return;
    // 連符の中・連符のとなりは、印が効かないので外す
    if (tupletIndexes.has(i) || tupletIndexes.has(i - 1)) {
      delete note.beam;
      return;
    }
    // 休符・4分音符より長い音符のとなりは、印が効かないので外す
    if (!isShort(notes[i - 1]) || !isShort(note)) {
      delete note.beam;
      return;
    }
    // 自動と同じなら外す
    const same = (note.beam === "join" && autoJoined.has(i)) || (note.beam === "break" && !autoJoined.has(i));
    if (same) delete note.beam;
  });
}

// ----------------------------------------------------------
// 関数：rangeByMeasure
// 範囲（または選んでいる1つの音）を、小節ごとの「最初と最後の音の番号」に分ける
// 戻り値：[{ measure, from, to }, ...]
// ----------------------------------------------------------
function rangeByMeasure(score, selection, range) {
  const target = range ?? (selection ? { part: selection.part, start: selection, end: selection } : null);
  if (!target) return [];
  const measures = score.parts[target.part].measures;
  const result = [];
  for (let m = target.start.measure; m <= target.end.measure; m++) {
    const from = m === target.start.measure ? target.start.note : 0;
    const to = m === target.end.measure ? target.end.note : measures[m].notes.length - 1;
    result.push({ measure: m, from: from, to: to });
  }
  return result;
}

// ----------------------------------------------------------
// 関数：isTupletAt
// 小節の中の k 番目の音が連符の中か
// ----------------------------------------------------------
function isTupletAt(notes, k) {
  return !!notes[k]?.tuplet;
}

// ----------------------------------------------------------
// 関数：canBeamTogether
// ［連桁にする］を押せるか
// 範囲の中に、となり合った短い音符（休符でなく、8分音符より短い、連符でない）が2つ以上続く所があれば押せる
// ----------------------------------------------------------
export function canBeamTogether(score, range) {
  if (!range) return false;
  const measures = score.parts[range.part].measures;
  return rangeByMeasure(score, null, range).some(({ measure, from, to }) => {
    const notes = measures[measure].notes;
    for (let k = from + 1; k <= to; k++) {
      if (isShort(notes[k - 1]) && isShort(notes[k]) && !isTupletAt(notes, k - 1) && !isTupletAt(notes, k)) return true;
    }
    return false;
  });
}

// ----------------------------------------------------------
// 関数：canUnbeam
// ［連桁を解除］を押せるか
// 選んでいる音（範囲）の中に、今、連桁でつながっている音符（連符でないもの）があれば押せる
// ----------------------------------------------------------
export function canUnbeam(score, selection, range) {
  const target = range ?? (selection ? { part: selection.part } : null);
  if (!target) return false;
  const measures = score.parts[target.part].measures;
  return rangeByMeasure(score, selection, range).some(({ measure, from, to }) => {
    const notes = measures[measure].notes;
    const groups = measureBeamGroups(notes, timeAt(score, measure), measureOffset(score, measure));
    return groups.some((group) => group.some((k) => k >= from && k <= to && !isTupletAt(notes, k)));
  });
}

// ----------------------------------------------------------
// 関数：beamTogether
// ［連桁にする］：範囲の音符を、小節ごとに1本の連桁でつなぐ
//   ・範囲の2つ目〜最後の音 → "join"（前とつなぐ）
//   ・範囲の最初の音        → "break"（範囲の前の音とは切る）
//   ・範囲のすぐ後ろの音    → "break"（範囲の後ろとも切る）
//   （休符・4分音符より長い音符・連符の所では、印があっても切れる）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function beamTogether(score, range) {
  const newScore = cloneScore(score);
  const measures = newScore.parts[range.part].measures;
  rangeByMeasure(newScore, null, range).forEach(({ measure, from, to }) => {
    const notes = measures[measure].notes;
    if (from > 0) notes[from].beam = "break";
    for (let k = from + 1; k <= to; k++) notes[k].beam = "join";
    if (to + 1 < notes.length) notes[to + 1].beam = "break";
    cleanMarks(notes, timeAt(newScore, measure), measureOffset(newScore, measure));
  });
  return newScore;
}

// ----------------------------------------------------------
// 関数：unbeam
// ［連桁を解除］：選んでいる音（範囲）の音符を、連桁でつながない1つずつの音符にする
//   ・選んだ音それぞれと、すぐ後ろの音 → "break"
//   （連符の中は、今までどおりいつもつながる）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function unbeam(score, selection, range) {
  const newScore = cloneScore(score);
  const part = range ? range.part : selection.part;
  const measures = newScore.parts[part].measures;
  rangeByMeasure(newScore, selection, range).forEach(({ measure, from, to }) => {
    const notes = measures[measure].notes;
    for (let k = from; k <= to + 1 && k < notes.length; k++) {
      if (k > 0) notes[k].beam = "break";
    }
    cleanMarks(notes, timeAt(newScore, measure), measureOffset(newScore, measure));
  });
  return newScore;
}

// ==========================================================
// MusicXML の連桁（ステップ19-2）
// ==========================================================

// 長さの名前 → 連桁の本数（8分音符は1本、16分音符は2本、32分音符は3本）
const BEAM_LEVELS = { eighth: 1, "16th": 2, "32nd": 3 };

// ----------------------------------------------------------
// 関数：beamXmlValues
// 1小節の音ごとに、MusicXML の <beam> に書く中身を決める（書き出し用）
//   notes  … 小節の音のデータの並び
//   groups … measureBeamGroups で決めたまとまり（画面と同じつなぎ方）
// ・1本目（number 1）：まとまりの最初 begin、途中 continue、最後 end
// ・2本目・3本目（16分音符・32分音符）：その本数がある音どうしが続く所を begin〜end でつなぐ
//     1つだけのときは「かぎ」（短い横棒）にする：まとまりの最初なら forward hook（右向き）、それ以外は backward hook（左向き）
// 戻り値：音の番号ごとの [{ number: 何本目か, value: 中身 }, ...] の配列（連桁のない音は空の配列）
// ----------------------------------------------------------
export function beamXmlValues(notes, groups) {
  const result = notes.map(() => []);
  groups.forEach((group) => {
    const levels = group.map((k) => BEAM_LEVELS[notes[k].duration] ?? 1);
    const maxLevel = Math.max(...levels);
    for (let number = 1; number <= maxLevel; number++) {
      // この本数がある音が続く所（まとまりの中の位置で）を探す
      let p = 0;
      while (p < group.length) {
        if (levels[p] < number) {
          p = p + 1;
          continue;
        }
        let q = p;
        while (q + 1 < group.length && levels[q + 1] >= number) q = q + 1;
        if (number === 1 || q > p) {
          // 2つ以上続く（1本目はまとまり全体）：begin 〜 continue 〜 end
          for (let r = p; r <= q; r++) {
            const value = r === p ? "begin" : r === q ? "end" : "continue";
            result[group[r]].push({ number: number, value: value });
          }
        } else {
          // 1つだけ：かぎ
          result[group[p]].push({ number: number, value: p === 0 ? "forward hook" : "backward hook" });
        }
        p = q + 1;
      }
    }
  });
  return result;
}

// ----------------------------------------------------------
// 関数：marksFromFile
// MusicXML から読んだ連桁（音ごとの beamXml）を、このアプリの印（join・break）にする（読み込み用）
//   notes  … 小節の音のデータの並び（読み込みで、主音に beamXml を一時的に付けてある）
//             beamXml … その音の <beam number="1"> の中身（"begin"・"continue"・"end" など。なければ付いていない）
//   time   … 小節の拍子
//   offset … 小節の頭が、拍子どおりの1小節の中のどの位置にあたるか（アウフタクトの小節だけ 0 より大きい）
// ・ファイルで前の音とつながっている（前が begin・continue で、自分が continue・end）なら "join"、そうでなければ "break"
// ・そのあと cleanMarks で、自動と同じになる印・効かない印を外す（自動と違う所だけ印が残る）
// ・beamXml は消す（notes を直接書き換える）
// ----------------------------------------------------------
export function marksFromFile(notes, time, offset = 0) {
  notes.forEach((note, i) => {
    if (i === 0) return;
    const prev = notes[i - 1];
    const joined = ["begin", "continue"].includes(prev.beamXml) && ["continue", "end"].includes(note.beamXml);
    note.beam = joined ? "join" : "break";
  });
  notes.forEach((note) => delete note.beamXml);
  cleanMarks(notes, time, offset);
}
