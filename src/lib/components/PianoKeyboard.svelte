<script>
  // ==========================================================
  // PianoKeyboard.svelte
  // 画面の下に出す鍵盤
  // （ステップ4-1では見た目だけ。押して音を入れるのはステップ4-2で作る）
  // ==========================================================

  // 親から受け取るもの
  //   startOctave … 一番左のドのオクターブ（4 なら ド4 から）
  //   octaves     … 何オクターブ分を並べるか
  let { startOctave = 3, octaves = 3 } = $props();

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
  <div class="keyboard" style="width: {whiteKeys.length * WHITE_WIDTH}px">
    <!-- 白鍵 -->
    {#each whiteKeys as key (key.step + key.octave)}
      <div class="white-key" style="width: {WHITE_WIDTH}px">
        <!-- ドの鍵盤にだけ、オクターブの数字も付ける（どこが何オクターブかわかるように） -->
        <span class="label">{STEP_NAMES[key.step]}{key.step === "C" ? key.octave : ""}</span>
      </div>
    {/each}

    <!-- 黒鍵（白鍵の上に重ねる） -->
    {#each blackKeys as key (key.step + key.octave)}
      <div class="black-key" style="left: {key.left}px"></div>
    {/each}
  </div>
</div>

<style>
  .keyboard-area {
    display: flex;
    justify-content: center; /* 鍵盤を中央に置く */
    padding: 8px 16px;
    background: #f3f4f6;
    border-top: 1px solid #ddd;
    overflow-x: auto; /* 画面が狭いときは横スクロール */
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
    padding-bottom: 6px;
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
    border-radius: 0 0 3px 3px;
  }
</style>
