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
  //   hiddenParts  … 隠すパートの名札（id）の配列（ステップ12-6a）
  //   ontoggleview … 表示のチェックが押されたときに呼ぶ関数（パートの名札を渡す）（ステップ12-6a）
  //   beatLines      … 拍の線が入っているか（ステップ12-7）
  //   ontogglebeats  … ［拍の線］が押されたときに呼ぶ関数（ステップ12-7）
  let {
    parts = [],
    selectedPart = null,
    onaddpart = () => {},
    onmovepart = () => {},
    ondeletepart = () => {},
    hiddenParts = [],
    ontoggleview = () => {},
    beatLines = false,
    ontogglebeats = () => {},
  } = $props();

  // 表示しているパートの数（最後の1つはチェックを外せないようにするため）（ステップ12-6a）
  let visibleCount = $derived(parts.filter((part) => !hiddenParts.includes(part.id)).length);

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

  <!-- 拍の線（押すたびに入・切）（ステップ12-7） -->
  <!-- 見え方の設定だと分かるように、「表示」の見出しを付ける（「小節」タブには移さない。ステップ16-3） -->
  <div class="group">
    <span class="label">表示</span>
    <button class:on={beatLines} onclick={() => ontogglebeats()} title="拍の頭ごとに、五線に色の線を引く（1拍目は赤、ほかは青。PDF には出ない）"> 拍の線 </button>
  </div>

  <!-- パートの一覧（上から楽譜と同じ順番） -->
  <div class="part-list">
    {#each parts as part, index}
      {@const shown = !hiddenParts.includes(part.id)}
      <div class="part-row" class:selected={index === selectedPart} class:hidden-part={!shown}>
        <!-- 表示する・しないのチェック（表示しているのが1つだけなら、それは外せない）（ステップ12-6a） -->
        <input
          type="checkbox"
          class="view-check"
          checked={shown}
          disabled={shown && visibleCount <= 1}
          onchange={() => ontoggleview(part.id)}
          title="楽譜に表示する（外すと隠れる。音は「再生」タブの設定どおりに鳴る）"
        />
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
  /* 入っているボタンは青（ステップ12-7） */
  button.on {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
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
  /* 隠しているパートの行は、名前をうすくする（ステップ12-6a） */
  .part-row.hidden-part .part-name {
    color: #aaa;
  }
  /* 表示のチェック（指でも押しやすい大きさ）（ステップ12-6a） */
  .view-check {
    width: 18px;
    height: 18px;
    margin: 0 6px 0 0;
    cursor: pointer;
  }
  /* 行の中のボタンは小さめ */
  button.small {
    height: 32px;
    padding: 0 8px;
    font-size: 13px;
  }
</style>
