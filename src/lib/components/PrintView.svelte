<script>
  // ==========================================================
  // PrintView.svelte
  // PDF 出力（印刷）用のページを作って、ブラウザの印刷の画面を開く部品（ステップ9）
  //
  // 【流れ】
  //   ① 紙（A4縦）の幅に合わせて、楽譜を描き直す（選択の青・再生中の緑は付けない）
  //   ② 段の上端・下端を使って、段の途中で切れないようにページに分ける
  //   ③ ページごとに、描いた楽譜の「その範囲だけ」を見せる絵を作る（SVG の viewBox で切り出す）
  //   ④ 印刷の画面を開く（送り先で「PDF に保存」を選ぶと PDF になる）
  //   ⑤ 印刷の画面が閉じたら、親に知らせる（onclose）→ 親がこの部品を消す
  //
  // 画面では見えない場所に置き、印刷のときだけ出す（編集の画面は印刷のときに隠す）
  // ==========================================================
  import { onMount, tick } from "svelte";
  import { renderScore } from "#lib/score/render.js";

  // 親から受け取るもの
  //   score   … 楽譜データ
  //   onclose … 印刷の画面が閉じたときに呼ぶ関数
  let { score, onclose = () => {} } = $props();

  // ----------------------------------------------------------
  // 紙の設定
  // CSS では 1mm ＝ 96 ÷ 25.4 ピクセル（約 3.78px）
  // ----------------------------------------------------------
  const MM = 96 / 25.4; // 1mm が何ピクセルか
  const PAGE_MARGIN_MM = 15; // 紙の上・左・右の余白（mm）
  const PAGE_BOTTOM_MM = 20; // 紙の下の余白（mm）（ページ番号を書く場所を含む）
  const CONTENT_WIDTH = (210 - PAGE_MARGIN_MM * 2) * MM; // 楽譜を置ける幅（A4 の幅 210mm から左右の余白を引く）
  const CONTENT_HEIGHT = (297 - PAGE_MARGIN_MM - PAGE_BOTTOM_MM) * MM; // 楽譜を置ける高さ（A4 の高さ 297mm から上下の余白を引く）
  const SCALE = 0.75; // 楽譜の大きさ（画面の 75%）

  // ページの一覧（それぞれ、そのページに出す SVG の要素）
  let pages = $state.raw([]);

  // ----------------------------------------------------------
  // 関数：splitPages
  // 段の上端・下端を見て、ページの区切りの高さを決める
  //   lineTops     … 段ごとの上端の高さ
  //   lineBottoms  … 段ごとの下端の高さ
  //   totalHeight  … 楽譜全体の高さ
  //   pageHeight   … 1ページに入る高さ（楽譜の大きさに直したもの）
  // 戻り値：[{ top, bottom }, ...]（ページごとの、楽譜の中の上端と下端の高さ）
  // ・1ページ目はいちばん上（タイトル）から始める
  // ・次の段がページに入りきらなければ、その段から次のページにする（段の途中では切らない）
  // ・1つの段だけでページに入りきらないときは、その段だけでページにする（はみ出した所は切れる）
  // ----------------------------------------------------------
  function splitPages(lineTops, lineBottoms, totalHeight, pageHeight) {
    const result = [];
    let pageTop = 0; // 今のページの上端
    let firstLine = 0; // 今のページの最初の段

    for (let l = 0; l < lineTops.length; l++) {
      // この段の下端までが今のページに入らず、今のページにもう段があるなら、ここで区切る
      if (lineBottoms[l] - pageTop > pageHeight && l > firstLine) {
        result.push({ top: pageTop, bottom: lineBottoms[l - 1] });
        pageTop = lineTops[l];
        firstLine = l;
      }
    }
    // 最後のページは、楽譜の下の端まで
    result.push({ top: pageTop, bottom: totalHeight });
    return result;
  }

  // ----------------------------------------------------------
  // 関数：makePageSvg
  // 描いた楽譜の SVG を写して、top から bottom までの範囲だけを見せる SVG にする
  //   svg    … 描いた楽譜の SVG
  //   width  … 楽譜の幅（楽譜の大きさのまま）
  //   top    … 見せる範囲の上端
  //   bottom … 見せる範囲の下端
  // viewBox：SVG の中の「どこからどこまで」を見せるかを決める（x y 幅 高さ）
  // width・height：紙の上での大きさ（ここを 75% にすると、中身も 75% に縮む）
  // ----------------------------------------------------------
  function makePageSvg(svg, width, top, bottom) {
    const copy = svg.cloneNode(true); // 中身ごと写す
    const height = bottom - top;
    copy.setAttribute("viewBox", `0 ${top} ${width} ${height}`);
    copy.setAttribute("width", String(width * SCALE));
    copy.setAttribute("height", String(height * SCALE));
    // VexFlow が付けた大きさの指定（style）を消す（上の width・height を使うため）
    copy.removeAttribute("style");
    return copy;
  }

  // ----------------------------------------------------------
  // 関数：appendNode
  // Svelte の action（use:appendNode）：受け取った要素を、この div の中に入れる
  // （JavaScript で作った SVG を、画面の部品の中に入れるのに使う）
  // ----------------------------------------------------------
  function appendNode(node, child) {
    node.appendChild(child);
  }

  // ----------------------------------------------------------
  // 出てきたら：楽譜を描いてページに分け、印刷の画面を開く
  // ----------------------------------------------------------
  onMount(() => {
    // 印刷の画面が閉じたら、親に知らせる（印刷しても、キャンセルしても呼ばれる）
    const handleAfterPrint = () => onclose();
    window.addEventListener("afterprint", handleAfterPrint);

    (async () => {
      // VexFlow と楽譜用のフォントの準備（編集の画面で読み込み済みなので、すぐ終わる）
      const VF = (await import("vexflow")).default;
      await document.fonts.ready;

      // ① 紙の幅に合わせて描く（楽譜の大きさのままの幅 ＝ 紙の幅 ÷ 75%）
      const width = CONTENT_WIDTH / SCALE;
      const draw = document.createElement("div");
      draw.style.position = "absolute";
      draw.style.left = "-100000px";
      document.body.appendChild(draw);
      const result = renderScore(VF, draw, score, width);
      const svg = draw.querySelector("svg");
      // 幅は renderScore が決めたもの（最低限の幅より狭いときは広がる）を使う
      const svgWidth = Number(svg.getAttribute("width"));

      // ② ページに分ける（1ページの高さも、楽譜の大きさに直して比べる）
      const ranges = splitPages(result.lineTops, result.lineBottoms, result.totalHeight, CONTENT_HEIGHT / SCALE);

      // ③ ページごとの SVG を作る
      pages = ranges.map((range) => makePageSvg(svg, svgWidth, range.top, range.bottom));
      draw.remove(); // 描いたもとの楽譜は、もういらない

      // ④ 画面にページが入るのを待ってから、印刷の画面を開く
      await tick();
      window.print();
    })();

    // この部品が消えるときの後片付け
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  });
</script>

<!-- 印刷用のページ（画面では見えない場所に置き、印刷のときだけ出す） -->
<div class="print-root">
  {#each pages as pageSvg, k}
    <div class="page">
      <div class="page-body" use:appendNode={pageSvg}></div>
      <!-- ページ番号（2ページ目から） -->
      {#if k > 0}
        <div class="page-number">{k + 1}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* 紙の大きさ（A4縦）。余白は .page の padding で作るので、紙の余白は 0 にする */
  @page {
    size: A4 portrait;
    margin: 0;
  }

  /* 画面では見えない場所に置く */
  .print-root {
    position: absolute;
    left: -100000px;
    top: 0;
  }

  /* 1ページ分の箱（A4 の大きさ） */
  .page {
    position: relative; /* ページ番号を、この箱を基準に置く */
    width: 210mm;
    height: 296mm; /* 297mm ちょうどだと、計算の誤差で白いページが増えることがあるので少し小さく */
    padding: 15mm 15mm 0;
    box-sizing: border-box;
    overflow: hidden; /* はみ出した所は切る */
    break-after: page; /* このあとでページを変える */
  }
  .page:last-child {
    break-after: auto; /* 最後のページのあとは、ページを変えない（白いページを作らない） */
  }
  .page-body :global(svg) {
    display: block; /* SVG の下にすき間ができないようにする */
  }
  .page-number {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 10mm; /* 紙の下から 10mm の所 */
    text-align: center;
    font-family: serif;
    font-size: 11pt;
  }

  /* 印刷のとき：編集の画面を隠して、印刷用のページだけを出す */
  @media print {
    :global(.editor) {
      display: none !important;
    }
    .print-root {
      position: static;
    }
  }
</style>
