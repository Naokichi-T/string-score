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

import { durationToTicks, noteTicks, timeAt, keyAt, tempoAt, measureTicks, restsForSpan, INSTRUMENTS, renameParts, tupletGroups, createPartId } from "./model.js";
import { ARTICULATIONS, STRING_MARKS, TECHNIQUES } from "./symbols.js";
import { positionsInRange } from "./selection.js";
import { keyAlters } from "./accidentals.js";

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
// （ティック = 長さの単位。16分音符1つ = TICKS_PER_16TH ティック。model.js を参照）
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
  // 連符の中の音は、長さを変えずに高さだけ入れ替えるので、いつでも置ける（ステップ10-2）
  if (notes[selection.note].tuplet) return true;

  const total = measureTicks(timeAt(score, selection.measure)); // 1小節の長さ
  const start = noteStart(notes, selection.note); // 選んでいる音の始まり
  return start + durationToTicks(duration, dots) <= total;
}

// ----------------------------------------------------------
// 関数：replaceAt
// 選んでいる場所に新しい音（休符）を置く（上書き）
//   ・新しい音が前より短い → 余った分を休符で埋める
//   ・新しい音が前より長い → 後ろの音を上書きする（上書きしきれなかった分は休符になる）
//   ・選んでいる音が連符の中 → 長さと連符はそのままで、高さ（音符か休符か）だけ入れ替える（ステップ10-2）
// 置ける長さかどうかは、先に canFit で調べておくこと
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function replaceAt(score, selection, newNote) {
  const old = score.parts[selection.part].measures[selection.measure].notes[selection.note];

  // 連符の中の音：長さ・付点・連符は前の音のまま（ステップ10-2）
  if (old.tuplet) {
    const newScore = cloneScore(score);
    const notes = newScore.parts[selection.part].measures[selection.measure].notes;
    notes[selection.note] = { ...newNote, duration: old.duration, dots: 0, tuplet: { ...old.tuplet } };
    return newScore;
  }

  return replaceWith(score, selection, [newNote]);
}

// ----------------------------------------------------------
// 関数：replaceWith
// 選んでいる音の頭から、いくつかの音（休符）を並べて置く（上書き）（ステップ10-2：replaceAt から分けた）
//   newNotes … 置く音の配列（連符を作るときは、連符の音を全部まとめて渡す）
//   ・置いた音の終わりから、残す音の始まりまでを休符で埋める
//   ・置いた音が連符の途中までかかったときは、その連符を丸ごと休符にする
//     （連符の一部だけが残ると、連符の数がそろわなくなるため）
// 置ける長さかどうかは、先に調べておくこと
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function replaceWith(score, selection, newNotes) {
  const newScore = cloneScore(score);
  const measure = newScore.parts[selection.part].measures[selection.measure];
  const notes = measure.notes;
  const total = measureTicks(timeAt(newScore, selection.measure));

  const start = noteStart(notes, selection.note); // 置く音の始まり
  const length = newNotes.reduce((sum, note) => sum + noteTicks(note), 0); // 置く音の長さの合計
  const end = start + length; // 置く音の終わり

  // 新しい音より前の音は、そのまま残す
  const before = notes.slice(0, selection.note);

  // 置く音の終わりより後ろで始まる音は、そのまま残す
  // ただし、置く音にかかった連符の残りの音は残さない
  const groups = tupletGroups(notes);
  const after = [];
  let firstAfterStart = total; // 残す音のうち、一番前の音の始まり（なければ小節の終わり）
  let position = 0;
  notes.forEach((note, j) => {
    // この音が入っている連符の最初の音が、置く音の終わりより前に始まっているか
    const group = groups.find((g) => g.start <= j && j <= g.end);
    const cutTuplet = group && noteStart(notes, group.start) < end;
    if (position >= end && !cutTuplet) {
      if (after.length === 0) firstAfterStart = position;
      after.push(note);
    }
    position = position + noteTicks(note);
  });

  // 置く音の終わりから、残す音の始まりまでのすき間を休符で埋める
  const fill = restsForSpan(end, firstAfterStart - end, timeAt(newScore, selection.measure));

  measure.notes = [...before, ...newNotes, ...fill, ...after];
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

// ==========================================================
// ここから下は、選んでいる音を編集する関数（ステップ4-3）
// ==========================================================

// ドからの半音の数（ド=0、レ=2、ミ=4 …）
const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 半音ごとの音名（♯で呼ぶとき）。添え字はドからの半音の数
const SHARP_NAMES = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
];

// 半音ごとの音名（♭で呼ぶとき）
const FLAT_NAMES = [
  { step: "C", alter: 0 },
  { step: "D", alter: -1 },
  { step: "D", alter: 0 },
  { step: "E", alter: -1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "G", alter: -1 },
  { step: "G", alter: 0 },
  { step: "A", alter: -1 },
  { step: "A", alter: 0 },
  { step: "B", alter: -1 },
  { step: "B", alter: 0 },
];

// 高さを変えられる範囲（MIDI の番号。ド1 = 24、ド8 = 108）
const LOWEST_MIDI = 24;
const HIGHEST_MIDI = 108;

// ----------------------------------------------------------
// 関数：pitchToMidi
// 音の高さを MIDI の番号にする（ド4 = 60。半音上がるごとに 1 増える）
// ----------------------------------------------------------
function pitchToMidi(pitch) {
  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
}

// ----------------------------------------------------------
// 関数：midiToPitch
// MIDI の番号を音の高さにする
//   key … 調号（♭の調なら♭で、それ以外は♯で呼ぶ。鍵盤の黒鍵と同じ決まり）
// ----------------------------------------------------------
function midiToPitch(midi, key) {
  const names = key < 0 ? FLAT_NAMES : SHARP_NAMES;
  const name = names[((midi % 12) + 12) % 12];
  return { step: name.step, alter: name.alter, octave: Math.floor(midi / 12) - 1 };
}

// ----------------------------------------------------------
// 関数：updateNote
// 選んでいる音だけを書き換えた、新しい楽譜データを作る
//   change … 音のデータ（コピー）を受け取って書き換える関数
// ----------------------------------------------------------
function updateNote(score, selection, change) {
  const newScore = cloneScore(score);
  const notes = newScore.parts[selection.part].measures[selection.measure].notes;
  change(notes[selection.note]);
  return newScore;
}

// ----------------------------------------------------------
// 関数：transposeNote
// 選んでいる音の高さを変える
//   semitones … 変える半音の数（1 なら半音上、-1 なら半音下、12 なら1オクターブ上）
// 1オクターブ（±12）のときは、音名を変えずにオクターブだけ変える
// 戻り値：新しい楽譜データ（休符や、範囲の外に出るときは元の楽譜データのまま）
// ----------------------------------------------------------
export function transposeNote(score, selection, semitones) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return score;

  const midi = pitchToMidi(note.pitch) + semitones;
  if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) return score; // 範囲の外には出さない

  return updateNote(score, selection, (n) => {
    if (Math.abs(semitones) === 12) {
      // オクターブだけ変える（音名と♯♭はそのまま）
      n.pitch.octave = n.pitch.octave + semitones / 12;
    } else {
      // 半音ずつ：調に合わせて♯か♭で呼び直す
      n.pitch = midiToPitch(midi, keyAt(score, selection.measure));
    }
  });
}

// ----------------------------------------------------------
// 関数：setAccidental
// 選んでいる音を、その音名の♯・♭・♮にする（例：ミ → ミ♭）
//   alter … 1 なら♯、-1 なら♭、0 なら♮
// 戻り値：新しい楽譜データ（休符なら元の楽譜データのまま）
// ----------------------------------------------------------
export function setAccidental(score, selection, alter) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return score;
  return updateNote(score, selection, (n) => {
    n.pitch.alter = alter;
  });
}

// ----------------------------------------------------------
// 関数：deleteNote
// 選んでいる音符を、同じ長さの休符にする（小節の長さは変わらない）
// 戻り値：新しい楽譜データ（もともと休符なら元の楽譜データのまま）
// ----------------------------------------------------------
export function deleteNote(score, selection) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return score;

  const newScore = cloneScore(score);
  const notes = newScore.parts[selection.part].measures[selection.measure].notes;
  // 長さだけ残して休符にする（記号やタイは消える）
  // 連符の中の音なら、連符の印も残す（ステップ10-3）
  notes[selection.note] = { rest: true, duration: note.duration, dots: note.dots ?? 0, ...(note.tuplet ? { tuplet: { ...note.tuplet } } : {}) };
  return newScore;
}

// ----------------------------------------------------------
// 関数：findNext
// 選んでいる音の「次の音」の場所を返す（小節をまたいでもよい）
// 最後の小節の最後の音なら null（小節は足さない）
// ----------------------------------------------------------
function findNext(score, selection) {
  const measures = score.parts[selection.part].measures;
  if (selection.note + 1 < measures[selection.measure].notes.length) {
    return { ...selection, note: selection.note + 1 };
  }
  if (selection.measure + 1 < measures.length) {
    return { ...selection, measure: selection.measure + 1, note: 0 };
  }
  return null;
}

// ----------------------------------------------------------
// 関数：toggleTie
// 選んでいる音と、次の音をタイでつなぐ（つながっていれば外す）
//   ・次が同じ高さの音 → タイを付ける・外す
//   ・次が休符 → その休符を同じ高さの音に変えて、タイでつなぐ
//   ・次が違う高さの音 → つなげない
// 戻り値：{ score: 新しい楽譜データ, error: 知らせる文（うまくいったときは空の文字） }
// ----------------------------------------------------------
export function toggleTie(score, selection) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return { score: score, error: "休符にはタイを付けられません" };

  // すでにタイが付いていれば外す
  if (note.tie) {
    return {
      score: updateNote(score, selection, (n) => {
        n.tie = false;
      }),
      error: "",
    };
  }

  const next = findNext(score, selection);
  if (!next) return { score: score, error: "最後の音なので、つなぐ相手がありません" };

  const nextNote = score.parts[next.part].measures[next.measure].notes[next.note];

  if (nextNote.rest) {
    // 次の休符を同じ高さの音にして、タイでつなぐ
    const newScore = cloneScore(score);
    const notes = newScore.parts[selection.part].measures[selection.measure].notes;
    notes[selection.note].tie = true;
    delete notes[selection.note].glissando; // タイを付けたら、グリッサンドは外す（ステップ11-5a）
    const nextNotes = newScore.parts[next.part].measures[next.measure].notes;
    nextNotes[next.note] = {
      pitch: { ...note.pitch },
      duration: nextNote.duration,
      dots: nextNote.dots ?? 0,
      tie: false,
      // 次の休符が連符の中なら、連符の印も残す（ステップ10-3）
      ...(nextNote.tuplet ? { tuplet: { ...nextNote.tuplet } } : {}),
    };
    return { score: newScore, error: "" };
  }

  if (pitchToMidi(nextNote.pitch) !== pitchToMidi(note.pitch)) {
    return { score: score, error: "次の音が違う高さなので、タイを付けられません" };
  }

  return {
    score: updateNote(score, selection, (n) => {
      n.tie = true;
      delete n.glissando; // タイを付けたら、グリッサンドは外す（ステップ11-5a）
    }),
    error: "",
  };
}

// ==========================================================
// ここから下は、挿入モードの関数（ステップ4-4）
// 挿入モードでは、後ろの音を右にずらしたり左に詰めたりする
// ずらせる量は「小節の終わりに続いている休符」の分だけ
// （まん中の休符はわざと入れたものかもしれないので、詰めない）
// ==========================================================

// ----------------------------------------------------------
// 関数：contentCount
// 小節の音の並びのうち、「終わりに続く休符」より前にある音の数を返す
// 例：[ド, 休, レ, 休, 休] → 3（ド・休・レ。最後の2つの休符は数えない）
// 連符の中の休符は「終わりに続く休符」に入れない（取りのぞくと連符の数がそろわなくなるため）（ステップ10-3）
// ----------------------------------------------------------
function contentCount(notes) {
  let count = notes.length;
  while (count > 0 && notes[count - 1].rest && !notes[count - 1].tuplet) {
    count = count - 1;
  }
  return count;
}

// ----------------------------------------------------------
// 関数：rebuildMeasure
// 小節の中身を「並べたい音」で作り直し、残りを休符で埋める
//   contents … 並べたい音の配列（頭から順に）
//   time     … その小節の拍子
// 戻り値：作り直した音の配列（小節に入りきらないときは null）
// ----------------------------------------------------------
function rebuildMeasure(contents, time) {
  const total = measureTicks(time);
  const used = contents.reduce((sum, note) => sum + noteTicks(note), 0);
  if (used > total) return null; // 入りきらない
  return [...contents, ...restsForSpan(used, total - used, time)];
}

// ----------------------------------------------------------
// 関数：insertedContents
// 選んでいる音の前に新しい音を入れたときの「並べたい音」を作る
// （終わりに続く休符は取りのぞく。あとで rebuildMeasure が埋め直す）
// ----------------------------------------------------------
function insertedContents(notes, index, newNote) {
  const count = contentCount(notes);
  const before = notes.slice(0, index); // 選んでいる音より前
  const after = index < count ? notes.slice(index, count) : []; // 選んでいる音から、終わりの休符の前まで
  return [...before, newNote, ...after];
}

// ----------------------------------------------------------
// 関数：resizedContents
// 選んでいる音の長さを変えたときの「並べたい音」を作る（後ろの音はずれる）
// ----------------------------------------------------------
function resizedContents(notes, index, newNote) {
  const count = contentCount(notes);
  const before = notes.slice(0, index);
  const after = index + 1 < count ? notes.slice(index + 1, count) : [];
  return [...before, newNote, ...after];
}

// ----------------------------------------------------------
// 関数：canInsert
// 選んでいる音の前に、この長さの音を挿入できるか調べる
// ----------------------------------------------------------
export function canInsert(score, selection, duration, dots) {
  if (!selection) return false;
  if (duration === "16th" && dots > 0) return false;
  const notes = score.parts[selection.part].measures[selection.measure].notes;
  // 連符の中には挿入できない（連符の数がそろわなくなるため）（ステップ10-2）
  if (notes[selection.note].tuplet) return false;
  const newNote = { rest: true, duration: duration, dots: dots }; // 長さを調べるだけなので休符で代用
  const contents = insertedContents(notes, selection.note, newNote);
  return rebuildMeasure(contents, timeAt(score, selection.measure)) !== null;
}

// ----------------------------------------------------------
// 関数：canResize
// 選んでいる音の長さを変えて、後ろをずらせるか調べる
// ----------------------------------------------------------
export function canResize(score, selection, duration, dots) {
  if (!selection) return false;
  if (duration === "16th" && dots > 0) return false;
  const notes = score.parts[selection.part].measures[selection.measure].notes;
  // 連符の中の音の長さは変えられない（ステップ10-2）
  if (notes[selection.note].tuplet) return false;
  const newNote = { ...notes[selection.note], duration: duration, dots: dots };
  const contents = resizedContents(notes, selection.note, newNote);
  return rebuildMeasure(contents, timeAt(score, selection.measure)) !== null;
}

// ----------------------------------------------------------
// 関数：insertAt
// 選んでいる音の前に新しい音（休符）を挿入する。後ろの音は右にずれる
// 戻り値：{ score: 新しい楽譜データ, selection: 新しい選択中の場所, error: 知らせる文 }
//   選択は「もともと選んでいた音」（右にずれた位置）のままにする
// ----------------------------------------------------------
export function insertAt(score, selection, newNote) {
  const notes = score.parts[selection.part].measures[selection.measure].notes;
  const contents = insertedContents(notes, selection.note, newNote);
  const rebuilt = rebuildMeasure(contents, timeAt(score, selection.measure));
  if (!rebuilt) {
    return { score: score, selection: selection, error: "この小節には空きがありません" };
  }

  const newScore = cloneScore(score);
  newScore.parts[selection.part].measures[selection.measure].notes = rebuilt;

  // 選んでいた音は1つ右にずれる
  const shifted = { ...selection, note: selection.note + 1 };
  if (shifted.note < rebuilt.length) {
    return { score: newScore, selection: shifted, error: "" };
  }
  // 小節の最後まで埋まったときは、次の小節へ（最後の小節なら小節を足す）
  const next = nextPosition(newScore, selection);
  return { score: next.score, selection: next.selection, error: "" };
}

// ----------------------------------------------------------
// 関数：resizeAt
// 選んでいる音の長さを変える。後ろの音は右にずれる・左に詰まる
// 戻り値：{ score: 新しい楽譜データ, error: 知らせる文 }
// ----------------------------------------------------------
export function resizeAt(score, selection, duration, dots) {
  const notes = score.parts[selection.part].measures[selection.measure].notes;
  const newNote = { ...JSON.parse(JSON.stringify(notes[selection.note])), duration: duration, dots: dots };
  const contents = resizedContents(notes, selection.note, newNote);
  const rebuilt = rebuildMeasure(contents, timeAt(score, selection.measure));
  if (!rebuilt) {
    return { score: score, error: "この小節には空きがありません" };
  }
  const newScore = cloneScore(score);
  newScore.parts[selection.part].measures[selection.measure].notes = rebuilt;
  return { score: newScore, error: "" };
}

// ==========================================================
// ここから下は、記号を付ける・外す関数（ステップ4-5）
// ==========================================================

// ----------------------------------------------------------
// 関数：toggleInList
// 並び（配列）に値があれば外し、なければ最後に足した新しい並びを返す
// 例：([1, 2], 2) → [1]、([1], 3) → [1, 3]
// ----------------------------------------------------------
function toggleInList(list, value) {
  const current = list ?? [];
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  return [...current, value];
}

// ----------------------------------------------------------
// 関数：canGlissando
// 選んでいる音にグリッサンドを付けられるか調べる（ステップ11-5a）
// 次のときだけ付けられる
//   ・選んでいるのが音符（休符ではない）
//   ・タイが付いていない（タイは同じ高さどうしをつなぐので、いっしょには使わない）
//   ・次の音がある（小節をまたいでもよい）
//   ・次の音が休符ではない
// 戻り値：true / false
// ----------------------------------------------------------
export function canGlissando(score, selection) {
  if (!selection) return false;
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest || note.tie) return false;
  const next = findNext(score, selection);
  if (!next) return false; // 最後の音
  const nextNote = score.parts[next.part].measures[next.measure].notes[next.note];
  return !nextNote.rest;
}

// ----------------------------------------------------------
// 関数：toggleNoteSymbol
// 選んでいる音符に記号を付ける（すでに付いていれば外す）
//   kind  … 記号の種類
//            'bowing'（弓）・'fingering'（指番号）・'articulation'（スタッカートなど）
//            'fermata'（フェルマータ）・'technique'（奏法）・'dynamic'（強弱）
//            'stringMark'（ハーモニクス・左手ピチカートなど）（ステップ11-1b）
//            'breath'（ブレス・カエスーラ）（ステップ11-1c）
//            'ornament'（トリルなどの装飾）（ステップ11-3a）
//            'tremolo'（トレモロ。value は斜線の本数）（ステップ11-4）
//   value … 記号の名前や数字（'down'・2・'staccato' など。フェルマータは使わない）
// 1つだけのもの（弓・強弱・ブレスとカエスーラ・装飾・トレモロ）は、別のものを押すと入れ替わる
// 装飾とトレモロは、1つの音にどちらか1つだけ（片方を付けると、もう片方は外れる）
// 戻り値：新しい楽譜データ（休符なら元の楽譜データのまま）
// ----------------------------------------------------------
export function toggleNoteSymbol(score, selection, kind, value) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return score;

  // グリッサンド（kind が 'glissando'）：付いていれば外す、なければ付ける（ステップ11-5a）
  // 付けるのは、canGlissando で付けられるときだけ（外すのはいつでもできる）
  if (kind === "glissando") {
    if (!note.glissando && !canGlissando(score, selection)) return score;
    return updateNote(score, selection, (n) => {
      if (n.glissando) {
        delete n.glissando;
      } else {
        n.glissando = true;
      }
    });
  }

  return updateNote(score, selection, (n) => {
    if (kind === "bowing") {
      // 弓：同じものなら外す、違うものなら入れ替える
      if (n.bowing === value) {
        delete n.bowing;
      } else {
        n.bowing = value;
      }
    } else if (kind === "breath") {
      // ブレス・カエスーラ：同じものなら外す、違うものなら入れ替える（ステップ11-1c）
      if (n.breath === value) {
        delete n.breath;
      } else {
        n.breath = value;
      }
    } else if (kind === "ornament") {
      // 装飾：同じものなら外す、違うものなら入れ替える（ステップ11-3a）
      if (n.ornament === value) {
        delete n.ornament;
      } else {
        n.ornament = value;
        delete n.tremolo; // トレモロは外す（ステップ11-4）
      }
    } else if (kind === "tremolo") {
      // トレモロ：同じ本数なら外す、違う本数なら入れ替える（ステップ11-4）
      if (n.tremolo === value) {
        delete n.tremolo;
      } else {
        n.tremolo = value;
        delete n.ornament; // 装飾は外す
      }
    } else if (kind === "dynamic") {
      // 強弱：同じものなら外す、違うものなら入れ替える
      if (n.dynamic === value) {
        delete n.dynamic;
      } else {
        n.dynamic = value;
      }
    } else if (kind === "fermata") {
      // フェルマータ：付いていれば外す、なければ付ける
      if (n.fermata) {
        delete n.fermata;
      } else {
        n.fermata = true;
      }
    } else if (kind === "fingering") {
      // 指番号：いくつでも付けられる
      n.fingerings = toggleInList(n.fingerings, value);
      if (n.fingerings.length === 0) delete n.fingerings;
    } else if (kind === "articulation") {
      // スタッカートなど：いくつでも付けられるが、同じ group のもの（スタッカートとスタッカーティシモ、アクセントとマルカート）は1つだけ（ステップ11-1a）
      const adding = !(n.articulations ?? []).includes(value);
      let list = toggleInList(n.articulations, value);
      if (adding) {
        const group = ARTICULATIONS[value]?.group;
        // 同じ group の別の記号を外す（group がない記号は何も外さない）
        list = list.filter((name) => name === value || !group || ARTICULATIONS[name]?.group !== group);
      }
      n.articulations = list;
      if (n.articulations.length === 0) delete n.articulations;
    } else if (kind === "stringMark") {
      // 弦楽器の記号：いくつでも付けられるが、同じ group のもの（左手ピチカートとバルトーク・ピチカート）は1つだけ（ステップ11-1b）
      const adding = !(n.stringMarks ?? []).includes(value);
      let list = toggleInList(n.stringMarks, value);
      if (adding) {
        const group = STRING_MARKS[value]?.group;
        // 同じ group の別の記号を外す（group がない記号は何も外さない）
        list = list.filter((name) => name === value || !group || STRING_MARKS[name]?.group !== group);
      }
      n.stringMarks = list;
      if (n.stringMarks.length === 0) delete n.stringMarks;
    } else if (kind === "technique") {
      // 奏法：いくつでも付けられるが、同じ group のもの（pizz. と arco）は1つだけ
      const adding = !(n.techniques ?? []).includes(value);
      let list = toggleInList(n.techniques, value);
      if (adding) {
        const group = TECHNIQUES[value]?.group;
        // 同じ group の別の奏法を外す
        list = list.filter((name) => name === value || !group || TECHNIQUES[name]?.group !== group);
      }
      n.techniques = list;
      if (n.techniques.length === 0) delete n.techniques;
    }
  });
}

// ==========================================================
// ここから下は、スラー・松葉を付ける・外す関数（ステップ4-6）
// ==========================================================

// ----------------------------------------------------------
// 関数：spanEnds
// 範囲の中で、最初の音符と最後の音符（休符は飛ばす）の場所を返す
// 戻り値：{ first, last, inner }（音符が2つ未満なら null）
//   inner … 最初と最後の間にある音符の場所の並び
// ----------------------------------------------------------
function spanEnds(score, range) {
  const notes = positionsInRange(score, range).filter((pos) => {
    const note = score.parts[pos.part].measures[pos.measure].notes[pos.note];
    return !note.rest;
  });
  if (notes.length < 2) return null;
  return { first: notes[0], last: notes[notes.length - 1], inner: notes.slice(1, -1) };
}

// ----------------------------------------------------------
// 関数：canSpan
// 範囲にスラー・松葉を付けられるか（音符が2つ以上あるか）調べる
// ----------------------------------------------------------
export function canSpan(score, range) {
  return !!range && spanEnds(score, range) !== null;
}

// ----------------------------------------------------------
// 関数：getSpanState
// 範囲の最初と最後の音符に、どのスラー・松葉が付いているかを調べる（ボタンを青くするため）
// 戻り値：{ slur: true / false, wedge: 'crescendo' / 'diminuendo' / null }
// ----------------------------------------------------------
export function getSpanState(score, range) {
  const ends = range ? spanEnds(score, range) : null;
  if (!ends) return { slur: false, wedge: null };
  const noteAt = (pos) => score.parts[pos.part].measures[pos.measure].notes[pos.note];
  const first = noteAt(ends.first);
  const last = noteAt(ends.last);
  return {
    slur: first.slur === "start" && last.slur === "stop",
    wedge: last.wedge === "stop" ? (first.wedge ?? null) : null,
  };
}

// ----------------------------------------------------------
// 関数：toggleSpanner
// 範囲にスラーか松葉を付ける（同じものがすでに付いていれば外す）
//   kind … 'slur'（スラー）・'crescendo'（＜）・'diminuendo'（＞）
// 範囲の最初の音符に「ここから」、最後の音符に「ここまで」の印を付ける
// 間の音符に付いていた同じ種類の印は消す（重なってわかりにくくならないように）
// 戻り値：新しい楽譜データ（付けられないときは元の楽譜データのまま）
// ----------------------------------------------------------
export function toggleSpanner(score, range, kind) {
  const ends = spanEnds(score, range);
  if (!ends) return score;

  const field = kind === "slur" ? "slur" : "wedge"; // データのどの項目を使うか
  const startValue = kind === "slur" ? "start" : kind; // 「ここから」の印

  const newScore = cloneScore(score);
  const noteAt = (pos) => newScore.parts[pos.part].measures[pos.measure].notes[pos.note];
  const first = noteAt(ends.first);
  const last = noteAt(ends.last);

  // すでに同じものが付いていれば外す
  if (first[field] === startValue && last[field] === "stop") {
    delete first[field];
    delete last[field];
    return newScore;
  }

  // 付ける（間の音符の同じ種類の印は消す）
  ends.inner.forEach((pos) => {
    delete noteAt(pos)[field];
  });
  first[field] = startValue;
  last[field] = "stop";
  return newScore;
}

// ==========================================================
// ここから下は、範囲の音をまとめて変える関数と、音名キーで入れる音を決める関数（ステップ4-7a）
// ==========================================================

// ----------------------------------------------------------
// 関数：rangeHasNotes
// 範囲の中に音符（休符ではない）が1つでもあるか調べる（▲ ▼・削除のボタンを押せるかどうかに使う）
// ----------------------------------------------------------
export function rangeHasNotes(score, range) {
  return positionsInRange(score, range).some((pos) => {
    const note = score.parts[pos.part].measures[pos.measure].notes[pos.note];
    return !note.rest;
  });
}

// ----------------------------------------------------------
// 関数：deleteRange
// 範囲の中の音符を、ぜんぶ同じ長さの休符にする
// 戻り値：新しい楽譜データ（音符が1つもなければ元の楽譜データのまま）
// ----------------------------------------------------------
export function deleteRange(score, range) {
  if (!rangeHasNotes(score, range)) return score;

  const newScore = cloneScore(score);
  positionsInRange(newScore, range).forEach((pos) => {
    const notes = newScore.parts[pos.part].measures[pos.measure].notes;
    const note = notes[pos.note];
    if (note.rest) return; // 休符はそのまま
    // 長さだけ残して休符にする（deleteNote と同じ。記号やタイは消える。連符の印は残す）
    notes[pos.note] = { rest: true, duration: note.duration, dots: note.dots ?? 0, ...(note.tuplet ? { tuplet: { ...note.tuplet } } : {}) };
  });
  return newScore;
}

// ----------------------------------------------------------
// 関数：transposeRange
// 範囲の中の音符を、ぜんぶ同じだけ高さを変える
//   semitones … 変える半音の数（transposeNote と同じ）
// 1つでも範囲の外に出る音があれば、どれも変えない
// 戻り値：新しい楽譜データ（変えられないときは元の楽譜データのまま）
// ----------------------------------------------------------
export function transposeRange(score, range, semitones) {
  // 範囲の中の音符の場所だけを集める
  const positions = positionsInRange(score, range).filter((pos) => {
    return !score.parts[pos.part].measures[pos.measure].notes[pos.note].rest;
  });
  if (positions.length === 0) return score;

  // 先に、ぜんぶの音が範囲の中に収まるかを調べる
  const allInside = positions.every((pos) => {
    const note = score.parts[pos.part].measures[pos.measure].notes[pos.note];
    const midi = pitchToMidi(note.pitch) + semitones;
    return midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI;
  });
  if (!allInside) return score;

  // 1つずつ高さを変える（transposeNote を順番に使う）
  let newScore = score;
  positions.forEach((pos) => {
    newScore = transposeNote(newScore, pos, semitones);
  });
  return newScore;
}

// ----------------------------------------------------------
// 関数：findPreviousPitch
// 選んでいる場所より前にある、いちばん近い音符の高さを探す（休符は飛ばす。小節をまたいでもよい）
// 戻り値：音の高さ { step, alter, octave }（前に音符がなければ null）
// ----------------------------------------------------------
function findPreviousPitch(score, selection) {
  const measures = score.parts[selection.part].measures;
  let measure = selection.measure;
  let note = selection.note - 1;
  while (measure >= 0) {
    const notes = measures[measure].notes;
    for (let j = note; j >= 0; j--) {
      if (!notes[j].rest) return notes[j].pitch;
    }
    // この小節にはなかったので、前の小節の最後の音から探す
    measure = measure - 1;
    if (measure >= 0) note = measures[measure].notes.length - 1;
  }
  return null;
}

// ----------------------------------------------------------
// 関数：pitchForLetter
// 音名キー（C D E F G A B）が押されたときに入れる音の高さを決める
//   step … 音名（"C"〜"B"）
// 決め方：
//   ① ♯♭は調号どおりにする（例：ト長調で F → ファ♯）
//   ② オクターブは、前の音にいちばん近い高さにする
//      前に音がなければ、楽器ごとの真ん中あたり（鍵盤の左はしのドの1オクターブ上）に近い高さにする
//      （バイオリン：ド5、ビオラ：ド4、チェロ：ド3）
//   ちょうど同じ近さのときは、低い方にする
// 戻り値：音の高さ { step, alter, octave }
// ----------------------------------------------------------
export function pitchForLetter(score, selection, step) {
  // ① 調号どおりの♯♭
  const alter = keyAlters(keyAt(score, selection.measure))[step];

  // ② 基準にする高さ（MIDI の番号）
  const previous = findPreviousPitch(score, selection);
  let base;
  if (previous) {
    base = pitchToMidi(previous);
  } else {
    const instrument = score.parts[selection.part].instrument;
    base = pitchToMidi({ step: "C", alter: 0, octave: INSTRUMENTS[instrument].keyboardOctave + 1 });
  }

  // 基準の前後のオクターブを比べて、いちばん近いものを選ぶ
  const baseOctave = Math.floor(base / 12) - 1;
  let best = null;
  for (let octave = baseOctave - 1; octave <= baseOctave + 1; octave++) {
    const pitch = { step: step, alter: alter, octave: octave };
    const midi = pitchToMidi(pitch);
    if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) continue; // 範囲の外は使わない
    const distance = Math.abs(midi - base);
    // 低い方から調べるので、「より近い」ときだけ入れ替えれば、同じ近さなら低い方が残る
    if (best === null || distance < best.distance) {
      best = { pitch: pitch, distance: distance };
    }
  }
  return best.pitch;
}

// ==========================================================
// ここから下は、楽譜全体の設定を変える関数（ステップ5-1）
// ==========================================================

// ----------------------------------------------------------
// 関数：setScoreInfo
// タイトル・作曲者・速度記号・テンポのどれか1つを変える
//   field … 項目の名前（"title"・"composer"・"tempoText"・"tempo"）
//   value … 新しい値（チェックは呼ぶ側で済ませておく）
// 戻り値：新しい楽譜データ（値が変わらないときは元の楽譜データのまま）
// ----------------------------------------------------------
export function setScoreInfo(score, field, value) {
  if (score[field] === value) return score;
  const newScore = cloneScore(score);
  newScore[field] = value;
  return newScore;
}

// ----------------------------------------------------------
// 関数：setTempoChange
// i 小節目の頭から、テンポを変える（ステップ11-6a）
//   i         … 何小節目か（0 から）
//   tempo     … ♩＝○○ の数字（20〜300 のチェックは呼ぶ側で済ませておく）
//   tempoText … 速度記号（"Andante" など。なければ空の文字）
// 1小節目（i が 0）なら、楽譜全体のテンポ（score.tempo・score.tempoText）を変える
// 戻り値：新しい楽譜データ（今のテンポと同じなら元の楽譜データのまま）
// ----------------------------------------------------------
export function setTempoChange(score, i, tempo, tempoText) {
  // 今のテンポ（前の小節から続いているものも含む）と同じなら、何もしない
  const now = tempoAt(score, i);
  if (now.tempo === tempo && now.tempoText === tempoText) return score;

  const newScore = cloneScore(score);
  if (i === 0) {
    newScore.tempo = tempo;
    newScore.tempoText = tempoText;
  } else {
    newScore.measures[i].tempo = tempo;
    if (tempoText) {
      newScore.measures[i].tempoText = tempoText;
    } else {
      delete newScore.measures[i].tempoText; // 速度記号なし
    }
  }
  return newScore;
}

// ----------------------------------------------------------
// 関数：removeTempoChange
// i 小節目のテンポ変更を消す（前の小節のテンポが続くようにする）（ステップ11-6a）
// 1小節目のテンポは消せない（テンポがなくなってしまうため）
// 戻り値：新しい楽譜データ（消すものがなければ元の楽譜データのまま）
// ----------------------------------------------------------
export function removeTempoChange(score, i) {
  if (i === 0 || score.measures[i].tempo === undefined) return score;
  const newScore = cloneScore(score);
  delete newScore.measures[i].tempo;
  delete newScore.measures[i].tempoText;
  return newScore;
}

// ----------------------------------------------------------
// 関数：gradualRanges
// rit.・accel. の範囲を、小節の情報から探して並べる（ステップ11-6b）
// 「ここから」（gradual: "rit" / "accel"）と「ここまで」（gradualEnd: true）の組を、前から順に探す
// （1小節だけの範囲は、同じ小節に両方の印がある）
//   measures … 楽譜全体の小節の情報（score.measures）
// 戻り値：[{ from: 始まりの小節, to: 終わりの小節, type: "rit" か "accel" }, ...]
//         （「ここまで」がない「ここから」・「ここから」がない「ここまで」は入れない）
// ----------------------------------------------------------
export function gradualRanges(measures) {
  const ranges = [];
  let open = null; // 「ここから」があって、まだ「ここまで」が来ていない範囲
  measures.forEach((info, i) => {
    if (info.gradual) open = { from: i, type: info.gradual }; // 新しい「ここから」（前に開いていたものは捨てる）
    if (info.gradualEnd && open) {
      ranges.push({ from: open.from, to: i, type: open.type });
      open = null;
    }
  });
  return ranges;
}

// ----------------------------------------------------------
// 関数：setGradualMarks
// 小節の情報の rit.・accel. の印を、全部消してから、ranges のとおりに付け直す（ステップ11-6b）
//   measures … 楽譜全体の小節の情報（コピーしたものを渡す。中身を書き換える）
//   ranges   … [{ from, to, type }, ...]
// ----------------------------------------------------------
function setGradualMarks(measures, ranges) {
  measures.forEach((info) => {
    delete info.gradual;
    delete info.gradualEnd;
  });
  ranges.forEach((range) => {
    measures[range.from].gradual = range.type;
    measures[range.to].gradualEnd = true;
  });
}

// ----------------------------------------------------------
// 関数：toggleGradual
// from 小節目から to 小節目までに、rit.（だんだん遅く）か accel.（だんだん速く）を付ける（ステップ11-6b）
// from 小節目でもう同じ種類が始まっていたら、その範囲を外す
// 付けるときは、範囲に重なっていた rit.・accel. を外す（重ならないようにする）
//   type … "rit" か "accel"
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function toggleGradual(score, from, to, type) {
  const newScore = cloneScore(score);
  const ranges = gradualRanges(newScore.measures);
  let next;
  if (newScore.measures[from].gradual === type) {
    // 同じ種類がここから始まっている：その範囲を外す
    next = ranges.filter((range) => range.from !== from);
  } else {
    // 重なる範囲を外して、新しい範囲を足す
    next = ranges.filter((range) => range.to < from || range.from > to);
    next.push({ from: from, to: to, type: type });
  }
  setGradualMarks(newScore.measures, next);
  return newScore;
}

// ----------------------------------------------------------
// 関数：toggleATempo
// i 小節目の頭に a tempo（元の速さに戻す）を付ける・外す（ステップ11-6b）
// 1小節目には付けない（戻す先の速さがないため）
// 戻り値：新しい楽譜データ（1小節目なら元の楽譜データのまま）
// ----------------------------------------------------------
export function toggleATempo(score, i) {
  if (i === 0) return score;
  const newScore = cloneScore(score);
  if (newScore.measures[i].aTempo) {
    delete newScore.measures[i].aTempo;
  } else {
    newScore.measures[i].aTempo = true;
  }
  return newScore;
}

// ----------------------------------------------------------
// 関数：setBarline
// i 小節目の「終わり」の線を決める（ステップ11-7a）
//   type … null（ふつう）・"double"（複縦線）・"final"（終止線）
// 小節の終わりには、くり返しの終わり（:‖）か、複縦線・終止線のどちらか1つだけ
// （ふつうにすると、くり返しの終わりも外れる）
// 何も決めていない小節は、今までどおり自動（調が変わる前は複縦線、曲の最後は終止線）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function setBarline(score, i, type) {
  const newScore = cloneScore(score);
  const info = newScore.measures[i];
  delete info.repeatEnd;
  if (type) {
    info.barline = type;
  } else {
    delete info.barline;
  }
  return newScore;
}

// ----------------------------------------------------------
// 関数：toggleRepeatStart
// i 小節目の「頭」に、くり返しの始まり（‖:）を付ける・外す（ステップ11-7a）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function toggleRepeatStart(score, i) {
  const newScore = cloneScore(score);
  const info = newScore.measures[i];
  if (info.repeatStart) {
    delete info.repeatStart;
  } else {
    info.repeatStart = true;
  }
  return newScore;
}

// ----------------------------------------------------------
// 関数：toggleRepeatEnd
// i 小節目の「終わり」に、くり返しの終わり（:‖）を付ける・外す（ステップ11-7a）
// 付けるときは、その小節の複縦線・終止線は外す（小節の終わりの線は1つだけ）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function toggleRepeatEnd(score, i) {
  const newScore = cloneScore(score);
  const info = newScore.measures[i];
  if (info.repeatEnd) {
    delete info.repeatEnd;
  } else {
    info.repeatEnd = true;
    delete info.barline;
  }
  return newScore;
}

// ==========================================================
// ここから下は、小節を足す・消す関数（ステップ5-2）
// ==========================================================

// ----------------------------------------------------------
// 関数：insertMeasure
// 小節を1つ足す（全パートいっしょに。中身は拍子に合わせた休符）
//   index … 足す位置（この番号の小節の前に入る。小節の数と同じなら最後に足す）
// 1小節目の前に足すときは、拍子・調・音部記号を新しい1小節目に移す
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function insertMeasure(score, index) {
  const newScore = cloneScore(score);

  // 足す小節の拍子（前の小節と同じ。1小節目の前なら今の1小節目と同じ）
  const time = timeAt(newScore, Math.max(index - 1, 0));
  const total = measureTicks(time);

  // 楽譜全体の小節の情報
  let info = {};
  if (index === 0) {
    // 1小節目の前：拍子と調を新しい1小節目に移す
    const first = newScore.measures[0];
    info = { time: first.time, key: first.key };
    delete first.time;
    delete first.key;
  }
  newScore.measures.splice(index, 0, info);

  // パートごとの小節
  newScore.parts.forEach((part) => {
    const measure = { notes: restsForSpan(0, total, time) };
    if (index === 0) {
      // 1小節目の前：音部記号を新しい1小節目に移す
      measure.clef = part.measures[0].clef;
      delete part.measures[0].clef;
    }
    part.measures.splice(index, 0, measure);
  });

  return newScore;
}

// ----------------------------------------------------------
// 関数：clefAt
// i 小節目で使われている音部記号を返す（前の小節にさかのぼって探す）
// （ステップ5-5：編集ページでも使うので export した）
// ----------------------------------------------------------
export function clefAt(part, i) {
  for (let k = i; k >= 0; k--) {
    if (part.measures[k].clef) return part.measures[k].clef;
  }
  return "treble";
}

// ----------------------------------------------------------
// 関数：cleanSpanners
// 1つのパートの中で、相手がいなくなったスラー・松葉の印を外す
// （「ここから」だけ・「ここまで」だけが残ると、おかしな所どうしがつながってしまうため）
// （ステップ5-7：コピー＆貼り付けでも使うので export した）
// ----------------------------------------------------------
export function cleanSpanners(part) {
  // 休符ではない音符を、前から順に並べる
  const notes = [];
  part.measures.forEach((measure) => {
    measure.notes.forEach((note) => {
      if (!note.rest) notes.push(note);
    });
  });

  // スラー（"start" と "stop"）と松葉（"crescendo"・"diminuendo" と "stop"）を、同じやり方で調べる
  ["slur", "wedge"].forEach((field) => {
    let open = null; // 「ここから」の印が付いていて、まだ「ここまで」が来ていない音符
    notes.forEach((note) => {
      const value = note[field];
      if (value === undefined) return;
      if (value === "stop") {
        if (open) {
          open = null; // 正しい組になった
        } else {
          delete note[field]; // 「ここから」がない「ここまで」は外す
        }
      } else {
        if (open) delete open[field]; // 前の「ここから」に「ここまで」がなかったので外す
        open = note;
      }
    });
    if (open) delete open[field]; // 最後まで「ここまで」が来なかった「ここから」は外す
  });
}

// ----------------------------------------------------------
// 関数：deleteMeasures
// from 小節目から to 小節目までを消す（全パートいっしょに。番号は 0 から）
// 消すときに、楽譜がおかしくならないように次のことも直す
//   ・消す小節で拍子・調・音部記号が変わっていたら、その変化を次の小節に移す
//   ・消す小節の直前の音から出ていたタイを外す
//   ・片方の端だけ消されたスラー・松葉を外す
// 戻り値：新しい楽譜データ（小節が1つも残らなくなるときは、元の楽譜データのまま）
// ----------------------------------------------------------
export function deleteMeasures(score, from, to) {
  const count = to - from + 1;
  if (count >= score.measures.length) return score; // 少なくとも1小節は残す

  const newScore = cloneScore(score);
  const next = to + 1; // 消したあと、消した小節の位置に来る小節

  // ① 変化を次の小節に移す（消すのが最後の小節までなら、移す先はない）
  if (next < newScore.measures.length) {
    const nextInfo = newScore.measures[next];
    // 拍子：次の小節に自分の拍子がなく、消す前後で拍子が変わるなら、次の小節に書く
    const timeAfter = timeAt(newScore, to);
    if (!nextInfo.time && (from === 0 || !sameTime(timeAt(newScore, from - 1), timeAfter))) {
      nextInfo.time = timeAfter;
    }
    // 調：拍子と同じ考え方
    const keyAfter = keyAt(newScore, to);
    if (nextInfo.key === undefined && (from === 0 || keyAt(newScore, from - 1) !== keyAfter)) {
      nextInfo.key = keyAfter;
    }
    // テンポ：拍子と同じ考え方（ステップ11-6a）
    const tempoAfter = tempoAt(newScore, to);
    if (nextInfo.tempo === undefined && (from === 0 || tempoAt(newScore, from - 1).tempo !== tempoAfter.tempo || tempoAt(newScore, from - 1).tempoText !== tempoAfter.tempoText)) {
      nextInfo.tempo = tempoAfter.tempo;
      if (tempoAfter.tempoText) nextInfo.tempoText = tempoAfter.tempoText;
    }
    // 音部記号：パートごとに同じ考え方
    newScore.parts.forEach((part) => {
      const clefAfter = clefAt(part, to);
      if (!part.measures[next].clef && (from === 0 || clefAt(part, from - 1) !== clefAfter)) {
        part.measures[next].clef = clefAfter;
      }
    });
  }

  // ② 消す小節の直前の音から出ていたタイを外す
  if (from > 0) {
    newScore.parts.forEach((part) => {
      const notes = part.measures[from - 1].notes;
      const last = notes[notes.length - 1]; // 直前の小節の最後の音
      if (last.tie) last.tie = false;
    });
  }

  // ③ 小節を消す
  newScore.measures.splice(from, count);
  newScore.parts.forEach((part) => {
    part.measures.splice(from, count);
  });

  // ③-2 1小節目にテンポ変更が来たら、楽譜全体のテンポに移す（1小節目のテンポは score.tempo に持つ決まりなので）（ステップ11-6a）
  const firstInfo = newScore.measures[0];
  if (firstInfo.tempo !== undefined) {
    newScore.tempo = firstInfo.tempo;
    newScore.tempoText = firstInfo.tempoText ?? "";
    delete firstInfo.tempo;
    delete firstInfo.tempoText;
  }
  // ③-3 片方の端だけ消された rit.・accel. を外す（残っている組だけで、印を付け直す）（ステップ11-6b）
  setGradualMarks(newScore.measures, gradualRanges(newScore.measures));
  delete newScore.measures[0].aTempo; // 1小節目に来た a tempo は外す

  // ④ 相手がいなくなったスラー・松葉を外す
  newScore.parts.forEach((part) => cleanSpanners(part));

  return newScore;
}

// ----------------------------------------------------------
// 関数：sameTime
// 2つの拍子が同じか調べる
// （ステップ8-1b：コモンタイム・カットタイムの印（symbol）も同じときだけ「同じ」とする。4/4 と C は別のもの）
// ----------------------------------------------------------
function sameTime(a, b) {
  return a.beats === b.beats && a.beatType === b.beatType && (a.symbol ?? null) === (b.symbol ?? null);
}

// ==========================================================
// ここから下は、拍子を変える関数（ステップ5-3）
// ==========================================================

// ----------------------------------------------------------
// 関数：changeTime
// from 小節目から to 小節目までの拍子を変える（全パートいっしょに。番号は 0 から）
//   time … 新しい拍子 { beats, beatType }（C・¢ のときは symbol: "common"・"cut" も付く）
//   to   … null のときは「次に拍子が変わる小節の手前まで（なければ最後まで）」
// 入りきらない音がある小節が1つでもあるときは、何も変えない
// 変えるときは、小節の中身（終わりの休符より前の音）はそのままにして、
// 残りを新しい拍子の「1拍ずつの休符」で埋め直す
// 戻り値：{ score: 新しい楽譜データ, error: 知らせる文 }
//   （何も変わらないとき・入りきらないときは、元の楽譜データのまま）
// ----------------------------------------------------------
export function changeTime(score, from, to, time) {
  const count = score.measures.length; // 小節の数

  // ① 効かせる最後の小節を決める（to が null なら、次に拍子が変わる小節の手前まで）
  let last = to;
  if (last === null) {
    last = from;
    while (last + 1 < count && !score.measures[last + 1].time) {
      last = last + 1;
    }
  }

  // ② 入りきらない音がないか、全パート・全小節を先に調べる
  const total = measureTicks(time); // 新しい拍子の1小節の長さ
  for (const part of score.parts) {
    for (let m = from; m <= last; m++) {
      const notes = part.measures[m].notes;
      const contents = notes.slice(0, contentCount(notes)); // 終わりの休符をのぞいた中身
      const used = contents.reduce((sum, note) => sum + noteTicks(note), 0);
      if (used > total) {
        return { score: score, error: `${m + 1}小節目の ${part.name} に入りきらない音があります` };
      }
    }
  }

  // ③ 効かせる範囲のすぐ後ろの小節の拍子（変える前の拍子）を覚えておく
  const timeAfter = timeAt(score, last);

  const newScore = cloneScore(score);

  // ④ パートごとに、小節の中身を新しい拍子で作り直す
  newScore.parts.forEach((part) => {
    for (let m = from; m <= last; m++) {
      const notes = part.measures[m].notes;
      const contents = notes.slice(0, contentCount(notes));
      const rebuilt = rebuildMeasure(contents, time);
      // 中身の最後の音のうしろに休符が来たら、その音のタイは外す（休符とはつなげないため）
      if (contents.length > 0 && rebuilt.length > contents.length) {
        const lastNote = rebuilt[contents.length - 1];
        if (lastNote.tie) lastNote.tie = false;
      }
      part.measures[m].notes = rebuilt;
    }
  });

  // ⑤ 楽譜全体の小節の情報に、拍子を書く
  newScore.measures[from].time = { beats: time.beats, beatType: time.beatType };
  // コモンタイム・カットタイムなら、その印も書く（ステップ8-1b）
  if (time.symbol) newScore.measures[from].time.symbol = time.symbol;
  // 範囲の中にあった、ほかの拍子の変化は消す
  for (let m = from + 1; m <= last; m++) {
    delete newScore.measures[m].time;
  }
  // 範囲のすぐ後ろの小節には、元の拍子を書いておく（後ろの小節まで変わらないように）
  if (last + 1 < count && !newScore.measures[last + 1].time) {
    newScore.measures[last + 1].time = timeAfter;
  }

  // ⑥ 前の小節と同じ拍子になった所は、拍子を書かない（1小節目は必ず残す）
  for (let m = Math.max(from, 1); m <= Math.min(last + 1, count - 1); m++) {
    const info = newScore.measures[m];
    if (info.time && sameTime(info.time, timeAt(newScore, m - 1))) {
      delete info.time;
    }
  }

  // 何も変わっていなければ、元の楽譜データを返す（「元に戻す」の履歴に残さないため）
  if (JSON.stringify(newScore) === JSON.stringify(score)) {
    return { score: score, error: "" };
  }
  return { score: newScore, error: "" };
}

// ==========================================================
// ここから下は、調を変える関数（ステップ5-4）
// ==========================================================

// ----------------------------------------------------------
// 関数：changeKey
// from 小節目から to 小節目までの調を変える（全パートいっしょに。番号は 0 から）
//   key … 新しい調（♯の数がプラス、♭の数がマイナス。例：2 → ♯2つ、-3 → ♭3つ）
//   to  … null のときは「次に調が変わる小節の手前まで（なければ最後まで）」
// 音のデータ（高さ）は変えない（臨時記号の表示は、描くときに自動で付け直される）
// 戻り値：新しい楽譜データ（何も変わらないときは、元の楽譜データのまま）
// ----------------------------------------------------------
export function changeKey(score, from, to, key) {
  const count = score.measures.length; // 小節の数

  // ① 効かせる最後の小節を決める（to が null なら、次に調が変わる小節の手前まで）
  let last = to;
  if (last === null) {
    last = from;
    while (last + 1 < count && score.measures[last + 1].key === undefined) {
      last = last + 1;
    }
  }

  // ② 効かせる範囲のすぐ後ろの小節の調（変える前の調）を覚えておく
  const keyAfter = keyAt(score, last);

  const newScore = cloneScore(score);

  // ③ 楽譜全体の小節の情報に、調を書く
  newScore.measures[from].key = key;
  // 範囲の中にあった、ほかの調の変化は消す
  for (let m = from + 1; m <= last; m++) {
    delete newScore.measures[m].key;
  }
  // 範囲のすぐ後ろの小節には、元の調を書いておく（後ろの小節まで変わらないように）
  if (last + 1 < count && newScore.measures[last + 1].key === undefined) {
    newScore.measures[last + 1].key = keyAfter;
  }

  // ④ 前の小節と同じ調になった所は、調を書かない（1小節目は必ず残す）
  for (let m = Math.max(from, 1); m <= Math.min(last + 1, count - 1); m++) {
    const info = newScore.measures[m];
    if (info.key !== undefined && info.key === keyAt(newScore, m - 1)) {
      delete info.key;
    }
  }

  // 何も変わっていなければ、元の楽譜データを返す（「元に戻す」の履歴に残さないため）
  if (JSON.stringify(newScore) === JSON.stringify(score)) {
    return score;
  }
  return newScore;
}

// ==========================================================
// ここから下は、音部記号を変える関数（ステップ5-5）
// ==========================================================

// ----------------------------------------------------------
// 関数：changeClef
// 1つのパートの from 小節目から to 小節目までの音部記号を変える（番号は 0 から）
//   partIndex … パートの番号（0 から）
//   clef      … 新しい音部記号（"treble"・"alto"・"tenor"・"bass"）
//   to        … null のときは「次に音部記号が変わる小節の手前まで（なければ最後まで）」
// 音のデータ（高さ）は変えない（描く位置だけが変わる）
// 戻り値：新しい楽譜データ（何も変わらないときは、元の楽譜データのまま）
// ----------------------------------------------------------
export function changeClef(score, partIndex, from, to, clef) {
  const count = score.measures.length; // 小節の数
  const part = score.parts[partIndex];

  // ① 効かせる最後の小節を決める（to が null なら、次に音部記号が変わる小節の手前まで）
  let last = to;
  if (last === null) {
    last = from;
    while (last + 1 < count && !part.measures[last + 1].clef) {
      last = last + 1;
    }
  }

  // ② 効かせる範囲のすぐ後ろの小節の音部記号（変える前の音部記号）を覚えておく
  const clefAfter = clefAt(part, last);

  const newScore = cloneScore(score);
  const newPart = newScore.parts[partIndex];

  // ③ そのパートの小節に、音部記号を書く
  newPart.measures[from].clef = clef;
  // 範囲の中にあった、ほかの切り替えは消す
  for (let m = from + 1; m <= last; m++) {
    delete newPart.measures[m].clef;
  }
  // 範囲のすぐ後ろの小節には、元の音部記号を書いておく（後ろの小節まで変わらないように）
  if (last + 1 < count && !newPart.measures[last + 1].clef) {
    newPart.measures[last + 1].clef = clefAfter;
  }

  // ④ 前の小節と同じ音部記号になった所は、書かない（1小節目は必ず残す）
  for (let m = Math.max(from, 1); m <= Math.min(last + 1, count - 1); m++) {
    const measure = newPart.measures[m];
    if (measure.clef && measure.clef === clefAt(newPart, m - 1)) {
      delete measure.clef;
    }
  }

  // 何も変わっていなければ、元の楽譜データを返す（「元に戻す」の履歴に残さないため）
  if (JSON.stringify(newScore) === JSON.stringify(score)) {
    return score;
  }
  return newScore;
}

// ==========================================================
// ここから下は、パートを足す・並べ替える・消す関数（ステップ5-6）
// ==========================================================

// パート名を付け直す renameParts は、model.js に移した（ステップ7-3）

// ----------------------------------------------------------
// 関数：addPart
// 一番下にパートを1つ足す
//   instrument … 楽器（"violin"・"viola"・"cello"）
// 中身は各小節の拍子に合わせた休符、1小節目には楽器の最初の音部記号を書く
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function addPart(score, instrument) {
  const newScore = cloneScore(score);

  // 小節ごとに、その小節の拍子に合わせた休符で埋める
  const measures = newScore.measures.map((_, m) => {
    const time = timeAt(newScore, m);
    const measure = { notes: restsForSpan(0, measureTicks(time), time) };
    if (m === 0) measure.clef = INSTRUMENTS[instrument].clef;
    return measure;
  });

  // id はパートの名札（ステップ12-3）
  newScore.parts.push({ id: createPartId(), name: "", abbreviation: "", instrument: instrument, measures: measures });
  renameParts(newScore.parts);
  return newScore;
}

// ----------------------------------------------------------
// 関数：movePart
// index 番目のパートを、上（delta = -1）か下（delta = 1）のパートと入れ替える
// 戻り値：新しい楽譜データ（一番上をさらに上に・一番下をさらに下にするときは、元の楽譜データのまま）
// ----------------------------------------------------------
export function movePart(score, index, delta) {
  const target = index + delta; // 入れ替える相手の番号
  if (target < 0 || target >= score.parts.length) return score;

  const newScore = cloneScore(score);
  const parts = newScore.parts;
  // 2つのパートを入れ替える
  [parts[index], parts[target]] = [parts[target], parts[index]];
  renameParts(parts);
  return newScore;
}

// ----------------------------------------------------------
// 関数：deletePart
// index 番目のパートを消す
// 戻り値：新しい楽譜データ（パートが1つしかないときは、元の楽譜データのまま）
// ----------------------------------------------------------
export function deletePart(score, index) {
  if (score.parts.length <= 1) return score; // 最低1パートは残す

  const newScore = cloneScore(score);
  newScore.parts.splice(index, 1);
  renameParts(newScore.parts);
  return newScore;
}
