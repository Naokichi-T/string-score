// ==========================================================
// render/helpers.js
// 描くときに使う、ちょっとした変換の関数
// ==========================================================

// ----------------------------------------------------------
// 関数：timeToString
// 拍子のデータを VexFlow の書き方に変換する
// 例：{ beats: 4, beatType: 4 } → '4/4'
// ----------------------------------------------------------
export function timeToString(time) {
  return `${time.beats}/${time.beatType}`;
}

// ----------------------------------------------------------
// 関数：timeToSignature
// 拍子記号として描くときの、VexFlow の書き方に変換する（ステップ8-1b）
// コモンタイム・カットタイムの印（symbol）があれば、記号で描く書き方にする
// 例：{ beats: 4, beatType: 4, symbol: 'common' } → 'C'（コモンタイム）
//     { beats: 2, beatType: 2, symbol: 'cut' }    → 'C|'（カットタイム）
//     { beats: 3, beatType: 4 }                   → '3/4'
// ----------------------------------------------------------
export function timeToSignature(time) {
  if (time.symbol === "common") return "C";
  if (time.symbol === "cut") return "C|";
  return timeToString(time);
}

// ----------------------------------------------------------
// 関数：keyToVexKey
// 調号（♯の数がプラス、♭の数がマイナス）を VexFlow の長調の名前に変換する
// 例：0 → 'C'、2 → 'D'（♯2つ）、-1 → 'F'（♭1つ）
// ----------------------------------------------------------
export function keyToVexKey(key) {
  // 添え字 0 が ♭7つ、7 が調号なし、14 が ♯7つ
  const names = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  return names[key + 7];
}
