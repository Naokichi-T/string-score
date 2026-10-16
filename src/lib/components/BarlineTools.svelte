<script>
  // ==========================================================
  // BarlineTools.svelte
  // 「小節線」タブの中身（ステップ11-7a）
  //   ・小節の終わりの線：ふつう・複縦線・終止線
  //   ・くり返し：くり返しの始まり（‖:）・くり返しの終わり（:‖）
  //   ・1番・2番かっこ（ステップ11-7b）
  // 今付いているもののボタンは青くなる。くり返しのボタンは、もう一度押すと外れる
  // ==========================================================

  // 親から受け取るもの
  //   current     … 選んでいる所の小節線の情報（何も選んでいないときは null）
  //                 { barline: 終わりの線（null・"double"・"final"）, repeatStart: ‖: があるか, repeatEnd: :‖ があるか }
  //                 終わりの線・:‖ は「範囲の最後の小節（音1つならその小節）」、‖: は「範囲の最初の小節」のもの
  //   onbarline   … 終わりの線のボタンが押されたときに呼ぶ関数（null・"double"・"final" を渡す）
  //   onrepeatmark … くり返しのボタンが押されたときに呼ぶ関数（"start" か "end" を渡す）
  //   （ステップ11-7b）current には ending（範囲の最初の小節から始まるかっこの番号。なければ null）も入る
  //   onending    … 1番・2番かっこのボタンが押されたときに呼ぶ関数（1 か 2 を渡す）（ステップ11-7b）
  let { current = null, onbarline = () => {}, onrepeatmark = () => {}, onending = () => {} } = $props();

  // 何も選んでいないときは、ボタンを全部押せないようにする
  let disabled = $derived(!current);

  // 終わりの線のボタン
  //   type  … onbarline に渡すもの
  //   label … ボタンの横に書く名前
  //   title … マウスを乗せたときの説明
  const END_BUTTONS = [
    { type: null, label: "ふつう", title: "小節の終わりを、ふつうの小節線にする（くり返しの終わりも外れる）" },
    { type: "double", label: "複縦線", title: "小節の終わりを、複縦線（細い線2本）にする" },
    { type: "final", label: "終止線", title: "小節の終わりを、終止線（細い線＋太い線）にする" },
  ];

  // ----------------------------------------------------------
  // 関数：isEndActive
  // 終わりの線のボタンを青くするか（今の終わりの線と同じか）
  // ----------------------------------------------------------
  function isEndActive(type) {
    if (!current) return false;
    if (current.repeatEnd) return false; // くり返しの終わりのときは、どれも青くしない
    return (current.barline ?? null) === type;
  }
</script>

<div class="barline-tools">
  <!-- 小節の終わりの線（範囲を選んでいるときは、範囲の最後の小節の終わり） -->
  <div class="group">
    <span class="label">小節の終わり</span>
    {#each END_BUTTONS as button (button.label)}
      <button class:active={isEndActive(button.type)} {disabled} onclick={() => onbarline(button.type)} title={button.title}>
        <!-- 線の形を、小さな SVG で描く -->
        <svg width="22" height="28" viewBox="0 0 22 28">
          {#if button.type === null}
            <rect x="10" y="2" width="1.5" height="24" fill="currentColor" />
          {:else if button.type === "double"}
            <rect x="7" y="2" width="1.5" height="24" fill="currentColor" />
            <rect x="12" y="2" width="1.5" height="24" fill="currentColor" />
          {:else}
            <rect x="6" y="2" width="1.5" height="24" fill="currentColor" />
            <rect x="11" y="2" width="5" height="24" fill="currentColor" />
          {/if}
        </svg>
        <span class="text">{button.label}</span>
      </button>
    {/each}
  </div>

  <!-- くり返し（‖: は範囲の最初の小節の頭、:‖ は範囲の最後の小節の終わり） -->
  <div class="group">
    <span class="label">くり返し</span>
    <button
      class:active={!!current?.repeatStart}
      {disabled}
      onclick={() => onrepeatmark("start")}
      title="くり返しの始まり（‖:）：選んでいる小節の頭に付ける（範囲を選んでいるときは、範囲の最初の小節）"
    >
      <svg width="22" height="28" viewBox="0 0 22 28">
        <rect x="3" y="2" width="5" height="24" fill="currentColor" />
        <rect x="10" y="2" width="1.5" height="24" fill="currentColor" />
        <circle cx="16" cy="10.5" r="1.8" fill="currentColor" />
        <circle cx="16" cy="17.5" r="1.8" fill="currentColor" />
      </svg>
      <span class="text">始まり</span>
    </button>
    <button
      class:active={!!current?.repeatEnd}
      {disabled}
      onclick={() => onrepeatmark("end")}
      title="くり返しの終わり（:‖）：選んでいる小節の終わりに付ける（範囲を選んでいるときは、範囲の最後の小節）。再生では、2回目はそのまま進む"
    >
      <svg width="22" height="28" viewBox="0 0 22 28">
        <circle cx="6" cy="10.5" r="1.8" fill="currentColor" />
        <circle cx="6" cy="17.5" r="1.8" fill="currentColor" />
        <rect x="10.5" y="2" width="1.5" height="24" fill="currentColor" />
        <rect x="14" y="2" width="5" height="24" fill="currentColor" />
      </svg>
      <span class="text">終わり</span>
    </button>
  </div>

  <!-- 1番・2番かっこ（範囲を選んでいるときは、範囲にかかる小節に付ける。ここから始まっている所でもう一度押すと外れる）（ステップ11-7b） -->
  <div class="group">
    <span class="label">かっこ</span>
    {#each [1, 2] as number (number)}
      <button
        class:active={current?.ending === number}
        {disabled}
        onclick={() => onending(number)}
        title={`${number}番かっこ：選んでいる小節に付ける（範囲を選んでいるときは、範囲にかかる小節）。くり返しの${number}回目だけ弾く`}
      >
        <svg width="22" height="28" viewBox="0 0 22 28">
          <rect x="2" y="4" width="18" height="1.5" fill="currentColor" />
          <rect x="2" y="4" width="1.5" height="12" fill="currentColor" />
          {#if number === 1}
            <rect x="18.5" y="4" width="1.5" height="12" fill="currentColor" />
          {/if}
          <text x="6" y="17" class="ending-number">{number}.</text>
        </svg>
        <span class="text">{number}番</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .barline-tools {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap; /* 画面が狭いときは折り返す */
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
    display: flex;
    align-items: center;
    gap: 4px;
    height: 40px;
    padding: 0 10px 0 6px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  /* 今付いているものは青（ほかのタブと同じ色） */
  button.active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
  }
  button:disabled {
    opacity: 0.35; /* 押せないものはうすく */
    cursor: not-allowed;
  }
  /* かっこのボタンの中の「1.」「2.」（ステップ11-7b） */
  .ending-number {
    font-size: 10px;
    font-weight: bold;
    fill: currentColor;
  }
  /* 中の SVG と文字では、マウスの操作を受け取らず、下のボタンに通す */
  button svg,
  button .text {
    pointer-events: none;
  }
</style>
