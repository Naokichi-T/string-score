<script>
  // ==========================================================
  // トップページ（/）
  // 保存した楽譜の一覧（開く・削除・並び順の切り替え）
  // （ステップ7-2：一覧を作った）
  // （ステップ7-3：［＋ 新しい楽譜］で楽器の数を選んで作る）
  // （ステップ8-3：［MusicXML を読み込む］で、ファイルから新しい楽譜を作る）
  // ==========================================================
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { listScores, deleteScore, createScore } from "#lib/score/library.js";
  import { createEmptyScore } from "#lib/score/model.js";
  import NewScoreDialog from "#lib/components/NewScoreDialog.svelte";
  import { readMusicXMLFile, musicXMLToScore, titleFromFileName } from "#lib/score/musicxmlImport.js";

  // 保存した楽譜の一覧 [{ id, title, parts, createdAt, updatedAt }, ...]
  let scores = $state([]);

  // 一覧を読み込み終わったか（読み込む前に「まだ楽譜がありません」が一瞬出ないようにする）
  let loaded = $state(false);

  // 並び順（"updated"：更新日の新しい順、"created"：作った日の新しい順、"title"：タイトル順）
  let sortOrder = $state("updated");

  // 知らせたいこと（削除・作成できなかったときに赤く出す）
  let message = $state("");

  // 新しい楽譜を作る窓を出しているか（ステップ7-3）
  let showNewDialog = $state(false);

  // ファイルを選ぶ欄（画面には出さず、ボタンから開く）（ステップ8-3）
  let fileInput = $state(null);

  // 読み込み中か（読み込み中はボタンを押せなくする）（ステップ8-3）
  let importing = $state(false);

  // ----------------------------------------------------------
  // 関数：handleImport
  // ファイルが選ばれたとき：MusicXML を読み込んで新しい楽譜として保存し、編集ページで開く（ステップ8-3）
  //   event … ファイルを選ぶ欄の change イベント
  // ----------------------------------------------------------
  async function handleImport(event) {
    const file = event.currentTarget.files[0];
    // 同じファイルをもう一度選んでも change が起きるように、欄を空に戻しておく
    event.currentTarget.value = "";
    if (!file) return; // 選ばずに閉じたとき

    message = "";
    importing = true;
    try {
      // ファイル → MusicXML の文字（.mxl なら解凍）
      const text = await readMusicXMLFile(file);
      // MusicXML の文字 → 楽譜データ（タイトルがなければファイルの名前を使う）
      const { score, warnings } = musicXMLToScore(text, titleFromFileName(file.name));

      // 一覧に新しい楽譜として保存する
      const id = createScore(score);
      if (!id) {
        message = "読み込んだ楽譜を保存できませんでした（ブラウザの保存できる量を超えているかもしれません）";
        return;
      }
      // 編集ページで開く（新しく作ったときと違って、「楽譜の設定」タブではなく「音符」タブで始める）
      // state：知らせることを URL に出さずに渡す（編集ページの上に黄色い枠で出る）（ステップ8-4c）
      goto(`/edit?id=${id}`, { state: { importWarnings: warnings } });
    } catch (error) {
      // 読めなかったとき：理由を赤い字で出す
      console.error(error);
      message = `「${file.name}」を読み込めませんでした：${error.message}`;
    } finally {
      // うまくいっても、いかなくても、最後に読み込み中を終える
      importing = false;
    }
  }

  // ----------------------------------------------------------
  // 関数：handleCreate
  // 新しい楽譜の窓で［作成］が押されたとき：空の楽譜を作って保存し、編集ページで開く（ステップ7-3）
  //   instruments … 上から順の楽器の配列（例：["violin", "violin", "viola", "cello"]）
  // ----------------------------------------------------------
  function handleCreate(instruments) {
    showNewDialog = false;
    const id = createScore(createEmptyScore(instruments));
    if (!id) {
      message = "新しい楽譜を保存できませんでした（ブラウザの保存できる量を超えているかもしれません）";
      return;
    }
    // state：URL には出さずに「新しく作った」という印を編集ページに渡す（再読み込みすると消える）
    // 編集ページは、この印があれば「楽譜の設定」タブで始めて、タイトルの入力欄にカーソルを入れる
    goto(`/edit?id=${id}`, { state: { isNew: true } });
  }

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
  <!-- タブと Google の検索結果の見出しに出る（何のアプリか分かるようにする）（ステップ17-3） -->
  <title>string-score｜弦楽器の楽譜作成アプリ</title>
</svelte:head>

<main>
  <h1>string-score</h1>
  <p class="lead">弦楽器のための楽譜作成アプリ</p>

  <!-- 新しい楽譜（押すと、楽器の数を選ぶ窓が出る）と、MusicXML の読み込み -->
  <p class="actions">
    <button
      class="new-button"
      onclick={() => {
        message = "";
        showNewDialog = true;
      }}>＋ 新しい楽譜</button
    >
    <!-- 押すと、下の見えないファイルの欄を開く（ステップ8-3） -->
    <button class="import-button" disabled={importing} onclick={() => fileInput.click()} title="MusicXML のファイル（.musicxml・.xml・.mxl）から、新しい楽譜を作る">
      {importing ? "読み込み中…" : "MusicXML を読み込む"}
    </button>
    <!-- ファイルを選ぶ欄（見た目がそろわないので画面には出さない。accept：選べるファイルの種類） -->
    <input bind:this={fileInput} type="file" accept=".musicxml,.xml,.mxl" onchange={handleImport} hidden />
  </p>

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

  <!-- 簡単な使い方（初めての人と、Google の検索で来た人のため。たたまずに文章で出す）（ステップ17-4） -->
  <!-- ボタンやタブの名前は、画面の文字と同じにしておく（画面の名前を変えたら、ここも直す） -->
  <section class="howto">
    <h2>使い方</h2>
    <ol class="steps">
      <li>
        <span class="step-title">楽譜を作る</span>
        <span class="step-text">［＋ 新しい楽譜］で楽器の数を選びます。「楽譜の設定」タブで、タイトル・作曲者・テンポを入れます。</span>
      </li>
      <li>
        <span class="step-title">音を入れる</span>
        <span class="step-text">「音符」タブで長さを選んで、画面の下の鍵盤を押します。▲▼ で高さを直し、← → で前後の音へ移ります。</span>
      </li>
      <li>
        <span class="step-title">記号を付ける</span>
        <span class="step-text">「記号」「奏法」「小節線」タブで、弓・強弱・pizz.・くり返しなどを付けます。</span>
      </li>
      <li>
        <span class="step-title">聞いてみる</span>
        <span class="step-text">上のバーの［▶ 再生］で鳴らします。パートごとの音量は「再生」タブで変えられます。</span>
      </li>
      <li>
        <span class="step-title">書き出す</span>
        <span class="step-text">［PDF 出力］で印刷用の楽譜に、［MusicXML 書き出し］でほかの楽譜アプリで開けるファイルにします。</span>
      </li>
    </ol>

    <!-- 保存についての注意（楽譜をなくさないように） -->
    <div class="notice">
      <p class="notice-title">⚠ 楽譜はこのブラウザの中に自動で保存されます</p>
      <p>ほかの端末・ほかのブラウザでは見られません。ブラウザのデータを消すと楽譜も消えるので、大事な楽譜は［MusicXML 書き出し］でファイルにしておいてください。</p>
    </div>
  </section>
</main>

<!-- 新しい楽譜を作る窓（showNewDialog が true のときだけ出す） -->
{#if showNewDialog}
  <NewScoreDialog oncreate={handleCreate} oncancel={() => (showNewDialog = false)} />
{/if}

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
    padding: 8px 16px;
    background: #2563eb; /* 青 */
    color: white;
    border: none; /* ボタンのふちの線を消す */
    border-radius: 6px;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer; /* マウスを乗せたら指の形にする */
  }
  .new-button:hover {
    background: #1d4ed8; /* マウスを乗せたら少し濃い青 */
  }
  /* ［＋ 新しい楽譜］と［MusicXML を読み込む］を横に並べる（ステップ8-3） */
  .actions {
    display: flex;
    gap: 8px;
  }
  /* ［MusicXML を読み込む］は、白地に青い枠（［＋ 新しい楽譜］より目立たないように） */
  .import-button {
    padding: 8px 16px;
    background: #fff;
    color: #2563eb;
    border: 1px solid #2563eb;
    border-radius: 6px;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
  }
  .import-button:hover {
    background: #eff6ff; /* マウスを乗せたら、うすい青 */
  }
  .import-button:disabled {
    opacity: 0.5;
    cursor: wait; /* 読み込み中は、待ちの形のマウス */
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

  /* ---------- 使い方（ステップ17-4） ---------- */
  .howto {
    margin-top: 48px; /* 楽譜の一覧と間を空ける */
    padding-top: 8px;
    border-top: 1px solid #ddd;
  }
  /* 番号付きの手順（番号は自分で描くので、ブラウザの番号は出さない） */
  .steps {
    list-style: none;
    padding: 0;
    margin: 0;
    counter-reset: step; /* 番号を数える準備（0 から） */
  }
  .steps li {
    counter-increment: step; /* 行ごとに番号を1つ進める */
    display: flex; /* 番号・見出し・説明を横に並べる */
    align-items: baseline; /* 文字の下の線をそろえる */
    gap: 12px;
    padding: 10px 0;
    line-height: 1.6;
  }
  /* 青い丸の中に番号（1〜5）を出す */
  .steps li::before {
    content: counter(step);
    flex: none; /* 丸が縮まないようにする */
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #2563eb;
    color: #fff;
    font-size: 13px;
    font-weight: bold;
    line-height: 24px; /* 丸の中で番号を縦のまん中に */
    text-align: center;
  }
  .step-title {
    flex: none;
    width: 7.5em; /* 見出しの幅をそろえて、説明の始まりを縦にそろえる */
    font-weight: bold;
  }
  .step-text {
    color: #333;
  }
  /* 保存についての注意（うすい黄色の枠） */
  .notice {
    margin-top: 16px;
    padding: 12px 16px;
    background: #fffbeb;
    border: 1px solid #f59e0b;
    border-radius: 6px;
    font-size: 14px;
    line-height: 1.6;
  }
  .notice p {
    margin: 0;
  }
  /* 「.notice p」の margin: 0 より強くするため、.notice を前に付ける */
  .notice .notice-title {
    font-weight: bold;
    margin-bottom: 4px; /* 見出しと説明の間を少し空ける */
  }
  /* 幅の狭い画面では、見出しを説明の上に出す（見出しの幅で説明が細くならないように） */
  @media (max-width: 600px) {
    .steps li {
      flex-wrap: wrap;
    }
    .step-text {
      flex-basis: 100%;
      padding-left: 36px; /* 番号の丸の分だけ右へ */
    }
  }
</style>
