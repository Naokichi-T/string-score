<script>
  // ==========================================================
  // PianoKeyboard.svelte
  // 画面の下に出す鍵盤
  // ・押すと、その音を親に知らせる（onpress）
  // ・◀ ▶ ボタンで1オクターブずつずらす（onshift）
  // ==========================================================

  // 親から受け取るもの
  //   startOctave … 一番左のドのオクターブ（4 なら ド4 から）
  //   octaves     … 何オクターブ分を並べるか
  //   onpress     … 鍵盤が押されたときに呼ぶ関数（{ step, alter, octave } を渡す）
  //                 黒鍵は「左どなりの白鍵の♯」として渡す（♭にするかは親が決める）
  //   onshift     … ◀ ▶ が押されたときに呼ぶ関数（-1 か 1 を渡す）
  let { startOctave = 3, octaves = 3, onpress = () => {}, onshift = () => {} } = $props();

  // 白鍵の音名（1オクターブ分）
  const WHITE_STEPS = ["C", "D", "E", "F", "G", "A", "B"];

  // 白鍵に書く日本語の音名
  const STEP_NAMES = { C: "ド", D: "レ", E: "ミ", F: "ファ", G: "ソ", A: "ラ", B: "シ" };

  // 右どなりに黒鍵がある白鍵（ミとシの右には黒鍵がない）
  const HAS_BLACK_RIGHT = { C: true, D: true, E: false, F: true, G: true, A: true, B: false };

  // 白鍵1つの幅（ピクセル）。黒鍵の位置の計算にも使う
  const WHITE_WIDTH = 40;

  // ----------------------------------------------------------
  // 並べる白鍵の一覧を作る
  // 例：[{ step: 'C', octave: 3 }, { step: 'D', octave: 3 }, ...]
  // 最後に1つ上のドも足して、きりよく終わるようにする
  // ----------------------------------------------------------
  let whiteKeys = $derived.by(() => {
    const keys = [];
    for (let o = 0; o < octaves; o++) {
      for (const step of WHITE_STEPS) {
        keys.push({ step: step, octave: startOctave + o });
      }
    }
    keys.push({ step: "C", octave: startOctave + octaves });
    return keys;
  });

  // ----------------------------------------------------------
  // 並べる黒鍵の一覧を作る
  // 黒鍵は、白鍵と白鍵の境目の上に置く
  //   left … 左からの位置（ピクセル）
  // ----------------------------------------------------------
  let blackKeys = $derived.by(() => {
    const keys = [];
    whiteKeys.forEach((key, index) => {
      // 最後の白鍵の右には黒鍵を置かない
      if (index === whiteKeys.length - 1) return;
      if (!HAS_BLACK_RIGHT[key.step]) return;
      keys.push({
        step: key.step, // この黒鍵は「この白鍵の♯」
        octave: key.octave,
        left: (index + 1) * WHITE_WIDTH - 12, // 境目から黒鍵の幅の半分だけ左
      });
    });
    return keys;
  });
</script>

<div class="keyboard-area">
  <!-- 1オクターブ下へ -->
  <button class="shift" onclick={() => onshift(-1)} title="1オクターブ下へ">◀</button>

  <div class="keyboard" style="width: {whiteKeys.length * WHITE_WIDTH}px">
    <!-- 白鍵 -->
    {#each whiteKeys as key (key.step + key.octave)}
      <button class="white-key" style="width: {WHITE_WIDTH}px" onclick={() => onpress({ step: key.step, alter: 0, octave: key.octave })}>
        <!-- ドの鍵盤にだけ、オクターブの数字も付ける（どこが何オクターブかわかるように） -->
        <span class="label">{STEP_NAMES[key.step]}{key.step === "C" ? key.octave : ""}</span>
      </button>
    {/each}

    <!-- 黒鍵（白鍵の上に重ねる） -->
    {#each blackKeys as key (key.step + key.octave)}
      <button class="black-key" style="left: {key.left}px" aria-label="{STEP_NAMES[key.step]}♯{key.octave}" onclick={() => onpress({ step: key.step, alter: 1, octave: key.octave })}></button>
    {/each}
  </div>

  <!-- 1オクターブ上へ -->
  <button class="shift" onclick={() => onshift(1)} title="1オクターブ上へ">▶</button>
</div>

<style>
  .keyboard-area {
    display: flex;
    justify-content: center; /* 鍵盤を中央に置く */
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #f3f4f6;
    border-top: 1px solid #ddd;
    overflow-x: auto; /* 画面が狭いときは横スクロール */
  }
  .shift {
    height: 60px;
    padding: 0 10px;
    font-size: 16px;
  }
  .keyboard {
    position: relative; /* 黒鍵の位置の基準にする */
    display: flex; /* 白鍵を横に並べる */
    height: 110px;
    flex-shrink: 0;
  }
  .white-key {
    height: 100%;
    background: #fff;
    border: 1px solid #999;
    border-radius: 0 0 4px 4px;
    box-sizing: border-box;
    display: flex;
    align-items: flex-end; /* 音名を下の方に書く */
    justify-content: center;
    padding: 0 0 6px;
    cursor: pointer;
  }
  .white-key:active {
    background: #dbeafe; /* 押している間はうすい青 */
  }
  .label {
    font-size: 11px;
    color: #555;
  }
  .black-key {
    position: absolute;
    top: 0;
    width: 24px;
    height: 65%;
    background: #222;
    border: none;
    border-radius: 0 0 3px 3px;
    padding: 0;
    cursor: pointer;
  }
  .black-key:active {
    background: #2563eb; /* 押している間は青 */
  }
</style>
