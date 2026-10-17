<script>
  // ==========================================================
  // help/+page.svelte
  // Q&A（よくある質問）のページ（/help）（ステップ17-5）
  //
  // 【画面の作り】
  //   上：トップページへ戻るリンク・見出し・検索の欄・グループへ飛ぶリンク
  //   下：グループごとに質問を並べる。質問を押すと答えが開く
  //
  // 【検索】
  //   打つたびに、言葉が全部入っている質問だけに絞る（探し方は lib/help/search.js）
  //   検索している間は、見つかった質問の答えを全部開いて、言葉に色を付ける
  //
  // 【質問と答えのデータ】
  //   lib/help/faq.js（質問を足すときは、そのファイルだけ直せばよい）
  // ==========================================================
  import { onMount } from "svelte";
  import { FAQ_GROUPS } from "#lib/help/faq.js";
  import { splitWords, matchesAll, highlightParts } from "#lib/help/search.js";

  // 検索の欄に打った文字
  let query = $state("");

  // 打った文字を、スペースで区切った言葉の並びにしたもの（探しやすい形にそろえてある）
  let words = $derived(splitWords(query));

  // 検索しているか（言葉が1つ以上あるか）
  let searching = $derived(words.length > 0);

  // 開いている質問の一覧（質問の id → true）。検索していないときに使う
  let opened = $state({});

  // 言葉が全部入っている質問だけを残したグループの並び（質問が0になったグループは出さない）
  let shownGroups = $derived(FAQ_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => matchesAll(item, words)) })).filter((group) => group.items.length > 0));

  // 見つかった質問の数
  let hitCount = $derived(shownGroups.reduce((sum, group) => sum + group.items.length, 0));

  // ----------------------------------------------------------
  // 関数：isOpen
  // 質問の答えを開いて出すか決める
  // 検索している間は全部開く。していないときは、押して開いたものだけ
  //   id … 質問の id
  // ----------------------------------------------------------
  function isOpen(id) {
    return searching || !!opened[id];
  }

  // ----------------------------------------------------------
  // 関数：toggle
  // 質問が押されたときに、答えを開く・閉じる
  // （検索している間は全部開いているので、何もしない）
  //   id … 質問の id
  // ----------------------------------------------------------
  function toggle(id) {
    if (searching) return;
    opened = { ...opened, [id]: !opened[id] };
  }

  // ----------------------------------------------------------
  // 関数：clearQuery
  // 検索の欄を空にする（［×］が押されたとき）
  // ----------------------------------------------------------
  function clearQuery() {
    query = "";
  }

  // ページを開いたとき、アドレスの # のあとに質問の名前があれば（例：/help#q-pdf）、その質問を開く
  // （ほかのページや人に、1つの質問を教えるときに使える）
  onMount(() => {
    const hash = decodeURIComponent(location.hash.replace("#", ""));
    if (!hash.startsWith("q-")) return;
    const id = hash.slice(2);
    const exists = FAQ_GROUPS.some((group) => group.items.some((item) => item.id === id));
    if (!exists) return;
    opened = { ...opened, [id]: true };
    // 開いたあとの位置へ動かす（開く前に動かすと、ずれるため少し待つ）
    setTimeout(() => document.getElementById(hash)?.scrollIntoView(), 0);
  });
</script>

<svelte:head>
  <!-- タブと Google の検索結果の見出しに出る -->
  <title>Q&A（よくある質問）｜string-score</title>
</svelte:head>

<!-- 文字に色を付けて出す部品（色を付ける所は <mark> で囲む） -->
{#snippet highlighted(text)}
  {#each highlightParts(text, words) as part, index (index)}
    {#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}
  {/each}
{/snippet}

<main>
  <p class="back"><a href="/">← トップページへ</a></p>
  <h1>Q&A（よくある質問）</h1>
  <p class="lead">string-score の使い方や、困ったときの答えをまとめています。言葉で探すこともできます。</p>

  <!-- 検索の欄（打つたびに絞り込む） -->
  <div class="search">
    <input type="search" bind:value={query} placeholder="言葉で探す（例：タイ、PDF、ぴちかーと）" aria-label="質問を言葉で探す" />
    {#if query !== ""}
      <button class="clear" onclick={clearQuery} title="検索の言葉を消す" aria-label="検索の言葉を消す">×</button>
    {/if}
  </div>

  {#if searching}
    <!-- 見つかった数 -->
    <p class="count">{hitCount}件 見つかりました</p>
  {:else}
    <!-- グループへ飛ぶリンク（検索していないときだけ） -->
    <nav class="group-links">
      {#each FAQ_GROUPS as group (group.id)}
        <a href={`#group-${group.id}`}>{group.title}</a>
      {/each}
    </nav>
  {/if}

  {#if hitCount === 0}
    <p class="empty">見つかりませんでした。別の言葉や、短い言葉で探してみてください。</p>
  {/if}

  <!-- グループごとの質問 -->
  {#each shownGroups as group (group.id)}
    <section class="group" id={`group-${group.id}`}>
      <h2>{group.title}</h2>
      <ul class="items">
        {#each group.items as item (item.id)}
          <li id={`q-${item.id}`}>
            <!-- 質問（押すと答えが開く・閉じる） -->
            <button class="question" class:open={isOpen(item.id)} aria-expanded={isOpen(item.id)} onclick={() => toggle(item.id)}>
              <span class="q-mark">Q</span>
              <span class="q-text">{@render highlighted(item.q)}</span>
              <!-- 開いているかの印（検索中は全部開いているので出さない） -->
              {#if !searching}
                <span class="arrow">{isOpen(item.id) ? "−" : "＋"}</span>
              {/if}
            </button>
            <!-- 答え（1つの段落ずつ） -->
            <!-- 閉じているときも消さずに隠すだけにする（Google が答えの文も読めるように） -->
            <div class="answer" hidden={!isOpen(item.id)}>
              {#each item.a as paragraph, index (index)}
                <p>{@render highlighted(paragraph)}</p>
              {/each}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  <p class="back bottom"><a href="/">← トップページへ</a></p>
</main>

<style>
  main {
    max-width: 800px; /* 広い画面でも横に伸びすぎないようにする（トップページと同じ） */
    margin: 0 auto;
    padding: 16px;
    font-family: sans-serif;
  }
  .back a {
    color: #2563eb;
    text-decoration: none;
    font-size: 14px;
  }
  .back a:hover {
    text-decoration: underline;
  }
  .back.bottom {
    margin-top: 40px;
  }
  .lead {
    color: #555;
  }

  /* ---------- 検索の欄 ---------- */
  .search {
    position: relative; /* ［×］を欄の右はしに重ねるため */
    margin: 20px 0 8px;
  }
  .search input {
    width: 100%;
    box-sizing: border-box; /* 枠の太さも含めて幅 100% にする（はみ出さないように） */
    padding: 10px 40px 10px 12px; /* 右は［×］の分を空ける */
    font-size: 16px; /* 16px 未満だと、iPhone で欄を押したときに画面が拡大されるため */
    border: 1px solid #ccc;
    border-radius: 6px;
  }
  .search input:focus {
    outline: 2px solid #2563eb;
    border-color: #2563eb;
  }
  /* ブラウザが付ける検索の欄の×を消す（自分の［×］と2つ出ないように） */
  .search input::-webkit-search-cancel-button {
    -webkit-appearance: none;
  }
  .clear {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%); /* 縦のまん中に */
    width: 30px;
    height: 30px;
    border: none;
    background: none;
    font-size: 20px;
    color: #6b7280;
    cursor: pointer;
  }
  .count {
    font-size: 14px;
    color: #555;
  }
  .empty {
    color: #6b7280;
  }

  /* ---------- グループへ飛ぶリンク ---------- */
  .group-links {
    display: flex;
    flex-wrap: wrap; /* 入りきらなければ次の行へ */
    gap: 8px;
    margin: 12px 0 8px;
  }
  .group-links a {
    padding: 4px 12px;
    border: 1px solid #2563eb;
    border-radius: 999px; /* 丸い角 */
    color: #2563eb;
    font-size: 13px;
    text-decoration: none;
  }
  .group-links a:hover {
    background: #eff6ff;
  }

  /* ---------- 質問と答え ---------- */
  .group {
    margin-top: 28px;
    scroll-margin-top: 12px; /* リンクで飛んだとき、見出しが画面の上にくっつかないように */
  }
  h2 {
    font-size: 18px;
    padding-bottom: 6px;
    border-bottom: 2px solid #2563eb;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .items li {
    border-bottom: 1px solid #ddd;
    scroll-margin-top: 12px;
  }
  .question {
    display: flex; /* Q・質問の文・＋ を横に並べる */
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 12px 4px;
    border: none;
    background: none;
    text-align: left; /* ボタンの文字は、ふつうまん中に寄るので左に */
    font-size: 15px;
    font-weight: bold;
    color: #111;
    line-height: 1.5;
    cursor: pointer;
  }
  .question:hover {
    background: #f3f4f6;
  }
  .q-mark {
    flex: none;
    color: #2563eb;
  }
  .q-text {
    flex: 1; /* 残りの幅を全部使って、＋ を右はしに寄せる */
  }
  .arrow {
    flex: none;
    color: #6b7280;
    font-weight: normal;
  }
  .answer {
    padding: 0 4px 12px 30px; /* 左は Q の印の分だけ空ける */
    font-size: 14px;
    line-height: 1.7;
    color: #333;
  }
  .answer p {
    margin: 0 0 6px;
  }
  /* 検索の言葉に付ける色 */
  mark {
    background: #fde68a; /* うすい黄色 */
    color: inherit;
    border-radius: 2px;
  }
</style>
