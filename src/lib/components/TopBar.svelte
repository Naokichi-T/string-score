<script>
  // ==========================================================
  // TopBar.svelte
  // 編集ページの一番上のバー
  // （ステップ4-3：元に戻す・やり直しのボタンが動くようになった。ほかのボタンは後のステップで）
  // （ステップ5-1：テンポの前に速度記号も出す）
  // （ステップ6-1：再生・停止のボタンと、鳴らすパートを選ぶ欄、音の種類（楽器の音・電子音）を選ぶ欄）
  // （ステップ7-1：［保存］ボタンをやめて、自動保存の状態を出す）
  // （ステップ8-1：［MusicXML 書き出し］ボタンが動くようにした）
  // （ステップ9：［PDF 出力］ボタンを足した）
  // ==========================================================

  // 親から受け取るもの
  //   tempo      … テンポ（♩＝○○ の数字）
  //   tempoText  … 速度記号（"Allegro" など。なければ空の文字）
  //   canUndo    … 元に戻せるか（false ならボタンを押せない）
  //   canRedo    … やり直せるか
  //   onundo     … 元に戻すボタンが押されたときに呼ぶ関数
  //   onredo     … やり直しボタンが押されたときに呼ぶ関数
  //   parts      … パートの一覧（鳴らすパートを選ぶ欄に、パート名を出すのに使う）
  //   playing    … 再生中か
  //   soundState … 楽器の音の読み込みの状態（"loading"：読み込み中、"ready"：完了、"error"：失敗）
  //   playTarget … 鳴らすパート（"all" なら全体、数字ならそのパートの番号）
  //   canPlay    … 再生できるか（false なら再生ボタンを押せない）
  //   soundType  … 音の種類（"instrument"：楽器の音A、"instrumentB"：楽器の音B、"synth"：電子音）
  //   onplay     … 再生ボタンが押されたときに呼ぶ関数
  //   onstop     … 停止ボタンが押されたときに呼ぶ関数
  //   ontarget   … 鳴らすパートが選ばれたときに呼ぶ関数（"all" か数字を渡す）
  //   onsoundtype … 音の種類が選ばれたときに呼ぶ関数（"instrument"・"instrumentB"・"synth" のどれかを渡す）
  //   saveState  … 保存の状態（"saved"：保存済み、"error"：保存できなかった）
  //   onexport   … ［MusicXML 書き出し］ボタンが押されたときに呼ぶ関数（ステップ8-1）
  //   onprint    … ［PDF 出力］ボタンが押されたときに呼ぶ関数（ステップ9）
  let {
    tempo,
    tempoText = "",
    canUndo = false,
    canRedo = false,
    onundo = () => {},
    onredo = () => {},
    parts = [],
    playing = false,
    soundState = "loading",
    playTarget = "all",
    canPlay = false,
    soundType = "instrument",
    onplay = () => {},
    onstop = () => {},
    ontarget = () => {},
    onsoundtype = () => {},
    saveState = "saved",
    onexport = () => {},
    onprint = () => {},
  } = $props();

  // ----------------------------------------------------------
  // 関数：handleTargetChange
  // 鳴らすパートの欄が変わったとき：選ばれた値を親に渡す
  // （選ぶ欄の値は文字なので、パートの番号は数字に直す）
  // ----------------------------------------------------------
  function handleTargetChange(event) {
    const value = event.target.value;
    ontarget(value === "all" ? "all" : Number(value));
    // 選んだあとは欄の選択を外す（そのままだと、Space キーで再生できずに欄が開いてしまうため）
    event.target.blur();
  }

  // ----------------------------------------------------------
  // 関数：handleSoundTypeChange
  // 音の種類の欄が変わったとき：選ばれた値を親に渡す
  // ----------------------------------------------------------
  function handleSoundTypeChange(event) {
    onsoundtype(event.target.value);
    // 選んだあとは欄の選択を外す（Space キーで再生できるようにするため）
    event.target.blur();
  }
</script>

<header class="top-bar">
  <!-- アプリの名前（押すとトップページに戻る） -->
  <a class="app-name" href="/">string-score</a>

  <!-- 元に戻す・やり直し -->
  <div class="group">
    <button disabled={!canUndo} onclick={() => onundo()} title="元に戻す（Ctrl＋Z / ⌘＋Z）">↶ 元に戻す</button>
    <button disabled={!canRedo} onclick={() => onredo()} title="やり直し（Ctrl＋Shift＋Z / ⌘＋Shift＋Z）"> ↷ やり直し </button>
  </div>

  <!-- 再生・停止と、鳴らすパート -->
  <div class="group">
    {#if playing}
      <button class="play" onclick={() => onstop()} title="停止（Space）">■ 停止</button>
    {:else}
      <button class="play" disabled={!canPlay} onclick={() => onplay()} title="再生（Space）。音を選んでいれば、その小節から">▶ 再生</button>
    {/if}

    <!-- 鳴らすパート（value は今のデータに合わせ、変えるのは親に頼む） -->
    <select value={String(playTarget)} onchange={handleTargetChange} title="鳴らすパート">
      <option value="all">全体</option>
      {#each parts as part, p}
        <option value={String(p)}>{part.name}</option>
      {/each}
    </select>

    <!-- 音の種類（value は今のデータに合わせ、変えるのは親に頼む） -->
    <select value={soundType} onchange={handleSoundTypeChange} title="音の種類">
      <!-- 楽器の音A は FluidR3_GM、楽器の音B は MusyngKite の録音（ステップ12-2） -->
      <option value="instrument">楽器の音A</option>
      <option value="instrumentB">楽器の音B</option>
      <option value="synth">電子音</option>
    </select>

    <!-- 楽器の音の読み込みの状態（電子音を選んでいるときは出さない） -->
    {#if soundType === "synth"}
      <!-- 電子音は読み込みがいらないので、何も出さない -->
    {:else if soundState === "loading"}
      <span class="sound-status">音を読み込み中…</span>
    {:else if soundState === "error"}
      <span class="sound-status error">音を読み込めませんでした（ページを再読み込みしてください）</span>
    {/if}

    <span class="tempo">{tempoText ? `${tempoText} ` : ""}♩ = {tempo}</span>
  </div>

  <!-- 右に寄せるための空き -->
  <div class="spacer"></div>

  <!-- 保存の状態と書き出し -->
  <div class="group">
    {#if saveState === "error"}
      <span class="save-status error">保存できませんでした</span>
    {:else}
      <span class="save-status">✓ 保存済み</span>
    {/if}
    <button onclick={() => onexport()} title="今の楽譜を MusicXML のファイル（タイトル.musicxml）として保存する">MusicXML 書き出し</button>
    <button onclick={() => onprint()} title="印刷の画面を開く（送り先で「PDF に保存」を選ぶと PDF になる）">PDF 出力</button>
  </div>
</header>

<style>
  .top-bar {
    display: flex; /* 横に並べる */
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    background: #f3f4f6; /* うすいグレー */
    border-bottom: 1px solid #ddd;
  }
  .app-name {
    font-weight: bold;
    color: #111;
    text-decoration: none;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .spacer {
    flex: 1; /* 残りの幅を全部使って、右側のボタンを右端に寄せる */
  }
  .tempo {
    font-size: 14px;
    color: #333;
  }
  .sound-status {
    font-size: 12px;
    color: #6b7280; /* うすいグレーの文字 */
  }
  .sound-status.error {
    color: #dc2626; /* 赤 */
  }
  .save-status {
    font-size: 12px;
    color: #6b7280; /* うすいグレーの文字 */
  }
  .save-status.error {
    color: #dc2626; /* 赤 */
    font-weight: bold;
  }
  button {
    padding: 4px 10px;
    font-size: 14px;
  }
  .play {
    min-width: 72px; /* 「再生」と「停止」でボタンの幅が変わらないようにする */
  }
  select {
    font-size: 14px;
    padding: 3px 4px;
  }
</style>
