<script>
  // ==========================================================
  // PartTools.svelte
  // 「パート」タブの中身（パートの追加・並べ替え・削除）
  // （ステップ5-6で追加）
  // ==========================================================
  import { INSTRUMENTS } from "#lib/score/model.js";

  // 親から受け取るもの
  //   parts        … パートの一覧（楽譜データの parts）
  //   selectedPart … 選んでいるパートの番号（何も選んでいないときは null。その行を青っぽくする）
  //   onaddpart    … 追加のボタンが押されたときに呼ぶ関数（楽器の名前 "violin" などを渡す）
  //   onmovepart   … ↑ ↓ が押されたときに呼ぶ関数（パートの番号と、-1（上）か 1（下）を渡す）
  //   ondeletepart … 削除が押されたときに呼ぶ関数（パートの番号を渡す）
  let { parts = [], selectedPart = null, onaddpart = () => {}, onmovepart = () => {}, ondeletepart = () => {} } = $props();

  // 追加のボタンに並べる楽器（INSTRUMENTS に書いてある順番）
  const INSTRUMENT_IDS = Object.keys(INSTRUMENTS);
</script>

<div class="part-tools">
  <!-- パートの追加 -->
  <div class="group">
    <span class="label">パートを追加</span>
    {#each INSTRUMENT_IDS as id}
      <button onclick={() => onaddpart(id)} title={`${INSTRUMENTS[id].label}のパートを一番下に足す`}> ＋{INSTRUMENTS[id].label} </button>
    {/each}
  </div>

  <!-- パートの一覧（上から楽譜と同じ順番） -->
  <div class="part-list">
    {#each parts as part, index}
      <div class="part-row" class:selected={index === selectedPart}>
        <span class="part-name">{part.name}</span>
        <button class="small" disabled={index === 0} onclick={() => onmovepart(index, -1)} title="1つ上に動かす"> ↑ </button>
        <button class="small" disabled={index === parts.length - 1} onclick={() => onmovepart(index, 1)} title="1つ下に動かす"> ↓ </button>
        <button class="small" disabled={parts.length <= 1} onclick={() => ondeletepart(index)} title="このパートを消す（「元に戻す」で戻せる）"> 削除 </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .part-tools {
    display: flex;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .label {
    font-size: 13px;
    color: #666;
    margin-right: 4px;
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
  /* パートの一覧は、横に並べる（タブの高さを取りすぎないように） */
  .part-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .part-row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px 2px 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
  }
  /* 選んでいるパートの行は青っぽくする */
  .part-row.selected {
    background: #eff6ff;
    border-color: #2563eb;
  }
  .part-name {
    font-size: 14px;
    min-width: 72px;
    margin-right: 4px;
  }
  /* 行の中のボタンは小さめ */
  button.small {
    height: 32px;
    padding: 0 8px;
    font-size: 13px;
  }
</style>
