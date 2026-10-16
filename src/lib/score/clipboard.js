// ==========================================================
// clipboard.js
// 範囲のコピー・貼り付け（ステップ5-7）
//
// 【貼り付けの考え方】
// パートの音を「時間の並び」（頭から何ティック目に、どの長さの音があるか）として見て、
//   ・貼り付ける所より前 … そのまま
//   ・貼り付ける所       … コピーした音を順に置く
//   ・貼り付けた所の後ろ … そのまま（音の途中で切れたら、残りは休符）
// にしてから、小節ごとに分け直す。
// 小節線をまたぐ音は、小節線で分けてタイでつなぐ（休符は分けるだけ）
// （ティック = 長さの単位。16分音符1つ = TICKS_PER_16TH ティック。model.js を参照）
//
// 【連符の扱い】（ステップ10-4）
//   連符は途中で分けられないので、いつも「連符まるごと」で扱う
//   ・コピー：範囲が連符の途中で始まる・終わるときは、連符全体に広げる
//   ・貼り付け：貼り付ける所にかかった連符は、まるごと消す（はみ出す分は休符にする）
//   ・貼り付けられないとき（知らせて、何もしない）
//       連符の途中（2つ目から）を選んで貼り付けたとき
//       貼り付ける連符が小節線をまたぐとき
// ==========================================================

import { noteTicks, durationToTicks, timeAt, measureTicks, restsForSpan, tupletGroups } from "./model.js";
import { cloneScore, appendMeasure, cleanSpanners } from "./edit.js";
import { positionsInRange } from "./selection.js";

// 1つの音符で書ける長さ（長い順）。分けた長さを、これを組み合わせて表す
// ticks は、長さの名前と付点の数から計算する（ステップ10-1：ティックの細かさを変えたため）
const NOTE_VALUES = [
  { duration: "whole", dots: 0 }, // 全音符
  { duration: "half", dots: 1 }, // 付点2分音符
  { duration: "half", dots: 0 }, // 2分音符
  { duration: "quarter", dots: 1 }, // 付点4分音符
  { duration: "quarter", dots: 0 }, // 4分音符
  { duration: "eighth", dots: 1 }, // 付点8分音符
  { duration: "eighth", dots: 0 }, // 8分音符
  { duration: "16th", dots: 0 }, // 16分音符
].map((value) => ({ ...value, ticks: durationToTicks(value.duration, value.dots) }));

// ----------------------------------------------------------
// 関数：expandToTuplets
// コピーする範囲を決める（範囲がなければ、選んでいる1つの音）（ステップ10-4）
// 範囲の始まり・終わりが連符の途中なら、その連符全体まで広げる
//   range     … 選んでいる範囲（なければ null）
//   selection … 選んでいる場所
// 戻り値：{ part, start: { measure, note }, end: { measure, note } }（何も選んでいないときは null）
// ----------------------------------------------------------
export function expandToTuplets(score, range, selection) {
  const target = range ?? (selection ? { part: selection.part, start: selection, end: selection } : null);
  if (!target) return null;

  const measures = score.parts[target.part].measures;

  // 始まり：連符の途中なら、その連符の最初の音まで戻す
  const startNotes = measures[target.start.measure].notes;
  const startGroup = tupletGroups(startNotes).find((g) => g.start <= target.start.note && target.start.note <= g.end);
  const startNote = startGroup ? startGroup.start : target.start.note;

  // 終わり：連符の途中なら、その連符の最後の音まで進める
  const endNotes = measures[target.end.measure].notes;
  const endGroup = tupletGroups(endNotes).find((g) => g.start <= target.end.note && target.end.note <= g.end);
  const endNote = endGroup ? endGroup.end : target.end.note;

  return {
    part: target.part,
    start: { measure: target.start.measure, note: startNote },
    end: { measure: target.end.measure, note: endNote },
  };
}

// ----------------------------------------------------------
// 関数：copyNotes
// 範囲（範囲がなければ選んでいる1つの音）の音を、コピーして配列にする
//   range     … 選んでいる範囲（なければ null）
//   selection … 選んでいる場所
// ・範囲が連符の途中までなら、連符全体をコピーする（ステップ10-4）
// ・最後の音から出ているタイは外す（コピーしていない音へのタイなので）
// ・相手がコピーの中にないスラー・松葉は外す
// 戻り値：音の配列（何も選んでいないときは null）
// ----------------------------------------------------------
export function copyNotes(score, range, selection) {
  const target = expandToTuplets(score, range, selection);
  if (!target) return null;

  // 範囲の音を、前から順にコピーする
  const notes = positionsInRange(score, target).map((pos) => {
    const note = score.parts[pos.part].measures[pos.measure].notes[pos.note];
    return JSON.parse(JSON.stringify(note));
  });

  // 最後の音のタイは外す
  const last = notes[notes.length - 1];
  if (last.tie) last.tie = false;

  // 相手のいないスラー・松葉を外す（cleanSpanners はパートの形を受け取るので、1小節のパートの形にして渡す）
  cleanSpanners({ measures: [{ notes: notes }] });

  return notes;
}

// ----------------------------------------------------------
// 関数：measureStartTicks
// 各小節が、曲の頭から何ティック目に始まるかの配列を返す（最後に、曲全体の長さも付ける）
// 例：4分の4拍子が3小節 → [0, 1小節分, 2小節分, 3小節分]（ティック）
// ----------------------------------------------------------
function measureStartTicks(score) {
  const starts = [0];
  for (let m = 0; m < score.measures.length; m++) {
    starts.push(starts[m] + measureTicks(timeAt(score, m)));
  }
  return starts;
}

// ----------------------------------------------------------
// 関数：splitTicks
// 長さを、1つの音符で書ける長さの組み合わせに分ける（長いものから順に使う）
// 例：16分音符5個分 → 4分音符＋16分音符、16分音符7個分 → 付点4分音符＋16分音符
// 戻り値：NOTE_VALUES の中身の配列
// ----------------------------------------------------------
function splitTicks(length) {
  const values = [];
  let rest = length;
  while (rest > 0) {
    const value = NOTE_VALUES.find((v) => v.ticks <= rest);
    values.push(value);
    rest = rest - value.ticks;
  }
  return values;
}

// ----------------------------------------------------------
// 関数：plainNote
// 分けた2つ目からの音符を作る（高さと長さだけ。記号は最初の音符にだけ残すため）
// 重音なら、重ねる音（chord）も同じにする（ステップ14-1）
// ----------------------------------------------------------
function plainNote(note, value) {
  const piece = { pitch: { ...note.pitch }, duration: value.duration, dots: value.dots, tie: false };
  if (note.chord) piece.chord = note.chord.map((pitch) => ({ ...pitch }));
  return piece;
}

// ----------------------------------------------------------
// 関数：pasteNotes
// 選んでいる音の頭から、コピーした音を貼り付ける（上書き）
//   selection … 貼り付ける場所（この音の頭から貼る）
//   clip      … copyNotes で作った音の配列
// 戻り値：{ score: 新しい楽譜データ, start: 貼り付けた最初の場所, end: 貼り付けた最後の場所, error: "" }
//         貼り付けられないときは { score: 元の楽譜データ, error: 知らせる文 }（ステップ10-4）
// ----------------------------------------------------------
export function pasteNotes(score, selection, clip) {
  // 連符の途中（2つ目から）には貼り付けられない（ステップ10-4）
  const selectedGroup = tupletGroups(score.parts[selection.part].measures[selection.measure].notes).find((g) => g.start <= selection.note && selection.note <= g.end);
  if (selectedGroup && selectedGroup.start !== selection.note) {
    return { score: score, error: "連符の途中には貼り付けられません。連符の最初の音を選んでください" };
  }

  let newScore = cloneScore(score);

  // ① 貼り付ける所の頭と終わり（曲の頭から何ティック目か）
  let starts = measureStartTicks(newScore);
  const measureNotes = newScore.parts[selection.part].measures[selection.measure].notes;
  let offset = 0; // 選んでいる音が、小節の頭から何ティック目か
  for (let k = 0; k < selection.note; k++) offset = offset + noteTicks(measureNotes[k]);
  const pasteStart = starts[selection.measure] + offset;
  const pasteLength = clip.reduce((sum, note) => sum + noteTicks(note), 0);
  const pasteEnd = pasteStart + pasteLength;

  // ② 曲の長さが足りなければ、小節を足す（全パート）
  while (starts[starts.length - 1] < pasteEnd) {
    newScore = appendMeasure(newScore);
    starts = measureStartTicks(newScore);
  }

  // ②-2 貼り付ける連符が、小節線をまたがないか調べる（ステップ10-4）
  let clipPosition = pasteStart;
  const clipStarts = clip.map((note) => {
    const start = clipPosition;
    clipPosition = clipPosition + noteTicks(note);
    return start;
  });
  for (const group of tupletGroups(clip)) {
    const groupStart = clipStarts[group.start];
    const groupEnd = clipStarts[group.end] + noteTicks(clip[group.end]);
    // 連符の始まりと終わりの間に、小節の区切りがあったらまたいでいる
    if (starts.some((s) => s > groupStart && s < groupEnd)) {
      return { score: score, error: "連符が小節線をまたぐので、ここには貼り付けられません" };
    }
  }

  const part = newScore.parts[selection.part];

  // ③ 貼り付ける所の直前の音から出ていたタイを外す（違う音につながってしまうため）
  if (selection.note > 0) {
    const before = part.measures[selection.measure].notes[selection.note - 1];
    if (before.tie) before.tie = false;
  } else if (selection.measure > 0) {
    const prevNotes = part.measures[selection.measure - 1].notes;
    const before = prevNotes[prevNotes.length - 1];
    if (before.tie) before.tie = false;
  }

  // ④ 作り直す小節の範囲（貼り付ける所にかかる小節）
  const firstMeasure = selection.measure;
  let lastMeasure = firstMeasure;
  while (starts[lastMeasure + 1] < pasteEnd) lastMeasure = lastMeasure + 1;

  // ⑤ その小節の音を「時間の並び」にする
  //    event = { start: 曲の頭から何ティック目か, length: 長さ, note: 音のデータ, kind: 種類 }
  //    kind … "keep"（元の音をそのまま）・"paste"（貼り付ける音）・"rest"（休符で埋める所）
  const events = [];
  for (let m = firstMeasure; m <= lastMeasure; m++) {
    const measureNotes = part.measures[m].notes;
    // 音ごとの始まり（曲の頭から何ティック目か）と、この小節の連符（ステップ10-4）
    let notePosition = starts[m];
    const noteStarts = measureNotes.map((note) => {
      const start = notePosition;
      notePosition = notePosition + noteTicks(note);
      return start;
    });
    const groups = tupletGroups(measureNotes);

    let position = starts[m];
    measureNotes.forEach((note, j) => {
      const length = noteTicks(note);
      const end = position + length;

      // 連符の中の音：連符まるごとで決める（ステップ10-4）
      const group = groups.find((g) => g.start <= j && j <= g.end);
      if (group) {
        const groupStart = noteStarts[group.start];
        const groupEnd = noteStarts[group.end] + noteTicks(measureNotes[group.end]);
        if (groupEnd <= pasteStart || groupStart >= pasteEnd) {
          // 貼り付ける所にかからない連符：そのまま
          events.push({ start: position, length: length, note: note, kind: "keep" });
        } else if (j === group.start && groupEnd > pasteEnd) {
          // 貼り付ける所にかかる連符はまるごと消す。後ろにはみ出す分は休符にする（連符の最初の音のときに1回だけ）
          events.push({ start: pasteEnd, length: groupEnd - pasteEnd, note: null, kind: "rest" });
        }
        position = end;
        return;
      }

      if (end <= pasteStart || position >= pasteEnd) {
        // 貼り付ける所の外：そのまま
        events.push({ start: position, length: length, note: note, kind: "keep" });
      } else if (position < pasteEnd && end > pasteEnd) {
        // 貼り付ける所の終わりで、途中から切れる音：残りを休符にする
        events.push({ start: pasteEnd, length: end - pasteEnd, note: null, kind: "rest" });
      }
      // それ以外（貼り付ける所にすっぽり入る音）は消える
      position = end;
    });
  }
  // 貼り付ける音を置く
  let position = pasteStart;
  clip.forEach((note) => {
    const length = noteTicks(note);
    events.push({ start: position, length: length, note: JSON.parse(JSON.stringify(note)), kind: "paste" });
    position = position + length;
  });
  // 時間の順に並べる
  events.sort((a, b) => a.start - b.start);

  // ⑥ 小節ごとに分け直す
  //    貼り付けた音の、分けた音符（pieces）も覚えておく（タイ・記号・選択のため）
  for (let m = firstMeasure; m <= lastMeasure; m++) {
    const measureStart = starts[m];
    const measureEnd = starts[m + 1];
    const time = timeAt(newScore, m);
    const notes = [];

    events.forEach((event) => {
      // この小節にかかる部分
      const from = Math.max(event.start, measureStart);
      const to = Math.min(event.start + event.length, measureEnd);
      if (from >= to) return; // この小節にはかからない

      if (event.kind === "keep") {
        notes.push(event.note); // 元の音はもともと小節の中に収まっている
      } else if (event.note && event.note.tuplet) {
        // 貼り付ける連符の音：分けずにそのまま置く（小節線をまたがないことは ②-2 で調べてある）（ステップ10-4）
        event.pieces = [{ measure: m, note: notes.length, data: event.note }];
        notes.push(event.note);
      } else if (event.kind === "rest" || event.note.rest) {
        // 休符：その部分を1拍ずつの休符で埋める
        const rests = restsForSpan(from - measureStart, to - from, time);
        if (event.kind === "paste") {
          // 貼り付けた休符も、選ぶときのために場所を覚えておく
          event.pieces = event.pieces ?? [];
          rests.forEach((rest, i) => {
            event.pieces.push({ measure: m, note: notes.length + i, data: rest });
          });
        }
        notes.push(...rests);
      } else {
        // 音符：書ける長さに分けて並べる
        event.pieces = event.pieces ?? [];
        splitTicks(to - from).forEach((value) => {
          const isFirst = event.pieces.length === 0;
          const piece = isFirst ? { ...event.note, duration: value.duration, dots: value.dots } : plainNote(event.note, value);
          event.pieces.push({ measure: m, note: notes.length, data: piece });
          notes.push(piece);
        });
      }
    });

    part.measures[m].notes = notes;
  }

  // ⑦ 分けた音符をタイでつなぎ、スラー・松葉の「ここまで」を最後の音符に移す
  events.forEach((event) => {
    if (event.kind !== "paste" || event.note.rest || event.pieces.length < 2) return;
    const pieces = event.pieces.map((p) => p.data);
    const first = pieces[0];
    const last = pieces[pieces.length - 1];
    pieces.forEach((piece, i) => {
      if (i < pieces.length - 1) piece.tie = true; // 次の音符とタイでつなぐ
    });
    last.tie = event.note.tie ?? false; // 最後は、元の音のタイのまま
    ["slur", "wedge"].forEach((field) => {
      if (first[field] === "stop") {
        delete first[field];
        last[field] = "stop";
      }
    });
    // グリッサンドは、分けた音の最後の部分から次の音へすべらせる（ステップ11-5a）
    // （最初の部分のままだと、タイでつながった同じ高さの音へ線を引いてしまう）
    if (first.glissando) {
      delete first.glissando;
      last.glissando = true;
    }
  });

  // ⑧ 相手のいなくなったスラー・松葉を外す
  cleanSpanners(part);

  // ⑨ 貼り付けた最初と最後の場所
  const pasted = events.filter((event) => event.kind === "paste");
  const firstPiece = pasted[0].pieces[0];
  const lastPieces = pasted[pasted.length - 1].pieces;
  const lastPiece = lastPieces[lastPieces.length - 1];

  return {
    score: newScore,
    start: { part: selection.part, measure: firstPiece.measure, note: firstPiece.note },
    end: { part: selection.part, measure: lastPiece.measure, note: lastPiece.note },
    error: "",
  };
}
