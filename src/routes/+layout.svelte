<script>
  import favicon from "#lib/assets/favicon.svg";
  // 指で長押ししたら、ボタンの説明を出す部品（アプリ全体に1つ）（ステップ12-10b）
  import LongPressTip from "#lib/components/LongPressTip.svelte";

  let { children } = $props();

  // ----------------------------------------------------------
  // LINE・X などにリンクを貼ったときに出るカード（OGP）の中身（ステップ17-2）
  //   SITE_URL    … 公開しているアドレス（画像のアドレスは、http から始まる形で書く決まりのため）
  //   OGP_TITLE   … カードの見出し
  //   DESCRIPTION … カードの説明文（Google の検索結果の説明文にも使う）
  // ----------------------------------------------------------
  const SITE_URL = "https://string-score.vercel.app";
  const OGP_TITLE = "string-score｜弦楽器の楽譜作成";
  const DESCRIPTION = "バイオリン・ビオラ・チェロの楽譜を、ブラウザで作って再生・PDF出力・MusicXML の書き出しができる無料のアプリです。";
</script>

<svelte:head>
  <!-- ブラウザのタブに出る小さな絵（ファビコン）：青い四角に、弦（縦線4本）と8分音符（ステップ17-1） -->
  <link rel="icon" href={favicon} />
  <!-- iPhone・iPad でホーム画面に追加したときの絵（static/apple-touch-icon.png、180×180）（ステップ17-1） -->
  <!-- 角は iPhone が自分で丸めるので、画像は四角いっぱいに青を塗ってある -->
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- ページの説明文（Google の検索結果などで、タイトルの下に出る）（ステップ17-2） -->
  <meta name="description" content={DESCRIPTION} />

  <!-- OGP：リンクを貼ったときのカード（ステップ17-2） -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="string-score" />
  <meta property="og:locale" content="ja_JP" />
  <meta property="og:url" content={SITE_URL + "/"} />
  <meta property="og:title" content={OGP_TITLE} />
  <meta property="og:description" content={DESCRIPTION} />
  <!-- カードの画像（static/ogp.png、1200×630） -->
  <meta property="og:image" content={SITE_URL + "/ogp.png"} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <!-- X（旧 Twitter）で、画像を大きく出すカードにする -->
  <meta name="twitter:card" content="summary_large_image" />

  <!-- Google Search Console の持ち主の確認（「HTML タグ」の方法）（ステップ17-3） -->
  <!-- 消すと確認が外れるので、残しておく -->
  <meta name="google-site-verification" content="QvJLZFa2vKxdL1xZaXeegqlpfeifot30Qql3zlCayJc" />
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
