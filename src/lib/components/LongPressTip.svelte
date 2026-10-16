<script>
  // ==========================================================
  // LongPressTip.svelte
  // 指でボタンなどを長押ししたら、その説明（title）を小さな吹き出しで出す部品（ステップ12-10b）
  // ・パソコンのマウスでは、今までどおりブラウザの説明（マウスを乗せると出るもの）を使う
  // ・タブレットでは、マウスを乗せることができないので、長押し（0.5秒）で説明を出す
  // ・長押しで説明を出したときは、そのボタンを押したことにしない（説明を見るつもりで、記号が付いたりしないように）
  // アプリ全体で1つだけ置く（+layout.svelte に置く）。ボタンごとに何か書く必要はない
  // ==========================================================
  import { onMount } from "svelte";

  // 長押しと決めるまでの時間（ミリ秒）
  const HOLD_TIME = 500;

  // 指がこれ以上動いたら、長押しではない（スクロールなど）とする（ピクセル）
  const MOVE_LIMIT = 10;

  // 説明を出しておく時間（ミリ秒）
  const SHOW_TIME = 2500;

  // 吹き出しのいちばん広い幅と、画面の端に残すすき間（ピクセル）
  const TIP_MAX_WIDTH = 320;
  const EDGE = 16;

  // 出している説明（出していないときは null）
  //   text … 説明の文字
  //   x, y … 吹き出しを置く位置（画面の左上からのピクセル）
  //   below … true なら要素の下に出す（上に場所がないとき）
  let tip = $state(null);

  // ----------------------------------------------------------
  // 画面が表示されたら、指の操作を見張り始める
  // ----------------------------------------------------------
  onMount(() => {
    let holdTimer = null; // 長押しを待つタイマー
    let hideTimer = null; // 説明を消すタイマー
    let startX = 0; // 指を置いた位置
    let startY = 0;
    let shownByHold = false; // 今の長押しで説明を出したか

    // ----------------------------------------------------------
    // 関数：cancelHold
    // 長押しを待つのをやめる
    // ----------------------------------------------------------
    function cancelHold() {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    // ----------------------------------------------------------
    // 関数：showTip
    // 要素の説明を、要素の上（上に場所がなければ下）に出す
    //   element … 説明（title）を持っている要素
    // ----------------------------------------------------------
    function showTip(element) {
      const rect = element.getBoundingClientRect();
      const below = rect.top < 60; // 上に場所がない（画面のいちばん上の近く）なら下に出す
      // 吹き出しの横の真ん中（要素の真ん中。ただし、吹き出しが画面の左右からはみ出さないように寄せる）
      const half = Math.min(TIP_MAX_WIDTH, window.innerWidth - EDGE * 2) / 2;
      const center = Math.min(Math.max(rect.left + rect.width / 2, EDGE + half), window.innerWidth - EDGE - half);
      tip = {
        text: element.getAttribute("title"),
        x: center,
        y: below ? rect.bottom + 8 : rect.top - 8,
        below: below,
      };
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => (tip = null), SHOW_TIME);
    }

    // ----------------------------------------------------------
    // 関数：blockNextClick
    // 長押しで説明を出したとき、指を離したときの「押した」を取り消す
    // （指を離すと click が起きるので、その1回だけ止める。0.4秒たっても起きなければ止めるのをやめる）
    // ----------------------------------------------------------
    function blockNextClick() {
      const block = (event) => {
        event.preventDefault();
        event.stopPropagation(); // ボタンの onclick まで届かないようにする
        window.removeEventListener("click", block, true);
      };
      window.addEventListener("click", block, true);
      setTimeout(() => window.removeEventListener("click", block, true), 400);
    }

    // 指を置いたとき：説明（title）を持つ要素の上なら、長押しを待ち始める
    function handleDown(event) {
      tip = null; // 前の説明は消す
      shownByHold = false;
      if (event.pointerType !== "touch") return; // マウス・ペンでは何もしない
      const element = event.target.closest("[title]");
      if (!element || !element.getAttribute("title")) return;
      startX = event.clientX;
      startY = event.clientY;
      cancelHold();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        shownByHold = true;
        showTip(element);
      }, HOLD_TIME);
    }

    // 指を動かしたとき：大きく動いたら長押しではない
    function handleMove(event) {
      if (!holdTimer) return;
      if (Math.abs(event.clientX - startX) > MOVE_LIMIT || Math.abs(event.clientY - startY) > MOVE_LIMIT) {
        cancelHold();
      }
    }

    // 指を離したとき：長押しを待つのをやめる。長押しで説明を出していたら、押したことにしない
    function handleUp() {
      cancelHold();
      if (shownByHold) blockNextClick();
      shownByHold = false;
    }

    // 長押しで出るメニュー（Android など）を、説明を出したときだけ止める
    function handleContextMenu(event) {
      if (shownByHold || tip) event.preventDefault();
    }

    // true：ほかの処理より先に受け取る（capture）
    window.addEventListener("pointerdown", handleDown, true);
    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleUp, true);
    window.addEventListener("contextmenu", handleContextMenu, true);

    // この部品が消えるときの後片付け
    return () => {
      cancelHold();
      clearTimeout(hideTimer);
      window.removeEventListener("pointerdown", handleDown, true);
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleUp, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
    };
  });
</script>

<!-- 説明の吹き出し（出しているときだけ） -->
{#if tip}
  <div class="tip" class:below={tip.below} style="left: {tip.x}px; top: {tip.y}px;">{tip.text}</div>
{/if}

<style>
  .tip {
    position: fixed; /* 画面に対して位置を決める（スクロールしても動かない） */
    z-index: 1000; /* ほかの何よりも上に出す */
    width: max-content; /* 短い説明は文字の幅に合わせる */
    max-width: min(320px, calc(100vw - 32px)); /* 長い説明は折り返す。画面からはみ出さない（320 と 32 は TIP_MAX_WIDTH と EDGE×2） */
    padding: 6px 10px;
    font-size: 13px;
    line-height: 1.4;
    color: #fff;
    background: rgba(17, 24, 39, 0.92); /* ほぼ黒 */
    border-radius: 6px;
    pointer-events: none; /* 吹き出しは押せない（下のものの操作をじゃましない） */
    /* 位置は要素の上の真ん中。吹き出しの下の端・横の真ん中をそこに合わせる */
    transform: translate(-50%, -100%);
  }
  /* 要素の下に出すときは、吹き出しの上の端を合わせる */
  .tip.below {
    transform: translate(-50%, 0);
  }
</style>
