<script>
  // ==========================================================
  // SelectionInfo.svelte
  // 今選んでいる音の情報を1行で表示する
  // 例：「選択中：Viola　3小節目　2つ目　ラ3・4分音符」
  // ==========================================================
  import { describeSelection } from "#lib/score/selection.js";

  // 親から受け取るもの
  //   score     … 楽譜データ
  //   selection … 選択中の場所（選んでいなければ null）
  let { score, selection } = $props();

  // 表示する文章（score か selection が変わると自動で作り直される）
  let text = $derived(describeSelection(score, selection));
</script>

<div class="selection-info">
  {#if text}
    選択中：{text}
  {:else}
    <span class="hint">音符をクリックすると選べます（← → キーで前後の音へ、Esc で選択を外す）</span>
  {/if}
</div>

<style>
  .selection-info {
    padding: 6px 16px;
    font-size: 14px;
    background: #eff6ff; /* うすい青 */
    border-bottom: 1px solid #ddd;
    min-height: 20px;
  }
  .hint {
    color: #888;
  }
</style>
