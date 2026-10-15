<script>
  // ==========================================================
  // SymbolTools.svelte
  // 「記号」タブの中身（音符1つに付ける記号のボタン）
  // ボタンを押すと記号が付き、もう一度押すと外れる
  // 選んでいる音にすでに付いている記号のボタンは青くなる
  // （ステップ4-6：範囲に付けるスラー・松葉のボタンを追加）
  // ==========================================================
  import { BOWINGS, ARTICULATIONS, STRING_MARKS, FERMATA, FINGERINGS, TECHNIQUES, DYNAMICS } from "#lib/score/symbols.js";

  // 親から受け取るもの
  //   note     … 選んでいる音符のデータ（音符を選んでいないときは null）
  //   onsymbol … ボタンが押されたときに呼ぶ関数（記号の種類と名前を渡す）
  //              例：onsymbol('bowing', 'down')、onsymbol('fingering', 2)
  //   spanState    … 選んだ範囲に付いているスラー・松葉 { slur: true / false, wedge: 'crescendo' / 'diminuendo' / null }
  //   canSpanRange … 範囲にスラー・松葉を付けられるか（範囲の中に音符が2つ以上あるか）
  //   onspanner    … スラー・松葉のボタンが押されたときに呼ぶ関数（'slur'・'crescendo'・'diminuendo' を渡す）
  let { note = null, onsymbol = () => {}, spanState = { slur: false, wedge: null }, canSpanRange = false, onspanner = () => {} } = $props();

  // 音符を選んでいないときは、ボタンを全部押せないようにする
  let disabled = $derived(!note);
</script>

<div class="symbol-tools">
  <!-- 弓 -->
  <div class="group" title="弓">
    {#each Object.entries(BOWINGS) as [name, symbol] (name)}
      <button class="tool" class:on={note?.bowing === name} {disabled} onclick={() => onsymbol("bowing", name)} title={symbol.label} aria-label={symbol.label}>
        <span class="icon bow">{symbol.icon}</span>
      </button>
    {/each}
  </div>

  <!-- 指番号 -->
  <div class="group" title="指番号">
    {#each FINGERINGS as number (number)}
      <button class="tool text" class:on={(note?.fingerings ?? []).includes(number)} {disabled} onclick={() => onsymbol("fingering", number)} title="指番号 {number}" aria-label="指番号 {number}">
        {number}
      </button>
    {/each}
  </div>

  <!-- スタッカート・テヌート・アクセント・フェルマータ -->
  <div class="group">
    {#each Object.entries(ARTICULATIONS) as [name, symbol] (name)}
      <button class="tool" class:on={(note?.articulations ?? []).includes(name)} {disabled} onclick={() => onsymbol("articulation", name)} title={symbol.label} aria-label={symbol.label}>
        <span class="icon artic">{symbol.icon}</span>
      </button>
    {/each}
    <button class="tool" class:on={!!note?.fermata} {disabled} onclick={() => onsymbol("fermata")} title={FERMATA.label} aria-label={FERMATA.label}>
      <span class="icon fermata">{FERMATA.icon}</span>
    </button>
  </div>

  <!-- 弦楽器の記号（ハーモニクス・左手ピチカート・バルトーク・ピチカート）（ステップ11-1b） -->
  <div class="group">
    {#each Object.entries(STRING_MARKS) as [name, symbol] (name)}
      <button class="tool" class:on={(note?.stringMarks ?? []).includes(name)} {disabled} onclick={() => onsymbol("stringMark", name)} title={symbol.label} aria-label={symbol.label}>
        <span class="icon string-mark">{symbol.icon}</span>
      </button>
    {/each}
  </div>

  <!-- 奏法 -->
  <div class="group">
    {#each Object.entries(TECHNIQUES) as [name, symbol] (name)}
      <button class="tool text wide" class:on={(note?.techniques ?? []).includes(name)} {disabled} onclick={() => onsymbol("technique", name)} title={symbol.label} aria-label={symbol.label}>
        <i>{symbol.text}</i>
      </button>
    {/each}
  </div>

  <!-- 強弱 -->
  <div class="group">
    {#each Object.entries(DYNAMICS) as [name, symbol] (name)}
      <button class="tool" class:on={note?.dynamic === name} {disabled} onclick={() => onsymbol("dynamic", name)} title={symbol.label} aria-label={symbol.label}>
        <span class="icon dynamic">{symbol.glyph}</span>
      </button>
    {/each}
  </div>

  <!-- スラー・松葉（範囲を選んだときだけ押せる） -->
  <div class="group">
    <button class="tool text wide" class:on={spanState.slur} disabled={!canSpanRange} onclick={() => onspanner("slur")} title="スラー（S）（Shift＋クリックで範囲を選んでから押す）"> スラー </button>
    <button
      class="tool text"
      class:on={spanState.wedge === "crescendo"}
      disabled={!canSpanRange}
      onclick={() => onspanner("crescendo")}
      title="クレッシェンド（Shift＋クリックで範囲を選んでから押す）"
      aria-label="クレッシェンド"
    >
      ＜
    </button>
    <button
      class="tool text"
      class:on={spanState.wedge === "diminuendo"}
      disabled={!canSpanRange}
      onclick={() => onspanner("diminuendo")}
      title="ディミヌエンド（Shift＋クリックで範囲を選んでから押す）"
      aria-label="ディミヌエンド"
    >
      ＞
    </button>
  </div>
</div>

<style>
  .symbol-tools {
    display: flex;
    flex-wrap: wrap; /* 画面が狭いときは折り返す */
    align-items: center;
    gap: 12px;
  }
  .group {
    display: flex;
    gap: 3px;
  }
  .tool {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    font-size: 15px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .tool.wide {
    width: 52px;
  }
  .tool.on {
    background: #2563eb; /* 付いている記号は青 */
    color: #fff;
    border-color: #2563eb;
  }
  .tool:disabled {
    opacity: 0.35; /* 押せないものはうすく */
    cursor: not-allowed;
  }
  .icon {
    font-family: "Bravura"; /* 楽譜用フォント */
    font-size: 24px;
    line-height: 1;
    position: relative; /* 記号ごとに上下の位置を調整する */
    pointer-events: none; /* 文字の透明な箱がタブに重なっても、マウスの操作を受け取らない */
  }
  /* Bravura の記号は形によって文字の基準線からの位置が違うので、まん中に見えるよう少しずつずらす */
  .icon.bow {
    top: 6px;
  }
  .icon.artic {
    top: 2px;
  }
  .icon.fermata {
    top: 8px;
  }
  .icon.string-mark {
    top: 6px; /* ステップ11-1b */
    font-size: 32px; /* ハーモニクスなどは形が小さいので、ほかより大きく出す */
  }
  .icon.dynamic {
    top: -2px;
  }
</style>
