<script>
  import favicon from "#lib/assets/favicon.svg";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

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
