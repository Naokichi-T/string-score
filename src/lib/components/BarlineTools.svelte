<script>
  // ==========================================================
  // BarlineTools.svelte
  // 「小節線」タブの中身（ステップ11-7a）
  //   ・小節の終わりの線：ふつう・複縦線・終止線
  //   ・くり返し：くり返しの始まり（‖:）・くり返しの終わり（:‖）
  //   ・1番・2番かっこ（ステップ11-7b）
  //   ・𝄋・𝄌・To Coda・Fine、D.C.・D.S.（ステップ11-7c）
  // 今付いているもののボタンは青くなる。くり返しのボタンは、もう一度押すと外れる
  // ==========================================================

  import { JUMP_TEXTS } from "#lib/score/model.js"; // D.C.・D.S. の種類と文字（ステップ11-7c）

  // 親から受け取るもの
  //   current     … 選んでいる所の小節線の情報（何も選んでいないときは null）
  //                 { barline: 終わりの線（null・"double"・"final"）, repeatStart: ‖: があるか, repeatEnd: :‖ があるか }
  //                 終わりの線・:‖ は「範囲の最後の小節（音1つならその小節）」、‖: は「範囲の最初の小節」のもの
  //   onbarline   … 終わりの線のボタンが押されたときに呼ぶ関数（null・"double"・"final" を渡す）
  //   onrepeatmark … くり返しのボタンが押されたときに呼ぶ関数（"start" か "end" を渡す）
  //   （ステップ11-7b）current には ending（範囲の最初の小節から始まるかっこの番号。なければ null）も入る
  //   onending    … 1番・2番かっこのボタンが押されたときに呼ぶ関数（1 か 2 を渡す）（ステップ11-7b）
  //   （ステップ11-7c）current には次のものも入る
  //     segno・coda   … 範囲の最初の小節（音1つならその小節）の頭に 𝄋・𝄌 があるか
  //     toCoda・fine  … 範囲の最後の小節（音1つならその小節）の終わりに To Coda・Fine があるか
  //     jump          … 範囲の最後の小節の終わりの D.C.・D.S. の種類（なければ null）
  //   onjumpmark  … 𝄋・𝄌・To Coda・Fine のボタンが押されたときに呼ぶ関数（"segno"・"coda"・"toCoda"・"fine" を渡す）（ステップ11-7c）
  //   onjump      … D.C.・D.S. のプルダウンで選んだときに呼ぶ関数（null か "dc" などを渡す）（ステップ11-7c）
  let { current = null, onbarline = () => {}, onrepeatmark = () => {}, onending = () => {}, onjumpmark = () => {}, onjump = () => {} } = $props();

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

  // 𝄋・𝄌・To Coda・Fine のボタン（ステップ11-7c）
  //   kind  … onjumpmark に渡すもの（小節の情報の名前と同じ）
  //   glyph … ボタンに書く記号（楽譜用フォント。なければ null）
  //   label … ボタンに書く名前
  //   title … マウスを乗せたときの説明
  const MARK_BUTTONS = [
    { kind: "segno", glyph: "\uE047", label: "Segno", title: "𝄋（Segno）：選んでいる小節の頭に付ける。D.S. でここへ戻る（楽譜に1つだけ）" },
    { kind: "coda", glyph: "\uE048", label: "Coda", title: "𝄌（Coda）：コーダの始まりの小節の頭に付ける。To Coda からここへ飛ぶ（楽譜に1つだけ）" },
    { kind: "toCoda", glyph: null, label: "To Coda", title: "To Coda：選んでいる小節の終わりに付ける。D.C.・D.S. で戻ったあと、ここから 𝄌 へ飛ぶ" },
    { kind: "fine", glyph: null, label: "Fine", title: "Fine：選んでいる小節の終わりに付ける。D.C.・D.S. で戻ったあと、ここで終わる" },
  ];

  // ----------------------------------------------------------
  // 関数：handleJumpChange
  // D.C.・D.S. のプルダウンで選んだとき（ステップ11-7c）
  // 「なし」は空の文字なので、null にして渡す
  // ----------------------------------------------------------
  function handleJumpChange(event) {
    const value = event.currentTarget.value;
    onjump(value === "" ? null : value);
  }

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

  <!-- 𝄋・𝄌（小節の頭）と To Coda・Fine（小節の終わり）。もう一度押すと外れる（ステップ11-7c） -->
  <div class="group">
    <span class="label">記号</span>
    {#each MARK_BUTTONS as button (button.kind)}
      <button class:active={!!current?.[button.kind]} {disabled} onclick={() => onjumpmark(button.kind)} title={button.title}>
        {#if button.glyph}
          <span class="glyph">{button.glyph}</span>
        {/if}
        <span class="text">{button.label}</span>
      </button>
    {/each}
  </div>

  <!-- D.C.・D.S.（選んでいる小節の終わりに付ける）（ステップ11-7c） -->
  <div class="group">
    <span class="label">D.C.・D.S.</span>
    <select
      {disabled}
      value={current?.jump ?? ""}
      onchange={handleJumpChange}
      title="D.C.・D.S.：選んでいる小節の終わりに付ける（範囲を選んでいるときは、範囲の最後の小節）。再生では、ここから曲の頭（D.C.）か 𝄋（D.S.）へ1回だけ戻る"
    >
      <option value="">なし</option>
      {#each Object.entries(JUMP_TEXTS) as [type, text] (type)}
        <option value={type}>{text}</option>
      {/each}
    </select>
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
  /* 𝄋・𝄌 の記号（楽譜用フォント）（ステップ11-7c） */
  .glyph {
    font-family: "Bravura"; /* 楽譜用フォント */
    font-size: 22px;
    line-height: 1;
    position: relative;
    top: 9px; /* Bravura の記号は文字の基準線より上に寄っているので、まん中に見えるよう下げる */
  }
  /* D.C.・D.S. のプルダウン（ほかのボタンと同じ高さ）（ステップ11-7c） */
  select {
    height: 40px;
    padding: 0 6px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
  }
  select:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  /* 中の SVG と文字では、マウスの操作を受け取らず、下のボタンに通す */
  button svg,
  button .glyph,
  button .text {
    pointer-events: none;
  }
</style>
