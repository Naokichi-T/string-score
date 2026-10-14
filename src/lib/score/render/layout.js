// ==========================================================
// render/layout.js
// 小節をどの段に置くか（改行の位置）を決める
// ==========================================================

// ----------------------------------------------------------
// 関数：layoutLines
// 小節をどの段に置くかを決める（改行の位置を決める）
//   noteWidths     … 小節ごとの「音符のための幅」の配列
//   startWidths    … 小節ごとの「段の頭に来たときの記号の幅」の配列
//   middleWidths   … 小節ごとの「段の途中に来たときの記号の幅」の配列
//   firstLineWidth … 1段目で小節に使える幅
//   otherLineWidth … 2段目以降で小節に使える幅
// 戻り値：段ごとの配列。それぞれ { measures: [小節の番号...], widths: [幅...] }
// ----------------------------------------------------------
export function layoutLines(noteWidths, startWidths, middleWidths, firstLineWidth, otherLineWidth) {
  const lines = [];
  let current = { measures: [], widths: [] }; // 今詰めている段
  let used = 0; // 今の段で使った幅

  for (let i = 0; i < noteWidths.length; i++) {
    // 今の段に使える幅（1段目かどうかで変わる）
    const available = lines.length === 0 ? firstLineWidth : otherLineWidth;

    // この小節を今の段の続きに置いたときの幅
    const isLineStart = current.measures.length === 0;
    const width = noteWidths[i] + (isLineStart ? startWidths[i] : middleWidths[i]);

    if (!isLineStart && used + width > available) {
      // 入らないので改行する：今の段を確定して、新しい段の頭に置く
      lines.push(current);
      current = { measures: [], widths: [] };
      const startWidth = noteWidths[i] + startWidths[i];
      current.measures.push(i);
      current.widths.push(startWidth);
      used = startWidth;
    } else {
      // 入るので今の段に置く（段の頭なら、入らなくても1小節は置く）
      current.measures.push(i);
      current.widths.push(width);
      used = used + width;
    }
  }
  // 最後の段を確定する
  if (current.measures.length > 0) lines.push(current);

  // 最後の段以外は、段の幅ぴったりになるよう小節の幅を同じ割合で広げる
  lines.forEach((line, l) => {
    if (l === lines.length - 1) return; // 最後の段は広げない
    const available = l === 0 ? firstLineWidth : otherLineWidth;
    const total = line.widths.reduce((sum, w) => sum + w, 0);
    const ratio = available / total;
    line.widths = line.widths.map((w) => w * ratio);
  });

  return lines;
}
