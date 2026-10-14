<script>
  // ==========================================================
  // ToolTabs.svelte
  // 道具のタブ（音符・記号・小節・楽譜の設定）
  // タブを押すと、その下に並ぶボタンが切り替わる
  // （ステップ4-2：「音符」タブに長さ・付点・休符のボタンを追加）
  // （ステップ4-3：臨時記号・高さ・タイ・削除のボタンを追加）
  // （ステップ4-4：上書き・挿入の切り替えを追加）
  // ボタンの記号は、五線譜と同じ楽譜用フォント（Bravura）で描く
  // ==========================================================
  import { DURATION_ORDER } from "#lib/score/model.js";

  // 親から受け取るもの
  //   duration     … 今の長さ（'quarter' など）
  //   dotted       … 付点が付いているか（true / false）
  //   canUse       … その長さ（＋付点）が使えるかを調べる関数 canUse(duration, dots) → true / false
  //   onduration   … 長さのボタンが押されたときに呼ぶ関数（長さの名前を渡す）
  //   ondot        … 付点のボタンが押されたときに呼ぶ関数
  //   onrest       … 休符のボタンが押されたときに呼ぶ関数
  //   noteSelected … 音符（休符ではない）を選んでいるか（false なら臨時記号などのボタンを押せない）
  //   onaccidental … 臨時記号のボタンが押されたときに呼ぶ関数（1：♯、-1：♭、0：♮ を渡す）
  //   onstep       … ▲ ▼ が押されたときに呼ぶ関数（1：半音上、-1：半音下 を渡す）
  //   ontie        … タイのボタンが押されたときに呼ぶ関数
  //   ondelete     … 削除のボタンが押されたときに呼ぶ関数
  //   mode         … 入力のしかた（'overwrite'：上書き、'insert'：挿入）
  //   onmode       … 切り替えのボタンが押されたときに呼ぶ関数（'overwrite' か 'insert' を渡す）
  let {
    mode = "overwrite",
    onmode = () => {},
    duration,
    dotted,
    canUse = () => true,
    onduration = () => {},
    ondot = () => {},
    onrest = () => {},
    noteSelected = false,
    onaccidental = () => {},
    onstep = () => {},
    ontie = () => {},
    ondelete = () => {},
  } = $props();

  // タブの一覧（id はプログラムの中で使う名前、label は画面に出す名前）
  const TABS = [
    { id: "note", label: "音符" },
    { id: "symbol", label: "記号" },
    { id: "measure", label: "小節" },
    { id: "settings", label: "楽譜の設定" },
  ];

  // 長さのボタンに出す記号と名前
  //   icon … 楽譜用フォント（Bravura）の文字。Bravura では音楽記号に決まった番号が付いている
  //   name … マウスを乗せたときに出す名前
  //   flat … 符尾のない平たい記号なら true（下にずらさなくてよいので、位置の調整を変える）
  const DURATION_LABELS = {
    whole: { icon: "\uE1D2", name: "全音符", flat: true },
    half: { icon: "\uE1D3", name: "2分音符" },
    quarter: { icon: "\uE1D5", name: "4分音符" },
    eighth: { icon: "\uE1D7", name: "8分音符" },
    "16th": { icon: "\uE1D9", name: "16分音符" },
  };

  // 付点・休符のボタンに出す記号（楽譜用フォントの文字）
  const DOT_ICON = "\uE1D5\uE1E7"; // 4分音符＋付点
  const REST_ICON = "\uE4E5"; // 4分休符

  // 臨時記号のボタン（alter：音の高さをどれだけ変えるか、icon：楽譜用フォントの文字）
  const ACCIDENTALS = [
    { alter: 1, icon: "\uE262", name: "シャープ（♯）" },
    { alter: -1, icon: "\uE260", name: "フラット（♭）" },
    { alter: 0, icon: "\uE261", name: "ナチュラル（♮）" },
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
      <!-- 入力のしかたの切り替え（上書き・挿入） -->
      <div class="mode-switch">
        <button class:on={mode === "overwrite"} onclick={() => onmode("overwrite")} title="選んでいる所を新しい音に置き換える（I キーで切り替え）"> 上書き </button>
        <button class:on={mode === "insert"} onclick={() => onmode("insert")} title="選んでいる音の前に入れて、後ろの音をずらす（I キーで切り替え）"> 挿入 </button>
      </div>

      <!-- 長さのボタン（今の長さは色が付く。入らない長さは押せない） -->
      <div class="group">
        {#each DURATION_ORDER as d (d)}
          <button
            class="tool"
            class:on={duration === d}
            disabled={!canUse(d, dotted ? 1 : 0) && !canUse(d, 0)}
            onclick={() => onduration(d)}
            title={DURATION_LABELS[d].name}
            aria-label={DURATION_LABELS[d].name}
          >
            <span class="icon" class:flat={DURATION_LABELS[d].flat}>{DURATION_LABELS[d].icon}</span>
          </button>
        {/each}
      </div>

      <!-- 付点 -->
      <div class="group">
        <button class="tool" class:on={dotted} onclick={() => ondot()} title="付点" aria-label="付点">
          <span class="icon">{DOT_ICON}</span>
        </button>
      </div>

      <!-- 休符 -->
      <div class="group">
        <button class="tool" disabled={!canUse(duration, dotted ? 1 : 0)} onclick={() => onrest()} title="休符にする" aria-label="休符にする">
          <span class="icon flat">{REST_ICON}</span>
        </button>
      </div>

      <!-- 臨時記号（音符を選んでいるときだけ押せる） -->
      <div class="group">
        {#each ACCIDENTALS as acc (acc.alter)}
          <button class="tool" disabled={!noteSelected} onclick={() => onaccidental(acc.alter)} title={acc.name} aria-label={acc.name}>
            <span class="icon accidental">{acc.icon}</span>
          </button>
        {/each}
      </div>

      <!-- 半音上げる・下げる -->
      <div class="group">
        <button class="tool text" disabled={!noteSelected} onclick={() => onstep(1)} title="半音上げる（↑）"> ▲ </button>
        <button class="tool text" disabled={!noteSelected} onclick={() => onstep(-1)} title="半音下げる（↓）"> ▼ </button>
      </div>

      <!-- タイ・削除 -->
      <div class="group">
        <button class="tool text wide" disabled={!noteSelected} onclick={() => ontie()} title="次の音とタイでつなぐ"> タイ </button>
        <button class="tool text wide" disabled={!noteSelected} onclick={() => ondelete()} title="音符を休符にする（Delete）"> 削除 </button>
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
    justify-content: center;
    width: 44px; /* 記号だけのボタンなので、幅をそろえる */
    height: 40px;
    padding: 0;
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
    font-family: "Bravura"; /* 楽譜用フォント（VexFlow が読み込んだもの） */
    font-size: 24px;
    line-height: 1;
    /* Bravura の音符は、玉が文字の基準線の上にあって符尾が上に長く伸びる形なので、
		   そのままだとボタンの上にはみ出す。少し下にずらしてまん中に見せる */
    position: relative;
    top: 9px;
  }
  .icon.flat {
    top: -1px; /* 全音符・休符は符尾がないので、ずらす量を小さくする */
  }
  .icon.accidental {
    top: 0; /* 臨時記号は文字の基準線の上下にまたがる形なので、ずらさない */
  }
  .tool.text {
    font-size: 15px; /* 文字のボタン（▲ ▼ タイ 削除） */
  }
  .tool.wide {
    width: 52px;
  }
  .placeholder {
    color: #999;
    font-size: 14px;
  }
  .mode-switch {
    display: flex; /* 2つのボタンをくっつけて並べる */
    border: 1px solid #ccc;
    border-radius: 4px;
    overflow: hidden; /* 角の丸みからボタンがはみ出さないようにする */
  }
  .mode-switch button {
    height: 40px;
    padding: 0 12px;
    font-size: 14px;
    border: none;
    background: #fff;
    cursor: pointer;
  }
  .mode-switch button + button {
    border-left: 1px solid #ccc; /* 2つのボタンの間の線 */
  }
  .mode-switch button.on {
    background: #f59e0b; /* 今のモードはオレンジ（長さのボタンの青と区別する） */
    color: #fff;
    font-weight: bold;
  }
</style>
