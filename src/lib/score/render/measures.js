// ==========================================================
// render/measures.js
// 小節ごとの状態（拍子・調・音部記号と、その変化）と、
// 小節の頭に付ける記号（音部記号・調号・拍子記号）を扱う
// ==========================================================

import { CLEFS, hasPickup, measureOffset, isShortEnd } from "../model.js";
import { timeToSignature, keyToVexKey } from "./helpers.js";

// 2段目からの段の頭で、音部記号・調号と最初の音符の間に空けるすき間（ピクセル）
// （VexFlow のままだと、最初の音符が音部記号にくっついて、段をまたぐタイを描く場所がない）
export const LINE_START_PADDING = 12;

// ----------------------------------------------------------
// 関数：buildStates
// 楽譜全体を最初の小節から順に見ていき、小節ごとの「状態」を作る
//   状態 = その小節の拍子・調・パートごとの音部記号と、
//          その小節の頭で「何が変わったか」
// こうしておくと、描くときに前の小節をさかのぼらなくてよい
// 戻り値の例（小節ごと）：
//   { time, key, prevKey, clefs: ['treble', ...],
//     timeChanged, keyChanged, clefChanged: [false, ...],
//     voiceTime, offset }
// （ステップ15-1：アウフタクトのために voiceTime と offset を足した）
//   voiceTime … VexFlow の声部（Voice）に渡す長さ { beats, beatType }
//               ふつうは拍子と同じ。アウフタクトの小節では、アウフタクトの拍の数（例：4/4 で1拍なら { beats: 1, beatType: 4 }）
//   offset    … 小節の頭が、拍子どおりの1小節の中のどの位置にあたるか（ティック。model.js の measureOffset）
//               アウフタクトの小節だけ 0 より大きい（拍の線・連桁のつなぎ方を、拍子どおりの位置にそろえるのに使う）
// ----------------------------------------------------------
export function buildStates(score) {
  const states = [];

  // 今の値（小節を進みながら更新する）
  let time = null;
  let key = 0;
  const clefs = score.parts.map(() => "treble");

  score.measures.forEach((info, i) => {
    // 拍子が変わったか（最初の小節は必ず表示するので true 扱い）
    // （ステップ8-1b：4/4 と C のように、長さが同じでも書き方が違えば「変わった」とする）
    const timeChanged = i === 0 || (info.time !== undefined && timeToSignature(info.time) !== timeToSignature(time));
    if (info.time) time = info.time;

    // 調が変わったか（最初の小節は必ず表示するので true 扱い）
    const prevKey = key;
    const keyChanged = i === 0 || (info.key !== undefined && info.key !== key);
    if (info.key !== undefined) key = info.key;

    // パートごとに音部記号が変わったか（最初の小節は必ず表示する）
    const clefChanged = score.parts.map((part, p) => {
      const newClef = part.measures[i].clef;
      const changed = i === 0 || (newClef !== undefined && newClef !== clefs[p]);
      if (newClef) clefs[p] = newClef;
      return changed;
    });

    // 声部に渡す長さと、小節の頭の位置（ステップ15-1）
    const isPickup = i === 0 && hasPickup(score);
    // 短い最後の小節も、その長さで声部を作る（ステップ20）
    const voiceTime = isPickup ? { beats: info.pickup, beatType: time.beatType } : isShortEnd(score, i) ? { beats: info.short, beatType: time.beatType } : time;

    states.push({
      time: time,
      key: key,
      prevKey: prevKey,
      clefs: [...clefs], // その時点の値を写しておく
      timeChanged: timeChanged,
      keyChanged: keyChanged,
      clefChanged: clefChanged,
      voiceTime: voiceTime,
      offset: isPickup ? measureOffset(score, i) : 0,
    });
  });

  return states;
}

// ----------------------------------------------------------
// 関数：addModifiers
// 小節の頭に付ける記号（音部記号・調号・拍子記号）を五線に付ける
//   VF          … VexFlow の部品一式
//   stave       … 記号を付ける五線
//   state       … その小節の状態（buildStates で作ったもの）
//   p           … パートの番号（0 が一番上）
//   isLineStart … 段の最初の小節なら true
//   isFirst     … 楽譜の最初の小節なら true
// ----------------------------------------------------------
export function addModifiers(VF, stave, state, p, isLineStart, isFirst) {
  // 音部記号
  //   段の頭 → いつもふつうの大きさで付ける
  //   段の途中で変わる → 少し小さめで付ける
  if (isLineStart) {
    stave.addClef(CLEFS[state.clefs[p]].vf, "default");
  } else if (state.clefChanged[p]) {
    stave.addClef(CLEFS[state.clefs[p]].vf, "small");
  }

  // 調号
  //   途中で変わる → 前の調号の記号を♮で消してから新しい調号
  //   段の頭（変わらない）→ 今の調号をそのまま付ける
  if (state.keyChanged && !isFirst) {
    stave.addKeySignature(keyToVexKey(state.key), keyToVexKey(state.prevKey));
  } else if (isLineStart) {
    stave.addKeySignature(keyToVexKey(state.key));
  }

  // 拍子記号（変わる小節だけ。最初の小節は変わる扱い）
  if (state.timeChanged) {
    stave.addTimeSignature(timeToSignature(state.time)); // C・¢ の印があれば記号で描く（ステップ8-1b）
  }
}

// ----------------------------------------------------------
// 関数：measureModifierWidth
// 小節の頭の記号（音部記号・調号・拍子記号）の幅を、全パートの中で一番広いもので測る
// （試しの五線を作って、記号を付けたときに音符がどこから始まるかを見る）
// ----------------------------------------------------------
export function measureModifierWidth(VF, state, partCount, isLineStart, isFirst) {
  let maxWidth = 0;
  for (let p = 0; p < partCount; p++) {
    const testStave = new VF.Stave(0, 0, 500);
    addModifiers(VF, testStave, state, p, isLineStart, isFirst);
    const width = testStave.getNoteStartX() - testStave.getX();
    if (width > maxWidth) maxWidth = width;
  }
  // 2段目からの段の頭なら、最初の音符の前のすき間のぶんも足す
  if (isLineStart && !isFirst) maxWidth = maxWidth + LINE_START_PADDING;
  return maxWidth;
}
