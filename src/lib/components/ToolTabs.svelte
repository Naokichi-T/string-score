<script>
  // ==========================================================
  // ToolTabs.svelte
  // 道具のタブ（音符・記号・小節・楽譜の設定）
  // タブを押すと、その下に並ぶボタンが切り替わる
  // （ステップ4-2：「音符」タブに長さ・付点・休符のボタンを追加）
  // ==========================================================
  import { DURATION_ORDER } from "#lib/score/model.js";

  // 親から受け取るもの
  //   duration     … 今の長さ（'quarter' など）
  //   dotted       … 付点が付いているか（true / false）
  //   canUse       … その長さ（＋付点）が使えるかを調べる関数 canUse(duration, dots) → true / false
  //   onduration   … 長さのボタンが押されたときに呼ぶ関数（長さの名前を渡す）
  //   ondot        … 付点のボタンが押されたときに呼ぶ関数
  //   onrest       … 休符のボタンが押されたときに呼ぶ関数
  let { duration, dotted, canUse = () => true, onduration = () => {}, ondot = () => {}, onrest = () => {} } = $props();

  // タブの一覧（id はプログラムの中で使う名前、label は画面に出す名前）
  const TABS = [
    { id: "note", label: "音符" },
    { id: "symbol", label: "記号" },
    { id: "measure", label: "小節" },
    { id: "settings", label: "楽譜の設定" },
  ];

  // 長さのボタンに出す記号と名前
  const DURATION_LABELS = {
    whole: { icon: "𝅝", text: "全" },
    half: { icon: "𝅗𝅥", text: "2分" },
    quarter: { icon: "♩", text: "4分" },
    eighth: { icon: "♪", text: "8分" },
    "16th": { icon: "𝅘𝅥𝅯", text: "16分" },
  };

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
      <!-- 長さのボタン（今の長さは色が付く。入らない長さは押せない） -->
      <div class="group">
        {#each DURATION_ORDER as d (d)}
          <button class="tool" class:on={duration === d} disabled={!canUse(d, dotted ? 1 : 0) && !canUse(d, 0)} onclick={() => onduration(d)} title="{DURATION_LABELS[d].text}音符">
            <span class="icon">{DURATION_LABELS[d].icon}</span>{DURATION_LABELS[d].text}
          </button>
        {/each}
      </div>

      <!-- 付点 -->
      <div class="group">
        <button class="tool" class:on={dotted} onclick={() => ondot()} title="付点">・付点</button>
      </div>

      <!-- 休符 -->
      <div class="group">
        <button class="tool" disabled={!canUse(duration, dotted ? 1 : 0)} onclick={() => onrest()} title="休符にする">
          <span class="icon">𝄽</span>休符
        </button>
      </div>
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
    gap: 16px;
    padding: 6px 16px;
    border-top: 1px solid #ddd;
  }
  .group {
    display: flex;
    gap: 4px;
  }
  .tool {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .tool.on {
    background: #2563eb; /* 選んでいるものは青 */
    color: #fff;
    border-color: #2563eb;
  }
  .tool:disabled {
    opacity: 0.35; /* 押せないものはうすく */
    cursor: not-allowed;
  }
  .icon {
    font-size: 20px;
    line-height: 1;
  }
  .placeholder {
    color: #999;
    font-size: 14px;
  }
</style>
