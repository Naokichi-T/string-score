<script>
  // ==========================================================
  // PerformView.svelte
  // 演奏モード：楽譜だけを画面いっぱいに出して、ページごとに見る部品（演奏モード）
  // （タブ・鍵盤・上のバーは見えなくなる。編集ページの上に重ねて出す）
  //
  // 【流れ】
  //   ① 画面の幅で、見えない場所に楽譜を描く（表示しているパートだけ。選択の青・再生中の緑は付けない）
  //   ② 段の上端・下端を使って、画面の高さに入るだけの段ずつページに分ける
  //      （PDF 出力（PrintView.svelte）の splitPages と同じ決まり。段の途中では切らない）
  //   ③ 今のページの範囲を切り出して（SVG の viewBox）、画面に出す
  //      （段ごとに切り出すと、段と段の間のすき間が抜けて、ページの下が空いてしまうので、1ページを1枚のまま切り出す）
  //   ④ 画面の大きさが変わったら（向きを変えたなど）、①からやり直す
  //      今見ていたページの最初の段が入っているページを開き直す
  // ［×］か Esc キーで、編集の画面に戻る（onclose）
  // ==========================================================
  import { onMount } from "svelte";
  import { renderScore } from "#lib/score/render.js";

  // 親から受け取るもの
  //   score        … 楽譜データ
  //   visibleParts … 表示しているパートの本当の番号の配列（null なら全部）（PDF 出力と同じ）
  //   onclose      … 演奏モードを終えるときに呼ぶ関数（［×］・Esc）
  let { score, visibleParts = null, onclose = () => {} } = $props();

  // 演奏モードで出す楽譜データ（表示しているパートだけ。PDF 出力と同じ作り方）
  const showParts = visibleParts ?? score.parts.map((_, p) => p);
  const showScore = showParts.length === score.parts.length ? score : { ...score, parts: showParts.map((p) => score.parts[p]) };

  // ----------------------------------------------------------
  // 見た目の設定（単位はピクセル）
  // ----------------------------------------------------------
  const PAGE_TOP = 8; // 画面の上の余白
  const FOOTER_HEIGHT = 36; // 画面の下の、ページ番号を出す場所の高さ
  const RESIZE_WAIT = 200; // 画面の大きさが変わってから、描き直すまで待つ時間（ミリ秒。向きを変えている途中で何度も描かないため）

  // 描いた楽譜（ページに分ける前の、1枚の長い楽譜）
  //   svg … 描いた楽譜の SVG、width … その幅、lineTops・lineBottoms … 段ごとの上端と下端、totalHeight … 全体の高さ
  let drawn = null;

  // ページの一覧 [{ top, bottom, lines }, ...]（splitPages で作ったもの）
  let pages = $state.raw([]);

  // 今見ているページの番号（0 から）
  let pageIndex = $state(0);

  // 今のページに出す SVG の並び（今のページが変わるたびに作り直す。今は1ページに1枚）
  let slices = $state.raw([]);

  // 楽譜を描いている途中か（最初の1回だけ「準備中…」を出す）
  let preparing = $state(true);

  // 楽譜を出す場所（この幅で描く）
  let stage;

  // ----------------------------------------------------------
  // 関数：splitPages
  // 段の上端・下端を見て、ページの区切りの高さを決める（PrintView.svelte の splitPages と同じ決まり）
  //   lineTops     … 段ごとの上端の高さ
  //   lineBottoms  … 段ごとの下端の高さ
  //   totalHeight  … 楽譜全体の高さ
  //   pageHeight   … 1ページに入る高さ
  // 戻り値：[{ top, bottom, lines }, ...]（ページごとの、楽譜の中の上端と下端の高さと、入る段の番号の配列）
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
        result.push({ top: pageTop, bottom: lineBottoms[l - 1], lines: range(firstLine, l - 1) });
        pageTop = lineTops[l];
        firstLine = l;
      }
    }
    // 最後のページは、楽譜の下の端まで
    result.push({ top: pageTop, bottom: totalHeight, lines: range(firstLine, lineTops.length - 1) });
    return result;
  }

  // ----------------------------------------------------------
  // 関数：range
  // from から to までの数の配列を作る（例：range(2, 4) → [2, 3, 4]）
  // ----------------------------------------------------------
  function range(from, to) {
    const list = [];
    for (let n = from; n <= to; n++) list.push(n);
    return list;
  }

  // ----------------------------------------------------------
  // 関数：makeSlice
  // 描いた楽譜の SVG を写して、top から bottom までの範囲だけを見せる SVG にする（PrintView.svelte の makePageSvg と同じ考え方）
  // 画面では縮めないので、大きさは楽譜のまま
  //   top    … 見せる範囲の上端
  //   bottom … 見せる範囲の下端
  // ----------------------------------------------------------
  function makeSlice(top, bottom) {
    const copy = drawn.svg.cloneNode(true); // 中身ごと写す
    const height = bottom - top;
    copy.setAttribute("viewBox", `0 ${top} ${drawn.width} ${height}`);
    copy.setAttribute("width", String(drawn.width));
    copy.setAttribute("height", String(height));
    copy.removeAttribute("style"); // VexFlow が付けた大きさの指定を消す（上の width・height を使うため）
    return copy;
  }

  // ----------------------------------------------------------
  // 関数：showPage
  // k ページ目を出す（ページの上端から下端までを1枚に切り出して、slices に入れる）
  //   ・1ページ目は、いちばん上（タイトル・テンポ）から
  //   ・最後のページは、楽譜の下の端まで
  // ----------------------------------------------------------
  function showPage(k) {
    if (!drawn || pages.length === 0) return;
    pageIndex = Math.min(Math.max(k, 0), pages.length - 1); // 範囲の外にならないようにする
    const page = pages[pageIndex];
    slices = [makeSlice(page.top, page.bottom)];
  }

  // ----------------------------------------------------------
  // 関数：layout
  // 今の画面の大きさで楽譜を描いて、ページに分け直す
  // 前に見ていたページがあれば、その最初の段が入っているページを開く（向きを変えても、同じ所を見ていられるように）
  // ----------------------------------------------------------
  async function layout() {
    // VexFlow と楽譜用のフォントの準備（編集の画面で読み込み済みなので、すぐ終わる）
    const VF = (await import("vexflow")).default;
    await document.fonts.ready;

    // 今見ている段（描き直す前のページの最初の段）を覚えておく
    const firstLine = pages[pageIndex]?.lines[0] ?? 0;

    // ① 画面の幅で、見えない場所に描く
    const width = stage.clientWidth;
    const draw = document.createElement("div");
    draw.style.position = "absolute";
    draw.style.left = "-100000px";
    document.body.appendChild(draw);
    const result = renderScore(VF, draw, showScore, width, null, null, [], false);
    const svg = draw.querySelector("svg");
    drawn = {
      svg: svg,
      width: Number(svg.getAttribute("width")), // renderScore が決めた幅（最低限の幅より狭いときは広がる）
      lineTops: result.lineTops,
      lineBottoms: result.lineBottoms,
      totalHeight: result.totalHeight,
    };
    draw.remove(); // 描いたもとの場所は、もういらない（SVG は drawn に持っている）

    // ② ページに分ける（1ページの高さ ＝ 画面の高さ − 上の余白 − ページ番号の場所）
    const pageHeight = window.innerHeight - PAGE_TOP - FOOTER_HEIGHT;
    pages = splitPages(drawn.lineTops, drawn.lineBottoms, drawn.totalHeight, pageHeight);

    // ③ 前に見ていた段が入っているページを出す
    const found = pages.findIndex((page) => page.lines.includes(firstLine));
    showPage(found >= 0 ? found : 0);
    preparing = false;
  }

  // ----------------------------------------------------------
  // 関数：appendNode
  // Svelte の action（use:appendNode）：受け取った要素を、この div の中に入れる（PrintView.svelte と同じ）
  // ----------------------------------------------------------
  function appendNode(node, child) {
    node.appendChild(child);
  }

  // ----------------------------------------------------------
  // 関数：handleKeydown
  // キーが押されたとき：Esc で編集の画面に戻る
  // （編集ページのキーの処理は、演奏モードの間は何もしないようにしてある）
  // ----------------------------------------------------------
  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onclose();
    }
  }

  // ----------------------------------------------------------
  // 出てきたら：楽譜を描いてページに分ける。画面の大きさが変わったら、少し待ってから描き直す
  // ----------------------------------------------------------
  onMount(() => {
    layout();

    let timer = null;
    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(layout, RESIZE_WAIT);
    };
    window.addEventListener("resize", handleResize);

    // この部品が消えるときの後片付け
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- 演奏モードの画面（編集ページの上に、画面いっぱいに重ねる） -->
<div class="perform" role="dialog" aria-label="演奏モード">
  <!-- 楽譜を出す場所（この幅で楽譜を描く） -->
  <div class="stage" bind:this={stage} style:padding-top={`${PAGE_TOP}px`}>
    {#if preparing}
      <p class="preparing">準備中…</p>
    {/if}
    <!-- 今のページを出す（ページが変わると、slices が入れかわる） -->
    {#each slices as slice (slice)}
      <div class="slice" use:appendNode={slice}></div>
    {/each}
  </div>

  <!-- ページ番号（例：2 / 5） -->
  <div class="footer" style:height={`${FOOTER_HEIGHT}px`}>
    {#if pages.length > 0}
      <span class="page-number">{pageIndex + 1} / {pages.length}</span>
    {/if}
  </div>

  <!-- 編集の画面に戻る -->
  <button class="close" onclick={() => onclose()} title="編集の画面に戻る（Esc）" aria-label="演奏モードを終える">×</button>
</div>

<style>
  /* 画面いっぱいに重ねる白い画面 */
  .perform {
    position: fixed;
    inset: 0; /* 上下左右いっぱい */
    z-index: 1000; /* 編集の画面より上 */
    background: #fff;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* スクロールさせない（ページでめくる） */
  }
  /* 楽譜を出す場所：残りの高さを全部使う */
  .stage {
    flex: 1;
    overflow: hidden;
    box-sizing: border-box;
  }
  .slice :global(svg) {
    display: block; /* SVG の下にすき間ができないようにする */
  }
  .preparing {
    margin: 24px;
    color: #666;
  }
  /* ページ番号の場所 */
  .footer {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .page-number {
    font-size: 14px;
    color: #666;
  }
  /* 右上の［×］：楽譜のじゃまにならないよう、小さくうすく */
  .close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 36px;
    height: 36px;
    border: 1px solid #ddd;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.9);
    color: #666;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }
</style>
