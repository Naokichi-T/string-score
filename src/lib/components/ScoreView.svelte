<script>
  // ==========================================================
  // ScoreView.svelte
  // 楽譜データを受け取って、五線譜を表示する部品
  // ==========================================================
  import { onMount } from "svelte";
  import { renderScore } from "#lib/score/render.js";

  // 親から受け取る楽譜データ
  let { score } = $props();

  // 五線譜を描く先の div（bind:this で中身が入る）
  let container;

  // ----------------------------------------------------------
  // 画面が表示されたら実行される処理
  // VexFlow はブラウザの中でしか動かないので、ここで読み込む
  // ----------------------------------------------------------
  onMount(async () => {
    // VexFlow を読み込む（読み込むと楽譜用のフォントも読み込みが始まる）
    const VF = (await import("vexflow")).default;

    // 楽譜用のフォント（Bravura）の読み込みが終わるのを待つ
    await document.fonts.ready;

    // 五線譜を描く
    renderScore(VF, container, score);
  });
</script>

<!-- 五線譜が入る枠（横に長いときは横スクロール） -->
<div class="score-view">
  <div bind:this={container}></div>
</div>

<style>
  .score-view {
    overflow-x: auto; /* はみ出したら横スクロール */
    background: #fff; /* 紙のような白い背景 */
    border: 1px solid #ddd; /* うすい枠線 */
    padding: 8px;
  }
</style>
