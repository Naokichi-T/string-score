<script>
  // ==========================================================
  // MeasureTools.svelte
  // 「小節」タブの中身（小節の追加・削除、拍子の変更のボタン）
  // （ステップ5-2で追加）
  // （ステップ5-3：拍子の変更を追加）
  // ==========================================================

  // 親から受け取るもの
  //   canDelete   … 小節を消せるか（何も選んでいない・小節が1つしか残らないときは false）
  //   onmeasure   … ボタンが押されたときに呼ぶ関数
  //                 "before"（前に追加）・"after"（後ろに追加）・"delete"（削除）を渡す
  //   currentTime … 選んでいる小節の拍子 { beats, beatType }（ボタンを青くするのに使う）
  //   ontime      … 拍子のボタンが押されたときに呼ぶ関数（新しい拍子 { beats, beatType } を渡す）
  let { canDelete = false, onmeasure = () => {}, currentTime = { beats: 4, beatType: 4 }, ontime = () => {} } = $props();

  // よく使う拍子（ボタンにして並べる）
  const PRESETS = [
    { beats: 2, beatType: 4 },
    { beats: 3, beatType: 4 },
    { beats: 4, beatType: 4 },
    { beats: 2, beatType: 2 },
    { beats: 3, beatType: 8 },
    { beats: 6, beatType: 8 },
  ];

  // 「その他」で選べる数字
  const BEATS_CHOICES = Array.from({ length: 16 }, (_, i) => i + 1); // 上の数字：1〜16
  const BEAT_TYPE_CHOICES = [2, 4, 8]; // 下の数字：2・4・8

  // 「その他」で今選んでいる数字
  let otherBeats = $state(5);
  let otherBeatType = $state(4);

  // ----------------------------------------------------------
  // 関数：isCurrent
  // その拍子が、選んでいる小節の拍子と同じか調べる（同じならボタンを青くする）
  // ----------------------------------------------------------
  function isCurrent(time) {
    return time.beats === currentTime.beats && time.beatType === currentTime.beatType;
  }
</script>

<div class="measure-tools">
  <!-- 小節の追加 -->
  <div class="group">
    <button onclick={() => onmeasure("before")} title="選んでいる小節の前に、小節を1つ足す（何も選んでいないときは最後に足す）"> 前に追加 </button>
    <button onclick={() => onmeasure("after")} title="選んでいる小節の後ろに、小節を1つ足す（何も選んでいないときは最後に足す）"> 後ろに追加 </button>
  </div>

  <!-- 小節の削除 -->
  <div class="group">
    <button disabled={!canDelete} onclick={() => onmeasure("delete")} title="選んでいる小節を消す（範囲を選んでいるときは、範囲にかかる小節をまとめて消す）"> 小節を削除 </button>
  </div>

  <!-- 拍子：よく使う拍子のボタン -->
  <div class="group">
    <span class="label">拍子</span>
    {#each PRESETS as time}
      <button class="time" class:active={isCurrent(time)} onclick={() => ontime(time)} title="選んでいる小節から、次に拍子が変わる所までの拍子を変える（範囲を選んでいるときは、範囲にかかる小節だけ）">
        <!-- 分数のように、上の数字と下の数字を縦に並べる -->
        <span class="fraction">
          <span>{time.beats}</span>
          <span>{time.beatType}</span>
        </span>
      </button>
    {/each}
  </div>

  <!-- 拍子：その他（数字を選んで変える） -->
  <div class="group">
    <span class="label">その他</span>
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
</div>

<style>
  .measure-tools {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  button {
    height: 40px;
    padding: 0 14px;
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
    width: 40px;
    padding: 0;
  }
  /* 選んでいる小節と同じ拍子のボタンは青（記号タブと同じ色） */
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
    margin-right: 4px;
  }
  .slash {
    color: #666;
  }
  select {
    height: 40px;
    font-size: 14px;
    padding: 0 4px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
</style>
