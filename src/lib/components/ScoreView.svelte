<script>
  // ==========================================================
  // ScoreView.svelte
  // 楽譜データを受け取って、五線譜を表示する部品
  // 画面の幅が変わったら、改行の位置を決め直して描き直す
  // ==========================================================
  import { onMount } from "svelte";
  import { renderScore } from "#lib/score/render.js";

  // 親から受け取る楽譜データ
  let { score } = $props();

  // 外側の枠の div（幅を測るのに使う）
  let wrapper;

  // 五線譜を描く先の div（bind:this で中身が入る）
  let container;

  // 読み込んだ VexFlow（読み込みが終わるまでは null）
  let VF = null;

  // ----------------------------------------------------------
  // 関数：draw
  // 今の枠の幅に合わせて、五線譜を描く
  // ----------------------------------------------------------
  function draw() {
    // VexFlow の読み込みが終わっていなければ何もしない
    if (!VF) return;
    // 枠の内側の幅（左右の padding 8px ずつを引く）
    const width = wrapper.clientWidth - 16;
    renderScore(VF, container, score, width);
  }

  // ----------------------------------------------------------
  // 画面が表示されたら実行される処理
  // VexFlow はブラウザの中でしか動かないので、ここで読み込む
  // ----------------------------------------------------------
  onMount(() => {
    // 描き直しの予約（幅が変わるたびに何度も描かないように、まとめて1回にする）
    let frame = 0;
    function requestDraw() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    }

    // 枠の幅が変わったら描き直す
    const observer = new ResizeObserver(requestDraw);
    observer.observe(wrapper);

    // VexFlow を読み込んで、フォントの準備ができたら描く
    (async () => {
      // VexFlow を読み込む（読み込むと楽譜用のフォントも読み込みが始まる）
      VF = (await import("vexflow")).default;
      // 楽譜用のフォント（Bravura）の読み込みが終わるのを待つ
      await document.fonts.ready;
      draw();
    })();

    // この部品が画面から消えるときの後片付け
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });
</script>

<!-- 五線譜が入る枠 -->
<div class="score-view" bind:this={wrapper}>
  <div bind:this={container}></div>
</div>

<style>
  .score-view {
    overflow-x: auto; /* 最低限の幅より狭い画面では横スクロール */
    background: #fff; /* 紙のような白い背景 */
    border: 1px solid #ddd; /* うすい枠線 */
    padding: 8px;
  }
</style>
