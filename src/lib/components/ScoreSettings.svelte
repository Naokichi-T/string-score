<script>
  // ==========================================================
  // ScoreSettings.svelte
  // 「楽譜の設定」タブの中身（タイトル・作曲者・速度記号・テンポ）
  // 入力欄を書き換えて、Enter を押すか、ほかの所をクリックすると確定する
  // （ステップ5-1で追加）
  // 速度記号の候補は、打った文字で「始まる」ものだけを出す（大文字・小文字は区別しない）
  // （ブラウザの datalist は「含む」ものを出すので、候補の一覧は自分で作っている）
  // （ステップ17-1：楽譜全体の移調の欄を追加）
  // （ステップ20：「小節の長さ」の欄（アウフタクト・最後の小節）を追加。アウフタクトは「小節」タブから移した）
  // （小節の長さの自動判断：「小節の長さ」の欄を消した。どの小節の長さも「小節」タブの「長さ」の欄で変える）
  // （X枚に収める b：「PDF を何枚に収めるか」の欄を追加。選んだ枚数は楽譜ごとに覚える（保存は親がする））
  // ==========================================================
  import { tick, onMount } from "svelte";
  import { keyAt, KEY_CHOICES } from "#lib/score/model.js"; // 1小節目の調・調の一覧（ステップ17-1）
  import { transposeInterval, intervalName } from "#lib/score/transpose.js"; // 動かす量と音程の名前（ステップ17-1）

  // 親から受け取るもの
  //   score      … 楽譜データ（入力欄に今の値を出すのに使う）
  //   onsettings … 確定したときに呼ぶ関数（項目の名前と、入力された文字を渡す）
  //                例：onsettings("title", "春の歌")、onsettings("tempo", "120")
  //   focusTitle … true なら、出てきたときにタイトルの入力欄にカーソルを入れて、文字を全部選ぶ（ステップ7-3）
  //   ontranspose … ［移調する］が押されたときに呼ぶ関数（行き先の調と向きを渡す）（ステップ17-1）
  //                 例：ontranspose(4, "nearest")
  //   （小節の長さの自動判断：pickup・onpickup・shortEnd・onshortend は、「小節の長さ」の欄といっしょに消した）
  //   pdfPages   … PDF を何枚に収めるか（指定なしは null）（X枚に収める b）
  //   onpdfpages … 枚数を選んだときに呼ぶ関数（枚数か、指定なしなら null を渡す）（X枚に収める b）
  //                例：onpdfpages(2)、onpdfpages(null)
  let { score, onsettings = () => {}, focusTitle = false, ontranspose = () => {}, pdfPages = null, onpdfpages = () => {} } = $props();

  // 「PDF を何枚に収めるか」の欄で選べる枚数（1〜10枚）（X枚に収める b）
  const FIT_PAGE_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // ----------------------------------------------------------
  // 関数：handlePdfPages
  // 「PDF を何枚に収めるか」の欄で選んだとき：枚数（指定なしなら null）を親に渡す（X枚に収める b）
  //   event … 選ぶ欄のイベント（選んだ値は event.currentTarget.value。指定なしは空の文字）
  // ----------------------------------------------------------
  function handlePdfPages(event) {
    const value = event.currentTarget.value;
    onpdfpages(value === "" ? null : Number(value));
  }

  // ----------------------------------------------------------
  // ここから下は、移調の欄（ステップ17-1）
  // ----------------------------------------------------------

  // 向きの選びかた
  //   value … ontranspose に渡す名前
  //   name  … 選ぶ欄に出す名前
  const DIRECTIONS = [
    { value: "nearest", name: "近いほう" },
    { value: "up", name: "上へ" },
    { value: "down", name: "下へ" },
  ];

  // 今の調（1小節目の調）
  let currentKey = $derived(keyAt(score, 0));

  // 今の調の名前（例："♯2つ（ニ長調・ロ短調）"）
  let currentKeyName = $derived(KEY_CHOICES.find((item) => item.key === currentKey)?.name ?? "");

  // 行き先に選んでいる調（最初は今の調）
  let targetKey = $state(0);

  // 選んでいる向き（最初は「近いほう」）
  let direction = $state("nearest");

  // 今の調が変わったら（移調した・元に戻したなど）、行き先の欄も今の調に合わせる
  // （移調したあとに、同じボタンをもう一度押して2回動かしてしまわないように）
  $effect(() => {
    targetKey = currentKey;
  });

  // 動かす量と、その音程の名前（例："長2度上（半音2個上）"。同じ調なら空の文字）
  let intervalText = $derived(intervalName(transposeInterval(currentKey, targetKey, direction)));

  // タイトルの入力欄（bind:this で入力欄そのものが入る）
  let titleInput;

  // ----------------------------------------------------------
  // 出てきたときに、タイトルの入力欄にカーソルを入れて「無題」を全部選ぶ
  // （全部選んでおくと、そのまま打てば「無題」と入れ替わる）
  // ----------------------------------------------------------
  onMount(() => {
    if (focusTitle) {
      titleInput.focus(); // カーソルを入れる
      titleInput.select(); // 文字を全部選ぶ
    }
  });

  // 速度記号の候補（打ち始めると、この中から選べる。ここにない言葉も自由に書ける）
  const TEMPO_WORDS = ["Largo", "Lento", "Adagio", "Andante", "Andantino", "Moderato", "Allegretto", "Allegro", "Vivace", "Presto"];

  // 速度記号の入力欄に今打たれている文字（候補をしぼるのに使う）
  let tempoQuery = $state("");

  // 候補の一覧を出しているか
  let showSuggestions = $state(false);

  // ↑↓ キーで選んでいる候補の番号（-1 は何も選んでいない）
  let activeIndex = $state(-1);

  // 出す候補：打った文字で始まるもの（大文字・小文字は区別しない）。何も打っていなければ全部
  let suggestions = $derived(TEMPO_WORDS.filter((word) => word.toLowerCase().startsWith(tempoQuery.trim().toLowerCase())));

  // ----------------------------------------------------------
  // 関数：handleChange
  // 入力欄の値が確定したとき（Enter・ほかの所をクリック）
  //   field … 項目の名前（"title"・"composer"・"tempoText"・"tempo"）
  //   event … 入力欄のイベント（入力された文字は event.target.value）
  // ----------------------------------------------------------
  async function handleChange(field, event) {
    const input = event.target;
    onsettings(field, input.value);
    // 親が楽譜データを更新し終わるのを待ってから、入力欄を楽譜データの値に合わせる
    // （テンポが範囲の外で受け付けられなかったときや、タイトルを空にして「無題」に戻ったときのため）
    await tick();
    input.value = String(score[field] ?? "");
  }

  // ----------------------------------------------------------
  // 関数：isComposing
  // 日本語入力の変換中に押されたキーかどうかを調べる
  // （変換を確定するための Enter を、入力欄の確定と取り違えないようにするため）
  //   event.isComposing … 変換中なら true
  //   event.keyCode 229 … 変換中のキーに付く番号（Safari では isComposing が false になることがあるので、こちらも見る）
  // ----------------------------------------------------------
  function isComposing(event) {
    return event.isComposing || event.keyCode === 229;
  }

  // ----------------------------------------------------------
  // 関数：handleKeydown
  // 入力欄で Enter が押されたら、入力欄から離れて確定する
  // （日本語入力の変換を確定する Enter は、何もしない）
  // ----------------------------------------------------------
  function handleKeydown(event) {
    if (isComposing(event)) return;
    if (event.key === "Enter") event.target.blur();
  }

  // ----------------------------------------------------------
  // 関数：openSuggestions
  // 速度記号の入力欄を押したとき・文字を打ったとき：候補の一覧を出す
  // ----------------------------------------------------------
  function openSuggestions(event) {
    tempoQuery = event.target.value;
    showSuggestions = true;
    activeIndex = -1;
  }

  // ----------------------------------------------------------
  // 関数：closeSuggestions
  // 速度記号の入力欄から離れたとき：候補の一覧を閉じる
  // ----------------------------------------------------------
  function closeSuggestions() {
    showSuggestions = false;
    activeIndex = -1;
  }

  // ----------------------------------------------------------
  // 関数：pickSuggestion
  // 候補を選んだとき：入力欄に入れて確定し、入力欄から離れる
  //   input … 速度記号の入力欄
  //   word  … 選んだ候補
  // ----------------------------------------------------------
  function pickSuggestion(input, word) {
    input.value = word;
    closeSuggestions();
    handleChange("tempoText", { target: input });
    input.blur();
  }

  // ----------------------------------------------------------
  // 関数：handleTempoTextKeydown
  // 速度記号の入力欄でキーが押されたとき
  //   ↓ ↑   … 候補を選ぶ
  //   Enter … 選んでいる候補があればそれに決める（なければ打った文字で確定）
  //   Esc   … 候補の一覧を閉じる
  // ----------------------------------------------------------
  function handleTempoTextKeydown(event) {
    // 日本語入力の変換中に押されたキーは、何もしない（変換の確定の Enter などを取り違えないため）
    if (isComposing(event)) return;
    const input = event.target;
    if (event.key === "ArrowDown" && showSuggestions && suggestions.length > 0) {
      activeIndex = (activeIndex + 1) % suggestions.length; // 最後の次は最初に戻る
      event.preventDefault();
    } else if (event.key === "ArrowUp" && showSuggestions && suggestions.length > 0) {
      activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
      event.preventDefault();
    } else if (event.key === "Enter") {
      if (showSuggestions && activeIndex >= 0) {
        pickSuggestion(input, suggestions[activeIndex]);
      } else {
        input.blur(); // 打った文字のまま確定
      }
    } else if (event.key === "Escape") {
      closeSuggestions();
    }
  }
</script>

<div class="score-settings">
  <label>
    タイトル
    <input bind:this={titleInput} class="text" type="text" value={score.title} onchange={(event) => handleChange("title", event)} onkeydown={handleKeydown} />
  </label>

  <label>
    作曲者
    <input class="text" type="text" value={score.composer} onchange={(event) => handleChange("composer", event)} onkeydown={handleKeydown} />
  </label>

  <label>
    速度記号
    <!-- 入力欄と、その下に出す候補の一覧をまとめた枠 -->
    <span class="combo">
      <input
        class="word"
        type="text"
        autocomplete="off"
        placeholder="（なし）"
        value={score.tempoText ?? ""}
        onfocus={openSuggestions}
        oninput={openSuggestions}
        onblur={closeSuggestions}
        onchange={(event) => handleChange("tempoText", event)}
        onkeydown={handleTempoTextKeydown}
      />
      {#if showSuggestions && suggestions.length > 0}
        <ul class="suggestions">
          {#each suggestions as word, index (word)}
            <!-- mousedown で選ぶ（click だと、先に入力欄から離れて一覧が閉じてしまうため） -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <li
              class:active={index === activeIndex}
              onmousedown={(event) => {
                event.preventDefault(); // 入力欄から離れないようにする
                pickSuggestion(event.currentTarget.closest(".combo").querySelector("input"), word);
              }}
            >
              {word}
            </li>
          {/each}
        </ul>
      {/if}
    </span>
  </label>

  <label>
    ♩ =
    <input class="number" type="number" min="20" max="300" step="1" value={score.tempo} onchange={(event) => handleChange("tempo", event)} onkeydown={handleKeydown} />
  </label>

  <!-- 移調（楽譜全体。全パート・全小節を動かして、調号も変える）（ステップ17-1） -->
  <div class="transpose">
    <span class="heading">移調</span>
    <span class="current">今の調：{currentKeyName}</span>
    <span class="arrow">→</span>
    <!-- 行き先の調 -->
    <select class="key" bind:value={targetKey} title="行き先の調">
      {#each KEY_CHOICES as item}
        <option value={item.key}>{item.name}</option>
      {/each}
    </select>
    <!-- 向き -->
    <select class="direction" bind:value={direction} title="上へ動かすか、下へ動かすか">
      {#each DIRECTIONS as item}
        <option value={item.value}>{item.name}</option>
      {/each}
    </select>
    <!-- 同じ調を選んでいるときは押せない -->
    <button class="run" disabled={intervalText === ""} onclick={() => ontranspose(targetKey, direction)}>移調する</button>
    <!-- 動かす音程（例：長2度上（半音2個上）） -->
    {#if intervalText !== ""}
      <span class="interval">{intervalText}</span>
    {/if}
  </div>

  <!-- PDF を何枚に収めるか（X枚に収める b） -->
  <!-- 指定すると、PDF 出力でそのページ数をこえるとき、音符の間隔を詰めて、それでも足りなければ楽譜を縮める -->
  <div class="pdf-fit">
    <span class="heading">PDF</span>
    <select value={pdfPages === null ? "" : String(pdfPages)} onchange={handlePdfPages} title="PDF 出力のページ数がこれより多くなるときは、音符の間隔を詰めたり楽譜を縮めたりして収めます">
      <option value="">ページ数の指定なし</option>
      {#each FIT_PAGE_CHOICES as count}
        <option value={String(count)}>{count}枚に収める</option>
      {/each}
    </select>
  </div>
</div>

<style>
  .score-settings {
    display: flex;
    flex-wrap: wrap; /* 画面が狭いときは折り返す */
    align-items: center;
    gap: 16px;
    font-size: 14px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  input {
    height: 32px;
    padding: 0 8px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }
  .text {
    width: 200px;
  }
  .word {
    width: 130px;
  }
  .number {
    width: 70px;
  }
  /* 移調の欄（ステップ17-1）・PDF の枚数の欄（X枚に収める b） */
  .transpose,
  .pdf-fit {
    display: flex;
    flex-wrap: wrap; /* 画面が狭いときは折り返す */
    align-items: center;
    gap: 8px;
    padding-left: 16px;
    border-left: 1px solid #ddd; /* タイトルなどの欄と分ける線 */
  }
  .heading {
    font-weight: bold;
  }
  .current {
    color: #555;
  }
  .arrow {
    color: #888;
  }
  select {
    height: 32px;
    padding: 0 6px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
  }
  .run {
    height: 32px;
    padding: 0 12px;
    font-size: 14px;
    border: 1px solid #2563eb;
    border-radius: 4px;
    background: #2563eb; /* 青 */
    color: #fff;
    cursor: pointer;
  }
  .run:disabled {
    border-color: #ccc;
    background: #e5e7eb; /* 押せないときは灰色 */
    color: #999;
    cursor: default;
  }
  .interval {
    color: #2563eb;
  }
  .combo {
    position: relative; /* 候補の一覧を、この枠を基準に置く */
  }
  .suggestions {
    position: absolute; /* 入力欄のすぐ下に重ねて出す */
    top: 100%;
    left: 0;
    z-index: 10; /* 五線譜より手前に出す */
    width: 100%;
    margin: 2px 0 0;
    padding: 4px 0;
    list-style: none; /* 「・」を付けない */
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }
  .suggestions li {
    padding: 4px 8px;
    cursor: pointer;
  }
  .suggestions li:hover,
  .suggestions li.active {
    background: #eff6ff; /* マウスを乗せた候補・↑↓で選んでいる候補は、うすい青 */
  }
</style>
