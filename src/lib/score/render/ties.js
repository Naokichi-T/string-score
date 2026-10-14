// ==========================================================
// render/ties.js
// タイ（同じ高さの音をつなぐ弧）を描く
// ==========================================================

// ----------------------------------------------------------
// 関数：drawTie
// タイの弧を1本描く
//   firstNote … タイの始まりの音（null なら段の頭から始まる弧）
//   lastNote  … タイの終わりの音（null なら段の終わりまでの弧）
// ----------------------------------------------------------
export function drawTie(VF, context, firstNote, lastNote) {
  // 段の頭から始まる弧は、VexFlow にまかせると音部記号に重なるので、自分で描く
  if (firstNote === null) {
    drawLineStartTie(VF, context, lastNote);
    return;
  }

  new VF.StaveTie({
    firstNote: firstNote,
    lastNote: lastNote,
    firstIndexes: [0], // 始まりの音の1つ目の音（重音なしなので常に 0）
    lastIndexes: [0], // 終わりの音の1つ目の音
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
// ----------------------------------------------------------
function drawLineStartTie(VF, context, lastNote) {
  const stave = lastNote.getStave();

  // 横の位置：右の端は玉の手前、左の端は音部記号・調号のすぐ右
  const x2 = lastNote.getTieLeftX() - TIE_GAP;
  let x1 = stave.getNoteStartX() + TIE_GAP;
  // 短すぎるときは、左にのばして最低の長さにする
  if (x2 - x1 < TIE_MIN_LENGTH) x1 = x2 - TIE_MIN_LENGTH;

  // 弧の向き：符尾が上向きなら下に、下向きなら上に（VexFlow のタイと同じ）
  const stemUp = lastNote.hasStem() && lastNote.getStemDirection() === VF.Stem.UP;
  const direction = stemUp ? 1 : -1; // 1：下にふくらむ、-1：上にふくらむ
  const noteY = lastNote.getYs()[0];
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
