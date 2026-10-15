<script>
  // ==========================================================
  // トップページ（/）
  // 保存した楽譜の一覧（開く・削除・並び順の切り替え）
  // （ステップ7-2：一覧を作った。新しい楽譜を作る画面はステップ7-3で）
  // ==========================================================
  import { onMount } from "svelte";
  import { listScores, deleteScore } from "#lib/score/library.js";

  // 保存した楽譜の一覧 [{ id, title, parts, createdAt, updatedAt }, ...]
  let scores = $state([]);

  // 一覧を読み込み終わったか（読み込む前に「まだ楽譜がありません」が一瞬出ないようにする）
  let loaded = $state(false);

  // 並び順（"updated"：更新日の新しい順、"created"：作った日の新しい順、"title"：タイトル順）
  let sortOrder = $state("updated");

  // 知らせたいこと（削除できなかったときに赤く出す）
  let message = $state("");

  // 並び替えた一覧（scores か sortOrder が変わると、自動で作り直される）
  let sortedScores = $derived(sortScores(scores, sortOrder));

  // ----------------------------------------------------------
  // ページが開いたら、ブラウザの中から一覧を読み込む
  // （localStorage はブラウザにしかないので、onMount の中で読む）
  // ----------------------------------------------------------
  onMount(() => {
    scores = listScores();
    loaded = true;
  });

  // ----------------------------------------------------------
  // 関数：sortScores
  // 一覧を並び替えた、新しい配列を返す（元の配列は変えない）
  //   list  … 楽譜の一覧
  //   order … 並び順（"updated"・"created"・"title"）
  // ----------------------------------------------------------
  function sortScores(list, order) {
    const copy = [...list]; // sort は配列そのものを変えてしまうので、コピーしてから並べる
    if (order === "created") {
      // 作った日の新しい順（大きい数字＝新しい日時が先）
      copy.sort((a, b) => b.createdAt - a.createdAt);
    } else if (order === "title") {
      // タイトル順（日本語の順。numeric：「2」が「10」より先に来るように数字の大きさで比べる）
      // タイトルが同じなら、更新日の新しい順
      copy.sort((a, b) => a.title.localeCompare(b.title, "ja", { numeric: true }) || b.updatedAt - a.updatedAt);
    } else {
      // 更新日の新しい順
      copy.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return copy;
  }

  // ----------------------------------------------------------
  // 関数：formatDate
  // 日時の数字を「2026/10/15 09:05」の形の文字にする
  // ----------------------------------------------------------
  function formatDate(time) {
    const date = new Date(time);
    // padStart(2, "0")：1けたのときは前に 0 を付けて2けたにする（9 → "09"）
    const two = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${two(date.getHours())}:${two(date.getMinutes())}`;
  }

  // ----------------------------------------------------------
  // 関数：handleDelete
  // ［削除］が押されたとき：確認してから楽譜を消し、一覧を読み込み直す
  //   item … 一覧の1行分 { id, title, ... }
  // ----------------------------------------------------------
  function handleDelete(item) {
    message = "";
    // confirm：ブラウザの確認の窓を出す（OK なら true、キャンセルなら false）
    const ok = confirm(`「${item.title}」を削除しますか？\n削除すると元に戻せません。`);
    if (!ok) return;

    if (!deleteScore(item.id)) {
      message = "削除できませんでした";
    }
    // 一覧を読み込み直す（消えたものが一覧からなくなる）
    scores = listScores();
  }

  // ----------------------------------------------------------
  // 関数：handleSortChange
  // 並び順の欄が変わったとき
  // ----------------------------------------------------------
  function handleSortChange(event) {
    sortOrder = event.target.value;
  }
</script>

<svelte:head>
  <title>string-score</title>
</svelte:head>

<main>
  <h1>string-score</h1>
  <p class="lead">弦楽器のための楽譜作成アプリ</p>

  <!-- 新しい楽譜（今は空の弦楽四重奏を作る仮のリンク。ステップ7-3で編成を選べるようにする） -->
  <p><a class="new-button" href="/edit">＋ 新しい楽譜</a></p>

  <div class="list-header">
    <h2>保存した楽譜</h2>
    <!-- 並び順（value は今のデータに合わせ、変えるのは handleSortChange で） -->
    <select value={sortOrder} onchange={handleSortChange} title="並び順">
      <option value="updated">更新日の新しい順</option>
      <option value="created">作った日の新しい順</option>
      <option value="title">タイトル順</option>
    </select>
  </div>

  {#if message}
    <p class="message">{message}</p>
  {/if}

  {#if !loaded}
    <!-- 読み込み中（すぐ終わるので、ほとんど見えない） -->
  {:else if sortedScores.length === 0}
    <p class="empty">まだ楽譜がありません。「＋ 新しい楽譜」から作ってください。</p>
  {:else}
    <ul class="score-list">
      {#each sortedScores as item (item.id)}
        <li>
          <!-- タイトル（押すと編集ページで開く） -->
          <a class="title" href={`/edit?id=${item.id}`}>{item.title}</a>
          <!-- 編成（短いパート名を「・」でつなぐ。古いデータで編成がないときは何も出さない） -->
          <span class="parts">{(item.parts ?? []).join("・")}</span>
          <!-- 更新日時 -->
          <span class="date">{formatDate(item.updatedAt)}</span>
          <button onclick={() => handleDelete(item)}>削除</button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  main {
    max-width: 800px; /* 広い画面でも横に伸びすぎないようにする */
    margin: 0 auto; /* まん中に寄せる */
    padding: 16px;
    font-family: sans-serif;
  }
  .lead {
    color: #555;
  }
  .new-button {
    display: inline-block;
    padding: 8px 16px;
    background: #2563eb; /* 青 */
    color: white;
    border-radius: 6px;
    text-decoration: none;
    font-weight: bold;
  }
  .new-button:hover {
    background: #1d4ed8; /* マウスを乗せたら少し濃い青 */
  }
  .list-header {
    display: flex; /* 見出しと並び順を横に並べる */
    align-items: center;
    justify-content: space-between; /* 見出しは左、並び順は右 */
    margin-top: 24px;
  }
  h2 {
    font-size: 18px;
  }
  select {
    font-size: 14px;
    padding: 3px 4px;
  }
  .message {
    color: #dc2626; /* 赤 */
  }
  .empty {
    color: #6b7280; /* うすいグレー */
  }
  .score-list {
    list-style: none; /* 行の頭の点を出さない */
    padding: 0;
    margin: 0;
    border-top: 1px solid #ddd;
  }
  .score-list li {
    display: flex; /* 1行の中を横に並べる */
    align-items: center;
    gap: 16px;
    padding: 10px 4px;
    border-bottom: 1px solid #ddd;
  }
  .score-list li:hover {
    background: #f3f4f6; /* マウスを乗せた行をうすいグレーに */
  }
  .title {
    flex: 1; /* 残りの幅を全部使う（編成・日時・削除を右に寄せる） */
    color: #111;
    font-weight: bold;
    text-decoration: none;
  }
  .title:hover {
    text-decoration: underline;
  }
  .parts {
    font-size: 13px;
    color: #555;
  }
  .date {
    font-size: 13px;
    color: #6b7280;
    font-variant-numeric: tabular-nums; /* 数字の幅をそろえて、日時の縦の位置を合わせる */
  }
  button {
    padding: 4px 10px;
    font-size: 13px;
  }
</style>
