<script>
  // ==========================================================
  // NewScoreDialog.svelte
  // 新しい楽譜を作る窓（トップページの上に重ねて出す）
  // バイオリン・ビオラ・チェロの数を選んで［作成］を押す
  // （ステップ7-3）
  // ==========================================================
  import { INSTRUMENTS, renameParts } from "#lib/score/model.js";

  // 親から受け取るもの
  //   oncreate … ［作成］が押されたときに呼ぶ関数（上から順の楽器の配列を渡す。例：["violin", "violin", "viola", "cello"]）
  //   oncancel … ［キャンセル］・Esc キー・窓の外のクリックのときに呼ぶ関数
  let { oncreate = () => {}, oncancel = () => {} } = $props();

  // 1つの楽器の数の上限
  const MAX_COUNT = 4;

  // 並べる楽器の順（楽譜の上から、この順に並ぶ）
  const ORDER = ["violin", "viola", "cello"];

  // 楽器ごとの数（最初は弦楽四重奏）
  let counts = $state({ violin: 2, viola: 1, cello: 1 });

  // 上から順の楽器の配列（例：["violin", "violin", "viola", "cello"]）
  let instruments = $derived(ORDER.flatMap((instrument) => Array(counts[instrument]).fill(instrument)));

  // できあがるパート名の一覧（数を変えるとすぐ変わる）
  let partNames = $derived.by(() => {
    // 名前を付けるためだけの、仮のパートの配列を作る
    const parts = instruments.map((instrument) => ({ instrument: instrument, name: "", abbreviation: "" }));
    renameParts(parts);
    return parts.map((part) => part.name);
  });

  // ----------------------------------------------------------
  // 関数：changeCount
  // 楽器の数を1つ増やす・減らす（0〜MAX_COUNT の間だけ）
  //   instrument … 楽器（"violin"・"viola"・"cello"）
  //   delta      … 1（増やす）か -1（減らす）
  // ----------------------------------------------------------
  function changeCount(instrument, delta) {
    const next = counts[instrument] + delta;
    if (next < 0 || next > MAX_COUNT) return;
    counts[instrument] = next;
  }

  // ----------------------------------------------------------
  // 関数：handleCreate
  // ［作成］が押されたとき：楽器の配列を親に渡す（パートが0のときは何もしない）
  // ----------------------------------------------------------
  function handleCreate() {
    if (instruments.length === 0) return;
    oncreate(instruments);
  }

  // ----------------------------------------------------------
  // 関数：handleKeydown
  // Esc キーで閉じる
  // ----------------------------------------------------------
  function handleKeydown(event) {
    if (event.key === "Escape") oncancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- 窓のうしろの、うすく暗くする幕（押すと閉じる） -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => oncancel()}>
  <!-- 窓の中を押したときは閉じないように、クリックが幕まで伝わるのを止める（stopPropagation） -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(event) => event.stopPropagation()}>
    <h2>新しい楽譜</h2>
    <p class="hint">楽器の数を選んでください（あとから「パート」タブでも追加・削除できます）</p>

    <!-- 楽器ごとの数 -->
    <div class="counters">
      {#each ORDER as instrument}
        <div class="row">
          <span class="label">{INSTRUMENTS[instrument].label}</span>
          <button disabled={counts[instrument] <= 0} onclick={() => changeCount(instrument, -1)} title="減らす">−</button>
          <span class="count">{counts[instrument]}</span>
          <button disabled={counts[instrument] >= MAX_COUNT} onclick={() => changeCount(instrument, 1)} title="増やす">＋</button>
        </div>
      {/each}
    </div>

    <!-- できあがるパート名 -->
    <p class="parts">
      {#if partNames.length === 0}
        <span class="warning">楽器を1つ以上選んでください</span>
      {:else}
        パート：{partNames.join("・")}
      {/if}
    </p>

    <!-- キャンセル・作成 -->
    <div class="buttons">
      <button onclick={() => oncancel()}>キャンセル</button>
      <button class="create" disabled={instruments.length === 0} onclick={handleCreate}>作成</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; /* 画面に貼り付ける（スクロールしても動かない） */
    inset: 0; /* 上下左右いっぱいに広げる */
    background: rgba(0, 0, 0, 0.4); /* うすい黒（うしろの一覧が透けて見える） */
    display: flex; /* 窓を画面のまん中に置く */
    align-items: center;
    justify-content: center;
  }
  .dialog {
    background: white;
    border-radius: 8px;
    padding: 20px 24px;
    width: 420px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); /* 窓の影 */
  }
  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  .hint {
    margin: 0 0 16px;
    font-size: 13px;
    color: #6b7280;
  }
  .counters {
    display: flex;
    flex-direction: column; /* 楽器を縦に並べる */
    gap: 8px;
  }
  .row {
    display: flex; /* 楽器名・［−］・数・［＋］を横に並べる */
    align-items: center;
    gap: 8px;
  }
  .label {
    width: 90px; /* 楽器名の幅をそろえて、ボタンの縦の位置を合わせる */
  }
  .count {
    width: 24px;
    text-align: center;
    font-weight: bold;
    font-variant-numeric: tabular-nums;
  }
  .row button {
    width: 32px;
    height: 32px;
    font-size: 16px;
    /* ＋ − をボタンのまん中に置く（iPad の Safari で右に寄るのを直した）
       ブラウザがボタンに最初から付ける内側の余白（padding）は、ブラウザごとに大きさが違う
       Safari は余白が大きいので、32px の幅から余白を引いた残りが ＋ の幅（16px）より狭くなり、
       入りきらない分が右へはみ出して、右に寄って見えていた
       → 余白を 0 にして、ボタンの中で上下左右のまん中にそろえる */
    padding: 0;
    display: inline-flex;
    align-items: center; /* 上下のまん中 */
    justify-content: center; /* 左右のまん中 */
    line-height: 1; /* 文字の行の高さで上下がずれないようにする */
  }
  .parts {
    margin: 16px 0;
    font-size: 14px;
    color: #333;
  }
  .warning {
    color: #dc2626; /* 赤 */
  }
  .buttons {
    display: flex;
    justify-content: flex-end; /* ボタンを右に寄せる */
    gap: 8px;
  }
  .buttons button {
    padding: 6px 16px;
    font-size: 14px;
  }
  .create {
    background: #2563eb; /* 青 */
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: bold;
  }
  .create:disabled {
    background: #9ca3af; /* 押せないときはグレー */
  }
</style>
