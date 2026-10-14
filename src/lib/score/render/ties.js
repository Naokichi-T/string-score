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
  new VF.StaveTie({
    firstNote: firstNote,
    lastNote: lastNote,
    firstIndexes: [0], // 始まりの音の1つ目の音（重音なしなので常に 0）
    lastIndexes: [0], // 終わりの音の1つ目の音
  })
    .setContext(context)
    .draw();
}
