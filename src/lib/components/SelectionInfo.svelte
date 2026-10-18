<script>
  // ==========================================================
  // SelectionInfo.svelte
  // 今選んでいる音の情報を1行で表示する
  // 例：「選択中：Viola　3小節目　2つ目　ラ3・4分音符」
  // 範囲を選んでいるときは、範囲を表示する
  // 例：「範囲：Violin I　1小節目 2つ目 〜 2小節目 3つ目（6つ）」
  // ==========================================================
  import { describeSelection, describeRange } from "#lib/score/selection.js";

  // 親から受け取るもの
  //   score     … 楽譜データ
  //   selection … 選択中の場所（選んでいなければ null）
  //   range     … 範囲選択（範囲を選んでいなければ null）
  //   message   … 知らせたいこと（「小節に入りきりません」など。なければ空の文字）
  //   info      … message が案内の文（まちがいではない知らせ）なら true。青い字で出す（後で直す候補の手直し）
  //   onmove    … ［◀ 前の音］［次の音 ▶］が押されたときに呼ぶ関数（-1 か 1 を渡す）（ステップ12-10a）
  let { score, selection, range = null, message = "", info = false, onmove = () => {} } = $props();

  // 表示する文章（score か selection が変わると自動で作り直される）
  let text = $derived(describeSelection(score, selection));

  // 範囲の文章（範囲を選んでいなければ空の文字）
  let rangeText = $derived(describeRange(score, range));
</script>

<div class="selection-info">
  <!-- 左側：選んでいる音・範囲の説明と、知らせたいこと（ステップ12-10a：span で囲んで、右にボタンを置けるようにした） -->
  <span class="text">
    {#if rangeText}
      範囲：{rangeText}
    {:else if text}
      選択中：{text}
    {:else}
      <span class="hint">音符をクリックすると選べます（← → キーで前後の音へ、Shift＋クリックか Shift＋← → で範囲を選ぶ、⌥（Alt）＋↑↓ で重音の中の音を選ぶ、Esc で選択を外す）</span>
    {/if}
    <!-- 知らせたいことがあれば、右側に出す（まちがいは赤い字、案内は青い字）（後で直す候補の手直し：案内の色を分けた） -->
    {#if message}
      <span class="message" class:info>{message}</span>
    {/if}
  </span>

  <!-- 右端：前後の音へ移るボタン（音を選んでいるときだけ押せる）（ステップ12-10a） -->
  <span class="move">
    <button disabled={!selection} onclick={() => onmove(-1)} title="前の音へ（← キーと同じ。［範囲］が入っているときは、範囲の端を前へ）">◀ 前の音</button>
    <button disabled={!selection} onclick={() => onmove(1)} title="次の音へ（→ キーと同じ。［範囲］が入っているときは、範囲の端を次へ）">次の音 ▶</button>
  </span>
</div>

<style>
  .selection-info {
    display: flex; /* 左に説明、右端にボタン（ステップ12-10a） */
    align-items: center;
    gap: 12px;
    padding: 4px 16px;
    font-size: 14px;
    background: #eff6ff; /* うすい青 */
    border-bottom: 1px solid #ddd;
    min-height: 20px;
  }
  .hint {
    color: #888;
  }
  /* 説明の部分は、残りの幅を全部使う（ボタンを右端に寄せる）（ステップ12-10a） */
  .text {
    flex: 1;
  }
  /* 前後の音へ移るボタン（ステップ12-10a） */
  .move {
    display: flex;
    gap: 4px;
    flex-shrink: 0; /* 狭いときもボタンは縮めない */
  }
  .move button {
    height: 36px;
    padding: 0 12px;
    font-size: 14px;
    white-space: nowrap;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .move button:disabled {
    opacity: 0.35; /* 押せないときはうすく */
    cursor: not-allowed;
  }
  .message {
    margin-left: 24px;
    color: #dc2626; /* 赤（まちがいの知らせ） */
  }
  /* 案内の文（まちがいではない知らせ）は青（後で直す候補の手直し） */
  .message.info {
    color: #1d4ed8; /* 濃い青（うすい青の帯の上でも読みやすい色） */
  }
</style>
