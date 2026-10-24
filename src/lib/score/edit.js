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

import {
  durationToTicks,
  noteTicks,
  timeAt,
  keyAt,
  tempoAt,
  measureTicks,
  measureLength,
  isShortEnd, // 短い最後の小節か（ステップ20）
  measureName,
  hasPickup,
  restsForSpan,
  INSTRUMENTS,
  renameParts,
  tupletGroups,
  createPartId,
  isMeasureRest,
  DURATION_ORDER,
  NO_DOT_DURATIONS,
  notePitches,
  setNotePitches,
  samePitch,
  MAX_CHORD_NOTES,
  hasDiamond,
  canAlternate,
  isAlternate,
  isContinuation, // 続きの小節（後ろの部分だけの小節）か（途中の短い小節）
  isShortMeasure, // 前の部分だけの小節か（途中の短い小節）
} from "./model.js";
import { ARTICULATIONS, STRING_MARKS, TECHNIQUES, ALTERNATE_TREMOLO } from "./symbols.js";
import { positionsInRange, selectedHead } from "./selection.js";
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
  if (NO_DOT_DURATIONS.includes(duration) && dots > 0) return false; // 16分・32分音符には付点を付けない（ステップ15-5）

  const notes = score.parts[selection.part].measures[selection.measure].notes;
  // 連符の中の音は、長さを変えずに高さだけ入れ替えるので、いつでも置ける（ステップ10-2）
  if (notes[selection.note].tuplet) return true;

  const total = measureLength(score, selection.measure); // 1小節の長さ（アウフタクトなら短い長さ）（ステップ15-1）
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
  const total = measureLength(newScore, selection.measure); // アウフタクトなら短い長さ（ステップ15-1）

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
// （ステップ20：最後の小節が短い小節なら）
//   ・「短い」は、新しい最後の小節（足した小節）へ移す（足した小節は短い長さの休符で埋める）
//   ・もとの最後の小節は、ふつうの長さにする（後ろを休符で埋める）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function appendMeasure(score) {
  const newScore = cloneScore(score);
  const lastIndex = newScore.measures.length - 1;
  const time = timeAt(newScore, lastIndex);
  const total = measureTicks(time);

  // 最後の小節が短い小節か（ステップ20）
  const short = isShortEnd(newScore, lastIndex) ? newScore.measures[lastIndex].short : null;
  const shortLength = short ? measureLength(newScore, lastIndex) : total;

  newScore.measures.push(short ? { short: short } : {}); // 拍子・調は変えない（「短い」は新しい最後の小節へ）
  if (short) delete newScore.measures[lastIndex].short;
  newScore.parts.forEach((part) => {
    // もとの最後の小節を、ふつうの長さにする（後ろを休符で埋める）（ステップ20）
    if (short) part.measures[lastIndex].notes = resizeFromBack(part.measures[lastIndex].notes, total, time);
    part.measures.push({ notes: restsForSpan(0, shortLength, time) });
  });
  return newScore;
}

// ----------------------------------------------------------
// 関数：resizeFromBack
// 小節の長さを、後ろの側で変える（前の音はそのまま。後ろの休符を消す・足す）（ステップ20）
//   notes     … 小節の音の並び
//   newLength … 新しい長さ（ティック）
//   time      … その小節の拍子
// ・終わりに続く休符を取りのぞいてから、新しい長さまで1拍ずつの休符で埋める
// ・中身の最後の音のうしろに休符が来たら、その音のタイは外す（休符とはつなげないため）
// 戻り値：新しい音の並び（中身が新しい長さに入りきらないときは null）
// ----------------------------------------------------------
function resizeFromBack(notes, newLength, time) {
  const contents = notes.slice(0, contentCount(notes)).map((note) => ({ ...note }));
  const rebuilt = rebuildMeasure(contents, newLength, time);
  if (!rebuilt) return null;
  if (contents.length > 0 && rebuilt.length > contents.length) {
    const lastNote = rebuilt[contents.length - 1];
    if (lastNote.tie) lastNote.tie = false;
  }
  return rebuilt;
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
  // 最後の小節の最後の音で、最後の小節が短い小節なら、小節を足さずにそこで止まる（曲の終わりなので）（ステップ20）
  if (isShortEnd(score, selection.measure)) {
    return { score: score, selection: selection };
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
// 重音なら、全部の音を同じだけ動かす（ステップ14-1）
// 戻り値：新しい楽譜データ（休符や、範囲の外に出るときは元の楽譜データのまま）
// ----------------------------------------------------------
export function transposeNote(score, selection, semitones) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return score;

  // 全部の音が範囲の中に収まるか（1つでも外に出るなら動かさない）
  const pitches = notePitches(note);
  const inside = pitches.every((pitch) => {
    const midi = pitchToMidi(pitch) + semitones;
    return midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI;
  });
  if (!inside) return score;

  return updateNote(score, selection, (n) => {
    const key = keyAt(score, selection.measure);
    const moved = notePitches(n).map((pitch) => {
      if (Math.abs(semitones) === 12) {
        // オクターブだけ変える（音名と♯♭はそのまま）
        // （注意の臨時記号：高さが変わるので、注意の記号の印は外す（withoutCourtesy））
        return withoutCourtesy({ ...pitch, octave: pitch.octave + semitones / 12 });
      }
      // 半音ずつ：調に合わせて♯か♭で呼び直す（ひし形の印は残す（ステップ14-5a））
      return { ...midiToPitch(pitchToMidi(pitch) + semitones, key), ...(pitch.diamond ? { diamond: true } : {}) };
    });
    setNotePitches(n, moved); // 低い順に入れ直す（全部同じだけ動かすので、並びは変わらない）
  });
}

// ----------------------------------------------------------
// 関数：withoutCourtesy
// 高さのデータから、注意の記号の印（courtesy）を外したコピーを返す（注意の臨時記号）
// 高さを変えたときに使う（別の高さの音に、注意の記号が残らないようにするため）
//   pitch … 高さ { step, alter, octave, courtesy, diamond など }
// 戻り値：印のない高さ（ほかの項目（ひし形の印など）はそのまま）
// ----------------------------------------------------------
function withoutCourtesy(pitch) {
  const { courtesy, ...rest } = pitch;
  return rest;
}

// ----------------------------------------------------------
// 関数：accidentalPitch
// ♯♭♮ のボタンを押したときの、新しい高さを返す（注意の臨時記号）
//   pitch … 今の高さ
//   alter … 押したボタン（1 なら♯、-1 なら♭、0 なら♮）
// 決まり
//   ・今の ♯♭♮ とちがう → その ♯♭♮ にする（注意の記号の印は外す）
//   ・今の ♯♭♮ と同じ   → 注意の記号の印を付ける・外す（押すたびに入れかわる）
//       印があると、決まりで要らなくても記号を出す（accidentals.js のルール⑦）
//       例：ハ長調で、前の小節のファ♯のあとのファ を選んで［♮］ → ♮ が出る。もう一度［♮］ → 消える
// 戻り値：新しい高さ（コピー。渡された高さは書き換えない）
// ----------------------------------------------------------
function accidentalPitch(pitch, alter) {
  if ((pitch.alter ?? 0) !== alter) return withoutCourtesy({ ...pitch, alter: alter });
  if (pitch.courtesy) return withoutCourtesy(pitch);
  return { ...pitch, courtesy: true };
}

// ----------------------------------------------------------
// 関数：setAccidental
// 選んでいる音を、その音名の♯・♭・♮にする（例：ミ → ミ♭）
//   alter … 1 なら♯、-1 なら♭、0 なら♮
// （注意の臨時記号：今と同じ ♯♭♮ のボタンを押したら、注意の記号の印を付ける・外す（accidentalPitch））
// 戻り値：新しい楽譜データ（休符・重音なら元の楽譜データのまま）
// （重音の中の1つの音の ♯♭♮ は、ステップ14-2 で重音の中の音を選べるようにしてから入れる）
// ----------------------------------------------------------
export function setAccidental(score, selection, alter) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest || note.chord) return score;
  return updateNote(score, selection, (n) => {
    n.pitch = accidentalPitch(n.pitch, alter);
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
// （ステップ14-1：重音のとき）
//   ・次の音に、同じ高さの音が1つでもあればつなぐ（つながるのは、同じ高さの音どうしだけ）
//   ・次が休符なら、重音のまま同じ高さにする
// （ステップ14-6a：2音トレモロの音には、タイを付けない。前の音から2音トレモロへのタイも付けない）
// 戻り値：{ score: 新しい楽譜データ, error: 知らせる文（うまくいったときは空の文字） }
// ----------------------------------------------------------
export function toggleTie(score, selection) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return { score: score, error: "休符にはタイを付けられません" };
  // 2音トレモロの音からは、つなげない（付いているタイを外すのは下でできる）（ステップ14-6a）
  if (!note.tie && isAlternate(note)) return { score: score, error: "2音トレモロの音には、タイを付けられません" };

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

  // 次が2音トレモロの音なら、つなげない（ステップ14-6a）
  if (isAlternate(nextNote)) return { score: score, error: "2音トレモロの音には、タイでつなげません" };

  if (nextNote.rest) {
    // 次の休符を同じ高さの音にして、タイでつなぐ
    const newScore = cloneScore(score);
    const notes = newScore.parts[selection.part].measures[selection.measure].notes;
    notes[selection.note].tie = true;
    delete notes[selection.note].glissando; // タイを付けたら、グリッサンドは外す（ステップ11-5a）
    const nextNotes = newScore.parts[next.part].measures[next.measure].notes;
    nextNotes[next.note] = {
      pitch: { ...note.pitch },
      // 重音なら、重ねる音も同じにする（ステップ14-1）（ひし形の印 diamond も、高さといっしょに写る（ステップ14-5a））
      ...(note.chord ? { chord: note.chord.map((pitch) => ({ ...pitch })) } : {}),
      duration: nextNote.duration,
      dots: nextNote.dots ?? 0,
      tie: false,
      // 次の休符が連符の中なら、連符の印も残す（ステップ10-3）
      ...(nextNote.tuplet ? { tuplet: { ...nextNote.tuplet } } : {}),
    };
    return { score: newScore, error: "" };
  }

  // 同じ高さの音が1つもなければつなげない（重音なら、どれか1つでも同じならよい）（ステップ14-1）
  const nextPitches = notePitches(nextNote);
  const hasSame = notePitches(note).some((pitch) => nextPitches.some((other) => samePitch(other, pitch)));
  if (!hasSame) {
    return { score: score, error: "次の音に同じ高さの音がないので、タイを付けられません" };
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
//   total    … その小節の長さ（ティック。measureLength で調べたもの）（ステップ15-1：アウフタクトのために足した）
//   time     … その小節の拍子
// 戻り値：作り直した音の配列（小節に入りきらないときは null）
// ----------------------------------------------------------
function rebuildMeasure(contents, total, time) {
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
  if (NO_DOT_DURATIONS.includes(duration) && dots > 0) return false; // 16分・32分音符には付点を付けない（ステップ15-5）
  const notes = score.parts[selection.part].measures[selection.measure].notes;
  // 連符の中には挿入できない（連符の数がそろわなくなるため）（ステップ10-2）
  if (notes[selection.note].tuplet) return false;
  const newNote = { rest: true, duration: duration, dots: dots }; // 長さを調べるだけなので休符で代用
  const contents = insertedContents(notes, selection.note, newNote);
  return rebuildMeasure(contents, measureLength(score, selection.measure), timeAt(score, selection.measure)) !== null;
}

// ----------------------------------------------------------
// 関数：canResize
// 選んでいる音の長さを変えて、後ろをずらせるか調べる
// ----------------------------------------------------------
export function canResize(score, selection, duration, dots) {
  if (!selection) return false;
  if (NO_DOT_DURATIONS.includes(duration) && dots > 0) return false; // 16分・32分音符には付点を付けない（ステップ15-5）
  const notes = score.parts[selection.part].measures[selection.measure].notes;
  // 連符の中の音の長さは変えられない（ステップ10-2）
  if (notes[selection.note].tuplet) return false;
  const newNote = { ...notes[selection.note], duration: duration, dots: dots };
  const contents = resizedContents(notes, selection.note, newNote);
  return rebuildMeasure(contents, measureLength(score, selection.measure), timeAt(score, selection.measure)) !== null;
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
  const rebuilt = rebuildMeasure(contents, measureLength(score, selection.measure), timeAt(score, selection.measure));
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
  const rebuilt = rebuildMeasure(contents, measureLength(score, selection.measure), timeAt(score, selection.measure));
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
//   ・この音も次の音も、重音ではない（ステップ14-1）
// 戻り値：true / false
// ----------------------------------------------------------
export function canGlissando(score, selection) {
  if (!selection) return false;
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest || note.tie || note.chord) return false;
  const next = findNext(score, selection);
  if (!next) return false; // 最後の音
  const nextNote = score.parts[next.part].measures[next.measure].notes[next.note];
  return !nextNote.rest && !nextNote.chord;
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
//            'grace'（前打音。value は "short"（短前打音）か "long"（長前打音））（ステップ11-8a）
//            'arpeggio'（アルペジオ。重音だけ。value は使わない）（ステップ14-4a）
//            'artificialHarmonic'（人工ハーモニクス。1音の音符の4度上にひし形の玉を足す・ひし形を外す。value は使わない）（ステップ14-5a）
//            'diamond'（選んでいる玉を、ひし形にする・戻す。value は使わない）（ステップ14-5a）
//            'alternate'（2音トレモロ。2音の重音を、下の音と上の音で交互に弾く形にする・戻す。value は使わない）（ステップ14-6a）
//   value … 記号の名前や数字（'down'・2・'staccato' など。フェルマータは使わない）
// 1つだけのもの（弓・強弱・ブレスとカエスーラ・装飾・トレモロ）は、別のものを押すと入れ替わる
// 装飾とトレモロは、1つの音にどちらか1つだけ（片方を付けると、もう片方は外れる）
// 重音には、装飾を付けられない（外すことはできる）（ステップ14-1）
// （ステップ24-2：重音にも前打音を付けられるようにした）
// 戻り値：新しい楽譜データ（休符なら元の楽譜データのまま）
// ----------------------------------------------------------
export function toggleNoteSymbol(score, selection, kind, value) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return score;

  // 重音：装飾は、付いていなければ付けない（ステップ14-1）
  // （前打音は、重音にも付けられる（ステップ24-2））
  if (note.chord && kind === "ornament" && !note.ornament) return score;

  // 人工ハーモニクス（kind が 'artificialHarmonic'）（ステップ14-5a）
  //   ひし形の玉がある音符：ひし形を外す
  //     ふつうの玉もあるとき … ひし形の玉を消す（例：ラ4＋レ5◇ → ラ4）
  //     ひし形の玉だけのとき … ひし形の印だけを外して、ふつうの玉にする
  //   ひし形のない1音の音符：4度上に、ひし形の玉を足す（2音の重音になる）
  //   ひし形のない重音：何もしない（付けられない）
  if (kind === "artificialHarmonic") {
    if (hasDiamond(note)) {
      return updateNote(score, selection, (n) => {
        const pitches = notePitches(n);
        const normals = pitches.filter((pitch) => !pitch.diamond);
        if (normals.length > 0) {
          setNotePitches(n, normals);
        } else {
          setNotePitches(
            n,
            pitches.map((pitch) => ({ step: pitch.step, alter: pitch.alter, octave: pitch.octave })),
          );
        }
        if (!n.chord) delete n.arpeggio; // 1音になったら、アルペジオは外す
      });
    }
    if (note.chord) return score; // 重音には付けられない
    const touch = { ...fourthAbove(note.pitch), diamond: true };
    if (pitchToMidi(touch) > HIGHEST_MIDI) return score; // 高すぎる
    const newScore = updateNote(score, selection, (n) => {
      setNotePitches(n, [n.pitch, touch]);
      // 重音には付けられない記号を外す（toggleChordPitch と同じ）
      delete n.ornament;
      delete n.grace;
      delete n.glissando;
    });
    // 前の音からこの音へのグリッサンドも外す
    const prev = findPrevious(newScore, selection);
    if (prev) {
      const prevNote = newScore.parts[prev.part].measures[prev.measure].notes[prev.note];
      if (prevNote.glissando) delete prevNote.glissando;
    }
    return newScore;
  }

  // ひし形（kind が 'diamond'）：選んでいる玉を、ひし形にする・戻す（ステップ14-5a）
  // ひし形の玉がある音符には、アルペジオは付けない（付いていたら外す）
  if (kind === "diamond") {
    const head = selectedHead(score, selection);
    return updateNote(score, selection, (n) => {
      const pitches = notePitches(n).map((pitch, k) => {
        if (k !== head) return pitch;
        const { diamond, ...plain } = pitch; // ひし形の印を取りのぞいた形
        return diamond ? plain : { ...plain, diamond: true };
      });
      setNotePitches(n, pitches);
      if (hasDiamond(n)) delete n.arpeggio;
    });
  }

  // 2音トレモロ（kind が 'alternate'）（ステップ14-6a）
  //   2音トレモロなら：ふつうの重音に戻す（印 alternate と、連桁の本数 tremolo を外す）
  //   そうでなければ：canAlternate でできるときだけ、2音トレモロにする
  //     ・連桁の本数（tremolo）がなければ、ALTERNATE_TREMOLO.defaultCount 本にする
  //     ・いっしょに使えないもの（アルペジオ・この音のタイ・前の音からこの音へのタイ）は外す
  if (kind === "alternate") {
    if (isAlternate(note)) {
      return updateNote(score, selection, (n) => {
        delete n.alternate;
        delete n.tremolo;
      });
    }
    if (!canAlternate(note)) return score;
    const newScore = updateNote(score, selection, (n) => {
      n.alternate = true;
      if (!n.tremolo) n.tremolo = ALTERNATE_TREMOLO.defaultCount;
      delete n.ornament; // 念のため（重音には装飾は付かないが、トレモロとはどちらか1つの決まり）
      delete n.arpeggio;
      n.tie = false;
    });
    const prev = findPrevious(newScore, selection);
    if (prev) {
      const prevNote = newScore.parts[prev.part].measures[prev.measure].notes[prev.note];
      if (prevNote.tie) prevNote.tie = false;
    }
    return newScore;
  }

  // アルペジオ（kind が 'arpeggio'）：付いていれば外す。付けるのは重音のときだけ（ステップ14-4a）
  // （ひし形の玉がある音符には付けない（ステップ14-5a））
  // （2音トレモロの音符には付けない（ステップ14-6a））
  if (kind === "arpeggio") {
    if (!note.arpeggio && (!note.chord || hasDiamond(note) || isAlternate(note))) return score;
    return updateNote(score, selection, (n) => {
      if (n.arpeggio) {
        delete n.arpeggio;
      } else {
        n.arpeggio = true;
      }
    });
  }

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

  // 前打音（kind が 'grace'）（ステップ11-8a）
  //   同じ種類が付いていれば外す。違う種類が付いていれば、高さはそのままで種類だけ入れ替える
  //   付いていなければ、主音の2度上（調号どおりの♯♭）の高さで付ける（あとで鍵盤で高さを変える）
  //   （ステップ24-2：主音が重音なら、いちばん高い音の2度上）
  if (kind === "grace") {
    return updateNote(score, selection, (n) => {
      if (n.grace && n.grace.type === value) {
        delete n.grace;
      } else if (n.grace) {
        n.grace = { ...n.grace, type: value };
      } else {
        const top = notePitches(n)[notePitches(n).length - 1]; // いちばん高い音（重音でなければ主音そのもの）
        n.grace = { type: value, pitch: stepAbove(top, keyAt(score, selection.measure)) };
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

// ----------------------------------------------------------
// 関数：stepAbove
// 1つ上の音名（2度上）の高さを、調号どおりの♯♭で返す（前打音を付けたときの、はじめの高さ）（ステップ11-8a）
//   例：ニ長調で ミ5 → ファ♯5、ハ長調で シ4 → ド5
//   pitch … もとの音の高さ { step, alter, octave }
//   key   … 調号（♯の数がプラス、♭の数がマイナス）
// 戻り値：音の高さ { step, alter, octave }
// ----------------------------------------------------------
function stepAbove(pitch, key) {
  const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
  const index = STEPS.indexOf(pitch.step);
  const nextStep = STEPS[(index + 1) % 7];
  // シ（B）の次はドなので、オクターブが1つ上がる
  const octave = pitch.step === "B" ? pitch.octave + 1 : pitch.octave;
  return { step: nextStep, alter: keyAlters(key)[nextStep], octave: octave };
}

// ----------------------------------------------------------
// 関数：fourthAbove / fourthBelow
// 完全4度上・下の音の高さを返す（人工ハーモニクスの触れる音を決めるのに使う）（ステップ14-5a）
// 音名を3つ先（後）にして、半音5つぶんになるように ♯♭ を決める
//   例：ラ4 → レ5、ファ♯4 → シ4、シ♭4 → ミ♭5、ド4 → ファ4
//   pitch … もとの音の高さ { step, alter, octave }
// 戻り値：音の高さ { step, alter, octave }
// ----------------------------------------------------------
function fourthAbove(pitch) {
  return shiftByFourth(pitch, 1);
}

function fourthBelow(pitch) {
  return shiftByFourth(pitch, -1);
}

// ----------------------------------------------------------
// 関数：shiftByFourth
// fourthAbove・fourthBelow の中身（direction が 1 なら上、-1 なら下）（ステップ14-5a）
// ----------------------------------------------------------
function shiftByFourth(pitch, direction) {
  const STEPS = ["C", "D", "E", "F", "G", "A", "B"];
  const index = STEPS.indexOf(pitch.step) + 3 * direction; // 音名を3つ進める（戻す）
  const step = STEPS[((index % 7) + 7) % 7];
  const octave = pitch.octave + Math.floor(index / 7); // ドをこえたらオクターブが変わる
  const target = pitchToMidi(pitch) + 5 * direction; // 半音5つぶん上（下）
  const natural = pitchToMidi({ step: step, alter: 0, octave: octave });
  return { step: step, alter: target - natural, octave: octave };
}

// ----------------------------------------------------------
// 関数：setGracePitch
// 選んでいる音の前打音の高さを変える（ステップ11-8a）
// 前打音が付いていない音なら、何もしない
//   pitch … 新しい高さ { step, alter, octave }
// （ステップ24-1：前打音を選んで、鍵盤・音名キーを押したときに使う。前打音が重音でも、1つの高さに入れ替える）
// 戻り値：新しい楽譜データ（前打音がなければ元の楽譜データのまま）
// ----------------------------------------------------------
export function setGracePitch(score, selection, pitch) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest || !note.grace) return score;
  return updateNote(score, selection, (n) => {
    const { chord: _chord, ...rest } = n.grace; // 重音の上の音は取りのぞく
    n.grace = { ...rest, pitch: { step: pitch.step, alter: pitch.alter ?? 0, octave: pitch.octave } };
  });
}

// ==========================================================
// ここから下は、選んだ前打音を直す関数（ステップ24-1）
// 前打音のデータ { type, pitch, chord } は、音符の高さと同じ形（pitch がいちばん低い音、chord が上の音）なので、
// 「前打音を、ふつうの音符に見立てた楽譜」を仮に作り、音符用の関数（transposeNote・重音の関数など）で直してから、
// 直した高さだけを、本当の楽譜の前打音に書き戻す（editGrace）
// 戻り値はどれも { score: 新しい楽譜データ, error: 知らせる文（うまくいったときは空の文字）, head: このあと選ぶ玉の番号 }
// ==========================================================

// ----------------------------------------------------------
// 関数：editGrace
// 前打音を、音符用の関数で直す（下の関数の共通の中身）（ステップ24-1）
//   score     … 楽譜データ
//   selection … 選択中の場所（前打音を選んでいる。head は前打音の中の玉の番号）
//   edit      … 仮の楽譜と仮の選択中の場所を受け取り、{ score, error, head } を返す関数
//               （仮の楽譜では、選んでいる音符が「前打音を見立てた音符」に入れ替わっている）
// ----------------------------------------------------------
function editGrace(score, selection, edit) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest || !note.grace) return { score: score, error: "", head: 0 };

  const { temp, place } = graceAsNote(score, selection);
  const result = edit(temp, place);
  if (result.error || result.score === temp) return { score: score, error: result.error ?? "", head: result.head ?? 0 };

  // 直した高さを、本当の楽譜の前打音に書き戻す（ほかの所は、元の楽譜のまま）
  const edited = result.score.parts[selection.part].measures[selection.measure].notes[selection.note];
  const newScore = updateNote(score, selection, (n) => {
    const { chord: _chord, ...rest } = n.grace;
    n.grace = { ...rest, pitch: { ...edited.pitch }, ...(edited.chord ? { chord: edited.chord.map((pitch) => ({ ...pitch })) } : {}) };
  });
  return { score: newScore, error: "", head: result.head ?? 0 };
}

// ----------------------------------------------------------
// 関数：graceAsNote
// 前打音を、ふつうの音符に見立てた仮の楽譜と、仮の選択中の場所を作る（editGrace などで使う）（ステップ24-2）
// （ステップ24-1 では editGrace の中にあったものを取り出した）
//   score     … 楽譜データ
//   selection … 選択中の場所（前打音を選んでいる。前打音が付いていること）
// 戻り値：{ temp: 仮の楽譜, place: 仮の選択中の場所（前打音の印は取りのぞき、玉の番号だけ残す） }
// ----------------------------------------------------------
function graceAsNote(score, selection) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  // 前打音を、ふつうの音符に見立てる（長さは使わないので、8分音符にしておく）
  const temp = cloneScore(score);
  temp.parts[selection.part].measures[selection.measure].notes[selection.note] = {
    pitch: { ...note.grace.pitch },
    ...(note.grace.chord ? { chord: note.grace.chord.map((pitch) => ({ ...pitch })) } : {}),
    duration: "eighth",
    dots: 0,
  };
  const place = { part: selection.part, measure: selection.measure, note: selection.note };
  if (Number.isInteger(selection.head)) place.head = selection.head;
  return { temp: temp, place: place };
}

// ----------------------------------------------------------
// 関数：toggleGraceChordPitch
// 前打音を選んで［重音］が入のときに、鍵盤・音名キーで押された高さを前打音に足す（ステップ24-2）
// （同じ高さがもうあれば、その音を外す。最後の1音は外さない。4音まで。toggleChordPitch と同じ決まり）
//   pitch … 足す（外す）高さ { step, alter, octave }
// ----------------------------------------------------------
export function toggleGraceChordPitch(score, selection, pitch) {
  return editGrace(score, selection, (temp, place) => toggleChordPitch(temp, place, pitch));
}

// ----------------------------------------------------------
// 関数：graceChordPitchForLetter
// 前打音を選んで［重音］が入のときに、音名キーで足す高さを決める（ステップ24-2）
// （前打音のいちばん高い音より上で、いちばん近い高さ。chordPitchForLetter と同じ決め方）
//   step … 音名（"C"〜"B"）
// 戻り値：音の高さ { step, alter, octave }
// ----------------------------------------------------------
export function graceChordPitchForLetter(score, selection, step) {
  const { temp, place } = graceAsNote(score, selection);
  return chordPitchForLetter(temp, place, step);
}

// ----------------------------------------------------------
// 関数：toggleGraceFingering
// 選んでいる前打音に指番号を付ける（もう付いていれば外す）（ステップ24-2）
// 前打音の指番号は grace.fingerings に、付けた順に入れる（主音の fingerings と同じ形）
//   number … 指番号（0〜4）
// 戻り値：新しい楽譜データ（前打音がなければ元の楽譜データのまま）
// ----------------------------------------------------------
export function toggleGraceFingering(score, selection, number) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest || !note.grace) return score;
  return updateNote(score, selection, (n) => {
    const list = toggleInList(n.grace.fingerings ?? [], number);
    const { fingerings: _old, ...rest } = n.grace;
    n.grace = list.length > 0 ? { ...rest, fingerings: list } : rest; // 空になったら項目ごと消す
  });
}

// ----------------------------------------------------------
// 関数：transposeGrace
// 選んでいる前打音の高さを変える（▲ ▼、↑ ↓ キー）（ステップ24-1）
//   semitones … 変える半音の数（transposeNote と同じ。±12 なら音名を変えずにオクターブだけ）
// 前打音が重音なら、選んでいる玉だけを動かす（ほかの玉と同じ高さになるときは動かさない）
// ----------------------------------------------------------
export function transposeGrace(score, selection, semitones) {
  return editGrace(score, selection, (temp, place) => {
    const target = temp.parts[place.part].measures[place.measure].notes[place.note];
    if (target.chord) return transposeChordHead(temp, place, semitones);
    const moved = transposeNote(temp, place, semitones);
    if (moved === temp) return { score: temp, error: "これ以上は高さを変えられません", head: 0 };
    return { score: moved, error: "", head: 0 };
  });
}

// ----------------------------------------------------------
// 関数：setGraceAccidental
// 選んでいる前打音を、その音名の♯・♭・♮にする（ステップ24-1）
//   alter … 1 なら♯、-1 なら♭、0 なら♮
// 前打音が重音なら、選んでいる玉だけを変える
// ----------------------------------------------------------
export function setGraceAccidental(score, selection, alter) {
  return editGrace(score, selection, (temp, place) => {
    const target = temp.parts[place.part].measures[place.measure].notes[place.note];
    if (target.chord) return setChordHeadAccidental(temp, place, alter);
    return { score: setAccidental(temp, place, alter), error: "", head: 0 };
  });
}

// ----------------------------------------------------------
// 関数：removeGrace
// 選んでいる前打音を消す（削除）（ステップ24-1）
//   ・前打音が重音 … 選んでいる玉だけを外す（removed は false）
//   ・1音の前打音 … 前打音ごと外す（removed は true。呼ぶ側で、主音を選び直す）
// 戻り値：{ score, error, head, removed }
// ----------------------------------------------------------
export function removeGrace(score, selection) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest || !note.grace) return { score: score, error: "", head: 0, removed: false };
  if (note.grace.chord) {
    return { ...editGrace(score, selection, (temp, place) => removeChordHead(temp, place)), removed: false };
  }
  const newScore = updateNote(score, selection, (n) => {
    delete n.grace;
  });
  return { score: newScore, error: "", head: 0, removed: true };
}

// ----------------------------------------------------------
// 関数：gracePitchForLetter
// 前打音を選んでいるときに、音名キー（C D E F G A B）で入れる高さを決める（ステップ24-1）
//   step … 音名（"C"〜"B"）
// 決め方：♯♭は調号どおり。オクターブは、主音（重音ならいちばん高い音）にいちばん近い高さにする
//   （前打音は主音のすぐ近くの音が多いため。pitchForLetter は「前の音」に近い高さにする）
// 戻り値：音の高さ { step, alter, octave }
// ----------------------------------------------------------
export function gracePitchForLetter(score, selection, step) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  const alter = keyAlters(keyAt(score, selection.measure))[step];
  const pitches = notePitches(note);
  if (pitches.length === 0) return pitchForLetter(score, selection, step);
  return nearestPitch(step, alter, pitchToMidi(pitches[pitches.length - 1]));
}

// ----------------------------------------------------------
// 関数：nearestPitch
// 音名と♯♭を決めた高さのうち、基準の高さにいちばん近いオクターブのものを返す（ステップ24-1）
// （pitchForLetter の中にあった決め方を、gracePitchForLetter でも使えるように取り出した）
//   step  … 音名（"C"〜"B"）
//   alter … ♯♭の数
//   base  … 基準の高さ（MIDI の番号）
// ちょうど同じ近さのときは、低い方にする。範囲の外（ド1 より低い・ド8 より高い）は使わない
// ----------------------------------------------------------
function nearestPitch(step, alter, base) {
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
// （ステップ16-1：松葉の終わりは wedgeEnd で調べる）
// 戻り値：{ slur: true / false, wedge: 'crescendo' / 'diminuendo' / null, holds: 指の番号の並び }
// （保持線：範囲の最初の音から始まり、最後の音で終わる保持線の指の番号を holds に入れる（例：[1, 3]））
// ----------------------------------------------------------
export function getSpanState(score, range) {
  const ends = range ? spanEnds(score, range) : null;
  if (!ends) return { slur: false, wedge: null, holds: [] };
  const noteAt = (pos) => score.parts[pos.part].measures[pos.measure].notes[pos.note];
  const first = noteAt(ends.first);
  const last = noteAt(ends.last);
  return {
    slur: first.slur === "start" && last.slur === "stop",
    wedge: last.wedgeEnd ? (first.wedge ?? null) : null,
    holds: (first.holdStart ?? []).filter((finger) => (last.holdEnd ?? []).includes(finger)),
  };
}

// ----------------------------------------------------------
// 関数：toggleSpanner
// 範囲にスラーか松葉を付ける（同じものがすでに付いていれば外す）
//   kind … 'slur'（スラー）・'crescendo'（＜）・'diminuendo'（＞）
// 範囲の最初の音符に「ここから」、最後の音符に「ここまで」の印を付ける
// 間の音符に付いていた同じ種類の印は消す（重なってわかりにくくならないように）
// （ステップ16-1：松葉は wedge（始まり）と wedgeEnd（終わり）を別々に持つようにした）
//   ・最初の音符で前の松葉が終わっていても（wedgeEnd）、そのまま残す → ＜ の終わりの音符から ＞ を始められる
//   ・最後の音符から次の松葉が始まっていても（wedge）、そのまま残す
//   ・範囲の中の音符の下だけの松葉（wedgeInside）は、重ならないように外す
//   ・相手がいなくなった松葉は、最後に cleanSpanners で外す
// 戻り値：新しい楽譜データ（付けられないときは元の楽譜データのまま）
// ----------------------------------------------------------
export function toggleSpanner(score, range, kind) {
  const ends = spanEnds(score, range);
  if (!ends) return score;

  const newScore = cloneScore(score);
  const noteAt = (pos) => newScore.parts[pos.part].measures[pos.measure].notes[pos.note];
  const first = noteAt(ends.first);
  const last = noteAt(ends.last);

  // スラー（今までどおり "start" と "stop"）
  if (kind === "slur") {
    // すでに付いていれば外す
    if (first.slur === "start" && last.slur === "stop") {
      delete first.slur;
      delete last.slur;
      return newScore;
    }
    // 付ける（間の音符のスラーの印は消す）
    ends.inner.forEach((pos) => {
      delete noteAt(pos).slur;
    });
    first.slur = "start";
    last.slur = "stop";
    return newScore;
  }

  // 松葉：すでに同じものが付いていれば外す
  if (first.wedge === kind && last.wedgeEnd) {
    delete first.wedge;
    delete last.wedgeEnd;
    cleanSpanners(newScore.parts[range.part]);
    return newScore;
  }

  // 松葉を付ける：間の音符の松葉の印と、範囲の中の音符の下だけの松葉は消す
  ends.inner.forEach((pos) => {
    const note = noteAt(pos);
    delete note.wedge;
    delete note.wedgeEnd;
    delete note.wedgeInside;
  });
  delete first.wedgeInside;
  delete last.wedgeInside;
  first.wedge = kind; // 最初の音符の wedgeEnd（前の松葉の終わり）は残す
  last.wedgeEnd = true; // 最後の音符の wedge（次の松葉の始まり）は残す
  cleanSpanners(newScore.parts[range.part]); // 入れ替えで相手がいなくなった松葉を外す
  return newScore;
}

// ==========================================================
// ここから下は、保持線（指を押さえたままにする線）の関数（保持線）
// データは model.js の説明を参照（holdStart・holdEnd に指の番号の並び）
// ==========================================================

// ----------------------------------------------------------
// 関数：addFinger
// 音符の holdStart か holdEnd の並びに、指の番号を足す（小さい順に並べる）（保持線）
//   note   … 音符のデータ（直接書き換える。コピーした楽譜データの中でだけ使う）
//   key    … "holdStart" か "holdEnd"
//   finger … 指の番号
// ----------------------------------------------------------
function addFinger(note, key, finger) {
  const list = note[key] ?? [];
  if (!list.includes(finger)) list.push(finger);
  note[key] = list.sort((a, b) => a - b);
}

// ----------------------------------------------------------
// 関数：removeFinger
// 音符の holdStart か holdEnd の並びから、指の番号を外す（空になったら項目ごと消す）（保持線）
//   note   … 音符のデータ（直接書き換える。コピーした楽譜データの中でだけ使う）
//   key    … "holdStart" か "holdEnd"
//   finger … 指の番号
// ----------------------------------------------------------
function removeFinger(note, key, finger) {
  if (!note[key]) return;
  note[key] = note[key].filter((f) => f !== finger);
  if (note[key].length === 0) delete note[key];
}

// ----------------------------------------------------------
// 関数：toggleHold
// 範囲に保持線を付ける（同じ指の保持線がすでに付いていれば外す）（保持線）
//   range  … 選んでいる範囲（音符が2つ以上あること。スラーと同じ）
//   finger … 指の番号（1〜4）
// 範囲の最初の音符の holdStart、最後の音符の holdEnd に、指の番号を入れる
// 決まり（スラー・松葉と同じ考え方）
//   ・最初と最後に、同じ指の始まりと終わりがもう付いている → 外す
//   ・それ以外 → 付ける。間の音符に付いていた同じ指の始まり・終わりは消す（重なってわかりにくくならないように）
//       最初の音符で、前の同じ指の線が終わっていても（holdEnd）、そのまま残す（そこから次の線を始められる）
//       最後の音符から、次の同じ指の線が始まっていても（holdStart）、そのまま残す
//   ・相手がいなくなった印は、最後に cleanSpanners で外す
//   ・ほかの指の保持線はさわらない（1と3の線は重ねられる）
// 戻り値：新しい楽譜データ（付けられないときは元の楽譜データのまま）
// ----------------------------------------------------------
export function toggleHold(score, range, finger) {
  const ends = spanEnds(score, range);
  if (!ends) return score;

  const newScore = cloneScore(score);
  const noteAt = (pos) => newScore.parts[pos.part].measures[pos.measure].notes[pos.note];
  const first = noteAt(ends.first);
  const last = noteAt(ends.last);

  // すでに同じ指の保持線が付いていれば外す
  if ((first.holdStart ?? []).includes(finger) && (last.holdEnd ?? []).includes(finger)) {
    removeFinger(first, "holdStart", finger);
    removeFinger(last, "holdEnd", finger);
    cleanSpanners(newScore.parts[range.part]);
    return newScore;
  }

  // 付ける：間の音符の、同じ指の始まり・終わりは消す
  ends.inner.forEach((pos) => {
    removeFinger(noteAt(pos), "holdStart", finger);
    removeFinger(noteAt(pos), "holdEnd", finger);
  });
  addFinger(first, "holdStart", finger); // 最初の音符の holdEnd（前の線の終わり）は残す
  addFinger(last, "holdEnd", finger); // 最後の音符の holdStart（次の線の始まり）は残す
  cleanSpanners(newScore.parts[range.part]); // 入れ替えで相手がいなくなった印を外す
  return newScore;
}

// ----------------------------------------------------------
// 関数：canWedgeInside
// 選んでいる音符の下だけに、松葉を付けられるか調べる（ステップ16-1）
// 音符（休符ではない）を1つ選んでいるときだけ付けられる
// ----------------------------------------------------------
export function canWedgeInside(score, selection) {
  if (!selection) return false;
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  return !!note && !note.rest;
}

// ----------------------------------------------------------
// 関数：toggleWedgeInside
// 選んでいる音符の下だけに、松葉を付ける・外す（ステップ16-1）
//   kind … 'crescendo'（＜）か 'diminuendo'（＞）
// 1つの音符に1つだけ：同じものなら外す、違うものなら入れ替える
// 戻り値：新しい楽譜データ（付けられないときは元の楽譜データのまま）
// ----------------------------------------------------------
export function toggleWedgeInside(score, selection, kind) {
  if (!canWedgeInside(score, selection)) return score;
  return updateNote(score, selection, (n) => {
    if (n.wedgeInside === kind) {
      delete n.wedgeInside;
    } else {
      n.wedgeInside = kind;
    }
  });
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
  // （ステップ14-1：重音なら、重ねた音も全部調べる）
  const allInside = positions.every((pos) => {
    const note = score.parts[pos.part].measures[pos.measure].notes[pos.note];
    return notePitches(note).every((pitch) => {
      const midi = pitchToMidi(pitch) + semitones;
      return midi >= LOWEST_MIDI && midi <= HIGHEST_MIDI;
    });
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

  // 基準の前後のオクターブを比べて、いちばん近いものを選ぶ（ステップ24-1：nearestPitch に取り出した）
  return nearestPitch(step, alter, base);
}

// ==========================================================
// ここから下は、重音の関数（ステップ14-1）
// ==========================================================

// ----------------------------------------------------------
// 関数：toggleChordPitch
// 選んでいる音符に、高さを1つ足す（同じ高さがもうあれば、その音を外す）
// ［重音］が入のときに、鍵盤・音名キーで呼ぶ
//   pitch … 足す（外す）高さ { step, alter, octave }
// 決まり
//   ・同じ高さ（鍵盤で同じ所）の音がもうある → その音を外す（ただし最後の1音は外さない）
//   ・ない → 足す（MAX_CHORD_NOTES 音より多くはしない）
//   ・足したり外したりしたら、低い順に並べ直す（いちばん低い音が pitch、残りが chord）
//   ・重音になったら、重音には付けられない記号（装飾・グリッサンド）を外す
//     （ステップ24-2：前打音は重音にも付けられるので、外さない）
// 選んでいるのが休符のときは、ここでは何もしない（休符に音を入れるのは、編集ページで行う）
// 戻り値：{ score: 新しい楽譜データ, error: 知らせる文（うまくいったときは空の文字）, head: このあと選ぶ玉の番号 }（ステップ14-2：head を足した）
//   head … 足したときは足した玉、外したときはそのすぐ下の玉（いちばん下を外したら、新しいいちばん下）
// ----------------------------------------------------------
export function toggleChordPitch(score, selection, pitch) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return { score: score, error: "", head: 0 };

  const pitches = notePitches(note);
  const index = pitches.findIndex((other) => samePitch(other, pitch));

  // もうある高さ：外す
  if (index >= 0) {
    if (pitches.length === 1) {
      return { score: score, error: "最後の1音は外せません（休符にするときは［削除］）", head: 0 };
    }
    const newScore = updateNote(score, selection, (n) => {
      setNotePitches(
        n,
        pitches.filter((_, k) => k !== index),
      ); // その音を除いて入れ直す
      if (!n.chord) delete n.arpeggio; // 1音になったら、アルペジオは外す（ステップ14-4a）
    });
    return { score: newScore, error: "", head: Math.max(0, index - 1) };
  }

  // ない高さ：足す
  if (pitches.length >= MAX_CHORD_NOTES) {
    return { score: score, error: `重音は${MAX_CHORD_NOTES}音までです`, head: selectedHead(score, selection) };
  }
  const newScore = updateNote(score, selection, (n) => {
    setNotePitches(n, [...pitches, pitch]);
    // 重音には付けられない記号を外す（前打音は外さない（ステップ24-2））
    delete n.ornament;
    delete n.glissando;
  });

  // 前の音からこの音へのグリッサンドも外す（重音へはすべらせない）
  const prev = findPrevious(newScore, selection);
  if (prev) {
    const prevNote = newScore.parts[prev.part].measures[prev.measure].notes[prev.note];
    if (prevNote.glissando) delete prevNote.glissando; // newScore はコピーなので、直接書き換えてよい
  }
  // 足した玉が、低い順で何番目になったか
  const added = notePitches(newScore.parts[selection.part].measures[selection.measure].notes[selection.note]).findIndex((other) => samePitch(other, pitch));
  return { score: newScore, error: "", head: added };
}

// ==========================================================
// ここから下は、重音の中の1つの玉を直す関数（ステップ14-2）
// どれも、選んでいる玉（selection.head。selection.js の selectedHead で決める）だけを変える
// 戻り値はどれも { score: 新しい楽譜データ, error: 知らせる文（うまくいったときは空の文字）, head: このあと選ぶ玉の番号 }
// ==========================================================

// ----------------------------------------------------------
// 関数：replaceChordHead
// 選んでいる玉の高さを入れ替えて、低い順に並べ直す（transposeChordHead・setChordHeadAccidental で使う）
//   newPitch … 新しい高さ
// ほかの玉と同じ高さになるときは、変えずに知らせる
// 並べ直したあとも、変えた玉を選んだままにする（head は並べ直したあとの番号）
// ----------------------------------------------------------
function replaceChordHead(score, selection, newPitch) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  const pitches = notePitches(note);
  const head = selectedHead(score, selection);
  // ほかの玉と同じ高さにならないか
  const others = pitches.filter((_, k) => k !== head);
  if (others.some((other) => samePitch(other, newPitch))) {
    return { score: score, error: "同じ高さの音があります", head: head };
  }
  const newScore = updateNote(score, selection, (n) => {
    setNotePitches(n, [...others, newPitch]);
  });
  const newHead = notePitches(newScore.parts[selection.part].measures[selection.measure].notes[selection.note]).findIndex((other) => samePitch(other, newPitch));
  return { score: newScore, error: "", head: newHead };
}

// ----------------------------------------------------------
// 関数：transposeChordHead
// 重音の中の、選んでいる玉だけの高さを変える（▲ ▼）
//   semitones … 変える半音の数（transposeNote と同じ。±12 なら音名を変えずにオクターブだけ）
// 範囲の外に出るときは変えない。ほかの玉と同じ高さになるときも変えない
// ----------------------------------------------------------
export function transposeChordHead(score, selection, semitones) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  const head = selectedHead(score, selection);
  // ひし形の玉がある音符（ハーモニクス）：玉どうしの間を保つため、全部の玉をいっしょに動かす（ステップ14-5a）
  if (hasDiamond(note)) {
    const moved = transposeNote(score, selection, semitones);
    if (moved === score) return { score: score, error: "これ以上は高さを変えられません", head: head };
    return { score: moved, error: "", head: head };
  }
  const pitch = notePitches(note)[head];
  const midi = pitchToMidi(pitch) + semitones;
  if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) {
    return { score: score, error: "これ以上は高さを変えられません", head: head };
  }
  // （注意の臨時記号：オクターブだけ変えるときも、高さが変わるので注意の記号の印は外す）
  const newPitch = Math.abs(semitones) === 12 ? withoutCourtesy({ ...pitch, octave: pitch.octave + semitones / 12 }) : midiToPitch(midi, keyAt(score, selection.measure));
  return replaceChordHead(score, selection, newPitch);
}

// ----------------------------------------------------------
// 関数：setChordHeadAccidental
// 重音の中の、選んでいる玉だけを、その音名の♯・♭・♮にする
//   alter … 1 なら♯、-1 なら♭、0 なら♮
// ほかの玉と同じ高さになるときは変えない（例：ミとファの重音で、ミを♯にする）
// （注意の臨時記号：今と同じ ♯♭♮ のボタンを押したら、その玉の注意の記号の印を付ける・外す）
// ----------------------------------------------------------
export function setChordHeadAccidental(score, selection, alter) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  const head = selectedHead(score, selection);
  const pitch = notePitches(note)[head];
  // 今と同じ ♯♭♮：高さは変わらないので、注意の記号の印だけを入れかえる（注意の臨時記号）
  // （人工ハーモニクスでも、もう1つの玉は動かさない）
  if ((pitch.alter ?? 0) === alter) return replaceChordHead(score, selection, accidentalPitch(pitch, alter));
  // 人工ハーモニクス（ふつうの玉＋その4度上のひし形の2音）：選んだ玉の ♯♭♮ を変えて、もう1つの玉を4度の間に合わせ直す（ステップ14-5a）
  // （ほかの形のひし形の音符は、選んだ玉だけを変える）
  const pitches = notePitches(note);
  const isArtificialPair = pitches.length === 2 && !pitches[0].diamond && pitches[1].diamond && pitchToMidi(pitches[1]) - pitchToMidi(pitches[0]) === 5;
  if (isArtificialPair) {
    const changed = { step: pitch.step, alter: alter, octave: pitch.octave };
    const lower = head === 0 ? changed : fourthBelow(changed);
    const upper = { ...(head === 0 ? fourthAbove(changed) : changed), diamond: true };
    const newScore = updateNote(score, selection, (n) => {
      setNotePitches(n, [lower, upper]);
    });
    return { score: newScore, error: "", head: head };
  }
  return replaceChordHead(score, selection, accidentalPitch(pitch, alter)); // ♯♭♮ を変える（注意の記号の印は外れる）
}

// ----------------------------------------------------------
// 関数：removeChordHead
// 重音の中の、選んでいる玉を外す（削除）
// 残りが1つになったら、ふつうの音符に戻る（記号・タイなどはそのまま）
// 外したあとは、そのすぐ下の玉を選ぶ（いちばん下を外したら、新しいいちばん下）
// ----------------------------------------------------------
export function removeChordHead(score, selection) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  const pitches = notePitches(note);
  const head = selectedHead(score, selection);
  if (pitches.length <= 1) return { score: score, error: "", head: 0 };
  const newScore = updateNote(score, selection, (n) => {
    setNotePitches(
      n,
      pitches.filter((_, k) => k !== head),
    );
    if (!n.chord) delete n.arpeggio; // 1音になったら、アルペジオは外す（ステップ14-4a）
  });
  return { score: newScore, error: "", head: Math.max(0, head - 1) };
}

// ----------------------------------------------------------
// 関数：findPrevious
// 選んでいる音の「前の音」の場所を返す（小節をまたいでもよい）（ステップ14-1）
// 最初の小節の最初の音なら null
// ----------------------------------------------------------
function findPrevious(score, selection) {
  if (selection.note > 0) return { ...selection, note: selection.note - 1 };
  if (selection.measure > 0) {
    const notes = score.parts[selection.part].measures[selection.measure - 1].notes;
    return { ...selection, measure: selection.measure - 1, note: notes.length - 1 };
  }
  return null;
}

// ----------------------------------------------------------
// 関数：chordPitchForLetter
// ［重音］が入のときに、音名キー（C D E F G A B）で足す音の高さを決める（ステップ14-1）
//   step … 音名（"C"〜"B"）
// 決め方：
//   ① ♯♭は調号どおりにする（pitchForLetter と同じ）
//   ② 選んでいる音符のいちばん高い音より上で、いちばん近い高さにする
//      （重音は下から積み上げて入れることが多いため。上に入らないときは、いちばん高い音に近い高さ）
//   選んでいるのが休符なら、pitchForLetter と同じ決め方にする
// 戻り値：音の高さ { step, alter, octave }
// ----------------------------------------------------------
export function chordPitchForLetter(score, selection, step) {
  const note = score.parts[selection.part].measures[selection.measure].notes[selection.note];
  if (!note || note.rest) return pitchForLetter(score, selection, step);

  const alter = keyAlters(keyAt(score, selection.measure))[step];
  const pitches = notePitches(note);
  const top = pitchToMidi(pitches[pitches.length - 1]); // いちばん高い音

  // いちばん高い音より上で、いちばん近いもの（低いオクターブから順に調べる）
  for (let octave = 0; octave <= 8; octave++) {
    const pitch = { step: step, alter: alter, octave: octave };
    const midi = pitchToMidi(pitch);
    if (midi > top && midi <= HIGHEST_MIDI) return pitch;
  }
  // 上に入らないとき：いちばん高い音と同じオクターブ
  return { step: step, alter: alter, octave: pitches[pitches.length - 1].octave };
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
// （自由な文字のテンポの指示：gradual に "none"（再生では変えない）も入るようにした。
//   書く文字 gradualText と、点線を引かない印 gradualDashes: false も、範囲といっしょに覚える）
//   measures … 楽譜全体の小節の情報（score.measures）
// 戻り値：[{ from: 始まりの小節, to: 終わりの小節, type: "rit"・"accel"・"none", text: 書く文字（なければ null）, dashes: 点線を引くか }, ...]
//         （「ここまで」がない「ここから」・「ここから」がない「ここまで」は入れない）
// ----------------------------------------------------------
export function gradualRanges(measures) {
  const ranges = [];
  let open = null; // 「ここから」があって、まだ「ここまで」が来ていない範囲
  measures.forEach((info, i) => {
    // 新しい「ここから」（前に開いていたものは捨てる）
    if (info.gradual) open = { from: i, type: info.gradual, text: info.gradualText ?? null, dashes: info.gradualDashes !== false };
    if (info.gradualEnd && open) {
      ranges.push({ from: open.from, to: i, type: open.type, text: open.text, dashes: open.dashes });
      open = null;
    }
  });
  return ranges;
}

// ----------------------------------------------------------
// 関数：setGradualMarks
// 小節の情報の rit.・accel. の印を、全部消してから、ranges のとおりに付け直す（ステップ11-6b）
// （自由な文字のテンポの指示：書く文字 gradualText と、点線を引かない印 gradualDashes も付け直す）
//   measures … 楽譜全体の小節の情報（コピーしたものを渡す。中身を書き換える）
//   ranges   … [{ from, to, type, text, dashes }, ...]（text・dashes は、なくてもよい）
// ----------------------------------------------------------
function setGradualMarks(measures, ranges) {
  measures.forEach((info) => {
    delete info.gradual;
    delete info.gradualEnd;
    delete info.gradualText;
    delete info.gradualDashes;
  });
  ranges.forEach((range) => {
    measures[range.from].gradual = range.type;
    measures[range.to].gradualEnd = true;
    // 自由な文字のときだけ、書く文字を持つ（rit.・accel. のボタンで付けたものは持たない）
    if (range.text) measures[range.from].gradualText = range.text;
    // 点線を引かないときだけ、印を持つ（ないときは今までどおり点線を引く）
    if (range.dashes === false) measures[range.from].gradualDashes = false;
  });
}

// ----------------------------------------------------------
// 関数：toggleGradual
// from 小節目から to 小節目までに、rit.（だんだん遅く）か accel.（だんだん速く）を付ける（ステップ11-6b）
// from 小節目でもう同じ種類が始まっていたら、その範囲を外す
// 付けるときは、範囲に重なっていた rit.・accel. を外す（重ならないようにする）
// （自由な文字のテンポの指示：同じ種類でも、自由な文字（rall. など）が付いているときは外さずに、rit.・accel. に入れ替える）
//   type … "rit" か "accel"
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function toggleGradual(score, from, to, type) {
  const newScore = cloneScore(score);
  const ranges = gradualRanges(newScore.measures);
  let next;
  if (newScore.measures[from].gradual === type && !newScore.measures[from].gradualText) {
    // 同じ種類（ボタンで付けたもの）がここから始まっている：その範囲を外す
    next = ranges.filter((range) => range.from !== from);
  } else {
    // 重なる範囲を外して、新しい範囲を足す
    next = ranges.filter((range) => range.to < from || range.from > to);
    next.push({ from: from, to: to, type: type, text: null, dashes: true });
  }
  setGradualMarks(newScore.measures, next);
  return newScore;
}

// ----------------------------------------------------------
// 関数：setGradualText
// from 小節目から to 小節目までに、自由な文字のテンポの指示（rall.・allargando など）を付ける（自由な文字のテンポの指示）
// 範囲に重なっていた rit.・accel.・自由な文字は外す（toggleGradual と同じく、重ならないようにする）
//   text   … 楽譜に書く文字（前後の空白は取る）
//   type   … 再生での扱い："rit"（遅くする）・"accel"（速くする）・"none"（変えない）
//   dashes … 文字のあとに、範囲の終わりまで点線を引くか（音1つを選んで付けたときは false）
// 戻り値：新しい楽譜データ（文字が空なら、何も変えない楽譜データ）
// ----------------------------------------------------------
export function setGradualText(score, from, to, text, type, dashes) {
  const newScore = cloneScore(score);
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return newScore;
  const ranges = gradualRanges(newScore.measures);
  const next = ranges.filter((range) => range.to < from || range.from > to);
  next.push({ from: from, to: to, type: type, text: trimmed, dashes: dashes });
  setGradualMarks(newScore.measures, next);
  return newScore;
}

// ----------------------------------------------------------
// 関数：removeGradual
// from 小節目から始まっている rit.・accel.・自由な文字の範囲を外す（自由な文字のテンポの指示）
// （［文字…］の欄の［外す］で使う）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function removeGradual(score, from) {
  const newScore = cloneScore(score);
  const next = gradualRanges(newScore.measures).filter((range) => range.from !== from);
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

// ----------------------------------------------------------
// 関数：endingRanges
// 1番・2番かっこの範囲を、小節の情報から探して並べる（ステップ11-7b）
// 「ここから」（ending: 番号）と「ここまで」（endingEnd: 番号）の組を、前から順に探す（gradualRanges と同じ考え方）
//   measures … 楽譜全体の小節の情報（score.measures）
// 戻り値：[{ from: 始まりの小節, to: 終わりの小節, number: 1 か 2 }, ...]
// ----------------------------------------------------------
export function endingRanges(measures) {
  const ranges = [];
  let open = null; // 「ここから」があって、まだ「ここまで」が来ていないかっこ
  measures.forEach((info, i) => {
    if (info.ending) open = { from: i, number: info.ending };
    if (info.endingEnd && open) {
      ranges.push({ from: open.from, to: i, number: open.number });
      open = null;
    }
  });
  return ranges;
}

// ----------------------------------------------------------
// 関数：setEndingMarks
// 小節の情報の1番・2番かっこの印を、全部消してから、ranges のとおりに付け直す（ステップ11-7b）
//   measures … 楽譜全体の小節の情報（コピーしたものを渡す。中身を書き換える）
//   ranges   … [{ from, to, number }, ...]
// ----------------------------------------------------------
function setEndingMarks(measures, ranges) {
  measures.forEach((info) => {
    delete info.ending;
    delete info.endingEnd;
  });
  ranges.forEach((range) => {
    measures[range.from].ending = range.number;
    measures[range.to].endingEnd = range.number;
  });
}

// ----------------------------------------------------------
// 関数：toggleEnding
// from 小節目から to 小節目までに、1番かっこか2番かっこを付ける（ステップ11-7b）
// from 小節目でもう同じ番号のかっこが始まっていたら、そのかっこを外す
// 付けるときは、範囲に重なっていたかっこを外す（重ならないようにする）
//   number … 1 か 2
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function toggleEnding(score, from, to, number) {
  const newScore = cloneScore(score);
  const ranges = endingRanges(newScore.measures);
  let next;
  if (newScore.measures[from].ending === number) {
    // 同じ番号がここから始まっている：そのかっこを外す
    next = ranges.filter((range) => range.from !== from);
  } else {
    // 重なるかっこを外して、新しいかっこを足す
    next = ranges.filter((range) => range.to < from || range.from > to);
    next.push({ from: from, to: to, number: number });
  }
  setEndingMarks(newScore.measures, next);
  return newScore;
}

// ----------------------------------------------------------
// 関数：toggleJumpMark
// i 小節目に、D.C.・D.S. で使う印を付ける・外す（ステップ11-7c）
//   kind … "segno"（𝄋：小節の頭）・"coda"（𝄌：コーダの始まり。小節の頭）
//           "toCoda"（To Coda：小節の終わり）・"fine"（Fine：小節の終わり）
//           "rehearsal"（練習番号：小節の頭。文字は model.js の rehearsalLabel で数えて決める）（ステップ11-7d）
// もう付いていたら外す
// 𝄋 と 𝄌 は楽譜に1つだけ：ほかの小節に付いていたら、そこからは外す（＝押した小節へ移る）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function toggleJumpMark(score, i, kind) {
  const newScore = cloneScore(score);
  const info = newScore.measures[i];
  if (info[kind]) {
    // もう付いている：外す
    delete info[kind];
    return newScore;
  }
  // 𝄋・𝄌 は1つだけなので、ほかの小節のものを外してから付ける
  if (kind === "segno" || kind === "coda") {
    newScore.measures.forEach((other) => {
      delete other[kind];
    });
  }
  info[kind] = true;
  return newScore;
}

// ----------------------------------------------------------
// 関数：setJump
// i 小節目の終わりに、D.C.・D.S. を付ける（ステップ11-7c）
//   type … null（なし）・"dc"・"dcFine"・"dcCoda"・"ds"・"dsFine"・"dsCoda"（種類は model.js の JUMP_TEXTS）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function setJump(score, i, type) {
  const newScore = cloneScore(score);
  const info = newScore.measures[i];
  if (type) {
    info.jump = type;
  } else {
    delete info.jump;
  }
  return newScore;
}

// ----------------------------------------------------------
// 関数：measureRestShape
// 1小節の長さ（ティック）を、休符1つで書くときの形を返す（ステップ13-3b）
// 例：4分の3拍子 → 付点2分休符 { duration: "half", dots: 1 }、4分の4拍子 → 全休符 { duration: "whole", dots: 0 }
//   total … 1小節の長さ（ティック）
// 戻り値：{ duration, dots }（休符1つで書けない長さ（5拍子など）なら null）
// ----------------------------------------------------------
function measureRestShape(total) {
  for (const duration of DURATION_ORDER) {
    for (const dots of [0, 1]) {
      if (durationToTicks(duration, dots) === total) return { duration: duration, dots: dots };
    }
  }
  return null;
}

// ----------------------------------------------------------
// 関数：toggleMeasureRest
// part パートの from 小節目から to 小節目までを、小節まるごとの休符（全休符）にする・戻す（ステップ13-3b）
//   ・全部の小節がもう全休符なら：拍ごとの休符（4分休符3つなど）に戻す
//   ・そうでなければ：全部の小節を全休符にする（中の音符は消える。元に戻すで戻せる）
//     休符1つで書けない長さ（5拍子など）の小節は、拍ごとの休符にする
//   ・前の小節の最後の音から、この範囲へタイが出ていたら外す（つなぐ相手がいなくなるため）
//   ・相手がいなくなったスラー・松葉も外す
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function toggleMeasureRest(score, part, from, to) {
  const newScore = cloneScore(score);
  const measures = newScore.parts[part].measures;

  // 範囲の小節が全部、もう全休符か
  let allMeasureRest = true;
  for (let i = from; i <= to; i++) {
    if (!isMeasureRest(measures[i].notes)) allMeasureRest = false;
  }

  for (let i = from; i <= to; i++) {
    const time = timeAt(newScore, i);
    const total = measureLength(newScore, i); // アウフタクトなら短い長さ（ステップ15-1）
    const shape = measureRestShape(total);
    if (allMeasureRest || !shape) {
      // 拍ごとの休符にする
      measures[i].notes = restsForSpan(0, total, time);
    } else {
      // 全休符（小節まるごとの休符）にする
      measures[i].notes = [{ rest: true, duration: shape.duration, dots: shape.dots, measureRest: true }];
    }
  }

  // 前の小節の最後の音から入ってくるタイを外す
  if (from > 0) {
    const prevNotes = measures[from - 1].notes;
    const last = prevNotes[prevNotes.length - 1];
    if (last && !last.rest && last.tie) last.tie = false;
  }

  // 相手がいなくなったスラー・松葉を外す
  cleanSpanners(newScore.parts[part]);
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
// （ステップ15-1：アウフタクトがあるときに1小節目の前に足したら）
//   ・アウフタクトは、新しい1小節目（足した空の小節）に移す
//   ・もとのアウフタクトの小節は、ふつうの長さの小節にする（前を休符で埋めて、音は小節の後ろに残す）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function insertMeasure(score, index) {
  // 最後の小節の後ろに足すときで、最後の小節が短い小節なら、「短い」を新しい最後の小節へ移す（ステップ20）
  if (index === score.measures.length && isShortEnd(score, index - 1)) return appendMeasure(score);

  const newScore = cloneScore(score);

  // 足す小節の拍子（前の小節と同じ。1小節目の前なら今の1小節目と同じ）
  const time = timeAt(newScore, Math.max(index - 1, 0));
  const full = measureTicks(time); // 拍子どおりの1小節の長さ
  // 足す小節の長さ（1小節目の前に足して、アウフタクトを移すときは、アウフタクトの長さ）（ステップ15-1）
  const movePickup = index === 0 && hasPickup(newScore);
  const total = movePickup ? measureLength(newScore, 0) : full;

  // 楽譜全体の小節の情報
  // （ステップ15-1：あとから pickup も足すので、「どんな項目でも入る入れ物」だと VSCode に教えておく。
  //   書かないと、最初に入れた { time, key } の形だと思われて、pickup を足す所がエラーになる）
  /** @type {Record<string, any>} */
  let info = {};
  if (index === 0) {
    // 1小節目の前：拍子と調を新しい1小節目に移す
    const first = newScore.measures[0];
    info = { time: first.time, key: first.key };
    delete first.time;
    delete first.key;
    // アウフタクトも新しい1小節目に移す（ステップ15-1）
    if (movePickup) {
      info.pickup = first.pickup;
      delete first.pickup;
    }
  }
  newScore.measures.splice(index, 0, info);

  // パートごとの小節
  newScore.parts.forEach((part) => {
    const measure = { notes: restsForSpan(0, total, time) };
    if (index === 0) {
      // 1小節目の前：音部記号を新しい1小節目に移す
      measure.clef = part.measures[0].clef;
      delete part.measures[0].clef;
      // もとのアウフタクトの小節を、ふつうの長さにする（前を休符で埋める）（ステップ15-1）
      if (movePickup) part.measures[0].notes = resizeFromFront(part.measures[0].notes, total, full, time);
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
// （保持線：保持線の始まり holdStart・終わり holdEnd も、指の番号ごとに同じ決まりで調べる）
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

  // スラー（"start" と "stop"）を調べる
  // （「どんな音符でも入る」と VSCode に教えておく。書かないと、null しか入らないと思われてエラーになる）
  /** @type {any} */
  let open = null; // 「ここから」の印が付いていて、まだ「ここまで」が来ていない音符
  notes.forEach((note) => {
    const value = note.slur;
    if (value === undefined) return;
    if (value === "stop") {
      if (open) {
        open = null; // 正しい組になった
      } else {
        delete note.slur; // 「ここから」がない「ここまで」は外す
      }
    } else {
      if (open) delete open.slur; // 前の「ここから」に「ここまで」がなかったので外す
      open = note;
    }
  });
  if (open) delete open.slur; // 最後まで「ここまで」が来なかった「ここから」は外す

  // 松葉（始まり wedge と終わり wedgeEnd）を調べる（ステップ16-1：終わりを wedgeEnd に分けた）
  // 1つの音符では「前の松葉の終わり → 次の松葉の始まり」の順に見る（＜ の終わりの音符から ＞ が始まる形のため）
  // （音符の下だけの松葉 wedgeInside は、1つの音符で完結しているので調べない）
  /** @type {any} */
  let openWedge = null; // 始まりが付いていて、まだ終わりが来ていない音符
  notes.forEach((note) => {
    if (note.wedgeEnd) {
      if (openWedge) {
        openWedge = null; // 正しい組になった
      } else {
        delete note.wedgeEnd; // 始まりのない終わりは外す
      }
    }
    if (note.wedge) {
      if (openWedge) delete openWedge.wedge; // 前の始まりに終わりがなかったので外す
      openWedge = note;
    }
  });
  if (openWedge) delete openWedge.wedge; // 最後まで終わりが来なかった始まりは外す

  // 保持線（始まり holdStart と終わり holdEnd）を、指の番号ごとに調べる（保持線）
  // 松葉と同じく、1つの音符では「前の線の終わり → 次の線の始まり」の順に見る
  // （同じ音符で始まって終わる線（1つの音符だけの線）は作らないので、終わりを先に見ると外れる）
  const openHolds = new Map(); // 指の番号 → 始まりが付いていて、まだ終わりが来ていない音符
  notes.forEach((note) => {
    [...(note.holdEnd ?? [])].forEach((finger) => {
      if (openHolds.has(finger)) {
        openHolds.delete(finger); // 正しい組になった
      } else {
        removeFinger(note, "holdEnd", finger); // 始まりのない終わりは外す
      }
    });
    [...(note.holdStart ?? [])].forEach((finger) => {
      if (openHolds.has(finger)) removeFinger(openHolds.get(finger), "holdStart", finger); // 前の始まりに終わりがなかったので外す
      openHolds.set(finger, note);
    });
  });
  openHolds.forEach((note, finger) => removeFinger(note, "holdStart", finger)); // 最後まで終わりが来なかった始まりは外す
}

// ----------------------------------------------------------
// 関数：cleanAlternates
// 2音トレモロの印（alternate）を、決まりどおりに直す（ステップ14-6a）
// 楽譜を変えたあと（+page.svelte の commit・MusicXML の読み込み）に、毎回呼ぶ
//   ・2音トレモロにできなくなった音符（3音になった・1音になった・8分音符にした・ひし形にした・
//     連桁の本数を外した など）からは、印 alternate を外す（ふつうの重音・音符に戻る）
//   ・2音トレモロの音符のタイと、前の音から2音トレモロへのタイを外す
// 直すものがなければ、渡された楽譜データをそのまま返す（「元に戻す」の履歴を増やさないため）
//   score … 楽譜データ
// 戻り値：楽譜データ（直したときは、新しく作ったもの）
// ----------------------------------------------------------
export function cleanAlternates(score) {
  // 直すものがあるか、先に調べる
  const needsFix = score.parts.some((part) => {
    let prev = null; // 1つ前の音符・休符（小節をまたいでもよい）
    return part.measures.some((measure) =>
      measure.notes.some((note) => {
        const broken = note.alternate && !isAlternate(note); // 使えなくなった印
        const tied = isAlternate(note) && (note.tie || (prev && !prev.rest && prev.tie)); // つながったタイ
        prev = note;
        return broken || tied;
      }),
    );
  });
  if (!needsFix) return score;

  // 新しく作って直す
  const newScore = cloneScore(score);
  newScore.parts.forEach((part) => {
    let prev = null;
    part.measures.forEach((measure) => {
      measure.notes.forEach((note) => {
        if (note.alternate && !isAlternate(note)) delete note.alternate;
        if (isAlternate(note)) {
          if (note.tie) note.tie = false;
          if (prev && !prev.rest && prev.tie) prev.tie = false;
        }
        prev = note;
      });
    });
  });
  return newScore;
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
  // 1番・2番かっこも同じように片付ける（ステップ11-7b）
  setEndingMarks(newScore.measures, endingRanges(newScore.measures));
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
// 関数：timeRangeEnd
// 拍子を変える範囲の、最後の小節を決める（ステップ18-4：流し直し（reflow.js）でも使うので、changeTime から分けた）
//   from … 範囲の最初の小節（0 から）
//   to   … 範囲の最後の小節。null のときは「次に拍子が変わる小節の手前まで（なければ最後まで）」
// 戻り値：最後の小節の番号
// ----------------------------------------------------------
export function timeRangeEnd(score, from, to) {
  if (to !== null) return to;
  const count = score.measures.length;
  let last = from;
  while (last + 1 < count && !score.measures[last + 1].time) {
    last = last + 1;
  }
  return last;
}

// ----------------------------------------------------------
// 関数：changeTime
// from 小節目から to 小節目までの拍子を変える（全パートいっしょに。番号は 0 から）
//   time … 新しい拍子 { beats, beatType }（C・¢ のときは symbol: "common"・"cut" も付く）
//   to   … null のときは「次に拍子が変わる小節の手前まで（なければ最後まで）」
// 入りきらない音がある小節が1つでもあるときは、何も変えない
// 変えるときは、小節の中身（終わりの休符より前の音）はそのままにして、
// 残りを新しい拍子の「1拍ずつの休符」で埋め直す
// （ステップ15-1：アウフタクトがあって、1小節目の拍子を変えるとき）
//   ・アウフタクトの長さ（ティック）はそのままにして、新しい拍子の拍の数に数え直す
//   ・新しい拍子の拍の数で割り切れない・新しい1小節より短くならないときは、何も変えずに知らせる
//     例：4/4 で4分音符1つ分 → 6/8 なら8分音符2つ分（OK）、2/2 なら半分の拍になる（変えられない）
// （途中の短い小節：範囲の中の、続きの小節・前の部分の小節・短い最後の小節も、アウフタクトと同じ決まりで数え直す）
// 戻り値：{ score: 新しい楽譜データ, error: 知らせる文, overflow: 入りきらない音があったか }
//   （何も変わらないとき・入りきらないときは、元の楽譜データのまま）
//   （ステップ18-4：入りきらないときは overflow を true にする。編集ページが「後ろへ流し直すか」をたずねるのに使う）
// ----------------------------------------------------------
export function changeTime(score, from, to, time) {
  const count = score.measures.length; // 小節の数

  // ① 効かせる最後の小節を決める（to が null なら、次に拍子が変わる小節の手前まで）
  //    （ステップ18-4：timeRangeEnd に分けた）
  const last = timeRangeEnd(score, from, to);

  // ①-2 範囲の中の短い小節（アウフタクト・続き・前の部分・短い最後の小節）の拍の数を、新しい拍子で数え直す
  // （ステップ15-1：アウフタクト、ステップ20：短い最後の小節）
  // （途中の短い小節：どの小節の short・pickup も、同じ決まりで数え直すようにまとめた）
  //   ・長さ（ティック）はそのままにして、新しい拍子の拍の数に数え直す
  //   ・割り切れない・1小節と同じか長くなるときは、何も変えずに知らせる
  //     例：4/4 で4分音符1つ分 → 6/8 なら8分音符2つ分（OK）、2/2 なら半分の拍になる（変えられない）
  const full = measureTicks(time); // 新しい拍子の1小節の長さ
  const unit = full / time.beats; // 新しい拍子の、下の数字の音符1つ分
  const newCounts = new Map(); // 小節の番号 → { kind: "short" か "pickup", count: 新しい拍の数 }
  for (let m = from; m <= last; m++) {
    const now = measureLengthKind(score, m);
    if (now.kind === "normal") continue;
    const newCount = measureLength(score, m) / unit;
    if (!Number.isInteger(newCount) || newCount >= time.beats) {
      return { score: score, error: `${measureName(score, m)}の長さが新しい拍子に合わないので、拍子を変えられません（先に「小節」タブで、その小節の長さを「拍子どおり」にしてください）` };
    }
    newCounts.set(m, { kind: now.kind, count: newCount });
  }

  // ② 入りきらない音がないか、全パート・全小節を先に調べる
  // （アウフタクトの小節は、アウフタクトの長さで調べる（ステップ15-1））
  // （ステップ20：短い最後の小節は、その長さで調べる）
  // （途中の短い小節：短い小節は、どれもその長さで調べる）
  const totalAt = (m) => (newCounts.has(m) ? measureLength(score, m) : full);
  for (const part of score.parts) {
    for (let m = from; m <= last; m++) {
      const notes = part.measures[m].notes;
      const contents = notes.slice(0, contentCount(notes)); // 終わりの休符をのぞいた中身
      const used = contents.reduce((sum, note) => sum + noteTicks(note), 0);
      if (used > totalAt(m)) {
        return { score: score, error: `${measureName(score, m)}の ${part.name} に入りきらない音があります`, overflow: true };
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
      const rebuilt = rebuildMeasure(contents, totalAt(m), time);
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
  // 短い小節（アウフタクト・続き・前の部分・短い最後の小節）の拍の数を、新しい拍子で数え直したものにする
  // （ステップ15-1・ステップ20。途中の短い小節：どの小節も同じ決まりにまとめた）
  newCounts.forEach(({ kind, count: newCount }, m) => {
    newScore.measures[m][kind] = newCount;
  });
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
// ここから下は、アウフタクト（短い1小節目）の関数（ステップ15-1）
// アウフタクトは小節の「後ろの部分」なので、長さを変えるときは小節の前の側を詰めたり足したりする
// ==========================================================

// ----------------------------------------------------------
// 関数：resizeFromFront
// 1つのパートの1小節分の音の並びを、前の側で長さを変える（ステップ15-1）
//   notes     … 小節の音の並び
//   oldLength … 今の小節の長さ（ティック）
//   newLength … 新しい小節の長さ（ティック）
//   time      … その小節の拍子（休符で埋めるのに使う）
// 決まり
//   ・長くするとき … 前に休符を足す（音は小節の後ろのまま）
//   ・短くするとき … 前の側から、詰める長さぶんを取りのぞく
//                    取りのぞく所に音符（休符ではない音）があるときは、短くできない（null を返す）
//                    休符が取りのぞく所の境目をまたいでいたら、その休符は取りのぞいて、残りを休符で埋め直す
//                    連符は途中で分けられないので、連符の一部でも取りのぞく所にかかったら、連符まるごと取りのぞく
//                    （そのときも、連符の中に音符があれば短くできない）
//   ・小節まるごとの休符（全休符）なら … 新しい長さの拍ごとの休符にする
// 休符で埋める所は、どれも拍子の下の数字の音符1つ分ずつずれるだけなので、1拍ずつの休符の並びはくずれない
// 戻り値：新しい音の並び（短くできないときは null）
// ----------------------------------------------------------
function resizeFromFront(notes, oldLength, newLength, time) {
  // 小節まるごとの休符：新しい長さの拍ごとの休符にする
  if (isMeasureRest(notes)) return restsForSpan(0, newLength, time);

  // 長くする：前に休符を足す
  if (newLength >= oldLength) {
    return [...restsForSpan(0, newLength - oldLength, time), ...notes];
  }

  // 短くする：前の側の cut ティックぶんを取りのぞく
  const cut = oldLength - newLength;
  const groups = tupletGroups(notes);
  const kept = []; // 残す音
  let firstKeptStart = oldLength; // 残す音のうち、いちばん前の音の始まり（なければ小節の終わり）
  let position = 0;
  for (let j = 0; j < notes.length; j++) {
    const note = notes[j];
    const start = position;
    position = position + noteTicks(note);
    // この音が入っている連符が、取りのぞく所にかかっているか（連符の最初の音の始まりで調べる）
    const group = groups.find((g) => g.start <= j && j <= g.end);
    const cutTuplet = group && noteStart(notes, group.start) < cut;
    if (start >= cut && !cutTuplet) {
      // 残す音
      if (kept.length === 0) firstKeptStart = start;
      kept.push(note);
    } else if (!note.rest) {
      // 取りのぞく所に音符がある：短くできない
      return null;
    }
  }
  // 新しい小節の頭から、残す音の始まりまでを休符で埋める
  const fill = restsForSpan(0, firstKeptStart - cut, time);
  return [...fill, ...kept];
}

// ----------------------------------------------------------
// 関数：pickupChoices
// アウフタクトの長さとして選べる拍の数の一覧を返す（ステップ15-1）
// 1拍から「1小節の拍の数 − 1」拍まで（1小節と同じ長さはアウフタクトではないので入れない）
//   time … 1小節目の拍子
// 例：4/4 → [1, 2, 3]、6/8 → [1, 2, 3, 4, 5]、1/4 → []（選べない）
// ----------------------------------------------------------
export function pickupChoices(time) {
  return Array.from({ length: Math.max(0, time.beats - 1) }, (_, k) => k + 1);
}

// （小節の長さの自動判断：「楽譜の設定」タブの欄を消したので、そこで使っていた
//   setPickup・canShortEnd・setShortEnd も消した。どの小節も setMeasureLengthAuto で長さを変える）

// ==========================================================
// ここから下は、どの小節でも長さを変える関数（途中の短い小節）
// 「小節」タブの「長さ」の欄で使う
//   ・前の部分（short）… 小節の頭から決めた拍の数まで。小節番号に数える（くり返し記号の前で終わる小節など）
//   ・続き（pickup）   … 小節の後ろの部分だけ。小節番号に数えない（くり返し記号のあとの、前の小節の続きなど）
//                        1小節目の続きは、アウフタクトと同じもの
// ==========================================================

// ----------------------------------------------------------
// 関数：measureLengthKind
// i 小節目の今の長さの種類と拍の数を返す（途中の短い小節）
// 戻り値：{ kind: "normal"（拍子どおり）・"short"（前の部分）・"pickup"（続き）, count: 拍の数（拍子どおりなら 0） }
// ----------------------------------------------------------
export function measureLengthKind(score, i) {
  if (isContinuation(score, i)) return { kind: "pickup", count: score.measures[i].pickup };
  if (isShortMeasure(score, i)) return { kind: "short", count: score.measures[i].short };
  return { kind: "normal", count: 0 };
}

// ----------------------------------------------------------
// 関数：setMeasureLength
// i 小節目の長さを変える（全パートいっしょに）（途中の短い小節）
//   i     … 何小節目か（0 から）
//   kind  … "normal"（拍子どおりに戻す）・"short"（前の部分）・"pickup"（続き）
//   count … 拍の数（拍子の下の数字の音符がいくつ分か）。"normal" のときは使わない
// 流れ
//   ① 今の形から、いったん拍子どおりの長さに戻す
//        前の部分だった → 後ろに休符を足す（resizeFromBack）
//        続きだった     → 前に休符を足す（resizeFromFront）
//   ② 新しい形にする
//        前の部分にする → 後ろの側を詰める（resizeFromBack。短い最後の小節と同じやり方）
//        続きにする     → 前の側を詰める（resizeFromFront。アウフタクトと同じやり方）
//   詰める所に音符があるパートが1つでもあれば、何も変えずに知らせる
// 1小節目を続きにすればアウフタクト、最後の小節を前の部分にすれば短い最後の小節になる
// （小節の長さの自動判断：画面からは直接呼ばず、setMeasureLengthAuto から呼ぶ）
// 戻り値：{ score: 新しい楽譜データ, error: 知らせる文（うまくいったときは空の文字） }
//   （長さが変わらないとき・変えられないときは、元の楽譜データのまま）
// ----------------------------------------------------------
export function setMeasureLength(score, i, kind, count) {
  const time = timeAt(score, i);
  // 選べない数（1小節と同じか長い・小数など）なら何もしない（欄からは来ないはず）
  if (kind !== "normal" && !pickupChoices(time).includes(count)) return { score: score, error: "" };

  // 今と同じなら何もしない
  const now = measureLengthKind(score, i);
  if (now.kind === kind && (kind === "normal" || now.count === count)) return { score: score, error: "" };

  const full = measureTicks(time); // 拍子どおりの1小節の長さ
  const oldLength = measureLength(score, i); // 今の長さ
  const newLength = kind === "normal" ? full : (full / time.beats) * count; // 新しい長さ
  const name = measureName(score, i); // 知らせる文に使う小節の名前（変える前の名前）

  const newScore = cloneScore(score);
  for (const part of newScore.parts) {
    let notes = part.measures[i].notes;

    // ① いったん拍子どおりの長さに戻す
    if (now.kind === "short") notes = resizeFromBack(notes, full, time);
    if (now.kind === "pickup") notes = resizeFromFront(notes, oldLength, full, time);
    if (!notes) {
      // 長くするだけなので、ふつうは起きない（念のため）
      return { score: score, error: `${part.name} の${name}の長さを変えられませんでした` };
    }

    // ② 新しい形にする
    if (kind === "short") {
      notes = resizeFromBack(notes, newLength, time);
      if (!notes) {
        return { score: score, error: `${part.name} の${name}の後ろのほうに音があるので、この長さにできません` };
      }
    }
    if (kind === "pickup") {
      notes = resizeFromFront(notes, full, newLength, time);
      if (!notes) {
        return { score: score, error: `${part.name} の${name}の前のほうに音があるので、この長さにできません` };
      }
    }

    part.measures[i].notes = notes;
    cleanSpanners(part); // 消えた休符に付いていた印などを整える
  }

  // 小節の情報に、長さを書く（1つの小節には short か pickup のどちらか1つだけ）
  const info = newScore.measures[i];
  delete info.short;
  delete info.pickup;
  if (kind === "short") info.short = count;
  if (kind === "pickup") info.pickup = count;
  return { score: newScore, error: "" };
}

// ==========================================================
// ここから下は、小節の長さを選ぶだけで、番号に数えるかどうかを自動で決める関数（小節の長さの自動判断）
// 「小節」タブの「長さ」の欄で使う（ユーザーは長さだけを選ぶ）
//   決まり（上から順に調べる）
//     ・1小節目                                         → 数えない（pickup。アウフタクト）
//     ・すぐ前が「数える短い小節（short）」で、
//       2つを足すとちょうど1小節になる                   → 数えない（pickup。前の小節の続き）
//     ・それ以外（最後の小節も含む）                     → 数える（short）
//   ある小節を変えると、すぐ後ろの小節の判断も変わることがあるので、後ろの小節も見直す
// ==========================================================

// ----------------------------------------------------------
// 関数：autoLengthKind
// i 小節目を count 拍の短い小節にするとき、番号に数えるかどうか（種類）を決めて返す（小節の長さの自動判断）
//   i     … 何小節目か（0 から）
//   count … 拍の数（拍子の下の数字の音符がいくつ分か。1 以上）
// 「前の小節と足してちょうど1小節か」は、拍の数ではなくティック（長さ）で比べる
//   （前の小節と拍子がちがっても、正しく比べられるようにするため）
// 戻り値："pickup"（数えない）か "short"（数える）
// 例：4/4 で、3小節目が short: 3 のとき、4小節目を 1拍 → "pickup"、2拍 → "short"
// ----------------------------------------------------------
export function autoLengthKind(score, i, count) {
  // 1小節目はアウフタクト
  if (i === 0) return "pickup";

  // すぐ前の小節が「数える短い小節」でなければ、数える
  if (!isShortMeasure(score, i - 1)) return "short";

  // 前の小節の長さ ＋ この小節の新しい長さ が、この小節の拍子の1小節分とちょうど同じなら、続き
  const time = timeAt(score, i);
  const full = measureTicks(time); // この小節の拍子の1小節の長さ
  const newLength = (full / time.beats) * count; // この小節の新しい長さ
  if (measureLength(score, i - 1) + newLength === full) return "pickup";
  return "short";
}

// ----------------------------------------------------------
// 関数：relabelMeasure
// i 小節目の、短い小節の種類（short か pickup）だけを入れかえる（小節の長さの自動判断）
//   kind … 新しい種類（"short" か "pickup"）
// 長さ（拍の数）は同じままなので、小節の中の音はさわらない（番号の数え方・拍の線の位置だけが変わる）
// 【注意】渡された楽譜データを直接書き換える（コピーした楽譜データにだけ使う）
// ----------------------------------------------------------
function relabelMeasure(score, i, kind) {
  const info = score.measures[i];
  const count = info.pickup ?? info.short; // 今の拍の数
  delete info.short;
  delete info.pickup;
  info[kind] = count;
}

// ----------------------------------------------------------
// 関数：refreshFollowing
// i 小節目を変えたあと、すぐ後ろの小節から順に、種類（数えるか数えないか）を見直す（小節の長さの自動判断）
//   ・後ろの小節が拍子どおりなら、そこで終わり
//   ・決まりどおりの種類なら、そこで終わり
//   ・ちがっていたら種類を入れかえて（音はそのまま）、さらにその後ろを見る
// 例：4/4 で5小節目が short: 1（数える）のとき、4小節目を short: 3 にした
//     → 3 ＋ 1 ＝ 4 なので、5小節目を pickup: 1（数えない・4小節目の続き）に入れかえる
// 【注意】渡された楽譜データを直接書き換える（コピーした楽譜データにだけ使う）
// ----------------------------------------------------------
function refreshFollowing(score, i) {
  for (let j = i + 1; j < score.measures.length; j++) {
    const now = measureLengthKind(score, j);
    if (now.kind === "normal") return; // 拍子どおりの小節なら、その後ろには影響しない
    const kind = autoLengthKind(score, j, now.count);
    if (kind === now.kind) return; // 決まりどおりなら、その後ろも変わらない
    relabelMeasure(score, j, kind);
  }
}

// ----------------------------------------------------------
// 関数：setMeasureLengthAuto
// i 小節目の長さを変える。番号に数えるかどうかは、アプリが自動で決める（小節の長さの自動判断）
//   i     … 何小節目か（0 から）
//   count … 拍の数（拍子の下の数字の音符がいくつ分か）。0 なら拍子どおりに戻す
// 流れ
//   ① 種類を決める（0 なら "normal"、それ以外は autoLengthKind で決める）
//   ② 長さが今と同じで、種類だけがちがう → 種類だけ入れかえる（音はそのまま）
//      それ以外 → setMeasureLength で長さを変える
//        （数える小節は後ろの側を、数えない小節は前の側を詰める・足す）
//   ③ すぐ後ろの小節から、種類を見直す（refreshFollowing）
// 詰める所に音があるパートが1つでもあれば、何も変えずに知らせる（setMeasureLength の知らせる文をそのまま返す）
// 戻り値：{ score: 新しい楽譜データ, error: 知らせる文（うまくいったときは空の文字） }
//   （何も変わらないとき・変えられないときは、元の楽譜データのまま）
// ----------------------------------------------------------
export function setMeasureLengthAuto(score, i, count) {
  // ① 種類を決める
  const kind = count === 0 ? "normal" : autoLengthKind(score, i, count);
  const now = measureLengthKind(score, i);

  // ② 長さを変える（または種類だけ入れかえる）
  let newScore;
  if (kind !== "normal" && now.kind !== "normal" && now.count === count && now.kind !== kind) {
    // 長さが同じで種類だけちがう：音はそのままで、種類だけ入れかえる
    // （setMeasureLength だと、いったん拍子どおりに戻して反対側を詰めるので、音があると変えられなくなるため）
    newScore = cloneScore(score);
    relabelMeasure(newScore, i, kind);
  } else {
    const result = setMeasureLength(score, i, kind, count);
    if (result.error) return result; // 変えられなかった：知らせる文をそのまま返す
    newScore = result.score === score ? cloneScore(score) : result.score; // 見直しで書き換えるので、コピーにしておく
  }

  // ③ すぐ後ろの小節から、種類を見直す
  refreshFollowing(newScore, i);

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
    const measure = { notes: restsForSpan(0, measureLength(newScore, m), time) }; // アウフタクトなら短い長さ（ステップ15-1）
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
