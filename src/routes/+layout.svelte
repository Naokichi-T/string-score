<script>
  import favicon from "#lib/assets/favicon.svg";
  // 指で長押ししたら、ボタンの説明を出す部品（アプリ全体に1つ）（ステップ12-10b）
  import LongPressTip from "#lib/components/LongPressTip.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<!-- 長押しの説明の吹き出し（ステップ12-10b） -->
<LongPressTip />

<style>
  /* タブレット（タッチ）向けの、アプリ全体の設定（ステップ12-8a） */
  /* ダブルタップで画面が拡大されないようにする（鍵盤を速く2回押しても、音の入力になる） */
  :global(html) {
    touch-action: manipulation;
  }
  /* ボタン・鍵盤・五線譜を長押ししても、文字の選択やメニューが出ないようにする（文字の入力欄はそのまま） */
  :global(button),
  :global(.score-view),
  :global(.keyboard-area) {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
</style>
