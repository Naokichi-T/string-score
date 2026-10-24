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
  // （ステップ12-3b：鳴らすパートを選ぶ欄をやめた。「再生」タブのソロで選ぶ）
  // （ステップ18-6：タブレットのときだけ、右端に［？］（タブレットでの使い方）を出す）
  // （演奏モード：［PDF 出力］の右に［演奏モード］（楽譜だけを画面いっぱいに出す）を足した）
  //   画面の幅が狭いとき（1140px 以下）は、右のボタンの文字を短くする（1024px の幅で上のバーがはみ出さないように）
  //   例：「MusicXML 書き出し」→「MusicXML」、「PDF 出力」→「PDF」、「演奏モード」→「演奏」
  //   長い文字（.long）と短い文字（.short）の両方を書いておき、CSS でどちらを見せるかを切り替える
  // ==========================================================

  // 親から受け取るもの
  //   tempo      … テンポ（♩＝○○ の数字）
  //   tempoText  … 速度記号（"Allegro" など。なければ空の文字）
  //   canUndo    … 元に戻せるか（false ならボタンを押せない）
  //   canRedo    … やり直せるか
  //   onundo     … 元に戻すボタンが押されたときに呼ぶ関数
  //   onredo     … やり直しボタンが押されたときに呼ぶ関数
  //   playing    … 再生中か
  //   soundState … 楽器の音の読み込みの状態（"loading"：読み込み中、"ready"：完了、"error"：失敗）
  //   canPlay    … 再生できるか（false なら再生ボタンを押せない）
  //   soundType  … 音の種類（"instrument"：楽器の音A、"instrumentB"：楽器の音B、"synth"：電子音）
  //   onplay     … 再生ボタンが押されたときに呼ぶ関数
  //   onstop     … 停止ボタンが押されたときに呼ぶ関数
  //   onsoundtype … 音の種類が選ばれたときに呼ぶ関数（"instrument"・"instrumentB"・"synth" のどれかを渡す）
  //   saveState  … 保存の状態（"saved"：保存済み、"error"：保存できなかった）
  //   onexport   … ［MusicXML 書き出し］ボタンが押されたときに呼ぶ関数（ステップ8-1）
  //   onprint    … ［PDF 出力］ボタンが押されたときに呼ぶ関数（ステップ9）
  //   onperform  … ［演奏モード］ボタンが押されたときに呼ぶ関数（演奏モード）
  //   showHelp   … ［？］を出すか（タブレットのときだけ true）（ステップ18-6）
  //   onhelp     … ［？］が押されたときに呼ぶ関数（ステップ18-6）
  let {
    showHelp = false,
    onhelp = () => {},
    tempo,
    tempoText = "",
    canUndo = false,
    canRedo = false,
    onundo = () => {},
    onredo = () => {},
    playing = false,
    soundState = "loading",
    canPlay = false,
    soundType = "instrument",
    onplay = () => {},
    onstop = () => {},
    onsoundtype = () => {},
    saveState = "saved",
    onexport = () => {},
    onprint = () => {},
    onperform = () => {},
  } = $props();

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

  <!-- 再生・停止と、音の種類 -->
  <div class="group">
    {#if playing}
      <button class="play" onclick={() => onstop()} title="停止（Space）">■ 停止</button>
    {:else}
      <button class="play" disabled={!canPlay} onclick={() => onplay()} title="再生（Space）。音を選んでいれば、その小節から">▶ 再生</button>
    {/if}

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
      <!-- 文が長いと上のバーが2行になるので、短く書いて、続きは title（マウスを乗せる・長押しで出る説明）に入れる（後で直す候補の手直し） -->
      <span class="sound-status error" title="楽器の音を読み込めませんでした。ページを再読み込みしてください（電子音なら鳴らせます）">音を読み込めません（再読み込みしてください）</span>
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
    <!-- 画面が狭いときは短い文字（.short）を見せる（演奏モード） -->
    <button onclick={() => onexport()} title="今の楽譜を MusicXML のファイル（タイトル.musicxml）として保存する">
      <span class="long">MusicXML 書き出し</span><span class="short">MusicXML</span>
    </button>
    <button onclick={() => onprint()} title="印刷の画面を開く（送り先で「PDF に保存」を選ぶと PDF になる）">
      <span class="long">PDF 出力</span><span class="short">PDF</span>
    </button>
    <!-- 楽譜だけを画面いっぱいに出して、ページをめくりながら見る（演奏モード） -->
    <button onclick={() => onperform()} title="楽譜だけを画面いっぱいに出して、ページをめくりながら演奏する（Esc か ×で戻る）">
      <span class="long">演奏モード</span><span class="short">演奏</span>
    </button>
    <!-- タブレットでの使い方の窓を開く（タブレットのときだけ）（ステップ18-6） -->
    {#if showHelp}
      <button class="help" onclick={() => onhelp()} title="タブレットでの使い方を見る">？</button>
    {/if}
  </div>
</header>

<style>
  .top-bar {
    display: flex; /* 横に並べる */
    align-items: center;
    gap: 16px;
    padding: 6px 16px; /* ボタンを高くした分、上下の余白を少しつめた（ステップ12-8d） */
    background: #f3f4f6; /* うすいグレー */
    border-bottom: 1px solid #ddd;
  }
  .app-name {
    white-space: nowrap; /* 文字を途中で折り返さない（ステップ12-8d） */
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
    white-space: nowrap; /* 文字を途中で折り返さない（ステップ12-8d） */
    font-size: 14px;
    color: #333;
  }
  .sound-status {
    white-space: nowrap; /* 文字を途中で折り返さない（後で直す候補の手直し：上のバーが2行にならないように） */
    font-size: 12px;
    color: #6b7280; /* うすいグレーの文字 */
  }
  .sound-status.error {
    color: #dc2626; /* 赤 */
  }
  .save-status {
    white-space: nowrap; /* 文字を途中で折り返さない（ステップ12-8d） */
    font-size: 12px;
    color: #6b7280; /* うすいグレーの文字 */
  }
  .save-status.error {
    color: #dc2626; /* 赤 */
    font-weight: bold;
  }
  button {
    height: 40px; /* 指で押しやすい高さ（ステップ12-8d） */
    padding: 0 12px;
    font-size: 14px;
    white-space: nowrap; /* 文字を途中で折り返さない */
  }
  /* ［？］（ステップ18-6） */
  .help {
    width: 40px; /* 正方形にする */
    padding: 0;
    font-size: 16px;
    font-weight: bold;
  }
  .play {
    min-width: 72px; /* 「再生」と「停止」でボタンの幅が変わらないようにする */
  }
  select {
    height: 40px; /* ボタンと同じ高さ（ステップ12-8d） */
    font-size: 14px;
    padding: 0 4px;
  }
  /* ボタンの短い文字は、ふだんは見せない（演奏モード） */
  .short {
    display: none;
  }
  /* 画面の幅が狭いとき（1140px 以下）：ボタンの文字を短くして、グループの間も少しつめる（演奏モード）
     （1024px の幅（古い iPad・iPad mini の横向きなど）で、上のバーの右のボタンがはみ出さないようにするため） */
  @media (max-width: 1140px) {
    .long {
      display: none;
    }
    .short {
      display: inline;
    }
    .top-bar {
      gap: 12px;
    }
  }
</style>
