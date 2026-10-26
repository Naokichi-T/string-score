<script>
  // ==========================================================
  // PrintView.svelte
  // PDF 出力（印刷）用のページを作って、ブラウザの印刷の画面を開く部品（ステップ9）
  //
  // 【流れ】
  //   ① 紙（A4縦）の幅に合わせて、楽譜を描き直す（選択の青・再生中の緑は付けない）
  //   ② 段の上端・下端を使って、段の途中で切れないようにページに分ける
  //   ③ ページごとに、描いた楽譜の「その範囲だけ」を見せる絵を作る（SVG の viewBox で切り出す）
  //      （ステップ13-2：段ごとに1枚ずつ切り出して、最後のページ以外は、段をページの下まで均等に広げる）
  //   ④ 印刷の画面を開く（送り先で「PDF に保存」を選ぶと PDF になる）
  //   ⑤ 印刷の画面が閉じたら、親に知らせる（onclose）→ 親がこの部品を消す
  //
  // 画面では見えない場所に置き、印刷のときだけ出す（編集の画面は印刷のときに隠す）
  //
  // 【X枚に収める】（X枚に収める b）
  //   maxPages（何枚に収めるか）が指定されていて、ふつうに描くとそれより多くなるときは、
  //   少しずつ詰めて描き直し、maxPages 枚以内に入った最初の形を使う（なるべく詰めすぎないように）
  //     ① 音符の間隔を 90% → 80% に詰める（音符の大きさは変わらない）
  //     ② 間隔 80% のまま、楽譜の大きさを 95% → 90% → 85% … と 5% ずつ縮める（下限は決めない）
  //        （ただし安全のため、30% まで縮めても入らないときは、そこで止めて知らせる）
  //   詰めたときは、閉じたあとに「何%にしたか」を知らせる（onclose に渡す）
  // ==========================================================
  import { onMount, tick } from "svelte";
  import { renderScore } from "#lib/score/render.js";

  // 親から受け取るもの
  //   score   … 楽譜データ
  //   onclose … 印刷の画面が閉じたときに呼ぶ関数
  //   visibleParts … 表示しているパートの本当の番号の配列（null なら全部）（ステップ12-6b）
  //                  表示しているパートだけを印刷する（全部ならスコア、1つならパート譜になる）
  //   maxPages … 何枚に収めるか（指定なしは null）（X枚に収める b）
  //              「以内」に収める決まりなので、パート譜のように、ふつうに描いてもそれより少ないときは何もしない
  //   onclose には、知らせること { text, error }（なければ null）を渡す（X枚に収める b）
  let { score, onclose = () => {}, visibleParts = null, maxPages = null } = $props();

  // 印刷する楽譜データ（表示しているパートだけ）（ステップ12-6b）
  const printParts = visibleParts ?? score.parts.map((_, p) => p);
  const printScore = printParts.length === score.parts.length ? score : { ...score, parts: printParts.map((p) => score.parts[p]) };

  // 1ページ目の左上に出すパート名（一部のパートだけのとき。全部のときは空の文字）（ステップ12-6b）
  // 例："Violin I"、"Violin I・Viola"
  const partLabel = printParts.length === score.parts.length ? "" : printParts.map((p) => score.parts[p].name).join("・");

  // ----------------------------------------------------------
  // 紙の設定
  // CSS では 1mm ＝ 96 ÷ 25.4 ピクセル（約 3.78px）
  // ----------------------------------------------------------
  // （ステップ13-2：参考の楽譜（五線の高さ 7mm・左右の余白 12〜14mm）に合わせて、大きさと余白を決め直した）
  const MM = 96 / 25.4; // 1mm が何ピクセルか
  const PAGE_TOP_MM = 15; // 紙の上の余白（mm）
  const PAGE_LEFT_MM = 10; // 紙の左の余白（mm）（楽譜の左の余白 10px を足すと、だいたい 12mm）
  const PAGE_RIGHT_MM = 12; // 紙の右の余白（mm）（楽譜の右の余白 10px を足すと、だいたい 14mm）
  const PAGE_BOTTOM_MM = 25; // 紙の下の余白（mm）（ページ番号を書く場所を含む）
  const CONTENT_WIDTH = (210 - PAGE_LEFT_MM - PAGE_RIGHT_MM) * MM; // 楽譜を置ける幅（A4 の幅 210mm から左右の余白を引く）
  const CONTENT_HEIGHT = (297 - PAGE_TOP_MM - PAGE_BOTTOM_MM) * MM; // 楽譜を置ける高さ（A4 の高さ 297mm から上下の余白を引く）
  // 楽譜の大きさ：五線の高さ（画面では 40px）が、紙の上で 7mm になるようにする（約 66%）
  const STAFF_HEIGHT_MM = 7;
  const SCALE = (STAFF_HEIGHT_MM * MM) / 40;
  const TITLE_SIZE = 33; // タイトルの文字の大きさ（縮める前。紙の上で、参考と同じ高さ約 5.7mm になる）

  // X枚に収めるときの詰め方（X枚に収める b）
  const FIT_SPACINGS = [0.9, 0.8]; // ① 試す音符の間隔の割合（順に試す）
  const FIT_ZOOM_STEP = 0.05; // ② 楽譜の大きさを、1回に何%ずつ縮めるか（0.05 ＝ 5%）
  const FIT_ZOOM_MIN = 0.3; // ② 安全のための、いちばん小さい大きさ（30%。これでも入らなければあきらめる）

  // 今のページで使っている縮める割合（ふつうは SCALE。X枚に収めるために縮めたときは、それより小さい）（X枚に収める b）
  // （1ページ目の左上のパート名の位置も、この割合に合わせる）
  let usedScale = $state(SCALE);

  // 閉じたときに知らせること（なければ null）（X枚に収める b）
  //   { text: 知らせる文, error: まちがいの知らせか }
  let notice = null;

  // ページの一覧（ステップ13-2：段ごとに切り出す形にした）
  //   { slices: そのページに出す段ごとの SVG の要素の配列, stretch: 段をページの下まで広げるか }
  let pages = $state.raw([]);

  // ----------------------------------------------------------
  // 関数：splitPages
  // 段の上端・下端を見て、ページの区切りの高さを決める
  //   lineTops     … 段ごとの上端の高さ
  //   lineBottoms  … 段ごとの下端の高さ
  //   totalHeight  … 楽譜全体の高さ
  //   pageHeight   … 1ページに入る高さ（楽譜の大きさに直したもの）
  // 戻り値：[{ top, bottom, lines }, ...]（ページごとの、楽譜の中の上端と下端の高さと、入る段の番号の配列）（lines はステップ13-2）
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
  // from から to までの数の配列を作る（例：range(2, 4) → [2, 3, 4]）（ステップ13-2）
  // ----------------------------------------------------------
  function range(from, to) {
    const list = [];
    for (let n = from; n <= to; n++) list.push(n);
    return list;
  }

  // ----------------------------------------------------------
  // 関数：pageSlices
  // 1ページ分を、段ごとの「切り出す範囲」に分ける（ステップ13-2）
  // 段の間のすき間は、あとで CSS で広げるので、ここでは段だけを切り出す
  //   ・ページの最初の段は、ページの上端から（1ページ目ならタイトル・テンポも入る）
  //   ・最後のページの最後の段は、楽譜の下の端まで
  //   page        … splitPages で作った1ページ分 { top, bottom, lines }
  //   lineTops    … 段ごとの上端の高さ
  //   lineBottoms … 段ごとの下端の高さ
  // 戻り値：[{ top, bottom }, ...]（段ごとの、楽譜の中の上端と下端の高さ）
  // ----------------------------------------------------------
  function pageSlices(page, lineTops, lineBottoms) {
    return page.lines.map((l, k) => ({
      top: k === 0 ? page.top : lineTops[l],
      bottom: k === page.lines.length - 1 ? page.bottom : lineBottoms[l],
    }));
  }

  // ----------------------------------------------------------
  // 関数：makePageSvg
  // 描いた楽譜の SVG を写して、top から bottom までの範囲だけを見せる SVG にする
  //   svg    … 描いた楽譜の SVG
  //   width  … 楽譜の幅（楽譜の大きさのまま）
  //   top    … 見せる範囲の上端
  //   bottom … 見せる範囲の下端
  // viewBox：SVG の中の「どこからどこまで」を見せるかを決める（x y 幅 高さ）
  // width・height：紙の上での大きさ（ここを scale 倍にすると、中身も scale 倍に縮む）
  // （ステップ13-2：1ページ分ではなく、1つの段の分を切り出すのにも使う）
  //   scale  … 縮める割合（X枚に収める b：縮めたときのために、決まった SCALE ではなく受け取るようにした）
  // ----------------------------------------------------------
  function makePageSvg(svg, width, top, bottom, scale) {
    const copy = svg.cloneNode(true); // 中身ごと写す
    const height = bottom - top;
    copy.setAttribute("viewBox", `0 ${top} ${width} ${height}`);
    copy.setAttribute("width", String(width * scale));
    copy.setAttribute("height", String(height * scale));
    // VexFlow が付けた大きさの指定（style）を消す（上の width・height を使うため）
    copy.removeAttribute("style");
    return copy;
  }

  // ----------------------------------------------------------
  // 関数：drawLayout
  // 決めた「音符の間隔」と「大きさ」で楽譜を描いて、ページに分ける（X枚に収める b）
  // （前は onMount の中に書いていた ① ② を、何度も試せるように関数にしたもの）
  //   VF      … VexFlow の部品一式
  //   spacing … 音符の間隔の割合（1 ならふつう）
  //   zoom    … 楽譜の大きさの割合（1 ならふつう。0.9 なら、ふつうの 90% に縮める）
  // 戻り値：{ result, svg, svgWidth, ranges, scale, spacing, zoom }
  //   result   … renderScore の戻り値（段の上端・下端など）
  //   svg      … 描いた楽譜の SVG（描いた場所からは外してある。写して使う）
  //   svgWidth … 楽譜の幅（楽譜の大きさのまま）
  //   ranges   … ページの一覧（splitPages で作ったもの。ranges.length がページ数）
  //   scale    … 紙に出すときに縮める割合（SCALE × zoom）
  // ----------------------------------------------------------
  function drawLayout(VF, spacing, zoom) {
    const scale = SCALE * zoom;
    // ① 紙の幅に合わせて描く（楽譜の大きさのままの幅 ＝ 紙の幅 ÷ 縮める割合）
    //    小さく縮めるほど、広い幅で描くことになるので、1段に入る小節が増える
    const width = CONTENT_WIDTH / scale;
    const draw = document.createElement("div");
    draw.style.position = "absolute";
    draw.style.left = "-100000px";
    document.body.appendChild(draw);
    // 表示しているパートだけ（ステップ12-6b）。タイトルは大きく、太字にしない（ステップ13-2）
    // spacing：音符の間隔の割合（X枚に収める b）
    const result = renderScore(VF, draw, printScore, width, null, null, [], false, { titleSize: TITLE_SIZE, titleBold: false, keepHeader: partLabel !== "", spacing: spacing });
    const svg = draw.querySelector("svg");
    // 幅は renderScore が決めたもの（最低限の幅より狭いときは広がる）を使う
    const svgWidth = Number(svg.getAttribute("width"));
    draw.remove(); // 描いた場所は、もういらない（SVG は手元に持っている）

    // ② ページに分ける（1ページの高さも、楽譜の大きさに直して比べる）
    const ranges = splitPages(result.lineTops, result.lineBottoms, result.totalHeight, CONTENT_HEIGHT / scale);
    return { result, svg, svgWidth, ranges, scale, spacing, zoom };
  }

  // ----------------------------------------------------------
  // 関数：fitLayout
  // maxPages 枚以内に入るように、少しずつ詰めて描く（X枚に収める b）
  //   VF … VexFlow の部品一式
  // 戻り値：drawLayout の戻り値（使う形）
  // 流れ：
  //   ・まず、ふつうに描く。maxPages の指定がない・maxPages 枚以内なら、それを使う
  //   ・① 音符の間隔を 90% → 80% にして描く。入ったらそれを使う
  //   ・② 間隔 80% のまま、大きさを 95% → 90% → … → 30% にして描く。入ったらそれを使う
  //   ・30% でも入らなければ、30% の形を使って、入らなかったことを知らせる
  // 詰めたとき・入らなかったときは、notice に知らせる文を入れる
  // ----------------------------------------------------------
  function fitLayout(VF) {
    const first = drawLayout(VF, 1, 1);
    if (!maxPages || first.ranges.length <= maxPages) return first;

    // ① 音符の間隔を詰める
    for (const spacing of FIT_SPACINGS) {
      const tried = drawLayout(VF, spacing, 1);
      if (tried.ranges.length <= maxPages) {
        notice = { text: fitText(tried), error: false };
        return tried;
      }
    }

    // ② 間隔をいちばん詰めたまま、楽譜を縮める
    // （0.05 を何度も引くと 0.8999… のような小さなずれが出るので、何回目かから計算して、小数第2位で丸める）
    const spacing = FIT_SPACINGS[FIT_SPACINGS.length - 1];
    let last = null;
    for (let k = 1; ; k++) {
      const zoom = Math.round((1 - FIT_ZOOM_STEP * k) * 100) / 100;
      if (zoom < FIT_ZOOM_MIN) break;
      last = drawLayout(VF, spacing, zoom);
      if (last.ranges.length <= maxPages) {
        notice = { text: fitText(last), error: false };
        return last;
      }
    }

    // いちばん小さくしても入らなかった
    notice = { text: `PDF を${maxPages}枚に収められませんでした（いちばん小さくしても${last.ranges.length}枚になりました）`, error: true };
    return last;
  }

  // ----------------------------------------------------------
  // 関数：fitText
  // 詰めて収めたときに知らせる文を作る（X枚に収める b）
  //   layout … drawLayout の戻り値
  // 例：「PDF を2枚に収めました（音符の間隔 80%・大きさ 90%）」
  //     大きさを変えていないときは「（音符の間隔 90%）」だけ
  // ----------------------------------------------------------
  function fitText(layout) {
    const spacingText = `音符の間隔 ${Math.round(layout.spacing * 100)}%`;
    const zoomText = layout.zoom < 1 ? `・大きさ ${Math.round(layout.zoom * 100)}%` : "";
    return `PDF を${maxPages}枚に収めました（${spacingText}${zoomText}）`;
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
    // （X枚に収める b：詰めたとき・入らなかったときの知らせ（notice）も渡す）
    const handleAfterPrint = () => onclose(notice);
    window.addEventListener("afterprint", handleAfterPrint);

    (async () => {
      // VexFlow と楽譜用のフォントの準備（編集の画面で読み込み済みなので、すぐ終わる）
      const VF = (await import("vexflow")).default;
      await document.fonts.ready;

      // ①② 紙の幅に合わせて描いて、ページに分ける（X枚に収める b：drawLayout・fitLayout にまとめた）
      //     maxPages の指定があり、ふつうに描くとそれより多くなるときは、詰めて描き直す
      const { result, svg, svgWidth, ranges, scale } = fitLayout(VF);
      usedScale = scale; // パート名の位置を、使った割合に合わせる

      // ③ ページごとに、段ごとの SVG を作る（ステップ13-2）
      //    最後のページ以外で、段が2つ以上あれば、段をページの下まで均等に広げる
      pages = ranges.map((page, k) => ({
        slices: pageSlices(page, result.lineTops, result.lineBottoms).map((slice) => makePageSvg(svg, svgWidth, slice.top, slice.bottom, scale)),
        stretch: k < ranges.length - 1 && page.lines.length > 1,
      }));

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
  {#each pages as page, k}
    <div class="page" style:padding={`${PAGE_TOP_MM}mm ${PAGE_RIGHT_MM}mm 0 ${PAGE_LEFT_MM}mm`}>
      <!-- 段ごとの SVG を縦に並べる。stretch のときは、段の間を均等に広げてページの下までうめる（ステップ13-2） -->
      <div class="page-body" class:stretch={page.stretch} style:height={`${297 - PAGE_TOP_MM - PAGE_BOTTOM_MM}mm`}>
        {#each page.slices as slice}
          <div use:appendNode={slice}></div>
        {/each}
      </div>
      <!-- パート名（一部のパートだけを印刷するとき、1ページ目の左上。作曲者と同じ高さ）（ステップ12-6b） -->
      <!-- （X枚に収める b：縮めたときも作曲者と同じ高さになるように、SCALE ではなく使った割合（usedScale）で位置を決める） -->
      {#if k === 0 && partLabel}
        <div class="part-label" style:top={`calc(${PAGE_TOP_MM}mm + ${56 * usedScale}px)`} style:left={`calc(${PAGE_LEFT_MM}mm + ${10 * usedScale}px)`}>{partLabel}</div>
      {/if}
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
    /* 余白（padding）は、script の PAGE_TOP_MM などから style で決める（ステップ13-2） */
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
  /* 段を縦に並べる。ふつうは上から詰める（ステップ13-2） */
  .page-body {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  /* 段をページの下まで均等に広げる：最初の段は上、最後の段は下にそろえ、あいだを同じだけあける（ステップ13-2） */
  .page-body.stretch {
    justify-content: space-between;
  }
  /* パート名：楽譜の作曲者（右寄せ）と同じ高さに、左寄せで書く（ステップ12-6b）
     作曲者の文字の上端は、楽譜の上から約 56px。位置（top・left）は、縮める割合に合わせて style で決める（ステップ13-2） */
  .part-label {
    position: absolute;
    font-family: Academico, serif;
    font-size: 13px; /* 楽譜の作曲者の文字と同じくらいに見える大きさ */
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
