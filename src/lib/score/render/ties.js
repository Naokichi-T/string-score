// ==========================================================
// render/ties.js
// タイ（同じ高さの音をつなぐ弧）を描く
// ==========================================================

// ----------------------------------------------------------
// 関数：drawTie
// タイの弧を描く（重音なら、つなぐ玉の組ごとに1本ずつ）
//   firstNote    … タイの始まりの音（null なら段の頭から始まる弧）
//   lastNote     … タイの終わりの音（null なら段の終わりまでの弧）
//   firstIndexes … 始まりの音の、何番目の玉（低い順。0 から）から出すかの配列（ステップ14-1）
//   lastIndexes  … 終わりの音の、何番目の玉へつなぐかの配列（firstIndexes と同じ順番）（ステップ14-1）
//                  （ふつうの音符は玉が1つなので、どちらも [0]）
// ----------------------------------------------------------
export function drawTie(VF, context, firstNote, lastNote, firstIndexes = [0], lastIndexes = [0]) {
  // 段の頭から始まる弧は、VexFlow にまかせると音部記号に重なるので、自分で描く
  if (firstNote === null) {
    lastIndexes.forEach((index) => drawLineStartTie(VF, context, lastNote, index));
    return;
  }

  new VF.StaveTie({
    firstNote: firstNote,
    lastNote: lastNote,
    firstIndexes: firstIndexes, // 始まりの音の、どの玉から出すか
    lastIndexes: lastIndexes, // 終わりの音の、どの玉へつなぐか
  })
    .setContext(context)
    .draw();
}

// ----------------------------------------------------------
// 見た目の設定（単位はピクセル。VexFlow のタイと同じくらいの形にする）
// ----------------------------------------------------------
const TIE_Y_SHIFT = 7; // 音符の玉のまん中から、弧の端までの上下のずれ
const TIE_CURVE_OUTER = 12; // 弧の外側の線のふくらみ
const TIE_CURVE_INNER = 8; // 弧の内側の線のふくらみ（外側との差が弧の太さになる）
const TIE_MIN_LENGTH = 14; // 弧の最低の長さ
const TIE_GAP = 2; // 音部記号・調号と弧のすき間、弧と音符のすき間

// ----------------------------------------------------------
// 関数：drawLineStartTie
// 段の頭から始まるタイの弧を描く（前の段から続いてきたタイの、後半の部分）
// 音部記号・調号のすぐ右から、音符の玉の手前までの弧にする
//   lastNote … タイの終わりの音（この段の最初の音）
//   index    … その音の、何番目の玉（低い順）へつなぐか（ステップ14-1）
// ----------------------------------------------------------
function drawLineStartTie(VF, context, lastNote, index = 0) {
  const stave = lastNote.getStave();

  // 横の位置：右の端は玉の手前、左の端は音部記号・調号のすぐ右
  const x2 = lastNote.getTieLeftX() - TIE_GAP;
  let x1 = stave.getNoteStartX() + TIE_GAP;
  // 短すぎるときは、左にのばして最低の長さにする
  if (x2 - x1 < TIE_MIN_LENGTH) x1 = x2 - TIE_MIN_LENGTH;

  // 弧の向き：符尾が上向きなら下に、下向きなら上に（VexFlow のタイと同じ）
  const stemUp = lastNote.hasStem() && lastNote.getStemDirection() === VF.Stem.UP;
  const direction = stemUp ? 1 : -1; // 1：下にふくらむ、-1：上にふくらむ
  const noteY = lastNote.getYs()[index]; // つなぐ玉の高さ（ステップ14-1：重音のため、0 番目に決めずに index 番目にした）
  const y = noteY + TIE_Y_SHIFT * direction;

  // 外側の線で右へ行き、内側の線で左へ戻って、間をぬりつぶす
  const cx = (x1 + x2) / 2;
  context.beginPath();
  context.moveTo(x1, y);
  context.quadraticCurveTo(cx, y + TIE_CURVE_OUTER * direction, x2, y);
  context.quadraticCurveTo(cx, y + TIE_CURVE_INNER * direction, x1, y);
  context.closePath();
  context.fill();
}
