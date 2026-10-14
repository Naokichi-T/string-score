<script>
  // ==========================================================
  // ToolTabs.svelte
  // 道具のタブ（音符・記号・小節・楽譜の設定）
  // タブを押すと、その下に並ぶボタンが切り替わる
  // （ステップ4-1ではタブの切り替えだけ。ボタンは後のステップで足す）
  // ==========================================================

  // タブの一覧（id はプログラムの中で使う名前、label は画面に出す名前）
  const TABS = [
    { id: "note", label: "音符" },
    { id: "symbol", label: "記号" },
    { id: "measure", label: "小節" },
    { id: "settings", label: "楽譜の設定" },
  ];

  // 今選んでいるタブ
  let activeTab = $state("note");
</script>

<div class="tool-tabs">
  <!-- タブのボタンの並び -->
  <div class="tab-list">
    {#each TABS as tab (tab.id)}
      <button class="tab" class:active={activeTab === tab.id} onclick={() => (activeTab = tab.id)}>
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- 選んでいるタブの中身 -->
  <div class="tab-content">
    {#if activeTab === "note"}
      <span class="placeholder">（音の長さ・休符などのボタンをステップ4-2で作ります）</span>
    {:else if activeTab === "symbol"}
      <span class="placeholder">（弓・指番号・強弱などのボタンをステップ4-4で作ります）</span>
    {:else if activeTab === "measure"}
      <span class="placeholder">（小節の追加・削除などをステップ5で作ります）</span>
    {:else if activeTab === "settings"}
      <span class="placeholder">（タイトル・調・拍子などをステップ5で作ります）</span>
    {/if}
  </div>
</div>

<style>
  .tool-tabs {
    border-bottom: 1px solid #ddd;
    background: #fff;
  }
  .tab-list {
    display: flex; /* タブを横に並べる */
    gap: 2px;
    padding: 6px 16px 0;
  }
  .tab {
    padding: 6px 16px;
    border: 1px solid #ddd;
    border-bottom: none;
    border-radius: 6px 6px 0 0; /* 上の角だけ丸くする */
    background: #f3f4f6;
    cursor: pointer;
  }
  .tab.active {
    background: #fff; /* 選んでいるタブは白くして、中身とつながって見えるようにする */
    font-weight: bold;
  }
  .tab-content {
    min-height: 44px; /* ボタンが並ぶ高さを先に確保しておく */
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    border-top: 1px solid #ddd;
  }
  .placeholder {
    color: #999;
    font-size: 14px;
  }
</style>
