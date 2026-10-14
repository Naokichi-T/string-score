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

import { durationToTicks, noteTicks, timeAt, keyAt, measureTicks, restsForSpan } from "./model.js";

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
  notes[selection.note] = { rest: true, duration: note.duration, dots: note.dots ?? 0 };
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
    const nextNotes = newScore.parts[next.part].measures[next.measure].notes;
    nextNotes[next.note] = {
      pitch: { ...note.pitch },
      duration: nextNote.duration,
      dots: nextNote.dots ?? 0,
      tie: false,
    };
    return { score: newScore, error: "" };
  }

  if (pitchToMidi(nextNote.pitch) !== pitchToMidi(note.pitch)) {
    return { score: score, error: "次の音が違う高さなので、タイを付けられません" };
  }

  return {
    score: updateNote(score, selection, (n) => {
      n.tie = true;
    }),
    error: "",
  };
}
