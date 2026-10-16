// ==========================================================
// accidentals.js
// 臨時記号（♯・♭・♮）をどの音に付けるかを自動で決めるファイル
// ==========================================================
//
// 【ルール】
// ① 調号どおりの音には何も付けない
// ② 調号と違う音には記号を付ける
// ③ 一度付けた記号は、その小節の終わりまで同じ高さの音に効く
// ④ 小節が変わったら、また調号どおりに戻る
// ⑤ ③は同じオクターブだけに効く
// ⑥ タイでつながった後ろの音には付けない（小節をまたいでも）
// ==========================================================

import { notePitches } from "./model.js"; // 音符の高さを低い順の配列にする（重音なら全部）（ステップ14-1）

// ♯が付いていく順番（ファ・ド・ソ・レ・ラ・ミ・シ）
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];

// ♭が付いていく順番（シ・ミ・ラ・レ・ソ・ド・ファ）
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

// alter の数字と VexFlow の臨時記号の書き方の対応表
const ALTER_TO_ACCIDENTAL = {
  "-2": "bb", // ダブルフラット
  "-1": "b", // フラット
  0: "n", // ナチュラル
  1: "#", // シャープ
  2: "##", // ダブルシャープ
};

// ----------------------------------------------------------
// 関数：keyAlters
// 調号から、ドレミファソラシそれぞれの「調号どおりの ♯♭」を表にする
// 例：2（♯2つ・ニ長調）→ { C: 1, D: 0, E: 0, F: 1, G: 0, A: 0, B: 0 }
// ----------------------------------------------------------
export function keyAlters(key) {
  // まず全部 0（♯♭なし）にしておく
  const alters = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };

  if (key > 0) {
    // ♯の調：♯の数だけ、順番どおりに +1 する
    for (let i = 0; i < key; i++) {
      alters[SHARP_ORDER[i]] = 1;
    }
  } else if (key < 0) {
    // ♭の調：♭の数だけ、順番どおりに -1 する
    for (let i = 0; i < -key; i++) {
      alters[FLAT_ORDER[i]] = -1;
    }
  }

  return alters;
}

// ----------------------------------------------------------
// 関数：computeAccidentals
// 1小節分の音符について、それぞれに付ける臨時記号を決める
//   notes   … 1小節分の音符・休符のデータの配列
//   key     … 今の調号（♯の数がプラス、♭の数がマイナス）
//   tiedIn  … 前の小節の最後の音が、タイでこの小節につながっているなら、その音のデータ（つながっていなければ null）
//              （ステップ14-1：重音で「どの高さがつながっているか」を見るため、true / false から音のデータに変えた）
// 戻り値：音符と同じ順番の配列。1つの音符ぶんは「高さごと（低い順）の臨時記号の配列」（ステップ14-1）
//   記号を付けない高さは null、休符は空の配列
//   例：[[null], ['n'], [], [null, '#']]（4つ目はラ＋ド♯の重音）
// 重音の中の音も、1つずつ同じ決まりで決める（同じ重音の中で、前の音に付けた記号も効く）
// ----------------------------------------------------------
export function computeAccidentals(notes, key, tiedIn) {
  // 調号どおりの ♯♭ の表
  const base = keyAlters(key);

  // この小節で効いている記号の表（ルール③⑤）
  // キーは「音名＋オクターブ」（例：'F4'）、値は alter の数字
  const current = {};

  // 1つ前の音で、タイでこの音につながっているもの（最初は前の小節からのタイ。なければ null）
  let prevTied = tiedIn;

  // 結果を入れる配列
  const result = [];

  for (const note of notes) {
    // 休符には記号を付けない（タイも途切れる）
    if (note.rest) {
      result.push([]);
      prevTied = null;
      continue;
    }

    // 1つ前の音の高さ（タイでつながっているときだけ）
    const tiedPitches = prevTied ? notePitches(prevTied) : [];

    // 高さごとに決める（低い順）
    const marks = notePitches(note).map((pitch) => {
      const { step, octave } = pitch;
      const alter = pitch.alter ?? 0;
      const name = `${step}${octave}`;

      // ルール⑥：タイの続きの音（前の音に同じ高さがある）には付けない（表も変えない）
      if (tiedPitches.some((p) => p.step === step && p.octave === octave && (p.alter ?? 0) === alter)) {
        return null;
      }

      // 今効いている値（この小節でまだ記号を付けていなければ調号どおり）
      const expected = current[name] ?? base[step];

      if (alter === expected) {
        // ルール①③：今効いている値と同じなので記号なし
        return null;
      }
      // ルール②：違うので記号を付けて、表を書き換える
      current[name] = alter;
      return ALTER_TO_ACCIDENTAL[String(alter)];
    });
    result.push(marks);

    // 次の音のために、この音がタイでつながっているなら覚えておく
    prevTied = note.tie ? note : null;
  }

  return result;
}
