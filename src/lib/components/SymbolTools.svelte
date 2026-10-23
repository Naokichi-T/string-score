<script>
  // ==========================================================
  // SymbolTools.svelte
  // 「記号」タブの中身（音符1つに付ける記号のボタン）
  // ボタンを押すと記号が付き、もう一度押すと外れる
  // 選んでいる音にすでに付いている記号のボタンは青くなる
  // （ステップ4-6：範囲に付けるスラー・松葉のボタンを追加）
  // （ステップ14-6a：トレモロの斜線のボタンの右に、［2音トレモロ］のボタンを追加）
  // （ステップ24-1：前打音を選んでいるときは、前打音のボタンだけを押せるようにする）
  // （ステップ24-2：重音にも前打音を付けられるようにする。前打音を選んでいるときは、指番号も押せる（前打音に付く））
  // ==========================================================
  import {
    BOWINGS,
    ARTICULATIONS,
    STRING_MARKS,
    BREATHS,
    ORNAMENTS,
    TREMOLOS,
    FERMATA,
    GLISSANDO,
    GRACES,
    FINGERINGS,
    DYNAMICS,
    ARPEGGIO,
    ARTIFICIAL_HARMONIC,
    DIAMOND_HEAD,
    ALTERNATE_TREMOLO,
  } from "#lib/score/symbols.js";
  import { notePitches, hasDiamond, canAlternate, isAlternate } from "#lib/score/model.js";

  // 親から受け取るもの
  //   note     … 選んでいる音符のデータ（音符を選んでいないときは null）
  //   onsymbol … ボタンが押されたときに呼ぶ関数（記号の種類と名前を渡す）
  //              例：onsymbol('bowing', 'down')、onsymbol('fingering', 2)
  //   spanState    … 選んだ範囲に付いているスラー・松葉 { slur: true / false, wedge: 'crescendo' / 'diminuendo' / null }
  //   canSpanRange … 範囲にスラー・松葉を付けられるか（範囲の中に音符が2つ以上あるか）
  //   canWedgeNote … 選んでいる1つの音符の下だけに松葉を付けられるか（ステップ16-1）
  //                  （このときの spanState.wedge は、その音符の下だけの松葉）
  //   onspanner    … スラー・松葉のボタンが押されたときに呼ぶ関数（'slur'・'crescendo'・'diminuendo' を渡す）
  //   canGlissando … 選んでいる音にグリッサンドを付けられるか（次の音が音符で、タイが付いていないか）（ステップ11-5a）
  //   head         … 重音の中で選んでいる玉の番号（低い順。0 から。［ひし形］のボタンを青くするのに使う）（ステップ14-5a）
  //   graceSelected … 前打音を選んでいるか（true のときの note は、その主音のデータ）（ステップ24-1）
  let {
    note = null,
    onsymbol = () => {},
    spanState = { slur: false, wedge: null },
    canSpanRange = false,
    canWedgeNote = false,
    onspanner = () => {},
    canGlissando = false,
    head = 0,
    graceSelected = false,
  } = $props();

  // 音符を選んでいないときは、ボタンを全部押せないようにする
  // 前打音を選んでいるときも、前打音のボタン以外は押せないようにする（ステップ24-1）
  let disabled = $derived(!note || graceSelected);

  // 前打音のボタンを押せないか（音符を選んでいないときだけ押せない。前打音を選んでいても押せる）（ステップ24-1）
  // 指番号のボタンも同じ（前打音を選んでいるときは、前打音に付く）（ステップ24-2）
  let graceDisabled = $derived(!note);

  // 指番号のボタンを青くするための、今付いている指番号（前打音を選んでいるときは前打音のもの）（ステップ24-2）
  let fingerings = $derived((graceSelected ? note?.grace?.fingerings : note?.fingerings) ?? []);

  // 選んでいる音符が重音か（重音には、装飾・前打音を付けられない。もう付いているものは、外すために押せる）（ステップ14-1）
  let isChord = $derived(!!note?.chord);

  // 選んでいる音符に、ひし形の玉（ハーモニクス）があるか（ステップ14-5a）
  let isHarmonic = $derived(!!note && hasDiamond(note));

  // 選んでいる玉が、ひし形か（［ひし形］のボタンを青くする）（ステップ14-5a）
  let headIsDiamond = $derived(!!note && !!notePitches(note)[head]?.diamond);

  // 選んでいる音符が2音トレモロか・2音トレモロにできるか（ステップ14-6a）
  let alternateOn = $derived(!!note && isAlternate(note));
  let alternateOk = $derived(!!note && canAlternate(note));
</script>

<div class="symbol-tools">
  <!-- 1行目（どの画面の幅でも、ここで行を分ける。狭すぎるときだけ、行の中で折り返す）（後で直す候補の手直し） -->
  <div class="row">
    <!-- 弓 -->
    <div class="group" title="弓">
      {#each Object.entries(BOWINGS) as [name, symbol] (name)}
        <button class="tool" class:on={note?.bowing === name} {disabled} onclick={() => onsymbol("bowing", name)} title={symbol.label} aria-label={symbol.label}>
          <span class="icon bow">{symbol.icon}</span>
        </button>
      {/each}
    </div>

    <!-- 指番号（前打音を選んでいるときは、前打音に付く）（ステップ24-2） -->
    <div class="group" title="指番号">
      {#each FINGERINGS as number (number)}
        <button
          class="tool text"
          class:on={fingerings.includes(number)}
          disabled={graceDisabled}
          onclick={() => onsymbol("fingering", number)}
          title={graceSelected ? `指番号 ${number}（前打音に付ける）` : `指番号 ${number}`}
          aria-label="指番号 {number}"
        >
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

    <!-- 人工ハーモニクス（1音の音符のときに押せる。ひし形のある音符では、外すために押せる）（ステップ14-5a） -->
    <!-- ひし形（選んでいる玉を、ひし形にする・戻す）（ステップ14-5a） -->
    <div class="group">
      <button
        class="tool"
        class:on={isHarmonic}
        disabled={disabled || (isChord && !isHarmonic)}
        onclick={() => onsymbol("artificialHarmonic")}
        title={isChord && !isHarmonic ? `${ARTIFICIAL_HARMONIC.label}（ひし形のない重音には付けられません）` : ARTIFICIAL_HARMONIC.label}
        aria-label={ARTIFICIAL_HARMONIC.label}
      >
        <!-- 白抜きのひし形（触れる音）と、黒い玉（押さえる音）と符尾を SVG で描く -->
        <svg class="harmonic-icon" width="22" height="30" viewBox="0 0 22 30">
          <path d="M8 5 L12 1.5 L16 5 L12 8.5 Z" fill="none" stroke="currentColor" stroke-width="1.5" />
          <ellipse cx="12" cy="13" rx="4" ry="3" transform="rotate(-20 12 13)" fill="currentColor" />
          <line x1="15.7" y1="12" x2="15.7" y2="28" stroke="currentColor" stroke-width="1.3" />
        </svg>
      </button>
      <button class="tool" class:on={headIsDiamond} {disabled} onclick={() => onsymbol("diamond")} title={DIAMOND_HEAD.label} aria-label={DIAMOND_HEAD.label}>
        <!-- 白抜きのひし形の玉だけを SVG で描く -->
        <svg class="harmonic-icon" width="22" height="22" viewBox="0 0 22 22">
          <path d="M5 11 L11 5 L17 11 L11 17 Z" fill="none" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </button>
    </div>

    <!-- 装飾（トリルなど）（ステップ11-3a） -->
    <div class="group">
      {#each Object.entries(ORNAMENTS) as [name, symbol] (name)}
        <!-- 重音のときは、今付いているもの（外すため）だけ押せる（ステップ14-1） -->
        <button
          class="tool"
          class:on={note?.ornament === name}
          disabled={disabled || (isChord && note?.ornament !== name)}
          onclick={() => onsymbol("ornament", name)}
          title={isChord ? `${symbol.label}（重音には付けられません）` : symbol.label}
          aria-label={symbol.label}
        >
          <span class="icon ornament">{symbol.icon}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- 2行目 -->
  <div class="row">
    <!-- トレモロ（斜線の本数）（ステップ11-4） -->
    <div class="group">
      {#each TREMOLOS as tremolo (tremolo.count)}
        <button class="tool" class:on={note?.tremolo === tremolo.count} {disabled} onclick={() => onsymbol("tremolo", tremolo.count)} title={tremolo.label} aria-label={tremolo.label}>
          <span class="icon tremolo">{tremolo.icon}</span>
        </button>
      {/each}
      <!-- 2音トレモロ（2音の重音で、全・2分・4分音符のときに押せる。2音トレモロなら、ふつうの重音に戻すために押せる）（ステップ14-6a） -->
      <button
        class="tool"
        class:on={alternateOn}
        disabled={disabled || (!alternateOn && !alternateOk)}
        onclick={() => onsymbol("alternate")}
        title={alternateOn || alternateOk ? ALTERNATE_TREMOLO.label : `${ALTERNATE_TREMOLO.label}（2音の重音で、全・2分・4分音符のときだけ付けられます。連符・ひし形の玉のある音符には付けられません）`}
        aria-label={ALTERNATE_TREMOLO.label}
      >
        <!-- 2つの白い玉と符尾のあいだに、離れた連桁を3本描く（SVG） -->
        <svg class="alternate-icon" width="30" height="30" viewBox="0 0 30 30">
          <ellipse cx="6" cy="24" rx="3.6" ry="2.6" transform="rotate(-20 6 24)" fill="none" stroke="currentColor" stroke-width="1.4" />
          <line x1="9.3" y1="23" x2="9.3" y2="3" stroke="currentColor" stroke-width="1.2" />
          <ellipse cx="21" cy="19" rx="3.6" ry="2.6" transform="rotate(-20 21 19)" fill="none" stroke="currentColor" stroke-width="1.4" />
          <line x1="24.3" y1="18" x2="24.3" y2="1" stroke="currentColor" stroke-width="1.2" />
          <path d="M11.5 5 L22 3 L22 5.2 L11.5 7.2 Z" fill="currentColor" />
          <path d="M11.5 9 L22 7 L22 9.2 L11.5 11.2 Z" fill="currentColor" />
          <path d="M11.5 13 L22 11 L22 13.2 L11.5 15.2 Z" fill="currentColor" />
        </svg>
      </button>
    </div>

    <!-- ブレス・カエスーラ（ステップ11-1c） -->
    <div class="group">
      {#each Object.entries(BREATHS) as [name, symbol] (name)}
        <button class="tool" class:on={note?.breath === name} {disabled} onclick={() => onsymbol("breath", name)} title={symbol.label} aria-label={symbol.label}>
          <span class="icon breath">{symbol.icon}</span>
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

    <!-- グリッサンド（ステップ11-5a） -->
    <!-- 付けられないときは押せない。ただし、もう付いている音なら、外すために押せる -->
    <div class="group">
      <button
        class="tool text wide"
        class:on={!!note?.glissando}
        disabled={disabled || (!canGlissando && !note?.glissando)}
        onclick={() => onsymbol("glissando")}
        title={GLISSANDO.label}
        aria-label={GLISSANDO.label}
      >
        <span class="gliss-text">{GLISSANDO.text}</span>
      </button>
    </div>

    <!-- アルペジオ（重音のときだけ押せる。もう付いているものは、外すために押せる）（ステップ14-4a） -->
    <div class="group">
      <button
        class="tool"
        class:on={!!note?.arpeggio}
        disabled={disabled || ((!isChord || isHarmonic) && !note?.arpeggio)}
        onclick={() => onsymbol("arpeggio")}
        title={isChord && !isHarmonic ? ARPEGGIO.label : `${ARPEGGIO.label}（重音のときだけ付けられます。ひし形の玉のある音符には付けられません）`}
        aria-label={ARPEGGIO.label}
      >
        <!-- 縦の波線を SVG で描く（楽譜用フォントの文字だと、ブラウザによってボタンから大きくはみ出したため） -->
        <!-- q は「曲がった線」：右・左に交互にふくらませて、上から下へ4回くねらせる -->
        <svg class="arpeggio-icon" width="16" height="28" viewBox="0 0 16 28">
          <path d="M8 2 q 5 3 0 6 q -5 3 0 6 q 5 3 0 6 q -5 3 0 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <!-- 前打音（短前打音・長前打音）。押したあと、鍵盤で前打音の高さを入れる（ステップ11-8a） -->
    <!-- （ステップ24-1：押すと前打音を選んだ状態になる。前打音を選んでいるときも押せる：同じ種類なら外す・違う種類なら入れ替える） -->
    <!-- （ステップ24-2：重音にも付けられるようにした） -->
    <div class="group">
      {#each Object.entries(GRACES) as [name, symbol] (name)}
        <button class="tool" class:on={note?.grace?.type === name} disabled={graceDisabled} onclick={() => onsymbol("grace", name)} title={symbol.label} aria-label={symbol.label}>
          <span class="icon grace">{symbol.glyph}</span>
        </button>
      {/each}
    </div>

    <!-- スラー・松葉（スラーは範囲を選んだときだけ押せる。松葉は、音符を1つだけ選んだときも押せて、その音符の下だけに付く（ステップ16-1）） -->
    <div class="group">
      <button class="tool text wide" class:on={spanState.slur} disabled={!canSpanRange} onclick={() => onspanner("slur")} title="スラー（S）（Shift＋クリックで範囲を選んでから押す）"> スラー </button>
      <button
        class="tool text"
        class:on={spanState.wedge === "crescendo"}
        disabled={!canSpanRange && !canWedgeNote}
        onclick={() => onspanner("crescendo")}
        title="クレッシェンド（Shift＋クリックで範囲を選んでから押す。音符を1つだけ選んで押すと、その音符の下だけに付く）"
        aria-label="クレッシェンド"
      >
        ＜
      </button>
      <button
        class="tool text"
        class:on={spanState.wedge === "diminuendo"}
        disabled={!canSpanRange && !canWedgeNote}
        onclick={() => onspanner("diminuendo")}
        title="ディミヌエンド（Shift＋クリックで範囲を選んでから押す。音符を1つだけ選んで押すと、その音符の下だけに付く）"
        aria-label="ディミヌエンド"
      >
        ＞
      </button>
    </div>
  </div>
</div>

<style>
  /* 1行目・2行目を縦に並べる（後で直す候補の手直し：どこで行を分けるかを決めた） */
  .symbol-tools {
    display: flex;
    flex-direction: column;
    gap: 12px; /* 行と行の間 */
  }
  /* 1つの行：グループを横に並べる（画面がとても狭いときだけ、行の中で折り返す） */
  .row {
    display: flex;
    flex-wrap: wrap;
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
  .icon.breath {
    top: 10px; /* ステップ11-1c */
  }
  .icon.ornament {
    top: 4px; /* ステップ11-3a */
  }
  .icon.tremolo {
    top: 0; /* ステップ11-4 */
  }
  .icon.dynamic {
    top: -2px;
  }
  /* アルペジオの波線（SVG）。押したときの操作は、下のボタンに通す（ステップ14-4a） */
  /* 人工ハーモニクスの記号（SVG）も同じ（ステップ14-5a） */
  /* 2音トレモロの記号（SVG）も同じ（ステップ14-6a） */
  .arpeggio-icon,
  .harmonic-icon,
  .alternate-icon {
    pointer-events: none;
  }
  .icon.grace {
    top: 6px; /* ステップ11-8a */
  }
  .gliss-text {
    font-style: italic; /* 楽譜の「gliss.」と同じく斜めの文字 ステップ11-5a */
    pointer-events: none;
  }
</style>
