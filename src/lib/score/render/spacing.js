// ==========================================================
// render/spacing.js
// パートの間・段の間を、中身に合わせて自動で決める（パートの間の自動調整）
//
// 【流れ】
//   ① 下書き：見えない場所に、パートの間をとても広くとって一度全部描く（measureExtents）
//   ② 測る：下書きの線や文字を1つずつ調べて、
//            「どの段の、どのパートのものか」と、
//            「五線の上にどれだけ、下にどれだけはみ出しているか」を記録する（measureExtents）
//   ③ 間を決める：測った結果から、五線を置く高さを段ごとに決める（computePositions）
// ==========================================================

// ----------------------------------------------------------
// 下書きの設定（単位はピクセル）
// ----------------------------------------------------------
const SLOT = 400; // 下書きで、1つのパート（1段の中の1パート）に使う高さ
const SLOT_STAFF_TOP = 160; // 下書きで、その場所の上から五線の一番上の線までの高さ
// （上に 160px、下に 400 − 160 − 40 = 200px まではみ出しても、となりの場所に入らない）

// ----------------------------------------------------------
// 本番の間の設定（単位はピクセル）
// 「五線の一番上の線」から「次の五線の一番上の線」までの長さで考える
// ----------------------------------------------------------
const MIN_PART_DISTANCE = 110; // パートとパートの最低の間（今までの間と同じ）
const MIN_SYSTEM_DISTANCE = 150; // 段と段の最低の間（上の段の一番下のパート → 次の段の一番上のパート。今までと同じ）
const PART_GAP = 10; // パートとパートの間で、はみ出した中身どうしの間に空けるすき間
const SYSTEM_GAP = 24; // 段と段の間で、はみ出した中身どうしの間に空けるすき間
const FIRST_TOP_MIN = 70; // タイトル・テンポの場所の下から、1段目の五線の一番上の線までの最低の間（今までと同じ）
const FIRST_TOP_GAP = 10; // 1段目の上にはみ出した中身と、テンポの文字の間に空けるすき間
const BOTTOM_MIN = 50; // 一番下の五線の一番下の線から、楽譜の下の端までの最低の間（今までと同じ）
const BOTTOM_GAP = 16; // 一番下にはみ出した中身と、楽譜の下の端の間に空けるすき間
const LINE_EDGE_MARGIN = 10; // 段の上端・下端（自動スクロールに使う）を、中身から少し外側にする量

// ----------------------------------------------------------
// 関数：staffMetrics
// VexFlow の五線の「上の余白」と「五線の高さ」を調べる
//   staffTop    … 五線を置いた高さ（Stave の y）から、一番上の線までの長さ
//   staffHeight … 一番上の線から一番下の線までの長さ
// （VexFlow の五線は、置いた高さの少し下から線が始まるため）
// ----------------------------------------------------------
export function staffMetrics(VF) {
  const stave = new VF.Stave(0, 0, 100);
  const staffTop = stave.getYForLine(0) - stave.getY();
  const staffHeight = stave.getYForLine(4) - stave.getYForLine(0);
  return { staffTop: staffTop, staffHeight: staffHeight };
}

// ----------------------------------------------------------
// 関数：measureExtents
// 下書きを描いて、段ごと・パートごとに、中身が五線の上と下にどれだけはみ出しているかを測る
//   VF        … VexFlow の部品一式
//   lineCount … 段の数
//   partCount … パートの数
//   width     … 楽譜の幅
//   draw      … 下書きを描く関数。(context, staveYs) を受け取って描く
//               staveYs[l][p] … l 段目・p パート目の五線を置く高さ（Stave の y）
// 戻り値：extents[l][p] = { above, below }
//   above … 五線の一番上の線から、上にはみ出した長さ（はみ出していなければ 0）
//   below … 五線の一番下の線から、下にはみ出した長さ（はみ出していなければ 0）
// ----------------------------------------------------------
export function measureExtents(VF, lineCount, partCount, width, draw) {
  const { staffTop, staffHeight } = staffMetrics(VF);

  // 下書きを描く、見えない場所を作る
  // （ページの中に入れないと大きさを測れないので、画面の外に置いて見えなくする）
  const draft = document.createElement("div");
  draft.style.position = "absolute";
  draft.style.left = "-100000px";
  draft.style.top = "0";
  draft.style.visibility = "hidden";
  document.body.appendChild(draft);

  try {
    // 下書き用の SVG（1パートに SLOT ずつの高さを使う）
    const renderer = new VF.Renderer(draft, VF.Renderer.Backends.SVG);
    renderer.resize(width, Math.max(lineCount * partCount * SLOT, 1));
    const context = renderer.getContext();

    // 下書きで五線を置く高さ（段もパートも、上から順に SLOT ずつ下にずらす）
    // 番号 slotIndex = 段の番号 × パートの数 ＋ パートの番号
    const staveYs = [];
    for (let l = 0; l < lineCount; l++) {
      const ys = [];
      for (let p = 0; p < partCount; p++) {
        const slotIndex = l * partCount + p;
        ys.push(slotIndex * SLOT + SLOT_STAFF_TOP - staffTop);
      }
      staveYs.push(ys);
    }

    // 下書きを描く
    draw(context, staveYs);

    // はみ出しの長さを入れる表（最初はどれも 0）
    const extents = [];
    for (let l = 0; l < lineCount; l++) {
      const row = [];
      for (let p = 0; p < partCount; p++) {
        row.push({ above: 0, below: 0 });
      }
      extents.push(row);
    }

    // 文字の形の大きさを測るための canvas（画面には出さない）
    const measureContext = document.createElement("canvas").getContext("2d");

    // 描いた線や文字を1つずつ調べる
    // （VexFlow は、線を path、四角を rect、文字や音符の玉を text で描く）
    const svg = draft.querySelector("svg");
    const elements = svg.querySelectorAll("path, rect, text, line");
    elements.forEach((element) => {
      // SVG の図形でないものは無視する
      // （instanceof で確かめると、VSCode にも「getBBox が使える図形だ」と伝わる）
      if (!(element instanceof SVGGraphicsElement)) return;

      // 透明なもの（VexFlow がクリック用に置く、見えない四角）は無視する
      if (element.getAttribute("opacity") === "0") return;

      // その線や文字を囲む四角（x, y, width, height）
      const box = element.tagName === "text" ? textInkBox(element, measureContext) : element.getBBox();
      if (box.width === 0 && box.height === 0) return; // 大きさのないものは無視する
      if (box.height > SLOT) return; // 念のため：1パートの場所より大きいもの（全体の背景など）は無視する

      // まん中の高さで、どのパートの場所のものかを決める
      const centerY = box.y + box.height / 2;
      const slotIndex = Math.floor(centerY / SLOT);
      if (slotIndex < 0 || slotIndex >= lineCount * partCount) return;
      const l = Math.floor(slotIndex / partCount); // 何段目か
      const p = slotIndex % partCount; // 何パート目か

      // その場所の五線の一番上の線・一番下の線の高さ
      const topLineY = slotIndex * SLOT + SLOT_STAFF_TOP;
      const bottomLineY = topLineY + staffHeight;

      // 上・下にどれだけはみ出しているか（今までで一番大きいものを残す）
      const extent = extents[l][p];
      extent.above = Math.max(extent.above, topLineY - box.y);
      extent.below = Math.max(extent.below, box.y + box.height - bottomLineY);
    });

    return extents;
  } finally {
    // 測り終わったら（途中でエラーになっても）下書きを消す
    draft.remove();
  }
}

// ----------------------------------------------------------
// 関数：textInkBox
// SVG の文字（text）の、実際にインクがある範囲を囲む四角を返す
// （getBBox で測ると、楽譜用フォントの文字は「行の高さ」で測られて、とても大きくなってしまう。
//   そこで canvas の measureText で、文字の形の上端・下端を測る）
//   element        … SVG の text 要素
//   measureContext … 測るのに使う canvas の 2d コンテキスト
// 戻り値：{ x, y, width, height }（横の位置と幅は getBBox のもの、高さは文字の形のもの）
// ----------------------------------------------------------
function textInkBox(element, measureContext) {
  const box = element.getBBox();
  // SVG の文字と同じ書体・大きさにする（getComputedStyle：実際に使われている見た目の値）
  const style = getComputedStyle(element);
  measureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const metrics = measureContext.measureText(element.textContent);
  // y の値は、文字の下端の線（ベースライン）の高さ
  const baseline = Number(element.getAttribute("y"));
  // actualBoundingBoxAscent：ベースラインから上の、インクがある高さ
  // actualBoundingBoxDescent：ベースラインから下の、インクがある深さ
  const top = baseline - metrics.actualBoundingBoxAscent;
  const bottom = baseline + metrics.actualBoundingBoxDescent;
  return { x: box.x, y: top, width: box.width, height: bottom - top };
}

// ----------------------------------------------------------
// 関数：computePositions
// 測ったはみ出しの長さから、本番で五線を置く高さを決める（段ごとに決める）
//   VF           … VexFlow の部品一式
//   extents      … measureExtents で測ったもの extents[l][p] = { above, below }
//   headerHeight … タイトル・テンポの場所の高さ（この下から楽譜が始まる）
// 戻り値：
//   staveYs[l][p] … l 段目・p パート目の五線を置く高さ（Stave の y）
//   lineTops[l]   … l 段目の上端（自動スクロールに使う）
//   lineBottoms[l]… l 段目の下端（自動スクロールに使う）
//   totalHeight   … 楽譜全体の高さ
// ----------------------------------------------------------
export function computePositions(VF, extents, headerHeight) {
  const { staffTop, staffHeight } = staffMetrics(VF);
  const lineCount = extents.length;
  const partCount = extents[0].length;

  const staveYs = [];
  const lineTops = [];
  const lineBottoms = [];

  // 「五線の一番上の線」の高さ。上から順に決めていく
  // 1段目の一番上のパート：テンポの文字の下に、上にはみ出した中身が入るようにする
  let topLineY = headerHeight + Math.max(FIRST_TOP_MIN, extents[0][0].above + FIRST_TOP_GAP);

  for (let l = 0; l < lineCount; l++) {
    const ys = [];
    for (let p = 0; p < partCount; p++) {
      if (p > 0) {
        // 同じ段の、上のパートとの間：上のパートの下のはみ出し ＋ すき間 ＋ このパートの上のはみ出し
        const needed = staffHeight + extents[l][p - 1].below + PART_GAP + extents[l][p].above;
        topLineY = topLineY + Math.max(MIN_PART_DISTANCE, needed);
      } else if (l > 0) {
        // 前の段との間：前の段の一番下のパートの下のはみ出し ＋ すき間 ＋ この段の一番上のパートの上のはみ出し
        const needed = staffHeight + extents[l - 1][partCount - 1].below + SYSTEM_GAP + extents[l][0].above;
        topLineY = topLineY + Math.max(MIN_SYSTEM_DISTANCE, needed);
      }
      // VexFlow の五線は「一番上の線より staffTop だけ上」に置く
      ys.push(topLineY - staffTop);
    }
    staveYs.push(ys);

    // この段の上端と下端（一番上のパートの上のはみ出しから、一番下のパートの下のはみ出しまで）
    const firstTop = ys[0] + staffTop;
    const lastBottom = ys[partCount - 1] + staffTop + staffHeight;
    lineTops.push(firstTop - extents[l][0].above - LINE_EDGE_MARGIN);
    lineBottoms.push(lastBottom + extents[l][partCount - 1].below + LINE_EDGE_MARGIN);
  }

  // 全体の高さ：最後の段の一番下のパートの、下のはみ出しが入るようにする
  const lastBottomLineY = topLineY + staffHeight;
  const totalHeight = lastBottomLineY + Math.max(BOTTOM_MIN, extents[lineCount - 1][partCount - 1].below + BOTTOM_GAP);

  return { staveYs: staveYs, lineTops: lineTops, lineBottoms: lineBottoms, totalHeight: totalHeight };
}
