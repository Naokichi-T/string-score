<script>
  // ==========================================================
  // MeasureTools.svelte
  // 「小節」タブの中身（小節の追加・削除、拍子・調・音部記号の変更）
  // （ステップ5-2で追加）
  // （ステップ5-3：拍子の変更を追加）
  // （ステップ5-4：調の変更を追加）
  // （ステップ5-5：音部記号の変更を追加）
  // （ステップ8-1b：拍子のボタンに、コモンタイム（C）・カットタイム（¢）を追加）
  // （ステップ11-6a：途中のテンポ変更を追加）
  // （ステップ15-1：アウフタクトを追加）
  // （ステップ17-1：調の一覧を model.js の KEY_CHOICES から読むようにした）
  // ==========================================================
  import { KEY_CHOICES } from "#lib/score/model.js"; // 調の一覧（ステップ17-1）

  // 親から受け取るもの
  //   canDelete   … 小節を消せるか（何も選んでいない・小節が1つしか残らないときは false）
  //   onmeasure   … ボタンが押されたときに呼ぶ関数
  //                 "before"（前に追加）・"after"（後ろに追加）・"delete"（削除）を渡す
  //   currentTime … 選んでいる小節の拍子 { beats, beatType, symbol }（ボタンを青くするのに使う）
  //   ontime      … 拍子のボタンが押されたときに呼ぶ関数（新しい拍子 { beats, beatType, symbol } を渡す）
  //                 symbol は C のとき "common"、¢ のとき "cut"。数字の拍子のときは付かない
  //   pickup      … 1小節目の拍子と、今のアウフタクトの拍の数 { time, count }（count が 0 ならアウフタクトなし）（ステップ15-1）
  //   onpickup    … アウフタクトの長さを選んだときに呼ぶ関数（拍の数を渡す。0 ならアウフタクトをやめる）（ステップ15-1）
  //   currentKey  … 選んでいる小節の調（♯の数がプラス、♭の数がマイナス。選ぶ欄に出すのに使う）
  //   onkey       … 調を選んだときに呼ぶ関数（新しい調の数字を渡す）
  //   currentClef … 選んでいるパート・小節の音部記号（何も選んでいないときは null。ボタンを青くするのに使う）
  //   onclef      … 音部記号のボタンが押されたときに呼ぶ関数（"treble"・"alto"・"tenor"・"bass" を渡す）
  //   currentTempo … 選んでいる小節のテンポ { measure, tempo, tempoText, isChange }（何も選んでいないときは null）（ステップ11-6a）
  //                  isChange … その小節でテンポが変わっているか（true なら［元に戻す］を押せる）
  //   ontempo      … ［変える］が押されたときに呼ぶ関数（数字の文字と、速度記号の文字を渡す）（ステップ11-6a）
  //   onremovetempo … ［元に戻す］が押されたときに呼ぶ関数（ステップ11-6a）
  //   currentGradual … 選んでいる小節（範囲なら最初の小節）の rit.・accel.・a tempo（ボタンを青くするのに使う）（ステップ11-6b）
  //                    { gradual: その小節から始まる "rit" か "accel"（なければ null）, aTempo: a tempo が付いているか }
  //                    何も選んでいないときは null
  //   ongradual      … ［rit.］［accel.］が押されたときに呼ぶ関数（"rit" か "accel" を渡す）（ステップ11-6b）
  //   onatempo       … ［a tempo］が押されたときに呼ぶ関数（ステップ11-6b）
  let {
    canDelete = false,
    onmeasure = () => {},
    currentTime = { beats: 4, beatType: 4 },
    ontime = () => {},
    pickup = { time: { beats: 4, beatType: 4 }, count: 0 },
    onpickup = () => {},
    currentKey = 0,
    onkey = () => {},
    currentClef = null,
    onclef = () => {},
    currentTempo = null,
    ontempo = () => {},
    onremovetempo = () => {},
    currentGradual = null,
    ongradual = () => {},
    onatempo = () => {},
  } = $props();

  // 速度記号の候補（「楽譜の設定」タブと同じもの）（ステップ11-6a）
  // 入力欄に文字を入れると、前が同じ候補が出る（datalist というしくみ）
  const TEMPO_WORDS = ["Largo", "Lento", "Adagio", "Andante", "Andantino", "Moderato", "Allegretto", "Allegro", "Vivace", "Presto"];

  // テンポの欄に入っている文字（ステップ11-6a）
  let tempoNumber = $state("");
  let tempoWord = $state("");

  // 選んでいる小節が変わったら（テンポが変わったときも）、欄の中身を、その小節の今のテンポにする（ステップ11-6a）
  $effect(() => {
    tempoNumber = currentTempo ? String(currentTempo.tempo) : "";
    tempoWord = currentTempo ? currentTempo.tempoText : "";
  });

  // ----------------------------------------------------------
  // 関数：handleTempoKeydown
  // テンポの欄で Enter が押されたら、［変える］と同じことをする（ステップ11-6a）
  // （日本語の変換を決めるための Enter では動かないようにする）
  // ----------------------------------------------------------
  function handleTempoKeydown(event) {
    if (event.key === "Enter" && !event.isComposing) ontempo(tempoNumber, tempoWord);
  }

  // よく使う拍子（ボタンにして並べる）
  //   symbol … コモンタイム・カットタイムのときだけ付ける（ボタンには数字ではなく記号を出す）
  //   icon   … 記号のボタンに出す、楽譜用フォント（Bravura）の文字
  //   name   … マウスを乗せたときに出す名前（記号のボタンだけ）
  // （ステップ8-1b：C は 4/4 の隣、¢ は 2/2 の隣に置いた）
  const PRESETS = [
    { beats: 2, beatType: 4 },
    { beats: 3, beatType: 4 },
    { beats: 4, beatType: 4 },
    { beats: 4, beatType: 4, symbol: "common", icon: "\uE08A", name: "コモンタイム（4/4 と同じ長さ）" },
    { beats: 2, beatType: 2 },
    { beats: 2, beatType: 2, symbol: "cut", icon: "\uE08B", name: "カットタイム（2/2 と同じ長さ）" },
    { beats: 3, beatType: 8 },
    { beats: 6, beatType: 8 },
  ];

  // 「その他」で選べる数字
  const BEATS_CHOICES = Array.from({ length: 16 }, (_, i) => i + 1); // 上の数字：1〜16
  const BEAT_TYPE_CHOICES = [2, 4, 8]; // 下の数字：2・4・8

  // 調の一覧（選ぶ欄に出す順番）（ステップ17-1：移調でも使うので、model.js の KEY_CHOICES に移した）
  const KEYS = KEY_CHOICES;

  // 音部記号のボタン
  //   clef  … データで使う名前
  //   name  … マウスを乗せたときに出す名前
  //   icon  … 楽譜用フォント（Bravura）の文字（ト音記号・ハ音記号・ヘ音記号）
  //   y     … 記号を置く高さ（ボタンの中の小さな五線の、どの線に乗せるか）
  //           線の高さは上から 8・14・20・26・32。記号の「基準の線」をそこに合わせる
  //             ト音記号 … 下から2本目の線（ソ）＝ 26
  //             アルト   … まん中の線（ド）＝ 20
  //             テノール … 上から2本目の線（ド）＝ 14
  //             ヘ音記号 … 上から2本目の線（ファ）＝ 14
  const CLEF_BUTTONS = [
    { clef: "treble", name: "ト音記号", icon: "\uE050", y: 26 },
    { clef: "alto", name: "アルト記号（ハ音記号・まん中の線がド）", icon: "\uE05C", y: 20 },
    { clef: "tenor", name: "テノール記号（ハ音記号・上から2本目の線がド）", icon: "\uE05C", y: 14 },
    { clef: "bass", name: "ヘ音記号", icon: "\uE062", y: 14 },
  ];

  // ボタンの中の小さな五線の、線の高さ（上から）
  const STAFF_LINES = [8, 14, 20, 26, 32];

  // 「その他」で今選んでいる数字
  let otherBeats = $state(5);
  let otherBeatType = $state(4);

  // アウフタクトで選べる拍の数（1拍から「1小節の拍の数 − 1」拍まで）（ステップ15-1）
  // 例：4/4 → [1, 2, 3]、6/8 → [1, 2, 3, 4, 5]
  let pickupCounts = $derived(Array.from({ length: Math.max(0, pickup.time.beats - 1) }, (_, k) => k + 1));

  // 選ぶ欄に出す、拍の数の名前（例：4/4 で 1 → "4分音符1つ"、6/8 で 2 → "8分音符2つ"）（ステップ15-1）
  function pickupLabel(count) {
    return `${pickup.time.beatType}分音符${count}つ`;
  }

  // ----------------------------------------------------------
  // 関数：pickPickup
  // アウフタクトの欄で長さを選んだとき：親に拍の数を渡す（ステップ15-1）
  // 変えられなかったとき（前のほうに音があるときなど）は、欄の表示を今の長さに戻す
  //   select … 選ぶ欄の要素
  // ----------------------------------------------------------
  function pickPickup(select) {
    onpickup(Number(select.value));
    select.value = String(pickup.count); // 変わったときは新しい長さ、変わらなかったときは前の長さになる
  }

  // ----------------------------------------------------------
  // 関数：isCurrent
  // その拍子が、選んでいる小節の拍子と同じか調べる（同じならボタンを青くする）
  // （ステップ8-1b：記号の印（symbol）も比べる。4/4 の小節で C のボタンは青くしない）
  // ----------------------------------------------------------
  function isCurrent(time) {
    const sameSymbol = (time.symbol ?? null) === (currentTime.symbol ?? null);
    return time.beats === currentTime.beats && time.beatType === currentTime.beatType && sameSymbol;
  }

  // ----------------------------------------------------------
  // 関数：pickTime
  // 拍子のボタンが押されたとき：ボタン用の情報（icon・name）を除いて、拍子のデータだけを親に渡す
  // ----------------------------------------------------------
  function pickTime(time) {
    const newTime = { beats: time.beats, beatType: time.beatType };
    if (time.symbol) newTime.symbol = time.symbol;
    ontime(newTime);
  }
</script>

<div class="measure-tools">
  <!-- 1行目：小節の追加・削除、拍子、音部記号（どの画面の幅でも、ここで行を分ける。狭すぎるときだけ、行の中で折り返す）（後で直す候補の手直し） -->
  <div class="row">
    <!-- 小節の追加・削除（後で直す候補の手直し：2行に収めるため、「小節」の見出しの横に［前に追加］［後ろに追加］［削除］をまとめた） -->
    <div class="group">
      <span class="label">小節</span>
      <button onclick={() => onmeasure("before")} title="選んでいる小節の前に、小節を1つ足す（何も選んでいないときは最後に足す）"> 前に追加 </button>
      <button onclick={() => onmeasure("after")} title="選んでいる小節の後ろに、小節を1つ足す（何も選んでいないときは最後に足す）"> 後ろに追加 </button>
      <button disabled={!canDelete} onclick={() => onmeasure("delete")} title="選んでいる小節を消す（範囲を選んでいるときは、範囲にかかる小節をまとめて消す）"> 削除 </button>
    </div>

    <!-- 拍子：よく使う拍子のボタン -->
    <div class="group">
      <span class="label">拍子</span>
      {#each PRESETS as time}
        <button
          class="time"
          class:active={isCurrent(time)}
          onclick={() => pickTime(time)}
          title={`${time.name ? time.name + "：" : ""}選んでいる小節から、次に拍子が変わる所までの拍子を変える（範囲を選んでいるときは、範囲にかかる小節だけ）`}
        >
          {#if time.symbol}
            <!-- C・¢ は楽譜用フォントの記号を SVG で描く（文字の基準の線を、ボタンのまん中に合わせるため） -->
            <svg width="30" height="40" viewBox="0 0 30 40">
              <text x="15" y="20" class="time-icon">{time.icon}</text>
            </svg>
          {:else}
            <!-- 分数のように、上の数字と下の数字を縦に並べる -->
            <span class="fraction">
              <span>{time.beats}</span>
              <span>{time.beatType}</span>
            </span>
          {/if}
        </button>
      {/each}
    </div>

    <!-- 拍子：その他（数字を選んで変える） -->
    <!-- （後で直す候補の手直し：2行に収めるため「その他」の見出しを外した。拍子のボタンのすぐ右に置くので、拍子の続きだと分かる） -->
    <div class="group">
      <select bind:value={otherBeats} title="上の数字（1小節に何拍あるか）">
        {#each BEATS_CHOICES as n}
          <option value={n}>{n}</option>
        {/each}
      </select>
      <span class="slash">/</span>
      <select bind:value={otherBeatType} title="下の数字（何分音符を1拍とするか）">
        {#each BEAT_TYPE_CHOICES as n}
          <option value={n}>{n}</option>
        {/each}
      </select>
      <button onclick={() => ontime({ beats: otherBeats, beatType: otherBeatType })} title="選んだ数字の拍子に変える"> 変更 </button>
    </div>

    <!-- 音部記号：選んでいるパートだけに効く（何も選んでいないときは押せない） -->
    <div class="group">
      <span class="label">音部記号</span>
      {#each CLEF_BUTTONS as item}
        <button
          class="clef"
          class:active={currentClef === item.clef}
          disabled={currentClef === null}
          onclick={() => onclef(item.clef)}
          title={`${item.name}：選んでいるパートの、選んでいる小節から次に音部記号が変わる所まで（範囲を選んでいるときは、範囲にかかる小節だけ）`}
        >
          <!-- 小さな五線と記号を、SVG で描く（文字の基準の線を、決まった線にぴったり合わせられるため） -->
          <svg width="34" height="40" viewBox="0 0 34 40">
            {#each STAFF_LINES as lineY}
              <line x1="2" y1={lineY} x2="32" y2={lineY} stroke="currentColor" stroke-width="0.8" />
            {/each}
            <text x="7" y={item.y} class="clef-icon">{item.icon}</text>
          </svg>
        </button>
      {/each}
    </div>
  </div>

  <!-- 2行目：アウフタクト、調、テンポ、rit.・accel.・a tempo -->
  <div class="row">
    <!-- アウフタクト：選んだらすぐ変わる（どの小節を選んでいても、1小節目に効く）（ステップ15-1） -->
    <div class="group">
      <span class="label">アウフタクト</span>
      <select
        class="pickup"
        value={pickup.count}
        disabled={pickupCounts.length === 0}
        onchange={(event) => pickPickup(event.currentTarget)}
        title="1小節目を、拍子より短い小節（アウフタクト）にする。長さは、拍子の下の数字の音符がいくつ分かで選ぶ"
      >
        <option value={0}>なし</option>
        {#each pickupCounts as count}
          <option value={count}>{pickupLabel(count)}</option>
        {/each}
      </select>
    </div>

    <!-- 調：選んだらすぐ変わる（今の小節の調が選ばれた状態で出る） -->
    <div class="group">
      <span class="label">調</span>
      <select
        class="key"
        value={currentKey}
        onchange={(event) => onkey(Number(event.currentTarget.value))}
        title="選んでいる小節から、次に調が変わる所までの調を変える（範囲を選んでいるときは、範囲にかかる小節だけ）"
      >
        {#each KEYS as item}
          <option value={item.key}>{item.name}</option>
        {/each}
      </select>
    </div>

    <!-- テンポ：選んでいる小節の頭から変える（何も選んでいないときは使えない）（ステップ11-6a） -->
    <div class="group">
      <span class="label">テンポ</span>
      <input
        class="tempo-word"
        type="text"
        list="measure-tempo-words"
        placeholder="速度記号"
        bind:value={tempoWord}
        disabled={!currentTempo}
        onkeydown={handleTempoKeydown}
        title="速度記号（Allegro など。なくてもよい）"
      />
      <datalist id="measure-tempo-words">
        {#each TEMPO_WORDS as word}
          <option value={word}></option>
        {/each}
      </datalist>
      <span class="label">♩＝</span>
      <input class="tempo-number" type="number" min="20" max="300" step="1" bind:value={tempoNumber} disabled={!currentTempo} onkeydown={handleTempoKeydown} title="テンポ（20〜300）" />
      <button disabled={!currentTempo} onclick={() => ontempo(tempoNumber, tempoWord)} title="選んでいる小節の頭から、テンポを変える（範囲を選んでいるときは、範囲の最初の小節から）"> 変える </button>
      <button disabled={!currentTempo?.isChange} onclick={() => onremovetempo()} title="選んでいる小節のテンポ変更を消す（前の小節のテンポが続く）"> 元に戻す </button>
    </div>

    <!-- rit.・accel.・a tempo（ステップ11-6b） -->
    <!-- rit.・accel. は、範囲を選んでいれば範囲にかかる小節、音1つならその小節に付ける。ここから始まっている所でもう一度押すと外れる -->
    <div class="group">
      <button
        class="words"
        class:active={currentGradual?.gradual === "rit"}
        disabled={!currentGradual}
        onclick={() => ongradual("rit")}
        title="リタルダンド（だんだん遅く）：範囲を選んでいるときは、範囲にかかる小節の間でだんだん遅くする"
      >
        rit.
      </button>
      <button
        class="words"
        class:active={currentGradual?.gradual === "accel"}
        disabled={!currentGradual}
        onclick={() => ongradual("accel")}
        title="アッチェレランド（だんだん速く）：範囲を選んでいるときは、範囲にかかる小節の間でだんだん速くする"
      >
        accel.
      </button>
      <button
        class="words"
        class:active={!!currentGradual?.aTempo}
        disabled={!currentTempo || currentTempo.measure === 0}
        onclick={() => onatempo()}
        title="ア・テンポ（元の速さに戻す）：選んでいる小節の頭から、rit.・accel. の前の速さに戻す"
      >
        a tempo
      </button>
    </div>
  </div>
</div>

<style>
  /* 1行目・2行目を縦に並べる（後で直す候補の手直し：どこで行を分けるかを決めた） */
  .measure-tools {
    display: flex;
    flex-direction: column;
    gap: 12px; /* 行と行の間 */
  }
  /* 1つの行：グループを横に並べる（画面がとても狭いときだけ、行の中で折り返す）
     グループの間は 16px → 12px につめた（iPad の横向きの幅で2行に収めるため） */
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  button {
    height: 40px;
    padding: 0 10px; /* 文字の左右の余白（後で直す候補の手直し：14px → 10px につめた） */
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.35; /* 押せないものはうすく */
    cursor: not-allowed;
  }
  /* 拍子のボタンは、正方形に近い形にする */
  button.time {
    width: 36px; /* 後で直す候補の手直し：40px → 36px につめた */
    padding: 0;
  }
  /* 今の拍子・音部記号のボタンは青（記号タブと同じ色） */
  button.active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
  }
  /* 上の数字と下の数字を縦に並べる */
  .fraction {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-weight: bold;
    line-height: 1.05;
  }
  .label {
    font-size: 13px;
    color: #666;
    margin-right: 2px; /* 後で直す候補の手直し：4px → 2px につめた */
  }
  .slash {
    color: #666;
  }
  /* 音部記号のボタンは、小さな五線が入る大きさにする */
  button.clef {
    width: 44px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* 記号の文字は楽譜用フォントで描く（大きさは「五線の高さ＝24」に合わせる） */
  .clef-icon {
    font-family: "Bravura";
    font-size: 24px;
    fill: currentColor;
  }
  /* 中の SVG ではマウスの操作を受け取らず、下のボタンに通す（「小節」タブが押せなかったときと同じ対策） */
  button.clef svg {
    pointer-events: none;
  }
  /* C・¢ の記号（楽譜用フォント。Bravura の拍子記号は、文字の基準の線が記号のまん中にある） */
  .time-icon {
    font-family: "Bravura";
    font-size: 32px;
    fill: currentColor;
    text-anchor: middle; /* x の位置を記号の左右のまん中にする */
  }
  /* C・¢ の SVG も、マウスの操作を下のボタンに通す */
  button.time svg {
    pointer-events: none;
  }
  select {
    height: 40px;
    font-size: 14px;
    padding: 0 4px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  select:disabled {
    opacity: 0.35; /* 選べないときはうすく（ステップ15-1） */
  }
  /* テンポの入力欄（ステップ11-6a） */
  input {
    height: 40px;
    font-size: 14px;
    padding: 0 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }
  input:disabled {
    opacity: 0.35;
  }
  .tempo-word {
    width: 96px; /* 後で直す候補の手直し：110px → 96px につめた（「速度記号」の文字は入る） */
  }
  .tempo-number {
    width: 64px;
  }
  /* rit.・accel.・a tempo のボタンは、楽譜と同じく斜めの文字（ステップ11-6b） */
  button.words {
    font-style: italic;
    padding: 0 10px;
  }
</style>
