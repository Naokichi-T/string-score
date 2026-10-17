<script>
  import favicon from "#lib/assets/favicon.svg";
  // 指で長押ししたら、ボタンの説明を出す部品（アプリ全体に1つ）（ステップ12-10b）
  import LongPressTip from "#lib/components/LongPressTip.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <!-- ブラウザのタブに出る小さな絵（ファビコン）：青い四角に、弦（縦線4本）と8分音符（ステップ17-1） -->
  <link rel="icon" href={favicon} />
  <!-- iPhone・iPad でホーム画面に追加したときの絵（static/apple-touch-icon.png、180×180）（ステップ17-1） -->
  <!-- 角は iPhone が自分で丸めるので、画像は四角いっぱいに青を塗ってある -->
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
