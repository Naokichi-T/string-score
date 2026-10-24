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
  //
  // 【めくり方】（演奏モードのステップ2）
  //   ・スワイプ：左へ → 次のページ、右へ → 前のページ
  //   ・タップ：画面の右のほう → 次のページ、左のほう → 前のページ（まん中は何もしない。手が当たってもめくれないように）
  //   ・キー：→・↓・PageDown・Space → 次のページ、←・↑・PageUp → 前のページ
  //       （Bluetooth の譜めくりペダルは、たいていこのどれかのキーを送るので、足でもめくれる）
  //
  // 【設定】（演奏モードのステップ3）右上の［⚙］から開く。ブラウザに保存する（library.js の saveSetting）
  //   ・performAutoPortrait … タブレットを縦にしたら、自動で演奏モードに入るか（最初は入る。編集ページが使う）
  //   ・performShowPrev     … 前のページの最後の段を、次のページのいちばん上にうすく出すか（最初は出さない）
  //       出すときは、2ページ目からは、その1段ぶん（と区切りのすき間）を引いた高さでページに分ける
  // 【画面が暗くならないようにする】（演奏モードのステップ3）
  //   演奏モードの間は、Wake Lock（ブラウザの機能）で画面が暗くならないようにする
  //   ほかのアプリに切り替えると外れるので、戻ってきたら、もう一度頼む（使えないブラウザでは何もしない）
  // ==========================================================
  import { onMount } from "svelte";
  import { renderScore } from "#lib/score/render.js";
  import { loadSettings, saveSetting } from "#lib/score/library.js"; // 設定を読む・保存する（演奏モードのステップ3）

  // 親から受け取るもの
  //   score        … 楽譜データ
  //   visibleParts … 表示しているパートの本当の番号の配列（null なら全部）（PDF 出力と同じ）
  //   onclose      … 演奏モードを終えるときに呼ぶ関数（［×］・Esc）
  let { score, visibleParts = null, onclose = () => {} } = $props();

  // 演奏モードで出す楽譜データ（表示しているパートだけ。PDF 出力と同じ作り方）
  // （$derived：親から受け取った score・visibleParts が変わったら、作り直す。
  //   ふつうの const だと「最初の値しか使っていない」と VSCode に注意されるため、決まりどおり $derived にした）
  let showParts = $derived(visibleParts ?? score.parts.map((_, p) => p));
  let showScore = $derived(showParts.length === score.parts.length ? score : { ...score, parts: showParts.map((p) => score.parts[p]) });

  // ----------------------------------------------------------
  // 見た目の設定（単位はピクセル）
  // ----------------------------------------------------------
  const PAGE_TOP = 8; // 画面の上の余白
  const FOOTER_HEIGHT = 36; // 画面の下の、ページ番号を出す場所の高さ
  const RESIZE_WAIT = 200; // 画面の大きさが変わってから、描き直すまで待つ時間（ミリ秒。向きを変えている途中で何度も描かないため）

  // めくる操作の設定（演奏モードのステップ2）
  const SWIPE_MIN = 50; // スワイプとみなす、横に動かすいちばん短い長さ（ピクセル）
  const SWIPE_RATIO = 1.5; // 横の動きが縦の動きの何倍より大きければ、横のスワイプとみなすか（ななめの指の動きでめくれないように）
  const TAP_MOVE = 12; // タップとみなす、指の動きのいちばん大きい長さ（ピクセル。これより動いたらタップではない）
  const TAP_TIME = 500; // タップとみなす、触ってから離すまでのいちばん長い時間（ミリ秒）
  const TAP_SIDE = 0.35; // 画面の左右の、この割合の幅をタップするとめくれる（0.35 なら、左の35%・右の35%）
  const NEXT_KEYS = ["ArrowRight", "ArrowDown", "PageDown", " "]; // 次のページへ進むキー（" " は Space）
  const PREV_KEYS = ["ArrowLeft", "ArrowUp", "PageUp"]; // 前のページへ戻るキー

  // 前のページの最後の段をうすく出すときの設定（演奏モードのステップ3）
  const PREV_GAP = 10; // うすく出す段と、そのページの楽譜の間のすき間（区切りの線をここに引く）

  // 設定（演奏モードのステップ3）
  //   autoPortrait … タブレットを縦にしたら、自動で演奏モードに入るか（保存していなければ true）
  //   showPrev     … 前のページの最後の段を、うすく出すか（保存していなければ false）
  const savedSettings = loadSettings();
  let autoPortrait = $state(savedSettings.performAutoPortrait !== false);
  let showPrev = $state(savedSettings.performShowPrev === true);

  // 設定の欄を開いているか（演奏モードのステップ3）
  let settingsOpen = $state(false);

  // 描いた楽譜（ページに分ける前の、1枚の長い楽譜）
  //   svg … 描いた楽譜の SVG、width … その幅、lineTops・lineBottoms … 段ごとの上端と下端、totalHeight … 全体の高さ
  let drawn = null;

  // ページの一覧 [{ top, bottom, lines }, ...]（splitPages で作ったもの）
  let pages = $state.raw([]);

  // 今見ているページの番号（0 から）
  let pageIndex = $state(0);

  // 今のページに出す SVG の並び（今のページが変わるたびに作り直す）
  //   [{ svg: 切り出した SVG, dim: うすく出すか }, ...]
  //   ふつうは1ページに1枚。「前の段をうすく出す」が入なら、前のページの最後の段（dim: true）＋ そのページ の2枚（演奏モードのステップ3）
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
  //   withPrev     … 前のページの最後の段をうすく出すか（演奏モードのステップ3）
  //                  true なら、2ページ目からは、前のページの最後の段の高さ＋すき間（PREV_GAP）を引いた高さに入れる
  // 戻り値：[{ top, bottom, lines }, ...]（ページごとの、楽譜の中の上端と下端の高さと、入る段の番号の配列）
  // ・1ページ目はいちばん上（タイトル）から始める
  // ・次の段がページに入りきらなければ、その段から次のページにする（段の途中では切らない）
  // ・1つの段だけでページに入りきらないときは、その段だけでページにする（はみ出した所は切れる）
  // ----------------------------------------------------------
  function splitPages(lineTops, lineBottoms, totalHeight, pageHeight, withPrev = false) {
    const result = [];
    let pageTop = 0; // 今のページの上端
    let firstLine = 0; // 今のページの最初の段

    for (let l = 0; l < lineTops.length; l++) {
      // 今のページに使える高さ（前の段をうすく出すときは、その段とすき間のぶんを引く）（演奏モードのステップ3）
      let room = pageHeight;
      if (withPrev && firstLine > 0) room = room - (lineBottoms[firstLine - 1] - lineTops[firstLine - 1]) - PREV_GAP;
      // この段の下端までが今のページに入らず、今のページにもう段があるなら、ここで区切る
      if (lineBottoms[l] - pageTop > room && l > firstLine) {
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
  //   ・「前の段をうすく出す」が入なら、2ページ目からは、前のページの最後の段をうすくして先に入れる（演奏モードのステップ3）
  // ----------------------------------------------------------
  function showPage(k) {
    if (!drawn || pages.length === 0) return;
    pageIndex = Math.min(Math.max(k, 0), pages.length - 1); // 範囲の外にならないようにする
    const page = pages[pageIndex];
    const list = [];
    const prevLine = page.lines[0] - 1; // 前のページの最後の段
    if (showPrev && prevLine >= 0) {
      list.push({ svg: makeSlice(drawn.lineTops[prevLine], drawn.lineBottoms[prevLine]), dim: true });
    }
    list.push({ svg: makeSlice(page.top, page.bottom), dim: false });
    slices = list;
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
    pages = splitPages(drawn.lineTops, drawn.lineBottoms, drawn.totalHeight, pageHeight, showPrev);

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
  // 関数：changeAutoPortrait
  // 設定「縦にしたら自動で演奏モードに入る」を変えたとき：保存する（演奏モードのステップ3）
  // （使うのは編集ページ。向きが変わったときに、保存した設定を読む）
  // ----------------------------------------------------------
  function changeAutoPortrait(value) {
    autoPortrait = value;
    saveSetting("performAutoPortrait", value);
  }

  // ----------------------------------------------------------
  // 関数：changeShowPrev
  // 設定「前のページの最後の段をうすく出す」を変えたとき：保存して、ページに分け直す（演奏モードのステップ3）
  // （ページに入る段の数が変わるので、layout で描き直す。見ていた段が入っているページを開き直す）
  // ----------------------------------------------------------
  function changeShowPrev(value) {
    showPrev = value;
    saveSetting("performShowPrev", value);
    layout();
  }

  // 画面が暗くならないようにする仕組み（Wake Lock）の、今の頼み（なければ null）（演奏モードのステップ3）
  let wakeLock = null;

  // ----------------------------------------------------------
  // 関数：requestWakeLock
  // 画面が暗くならないように、ブラウザに頼む（演奏モードのステップ3）
  // 使えないブラウザや、頼みを断られたときは、何もしない（演奏モードはそのまま使える）
  // ----------------------------------------------------------
  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    } catch (error) {
      wakeLock = null; // 断られた（電池が少ないときなど）。暗くなるのを防げないだけ
    }
  }

  // ----------------------------------------------------------
  // 関数：turnPage
  // ページをめくる（演奏モードのステップ2）
  //   step … 1 なら次のページ、-1 なら前のページ
  // 最後のページで「次」、最初のページで「前」のときは何もしない（showPage が範囲の中に収める）
  // ----------------------------------------------------------
  function turnPage(step) {
    const next = pageIndex + step;
    if (next < 0 || next >= pages.length) return;
    showPage(next);
  }

  // ----------------------------------------------------------
  // 関数：handleKeydown
  // キーが押されたとき
  //   ・Esc → 編集の画面に戻る
  //   ・→・↓・PageDown・Space → 次のページ、←・↑・PageUp → 前のページ（演奏モードのステップ2）
  // （編集ページのキーの処理は、演奏モードの間は何もしないようにしてある）
  // ----------------------------------------------------------
  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onclose();
      return;
    }
    if (NEXT_KEYS.includes(event.key)) {
      event.preventDefault(); // Space で、ボタンが押されたりしないように
      turnPage(1);
    } else if (PREV_KEYS.includes(event.key)) {
      event.preventDefault();
      turnPage(-1);
    }
  }

  // 指（マウス）を置いたときの場所と時刻（離したときに、スワイプかタップかを決めるのに使う）（演奏モードのステップ2）
  //   { id: 指の番号, x, y, time }（置いていなければ null）
  let touchStart = null;

  // ----------------------------------------------------------
  // 関数：handlePointerDown
  // 画面に指（マウス）を置いたとき：場所と時刻を覚える（演奏モードのステップ2）
  // ［×］の上では覚えない（［×］はふつうのボタンとして押す）
  // 2本目の指は使わない（最初の指だけを見る）
  // ----------------------------------------------------------
  function handlePointerDown(event) {
    // ［×］・［⚙］・設定の欄の上では、めくらない（ふつうのボタン・チェックとして押す）（［⚙］・設定の欄は演奏モードのステップ3）
    if (event.target.closest(".close, .gear, .settings")) return;
    if (!event.isPrimary) return;
    touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  }

  // ----------------------------------------------------------
  // 関数：handlePointerUp
  // 画面から指（マウス）を離したとき：スワイプかタップかを決めて、ページをめくる（演奏モードのステップ2）
  //   ・横に SWIPE_MIN 以上動いて、縦より十分大きく動いた → スワイプ（左へ：次、右へ：前）
  //   ・ほとんど動かず、すぐ離した → タップ（右のほう：次、左のほう：前、まん中：何もしない）
  // ----------------------------------------------------------
  function handlePointerUp(event) {
    if (!touchStart || event.pointerId !== touchStart.id) return;
    const dx = event.clientX - touchStart.x; // 横に動いた長さ（右がプラス）
    const dy = event.clientY - touchStart.y; // 縦に動いた長さ（下がプラス）
    const time = performance.now() - touchStart.time; // 触っていた時間
    touchStart = null;

    // スワイプ
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO) {
      turnPage(dx < 0 ? 1 : -1); // 左へはらう → 次のページ（紙の本と同じ向き）
      return;
    }

    // タップ
    if (Math.abs(dx) <= TAP_MOVE && Math.abs(dy) <= TAP_MOVE && time <= TAP_TIME) {
      const width = window.innerWidth;
      if (event.clientX >= width * (1 - TAP_SIDE)) turnPage(1);
      else if (event.clientX <= width * TAP_SIDE) turnPage(-1);
    }
  }

  // ----------------------------------------------------------
  // 関数：handlePointerCancel
  // 指の操作がとちゅうで取り消されたとき（電話がかかってきた・ブラウザが別の動きにしたなど）：覚えた場所を捨てる
  // ----------------------------------------------------------
  function handlePointerCancel() {
    touchStart = null;
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

    // 画面が暗くならないようにする（ほかのアプリから戻ってきたときも、もう一度頼む）（演奏モードのステップ3）
    requestWakeLock();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // この部品が消えるときの後片付け
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLock?.release().catch(() => {}); // 画面が暗くなってよいことにもどす
      wakeLock = null;
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- 演奏モードの画面（編集ページの上に、画面いっぱいに重ねる） -->
<!-- 指（マウス）の操作で、ページをめくる（演奏モードのステップ2） -->
<!-- tabindex="-1"：dialog の役割の要素は、キーボードの操作の行き先（フォーカス）になれるようにする決まり（VSCode の注意を直した） -->
<div class="perform" role="dialog" aria-label="演奏モード" tabindex="-1" onpointerdown={handlePointerDown} onpointerup={handlePointerUp} onpointercancel={handlePointerCancel}>
  <!-- 楽譜を出す場所（この幅で楽譜を描く） -->
  <div class="stage" bind:this={stage} style:padding-top={`${PAGE_TOP}px`}>
    {#if preparing}
      <p class="preparing">準備中…</p>
    {/if}
    <!-- 今のページを出す（ページが変わると、slices が入れかわる） -->
    <!-- dim：前のページの最後の段（うすく出して、下に区切りの線を引く）（演奏モードのステップ3） -->
    {#each slices as slice (slice.svg)}
      <div class="slice" class:dim={slice.dim} style:margin-bottom={slice.dim ? `${PREV_GAP}px` : null} use:appendNode={slice.svg}></div>
    {/each}
  </div>

  <!-- ページ番号（例：2 / 5） -->
  <div class="footer" style:height={`${FOOTER_HEIGHT}px`}>
    {#if pages.length > 0}
      <span class="page-number">{pageIndex + 1} / {pages.length}</span>
    {/if}
  </div>

  <!-- 設定の欄を開く・閉じる（演奏モードのステップ3） -->
  <button class="gear" class:open={settingsOpen} onclick={() => (settingsOpen = !settingsOpen)} title="演奏モードの設定" aria-label="演奏モードの設定">⚙</button>

  <!-- 編集の画面に戻る -->
  <button class="close" onclick={() => onclose()} title="編集の画面に戻る（Esc）" aria-label="演奏モードを終える">×</button>

  <!-- 設定の欄（［⚙］を押したときだけ出す）（演奏モードのステップ3） -->
  {#if settingsOpen}
    <div class="settings">
      <label>
        <input type="checkbox" checked={autoPortrait} onchange={(event) => changeAutoPortrait(event.currentTarget.checked)} />
        タブレットを縦にしたら、自動で演奏モードにする
      </label>
      <label>
        <input type="checkbox" checked={showPrev} onchange={(event) => changeShowPrev(event.currentTarget.checked)} />
        前のページの最後の段を、上にうすく出す
      </label>
    </div>
  {/if}
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
    touch-action: none; /* 指の動きで、ブラウザがスクロール・拡大をしないようにする（スワイプをこの画面で受け取るため）（演奏モードのステップ2） */
    user-select: none; /* 長押しで文字が選ばれないようにする */
    -webkit-user-select: none; /* iPad の Safari 用 */
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
  /* 前のページの最後の段：うすくして、下に区切りの線を引く（演奏モードのステップ3） */
  .slice.dim {
    opacity: 0.3;
    border-bottom: 1px dashed #999;
  }
  /* 右上の［×］と［⚙］：楽譜のじゃまにならないよう、小さくうすく */
  .close,
  .gear {
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
  /* ［⚙］は［×］の左（演奏モードのステップ3） */
  .gear {
    right: 52px;
    font-size: 18px;
  }
  .gear.open {
    border-color: #2563eb;
    color: #2563eb;
  }
  /* 設定の欄：右上のボタンの下に出す（演奏モードのステップ3） */
  .settings {
    position: absolute;
    top: 52px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    font-size: 14px;
    color: #333;
  }
  .settings label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .settings input {
    width: 20px; /* 指で押しやすい大きさ */
    height: 20px;
  }
</style>
