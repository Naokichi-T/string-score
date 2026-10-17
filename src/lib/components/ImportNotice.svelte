<script>
  // ==========================================================
  // ImportNotice.svelte
  // MusicXML を読み込んだときに「知らせること」を、黄色い枠で出す（ステップ8-4c）
  // トップページから goto の state（importWarnings）で渡された一覧を読む
  // ［×］で閉じる。ページを再読み込みすると、state が消えるので出なくなる
  // （ステップ17-1：移調で知らせることにも使えるように、見出しと一覧を親から渡せるようにした）
  // ==========================================================
  import { untrack } from "svelte";
  import { page } from "$app/state";

  // 親から受け取るもの（どちらも省略したら、MusicXML の読み込みの知らせになる）（ステップ17-1）
  //   title … 枠の見出しの文
  //   items … 知らせることの一覧（省略したら、goto の state の importWarnings を読む）
  let { title = "MusicXML の読み込みで、次のことがありました", items = undefined } = $props();

  // 知らせることの一覧（最初に出したときの一覧を写しておく。閉じたら空にする）
  // untrack：「最初の値だけを使う」ことをはっきりさせる（あとで変わっても追いかけない）
  // （出し直すときは、親が {#key} で作り直す）
  let warnings = $state(untrack(() => items ?? page.state.importWarnings ?? []));
</script>

{#if warnings.length > 0}
  <div class="notice">
    <div class="text">
      <p class="title">{title}</p>
      <ul>
        {#each warnings as warning}
          <li>{warning}</li>
        {/each}
      </ul>
    </div>
    <!-- 閉じる（一覧を空にすると、枠ごと消える） -->
    <button class="close" onclick={() => (warnings = [])} title="閉じる">×</button>
  </div>
{/if}

<style>
  .notice {
    display: flex; /* 文と［×］を横に並べる */
    align-items: flex-start;
    gap: 12px;
    padding: 8px 16px;
    background: #fef9c3; /* うすい黄色 */
    border-bottom: 1px solid #facc15; /* 黄色の線 */
    font-size: 13px;
    color: #713f12; /* こげ茶 */
    max-height: 30vh; /* 長いときは画面の3割まで（それ以上はこの中でスクロール） */
    overflow-y: auto;
  }
  .text {
    flex: 1; /* 残りの幅を全部使う（［×］を右端に寄せる） */
  }
  .title {
    margin: 0 0 4px;
    font-weight: bold;
  }
  ul {
    margin: 0;
    padding-left: 20px;
  }
  li {
    margin: 2px 0;
  }
  .close {
    border: none;
    background: none;
    font-size: 18px;
    line-height: 1;
    color: #713f12;
    cursor: pointer;
  }
</style>
