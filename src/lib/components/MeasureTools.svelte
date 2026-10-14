<script>
  // ==========================================================
  // MeasureTools.svelte
  // 「小節」タブの中身（小節の追加・削除のボタン）
  // （ステップ5-2で追加）
  // ==========================================================

  // 親から受け取るもの
  //   canDelete … 小節を消せるか（何も選んでいない・小節が1つしか残らないときは false）
  //   onmeasure … ボタンが押されたときに呼ぶ関数
  //               "before"（前に追加）・"after"（後ろに追加）・"delete"（削除）を渡す
  let { canDelete = false, onmeasure = () => {} } = $props();
</script>

<div class="measure-tools">
  <div class="group">
    <button onclick={() => onmeasure("before")} title="選んでいる小節の前に、小節を1つ足す（何も選んでいないときは最後に足す）"> 前に追加 </button>
    <button onclick={() => onmeasure("after")} title="選んでいる小節の後ろに、小節を1つ足す（何も選んでいないときは最後に足す）"> 後ろに追加 </button>
  </div>

  <div class="group">
    <button disabled={!canDelete} onclick={() => onmeasure("delete")} title="選んでいる小節を消す（範囲を選んでいるときは、範囲にかかる小節をまとめて消す）"> 小節を削除 </button>
  </div>
</div>

<style>
  .measure-tools {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .group {
    display: flex;
    gap: 4px;
  }
  button {
    height: 40px;
    padding: 0 14px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.35; /* 押せないものはうすく */
    cursor: not-allowed;
  }
</style>
