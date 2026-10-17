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
//   lengths        … 小節ごとの長さ（ティック。model.js の measureLength で調べたもの）の配列（ステップ15-1）
//                    段を広げるときに、余った幅を小節の長さの割合で分けるのに使う
// 戻り値：段ごとの配列。それぞれ { measures: [小節の番号...], widths: [幅...] }
// ----------------------------------------------------------
export function layoutLines(noteWidths, startWidths, middleWidths, firstLineWidth, otherLineWidth, lengths) {
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

  // 最後の段以外は、段の幅ぴったりになるよう小節の幅を広げる
  // （ただし段が1つだけのときは、その段も広げる。短いまま右が空くと、楽譜が途中で切れて見えるため）
  // （ステップ15-1：広げ方を変えた）
  //   前：小節の幅（音符の幅＋小節の頭の記号の幅）を、全部同じ割合で広げていた
  //       → 音部記号・拍子記号の幅まで広がるので、段の頭の小節や1小節目だけが広くなり、
  //         4分音符1つのアウフタクトでも、4拍の小節と同じくらいの幅になっていた
  //   今：段の幅から小節の幅の合計を引いた「余った幅」を、小節の長さ（拍の数）の割合で分けて足す
  //       → 記号の幅は広がらず、1拍のアウフタクトには、4拍の小節の4分の1だけ足される
  lines.forEach((line, l) => {
    if (l === lines.length - 1 && lines.length > 1) return; // 2段以上あるときの最後の段は広げない
    const available = l === 0 ? firstLineWidth : otherLineWidth;
    const total = line.widths.reduce((sum, w) => sum + w, 0); // 今の小節の幅の合計
    const extra = available - total; // 余った幅（1小節だけで段からはみ出すときは、マイナスになって縮む）
    const lengthTotal = line.measures.reduce((sum, i) => sum + lengths[i], 0); // この段の小節の長さの合計
    line.widths = line.widths.map((w, m) => w + extra * (lengths[line.measures[m]] / lengthTotal));
  });

  return lines;
}
