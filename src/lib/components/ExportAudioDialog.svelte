<script>
  // ==========================================================
  // ExportAudioDialog.svelte
  // MP3 を作っている間に、画面のまん中に出す窓（MP3 書き出しの手順3）
  // ・うしろを、うすく暗くする幕でおおう（作っている間は、楽譜を触れないようにするため）
  // ・今どの段階かと、進み具合を出す
  //     "render" … 音を作っている（どこまで進んだかは分からないので、左右に動く帯を出す）
  //     "encode" … MP3 に変えている（進み具合を ％ と帯の長さで出す）
  // ・［やめる］か Esc キーで、作りかけを捨ててやめる
  //   （幕を押しても閉じない。うっかり押して、作りかけが消えないようにするため）
  // ==========================================================

  // 親から受け取るもの
  //   stage    … 今の段階（"render"：音を作っている、"encode"：MP3 に変えている）
  //   progress … MP3 に変える進み具合（0〜1。"encode" のときだけ使う）
  //   oncancel … ［やめる］・Esc が押されたときに呼ぶ関数
  let { stage = "render", progress = 0, oncancel = () => {} } = $props();

  // 進み具合を ％ の整数にしたもの（例：0.456 → 46）
  let percent = $derived(Math.round(progress * 100));

  // ----------------------------------------------------------
  // 関数：handleKeydown
  // Esc キーでやめる（キーボードをつないだタブレット・パソコンのため）
  // ----------------------------------------------------------
  function handleKeydown(event) {
    if (event.key === "Escape") oncancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- 窓のうしろの、うすく暗くする幕（押しても閉じない） -->
<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="export-audio-title">
    <h2 id="export-audio-title">MP3 を作っています…</h2>

    <!-- 今の段階の説明 -->
    {#if stage === "render"}
      <p class="stage">音を作っています</p>
    {:else}
      <p class="stage">MP3 に変えています（{percent}％）</p>
    {/if}

    <!-- 進み具合の帯（"render" のときは左右に動く帯、"encode" のときは進み具合の長さ） -->
    <div class="bar">
      {#if stage === "render"}
        <div class="fill moving"></div>
      {:else}
        <div class="fill" style="width: {percent}%"></div>
      {/if}
    </div>

    <p class="note">長い曲では、少し時間がかかります。できたら「タイトル.mp3」がダウンロードされます。</p>

    <!-- やめるボタン（title を付けないのは、タブレットで長押しの説明が出て押しにくくならないようにするため） -->
    <div class="buttons">
      <button onclick={() => oncancel()}>やめる</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; /* 画面に貼り付ける（スクロールしても動かない） */
    inset: 0; /* 上下左右いっぱいに広げる */
    background: rgba(0, 0, 0, 0.4); /* うすい黒（うしろの楽譜が透けて見える） */
    display: flex; /* 窓を画面のまん中に置く */
    align-items: center;
    justify-content: center;
    z-index: 100; /* 楽譜や鍵盤・書き出しのメニューより上に出す */
  }
  .dialog {
    background: white;
    border-radius: 8px;
    padding: 20px 24px;
    width: 400px;
    max-width: calc(100vw - 32px); /* 画面が狭いときは、左右に 16px ずつ空ける */
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); /* 窓の影 */
  }
  h2 {
    margin: 0 0 12px;
    font-size: 18px;
  }
  .stage {
    margin: 0 0 8px;
    font-size: 15px;
    color: #333;
  }
  /* 進み具合の帯の、うしろの溝 */
  .bar {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: #e5e7eb; /* うすいグレー */
    overflow: hidden; /* 動く帯が溝の外に出ないようにする */
  }
  /* 進み具合の帯 */
  .fill {
    height: 100%;
    background: #2563eb; /* 青 */
    border-radius: 4px;
    transition: width 0.2s; /* 長さが変わるときに、なめらかにのびる */
  }
  /* 進み具合が分からないときの、左右に動く帯 */
  .fill.moving {
    position: absolute;
    width: 30%;
    animation: slide 1.2s ease-in-out infinite alternate;
  }
  @keyframes slide {
    from {
      left: 0;
    }
    to {
      left: 70%;
    }
  }
  .note {
    margin: 12px 0 0;
    font-size: 13px;
    color: #6b7280; /* うすいグレーの文字 */
    line-height: 1.6;
  }
  .buttons {
    display: flex;
    justify-content: flex-end; /* ボタンは右に寄せる */
    margin-top: 16px;
  }
  .buttons button {
    height: 40px; /* 指で押しやすい高さ */
    padding: 0 20px;
    font-size: 14px;
  }
</style>
