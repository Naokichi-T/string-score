// ==========================================================
// render/tuplets.js
// 連符を描くための処理（ステップ10-2）
//   ・連符（VexFlow の Tuplet）を作る
//   ・連桁（8分音符などの横棒）を、連符を切らないようにつなぐ
//   ・連符の数字を置く側（上か下か）と、括弧を付けるかを決める
// ==========================================================

import { tupletGroups, noteTicks, TICKS_PER_16TH } from "../model.js";
import { timeToString } from "./helpers.js";

// 全音符1つ分のティック（VexFlow の長さは「全音符の何分のいくつか」で書くため）
const WHOLE_TICKS = 16 * TICKS_PER_16TH;

// ----------------------------------------------------------
// 関数：createTuplets
// 1小節分の連符を作る
//   VF          … VexFlow の部品一式
//   notes       … 小節の音のデータの並び
//   staveNotes  … その音から作った VexFlow の音符の並び（同じ順番）
// VexFlow の Tuplet を作ると、中の音符の長さが連符の長さ（3連符なら 2/3）に変わる
// 声部（Voice）に入れる前に長さを決めておかないと、小節の長さが合わなくなるので、
// 声部を作る前に呼ぶこと
// 戻り値：[{ tuplet: VexFlow の連符, staveNotes: 連符の中の音符, notes: 連符の中の音のデータ }, ...]
// ----------------------------------------------------------
export function createTuplets(VF, notes, staveNotes) {
  return tupletGroups(notes).map((group) => {
    const groupStaveNotes = staveNotes.slice(group.start, group.end + 1);

    // 休符の高さを覚えておく
    // （VexFlow の Tuplet は、作るときに休符をまわりの音符の高さに動かしてしまう。
    //   連符でない所と同じように五線のまん中に置きたいので、あとで元に戻す）
    const restLines = groupStaveNotes.map((staveNote) => (staveNote.isRest() ? staveNote.getKeyLine(0) : null));

    const tuplet = new VF.Tuplet(groupStaveNotes, {
      numNotes: group.actual, // 連符の数字（3連符なら 3）
      notesOccupied: group.normal, // 何個分の長さに入れるか（3連符なら 2）
      ratioed: false, // 「6:4」のような比ではなく、「6」だけを書く
    });

    // 休符の高さを元に戻す
    groupStaveNotes.forEach((staveNote, k) => {
      if (restLines[k] !== null) staveNote.setKeyLine(0, restLines[k]);
    });

    return { tuplet: tuplet, staveNotes: groupStaveNotes, notes: notes.slice(group.start, group.end + 1) };
  });
}

// ----------------------------------------------------------
// 関数：createBeams
// 1小節分の連桁を作る
//   VF         … VexFlow の部品一式
//   notes      … 小節の音のデータの並び
//   staveNotes … その音から作った VexFlow の音符の並び（同じ順番）
//   time       … その小節の拍子
//   offset     … 小節の頭が、拍子どおりの1小節の中のどの位置にあたるか（ティック。アウフタクトの小節だけ 0 より大きい）（ステップ15-1）
//                 例：6/8 で8分音符4つ分のアウフタクト → 8分音符2つ分。連桁は「拍子どおりの小節の後ろの部分」として区切る
// 【考え方】
//   小節を「連符」と「連符でない所」に区切って、区切りごとに連桁を作る
//     ・連符でない所 … 今までと同じように、拍子に合わせてつなぐ
//     ・連符         … 連符の中を全部1本でつなぐ（12連符のように1拍より長くても切らない）
//                      4分音符以上の連符は、連桁がないので何もしない
// 戻り値：VexFlow の連桁の配列
// ----------------------------------------------------------
export function createBeams(VF, notes, staveNotes, time, offset = 0) {
  // 音ごとの始まりの位置（小節の頭から何ティックか）と、小節の長さ
  const starts = [];
  let position = 0;
  notes.forEach((note) => {
    starts.push(position);
    position = position + noteTicks(note);
  });
  const measureLength = position;

  // 拍子に合わせた「区切りの位置」（例：4分の4拍子なら、4分音符ごと）
  // アウフタクトの小節では、拍子どおりの1小節で区切りを作ってから、小節の頭の位置（offset）だけ前にずらす（ステップ15-1）
  const gridPoints = beatGridPoints(VF, time, measureLength + offset)
    .map((point) => point - offset)
    .filter((point) => point > 0);

  // 小節を区切りに分ける（連符は1つずつ、連符でない所はひとまとまり）
  const groups = tupletGroups(notes);
  const segments = []; // { from: 最初の音の番号, to: 最後の音の番号, isTuplet }
  let j = 0;
  groups.forEach((group) => {
    if (j < group.start) segments.push({ from: j, to: group.start - 1, isTuplet: false });
    segments.push({ from: group.start, to: group.end, isTuplet: true, duration: group.duration });
    j = group.end + 1;
  });
  if (j < notes.length) segments.push({ from: j, to: notes.length - 1, isTuplet: false });

  // 区切りごとに連桁を作る
  const beams = [];
  segments.forEach((segment) => {
    const segmentNotes = staveNotes.slice(segment.from, segment.to + 1);
    const segmentStart = starts[segment.from];
    const segmentEnd = segment.to + 1 < notes.length ? starts[segment.to + 1] : measureLength;

    let lengths; // つなぐまとまりの長さの並び（ティック）
    if (segment.isTuplet) {
      // 4分音符以上の連符には連桁がない
      if (!["eighth", "16th"].includes(segment.duration)) return;
      // 連符の中は全部1本でつなぐ
      lengths = [segmentEnd - segmentStart];
    } else {
      // 拍子の区切りのうち、この区切りの中にあるものでまとまりを分ける
      const points = [segmentStart, ...gridPoints.filter((p) => p > segmentStart && p < segmentEnd), segmentEnd];
      lengths = [];
      for (let k = 0; k < points.length - 1; k++) {
        lengths.push(points[k + 1] - points[k]);
      }
    }

    // VexFlow の書き方（全音符の何分のいくつか）にして、連桁を作る
    const fractions = lengths.map((length) => new VF.Fraction(length, WHOLE_TICKS).simplify());
    beams.push(...VF.Beam.generateBeams(segmentNotes, { groups: fractions }));
  });
  return beams;
}

// ----------------------------------------------------------
// 関数：beatGridPoints
// 拍子に合わせた「連桁を区切る位置」の一覧を作る（小節の頭は入れない）
// 区切りの長さは VexFlow の決まり（getDefaultBeamGroups）を使う（今までと同じつなぎ方にするため）
//   例：4分の4拍子 → 4分音符ごと、8分の6拍子 → 付点4分音符ごと
// 戻り値：小節の頭から何ティックかの配列（最後は小節の終わり）
// ----------------------------------------------------------
function beatGridPoints(VF, time, measureLength) {
  const defaults = VF.Beam.getDefaultBeamGroups(timeToString(time));
  // 区切りの長さをティックにする（例：1/4 → 4分音符のティック）
  const lengths = defaults.map((f) => (f.numerator * WHOLE_TICKS) / f.denominator);
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
// 関数：placeTuplets
// 連符の数字を置く側と、括弧を付けるかを決める（連桁を作ったあとで呼ぶ）
//   VF       … VexFlow の部品一式
//   tuplets  … createTuplets で作ったもの
// ・数字は、符尾（棒）のある側に置く（休符は数えず、最初の音符の符尾の向きで決める）
// ・中の音符が全部連桁でつながっていれば数字だけ、そうでなければ括弧も付ける
// ----------------------------------------------------------
export function placeTuplets(VF, tuplets) {
  tuplets.forEach((entry) => {
    // 最初の音符（休符でないもの）の符尾の向き（1 なら上向き）
    const firstNote = entry.staveNotes.find((staveNote, k) => !entry.notes[k].rest);
    const stemUp = !firstNote || firstNote.getStemDirection() === 1;
    entry.tuplet.setTupletLocation(stemUp ? VF.Tuplet.LOCATION_TOP : VF.Tuplet.LOCATION_BOTTOM);

    // 括弧を付けるか
    entry.tuplet.setBracketed(entry.staveNotes.some((staveNote) => !staveNote.hasBeam()));
  });
}
