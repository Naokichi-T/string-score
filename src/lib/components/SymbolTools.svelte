<script>
  // ==========================================================
  // SymbolTools.svelte
  // 「記号」タブの中身（音符1つに付ける記号のボタン）
  // ボタンを押すと記号が付き、もう一度押すと外れる
  // 選んでいる音にすでに付いている記号のボタンは青くなる
  // ==========================================================
  import { BOWINGS, ARTICULATIONS, FERMATA, FINGERINGS, TECHNIQUES, DYNAMICS } from "#lib/score/symbols.js";

  // 親から受け取るもの
  //   note     … 選んでいる音符のデータ（音符を選んでいないときは null）
  //   onsymbol … ボタンが押されたときに呼ぶ関数（記号の種類と名前を渡す）
  //              例：onsymbol('bowing', 'down')、onsymbol('fingering', 2)
  let { note = null, onsymbol = () => {} } = $props();

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
  .icon.dynamic {
    top: -2px;
  }
</style>
