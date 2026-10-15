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
  //   onmixer … 設定が変わったときに呼ぶ関数（パートの名札（id）と、変えた項目を渡す）
  //             例：onmixer("pk2qyyj3f", { volume: 80 })、onmixer("pk2qyyj3f", { mute: true })
  let { parts = [], mixer = {}, onmixer = () => {} } = $props();

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
        oninput={(event) => onmixer(part.id, { volume: Number(event.currentTarget.value) })}
        onchange={(event) => event.currentTarget.blur()}
        title="音量"
      />
      <!-- 選択を外すのは、Space キーで再生できるようにするため（つまみを選んだままだと、キーがつまみに取られる） -->

      <!-- 音量の数字 -->
      <span class="volume">{setting.volume}</span>
    </div>
  {/each}
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
</style>
