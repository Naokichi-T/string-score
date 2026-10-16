<script>
  // ==========================================================
  // PlaybackTools.svelte
  // 「再生」タブの中身（パートごとの音量・ミュート・ソロ）
  // （ステップ12-3 で追加）
  // ==========================================================
  import { mixerOf } from "#lib/score/mixer.js";

  // 親から受け取るもの
  //   parts   … パートの一覧（楽譜データの parts）
  //   mixer   … 音量の設定（くわしくは score/mixer.js）
  //   onmixer … 設定が変わったときに呼ぶ関数（パートの名札（id）と、変えた項目と、変え終わったかを渡す）
  //             例：onmixer("pk2qyyj3f", { volume: 80 }, false)、onmixer("pk2qyyj3f", { mute: true })
  //             変え終わったか：つまみを動かしている途中は false、離したときは true（省略したら true）（ステップ12-3b）
  //             （再生中に変え終わったら、親が今の小節から鳴らし直す）
  //   metronome   … メトロノームの設定 { on: 鳴らすか, volume: 音量 0〜100, countIn: カウントインを入れるか }（ステップ12-4a・12-4b）
  //   onmetronome … メトロノームの設定が変わったときに呼ぶ関数（変えた項目と、変え終わったかを渡す）（ステップ12-4a）
  //                 例：onmetronome({ on: true })、onmetronome({ volume: 50 }, false)
  //   repeatOn   … 区間リピートが入っているか（ステップ12-5b）
  //   repeatText … くり返す範囲の文字（例："3〜5小節目"）（ステップ12-5b）
  //   onrepeat   … ［区間リピート］が押されたときに呼ぶ関数（ステップ12-5b）
  let { parts = [], mixer = {}, onmixer = () => {}, metronome = { on: false, volume: 70 }, onmetronome = () => {}, repeatOn = false, repeatText = "", onrepeat = () => {} } = $props();

  // どれか1つでもソロになっているか（なっていれば、ソロでないパートは鳴らない）
  let anySolo = $derived(parts.some((part) => mixerOf(mixer, part.id).solo));

  // ----------------------------------------------------------
  // 関数：isSilent
  // そのパートが鳴らない設定になっているか（行をうすく表示するのに使う）
  //   ・ミュートになっている
  //   ・ほかのパートがソロで、このパートはソロではない
  // ----------------------------------------------------------
  function isSilent(setting) {
    return setting.mute || (anySolo && !setting.solo);
  }
</script>

<div class="playback-tools">
  <!-- パートごとの行（上から楽譜と同じ順番） -->
  {#each parts as part (part.id)}
    {@const setting = mixerOf(mixer, part.id)}
    <div class="part-row" class:silent={isSilent(setting)}>
      <span class="part-name">{part.name}</span>

      <!-- ミュート（押すたびに入・切） -->
      <button class="toggle mute" class:on={setting.mute} onclick={() => onmixer(part.id, { mute: !setting.mute })} title="ミュート：このパートを鳴らさない"> M </button>

      <!-- ソロ（押すたびに入・切。複数のパートを入れられる） -->
      <button class="toggle solo" class:on={setting.solo} onclick={() => onmixer(part.id, { solo: !setting.solo })} title="ソロ：ソロにしたパートだけを鳴らす（複数選べる）"> S </button>

      <!-- 音量のつまみ（0〜100） -->
      <!-- oninput：動かしている間ずっと呼ばれる。onchange：つまみを離したときに1回呼ばれる -->
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={setting.volume}
        oninput={(event) => onmixer(part.id, { volume: Number(event.currentTarget.value) }, false)}
        onchange={(event) => {
          onmixer(part.id, { volume: Number(event.currentTarget.value) }, true); // 離したとき：変え終わった（ステップ12-3b）
          event.currentTarget.blur();
        }}
      />
      <!-- 選択を外すのは、Space キーで再生できるようにするため（つまみを選んだままだと、キーがつまみに取られる） -->

      <!-- 音量の数字 -->
      <span class="volume">{setting.volume}</span>
    </div>
  {/each}

  <!-- メトロノーム（ステップ12-4a） -->
  <div class="part-row metronome">
    <!-- 入・切（押すたびに切り替わる） -->
    <button class="switch" class:on={metronome.on} onclick={() => onmetronome({ on: !metronome.on })} title="再生といっしょにメトロノームを鳴らす（1拍目は高い音）"> メトロノーム </button>

    <!-- カウントイン（押すたびに入・切。メトロノームが切でも使える）（ステップ12-4b） -->
    <button
      class="switch"
      class:on={metronome.countIn}
      onclick={() => onmetronome({ countIn: !metronome.countIn })}
      title="再生の前に、1小節ぶんクリックだけを鳴らす（再生中に設定を変えて鳴らし直すときは入れない）"
    >
      カウントイン
    </button>

    <!-- クリックの音量（パートのつまみと同じしくみ） -->
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      value={metronome.volume}
      oninput={(event) => onmetronome({ volume: Number(event.currentTarget.value) }, false)}
      onchange={(event) => {
        onmetronome({ volume: Number(event.currentTarget.value) }, true);
        event.currentTarget.blur(); // Space キーで再生できるように、選択を外す
      }}
      title="メトロノームの音量"
    />
    <span class="volume">{metronome.volume}</span>
  </div>

  <!-- 区間リピート（押すたびに入・切。入のときは、くり返す範囲を横に出す）（ステップ12-5b） -->
  <div class="part-row">
    <button class="switch" class:on={repeatOn} onclick={() => onrepeat()} title="選んだ範囲の小節を、止めるまでくり返す（範囲を選んでいなければ、選んでいる小節。何も選んでいなければ曲全体）">
      区間リピート
    </button>
    {#if repeatOn}
      <span class="repeat-range">{repeatText}</span>
    {/if}
  </div>
</div>

<style>
  .playback-tools {
    display: flex;
    flex-wrap: wrap; /* パートが多いときは折り返す */
    gap: 8px 16px;
  }
  .part-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: 1px solid #ddd;
    border-radius: 6px;
  }
  /* 鳴らないパートの行は、うすくする */
  .part-row.silent {
    opacity: 0.45;
  }
  .part-name {
    font-size: 14px;
    min-width: 72px;
  }
  .toggle {
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 13px;
    font-weight: bold;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  /* 入っているミュートは赤、ソロは黄色 */
  .toggle.mute.on {
    background: #dc2626;
    border-color: #dc2626;
    color: #fff;
  }
  .toggle.solo.on {
    background: #facc15;
    border-color: #eab308;
    color: #222;
  }
  input[type="range"] {
    width: 120px;
    cursor: pointer;
  }
  .volume {
    font-size: 13px;
    min-width: 28px; /* 数字の桁が変わっても、行の幅が動かないように */
    text-align: right;
    color: #444;
  }
  /* メトロノームの入・切のボタン（ステップ12-4a） */
  .switch {
    height: 32px;
    padding: 0 12px;
    font-size: 13px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  /* 入っているときは青 */
  .switch.on {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }
  /* くり返す範囲の文字（ステップ12-5b） */
  .repeat-range {
    font-size: 13px;
    color: #2563eb;
  }
</style>
