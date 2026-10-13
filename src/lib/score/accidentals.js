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
//   tiedIn  … 前の小節の最後の音から、タイでつながってきているなら true
// 戻り値：音符と同じ順番の配列。記号を付けない音は null
//   例：[null, 'n', null, '#']
// ----------------------------------------------------------
export function computeAccidentals(notes, key, tiedIn) {
  // 調号どおりの ♯♭ の表
  const base = keyAlters(key);

  // この小節で効いている記号の表（ルール③⑤）
  // キーは「音名＋オクターブ」（例：'F4'）、値は alter の数字
  const current = {};

  // 1つ前の音がタイでつながっているか（最初は前の小節からのタイ）
  let prevTie = tiedIn;

  // 結果を入れる配列
  const result = [];

  for (const note of notes) {
    // 休符には記号を付けない（タイも途切れる）
    if (note.rest) {
      result.push(null);
      prevTie = false;
      continue;
    }

    const { step, octave } = note.pitch;
    const alter = note.pitch.alter ?? 0;
    const name = `${step}${octave}`;

    // ルール⑥：タイの続きの音には付けない（表も変えない）
    if (prevTie) {
      result.push(null);
      prevTie = note.tie ?? false;
      continue;
    }

    // 今効いている値（この小節でまだ記号を付けていなければ調号どおり）
    const expected = current[name] ?? base[step];

    if (alter === expected) {
      // ルール①③：今効いている値と同じなので記号なし
      result.push(null);
    } else {
      // ルール②：違うので記号を付けて、表を書き換える
      result.push(ALTER_TO_ACCIDENTAL[String(alter)]);
      current[name] = alter;
    }

    // 次の音のために、この音がタイでつながっているかを覚えておく
    prevTie = note.tie ?? false;
  }

  return result;
}
