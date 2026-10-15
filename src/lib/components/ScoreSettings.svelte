<script>
  // ==========================================================
  // ScoreSettings.svelte
  // 「楽譜の設定」タブの中身（タイトル・作曲者・速度記号・テンポ）
  // 入力欄を書き換えて、Enter を押すか、ほかの所をクリックすると確定する
  // （ステップ5-1で追加）
  // 速度記号の候補は、打った文字で「始まる」ものだけを出す（大文字・小文字は区別しない）
  // （ブラウザの datalist は「含む」ものを出すので、候補の一覧は自分で作っている）
  // ==========================================================
  import { tick, onMount } from "svelte";

  // 親から受け取るもの
  //   score      … 楽譜データ（入力欄に今の値を出すのに使う）
  //   onsettings … 確定したときに呼ぶ関数（項目の名前と、入力された文字を渡す）
  //                例：onsettings("title", "春の歌")、onsettings("tempo", "120")
  //   focusTitle … true なら、出てきたときにタイトルの入力欄にカーソルを入れて、文字を全部選ぶ（ステップ7-3）
  let { score, onsettings = () => {}, focusTitle = false } = $props();

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
