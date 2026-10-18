// ==========================================================
// stems.js
// 符尾（音符の棒）の向きを決める処理と、［符尾↑］［符尾↓］のボタンの処理（ステップ22）
//
// 【データの持ち方】
//   音符ごとに、決めた向きを stem に覚える（印がない音符は、今までどおり自動で決まる）
//     stem: "up"   … 上向き
//     stem: "down" … 下向き
//
// 【向きの決め方】
//   ・連桁でつながった音符と、連符の中の音符は、1つの「まとまり」として同じ向きにする
//     まとまりの中で、いちばん前にある「向きを決めた音符」の向きに、まとまり全部をそろえる
//   ・まとまりに入っていない音符は、その音符の印のとおり
//   ・休符と全音符は符尾がないので、印があっても使わない
//
// VexFlow を使わずに計算するので、画面（render.js）と MusicXML の書き出し・読み込みの両方で使える
// edit.js と同じく、楽譜データを直接書き換えずに、新しい楽譜データを作って返す
// ==========================================================

import { tupletGroups, notePitches, timeAt, measureOffset } from "./model.js";
import { measureBeamGroups } from "./beams.js";
import { cloneScore } from "./edit.js";

// ----------------------------------------------------------
// 関数：hasStem
// 符尾のある音符か（休符でなく、全音符でない）
// ----------------------------------------------------------
export function hasStem(note) {
  return !!note && !note.rest && note.duration !== "whole";
}

// ----------------------------------------------------------
// 関数：linkedComponents
// 1小節の音を「同じ向きにそろえるまとまり」に分ける
//   ・連桁でつながった音符（beams.js の measureBeamGroups と同じつなぎ方）
//   ・連符の中の音（連桁のない4分音符の3連符なども入る）
//   まとまりどうしが重なったら（連桁でつながった連符など）、1つにまとめる
//   notes  … 小節の音のデータの並び
//   time   … 小節の拍子
//   offset … 小節の頭が、拍子どおりの1小節の中のどの位置にあたるか（アウフタクトの小節だけ 0 より大きい）
// 戻り値：
//   components … まとまりごとの「音の番号」の配列の配列（1つだけの音もまとまり1つになる。番号は小さい順）
//   beamed     … 音の番号ごとに、連桁でつながっているか（true / false）
// ----------------------------------------------------------
function linkedComponents(notes, time, offset) {
  // 「親」をたどって、同じまとまりの代表の番号を見つけるしくみ（Union-Find という決まった方法）
  const parent = notes.map((_, k) => k);
  const find = (k) => {
    while (parent[k] !== k) k = parent[k];
    return k;
  };
  const join = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };

  // 連桁のまとまり
  const beamed = notes.map(() => false);
  measureBeamGroups(notes, time, offset).forEach((group) => {
    group.forEach((k) => {
      // 連符のまとまりには休符が入ることがあるが、休符は連桁につながらないので数えない
      if (!notes[k].rest) beamed[k] = true;
      join(group[0], k);
    });
  });

  // 連符のまとまり
  tupletGroups(notes).forEach((group) => {
    for (let k = group.start; k <= group.end; k++) join(group.start, k);
  });

  // 代表の番号ごとに集める
  const map = new Map();
  notes.forEach((_, k) => {
    const root = find(k);
    if (!map.has(root)) map.set(root, []);
    map.get(root).push(k);
  });
  return { components: [...map.values()], beamed: beamed };
}

// ----------------------------------------------------------
// 関数：measureStemDirections
// 1小節の音ごとの「決めた符尾の向き」を返す（画面と MusicXML の書き出しで使う）
//   notes  … 小節の音のデータの並び
//   time   … 小節の拍子
//   offset … 小節の頭が、拍子どおりの1小節の中のどの位置にあたるか
// 戻り値：音の番号ごとの "up"・"down"・null（null は自動で決める）
// ・まとまりの中では、いちばん前の「向きを決めた音符」の向きに全部そろえる
// ----------------------------------------------------------
export function measureStemDirections(notes, time, offset = 0) {
  const result = notes.map(() => null);
  const { components } = linkedComponents(notes, time, offset);
  components.forEach((component) => {
    // まとまりの中で、いちばん前の「向きを決めた音符」
    const leader = component.find((k) => hasStem(notes[k]) && (notes[k].stem === "up" || notes[k].stem === "down"));
    if (leader === undefined) return; // 決めた音符がなければ、自動のまま
    const direction = notes[leader].stem;
    component.forEach((k) => {
      if (hasStem(notes[k])) result[k] = direction;
    });
  });
  return result;
}

// ----------------------------------------------------------
// 関数：targetNotes
// ボタンで向きを変える音の一覧を作る
//   ・範囲を選んでいれば範囲の中の音、そうでなければ選んでいる1つの音
//   ・その音が連桁・連符のまとまりに入っていれば、まとまり全部も入れる
// 戻り値：{ part, items: [{ measure, note }, ...] }（何も選んでいなければ null）
// ----------------------------------------------------------
function targetNotes(score, selection, range) {
  const target = range ?? (selection ? { part: selection.part, start: selection, end: selection } : null);
  if (!target) return null;
  const measures = score.parts[target.part].measures;
  const items = [];
  for (let m = target.start.measure; m <= target.end.measure; m++) {
    const notes = measures[m].notes;
    const from = m === target.start.measure ? target.start.note : 0;
    const to = m === target.end.measure ? target.end.note : notes.length - 1;
    // 選んだ音と同じまとまりの音も入れる
    const picked = new Set();
    const { components } = linkedComponents(notes, timeAt(score, m), measureOffset(score, m));
    components.forEach((component) => {
      if (component.some((k) => k >= from && k <= to)) component.forEach((k) => picked.add(k));
    });
    [...picked].sort((a, b) => a - b).forEach((k) => items.push({ measure: m, note: k }));
  }
  return { part: target.part, items: items };
}

// ----------------------------------------------------------
// 関数：stemState
// 選んでいる音（範囲）の、今の符尾の向きの状態（ボタンを青くするのに使う）
// 戻り値：
//   "up"   … 符尾のある音が全部、上向きに決めてある
//   "down" … 符尾のある音が全部、下向きに決めてある
//   null   … 自動のもの・向きがまじっている・符尾のある音がない
// ----------------------------------------------------------
export function stemState(score, selection, range) {
  const target = targetNotes(score, selection, range);
  if (!target) return null;
  const measures = score.parts[target.part].measures;
  // 小節ごとに、画面と同じ決め方で向きを出しておく
  const directionsByMeasure = new Map();
  const directionOf = (m, k) => {
    if (!directionsByMeasure.has(m)) directionsByMeasure.set(m, measureStemDirections(measures[m].notes, timeAt(score, m), measureOffset(score, m)));
    return directionsByMeasure.get(m)[k];
  };
  const directions = target.items.filter(({ measure, note }) => hasStem(measures[measure].notes[note])).map(({ measure, note }) => directionOf(measure, note));
  if (directions.length === 0) return null;
  if (directions.every((d) => d === "up")) return "up";
  if (directions.every((d) => d === "down")) return "down";
  return null;
}

// ----------------------------------------------------------
// 関数：canChangeStem
// ［符尾↑］［符尾↓］を押せるか（選んでいる音（範囲）の中に、符尾のある音符があるか）
// ----------------------------------------------------------
export function canChangeStem(score, selection, range) {
  const target = targetNotes(score, selection, range);
  if (!target) return false;
  const measures = score.parts[target.part].measures;
  return target.items.some(({ measure, note }) => hasStem(measures[measure].notes[note]));
}

// ----------------------------------------------------------
// 関数：setStem
// ［符尾↑］［符尾↓］が押されたとき：選んでいる音（範囲）とそのまとまりの符尾の向きを決める
//   direction … "up" か "down"
// ・もう全部その向きに決めてあれば（ボタンが青いとき）、印を外して自動に戻す
// ・そうでなければ、全部その向きにする
// ・休符・全音符の印は外す（符尾がないので意味がない）
// 戻り値：新しい楽譜データ
// ----------------------------------------------------------
export function setStem(score, selection, range, direction) {
  const target = targetNotes(score, selection, range);
  if (!target) return score;
  const backToAuto = stemState(score, selection, range) === direction;
  const newScore = cloneScore(score);
  const measures = newScore.parts[target.part].measures;
  target.items.forEach(({ measure, note }) => {
    const data = measures[measure].notes[note];
    if (!hasStem(data) || backToAuto) {
      delete data.stem;
    } else {
      data.stem = direction;
    }
  });
  return newScore;
}

// ==========================================================
// MusicXML の読み込み用（ステップ22）
// ほかのアプリのファイルには、全部の音符に <stem> が書いてあることが多い
// そのまま全部を「決めた向き」にすると、あとで高さを変えても向きが変わらなくなるので、
// 自動と同じ向きの所は印を外して、自動と違う所だけ残す（連桁の印 cleanMarks と同じ考え方）
// ==========================================================

// 音名 → ドから数えて何番目か（VexFlow の決め方と同じ）
const STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// 音部記号ごとの、五線の上の位置のずれ（VexFlow の clefProperties の lineShift と同じ数）
const CLEF_SHIFT = { treble: 0, alto: 3, tenor: 4, bass: 6 };

// 五線のまん中の線（VexFlow の数え方で、いちばん下の線が 1、まん中の線が 3）
const MIDDLE_LINE = 3;

// ----------------------------------------------------------
// 関数：staffLine
// 音の高さが、五線のどの位置か（VexFlow の keyProperties の line と同じ計算）
//   例：ト音記号のシ4 → 3（まん中の線）、ミ4 → 1（いちばん下の線）
// ----------------------------------------------------------
function staffLine(pitch, clef) {
  return (pitch.octave * 7 - 4 * 7 + STEP_INDEX[pitch.step]) / 2 + (CLEF_SHIFT[clef] ?? 0);
}

// ----------------------------------------------------------
// 関数：autoNoteDirection
// 連桁のない音符の、自動の向き（VexFlow の calculateOptimalStemDirection と同じ決め方）
//   いちばん低い玉といちばん高い玉のまん中が、まん中の線より下なら上向き、そうでなければ下向き
// ----------------------------------------------------------
function autoNoteDirection(note, clef) {
  const lines = notePitches(note).map((pitch) => staffLine(pitch, clef));
  const middle = (Math.min(...lines) + Math.max(...lines)) / 2;
  return middle < MIDDLE_LINE ? "up" : "down";
}

// ----------------------------------------------------------
// 関数：autoBeamDirection
// 連桁でつながった音符の、自動の向き（VexFlow の Beam の calculateStemDirection と同じ決め方）
//   全部の玉の「まん中の線からの位置」を足して、0 以上なら下向き、マイナスなら上向き
// ----------------------------------------------------------
function autoBeamDirection(notes, clef) {
  let sum = 0;
  notes.forEach((note) => {
    notePitches(note).forEach((pitch) => {
      sum = sum + (staffLine(pitch, clef) - MIDDLE_LINE);
    });
  });
  return sum >= 0 ? "down" : "up";
}

// ----------------------------------------------------------
// 関数：stemsFromFile
// MusicXML から読んだ符尾の向き（音ごとの stem）を整える（読み込み用）
//   notes  … 小節の音のデータの並び（読み込みで、ファイルの <stem> を stem に入れてある）
//   clef   … その小節の音部記号
//   time   … 小節の拍子
//   offset … 小節の頭が、拍子どおりの1小節の中のどの位置にあたるか
// ・まとまりごとに、ファイルの向きが全部「自動と同じ（か書いていない）」なら、印を外す
// ・自動と違う所があれば、まとまり全部を、いちばん前の書いてあった向きにそろえる
// （notes を直接書き換える）
// ----------------------------------------------------------
export function stemsFromFile(notes, clef, time, offset = 0) {
  // 休符・全音符の印は外す
  notes.forEach((note) => {
    if (!hasStem(note)) delete note.stem;
  });

  const { components, beamed } = linkedComponents(notes, time, offset);
  components.forEach((component) => {
    const stemmed = component.filter((k) => hasStem(notes[k]));
    if (stemmed.length === 0) return;

    // 自動の向き：連桁でつながった音符は、連桁のまとまりで決める
    //   （連桁のまとまりは、linkedComponents の中の連桁の音だけで計算する）
    const beamedNotes = stemmed.filter((k) => beamed[k]).map((k) => notes[k]);
    const beamDirection = beamedNotes.length > 1 ? autoBeamDirection(beamedNotes, clef) : null;
    const autoOf = (k) => (beamed[k] && beamDirection ? beamDirection : autoNoteDirection(notes[k], clef));

    // ファイルの向きが、全部自動と同じか（書いていない音は、自動と同じとみなす）
    const sameAsAuto = stemmed.every((k) => !notes[k].stem || notes[k].stem === autoOf(k));
    if (sameAsAuto) {
      stemmed.forEach((k) => delete notes[k].stem);
      return;
    }

    // 自動と違う：いちばん前の書いてあった向きに、まとまり全部をそろえる
    const leader = stemmed.find((k) => notes[k].stem);
    const direction = notes[leader].stem;
    stemmed.forEach((k) => {
      notes[k].stem = direction;
    });
  });
}
