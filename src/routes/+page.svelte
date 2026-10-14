<script>
  // ==========================================================
  // トップページ（/）
  // 今は編集ページへのリンクだけ（保存した楽譜の一覧はステップ7で作る）
  // ==========================================================
</script>

<svelte:head>
  <title>string-score</title>
</svelte:head>

<main>
  <h1>string-score</h1>
  <p>弦楽器のための楽譜作成アプリ</p>
  <p><a href="/edit">楽譜を編集する</a></p>
</main>

<style>
  main {
    padding: 16px;
    font-family: sans-serif;
  }
</style>
