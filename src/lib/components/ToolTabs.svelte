<script>
  // ==========================================================
  // ToolTabs.svelte
  // 道具のタブ（音符・記号・小節・パート・楽譜の設定）
  // タブを押すと、その下に並ぶボタンが切り替わる
  // （ステップ4-2：「音符」タブに長さ・付点・休符のボタンを追加）
  // （ステップ4-3：臨時記号・高さ・タイ・削除のボタンを追加）
  // （ステップ4-4：上書き・挿入の切り替えを追加）
  // （ステップ4-5：「記号」タブの中身を SymbolTools として追加）
  // （ステップ4-7a：範囲を選んでいるときも ▲ ▼・削除を押せるようにする。説明にキーの名前を追加）
  // （ステップ4-7b：休符のボタンを押せるかどうかを、鍵盤と同じ判定にする）
  // （ステップ5-1：「楽譜の設定」タブの中身を ScoreSettings として追加）
  // （ステップ5-2：「小節」タブの中身を MeasureTools として追加）
  // （ステップ5-6：「パート」タブを追加。中身は PartTools）
  // （ステップ5-7：「音符」タブにコピー・切り取り・貼り付けのボタンを追加）
  // （ステップ10-2：「音符」タブに［3連符］のボタンを追加）
  // （ステップ11-2：「奏法」タブを追加。中身は TechniqueTools）
  // ボタンの記号は、五線譜と同じ楽譜用フォント（Bravura）で描く
  // ==========================================================
  import { untrack } from "svelte";
  import { DURATION_ORDER } from "#lib/score/model.js";
  import SymbolTools from "./SymbolTools.svelte";
  import TechniqueTools from "./TechniqueTools.svelte";
  import ScoreSettings from "./ScoreSettings.svelte";
  import MeasureTools from "./MeasureTools.svelte";
  import PartTools from "./PartTools.svelte";

  // 親から受け取るもの
  //   duration     … 今の長さ（'quarter' など）
  //   dotted       … 付点が付いているか（true / false）
  //   canUse       … その長さ（＋付点）が使えるかを調べる関数 canUse(duration, dots) → true / false
  //   onduration   … 長さのボタンが押されたときに呼ぶ関数（長さの名前を渡す）
  //   ondot        … 付点のボタンが押されたときに呼ぶ関数
  //   onrest       … 休符のボタンが押されたときに呼ぶ関数
  //   canRest      … 休符のボタンを押せるか（今の長さの休符を、選んでいる場所に入れられるか）
  //   noteSelected … 音符（休符ではない）を選んでいるか（false なら臨時記号などのボタンを押せない）
  //   rangeEditable … 選んだ範囲の中に音符があるか（true なら ▲ ▼・削除のボタンを押せる）
  //   onaccidental … 臨時記号のボタンが押されたときに呼ぶ関数（1：♯、-1：♭、0：♮ を渡す）
  //   onstep       … ▲ ▼ が押されたときに呼ぶ関数（1：半音上、-1：半音下 を渡す）
  //   ontie        … タイのボタンが押されたときに呼ぶ関数
  //   ondelete     … 削除のボタンが押されたときに呼ぶ関数
  //   mode         … 入力のしかた（'overwrite'：上書き、'insert'：挿入）
  //   onmode       … 切り替えのボタンが押されたときに呼ぶ関数（'overwrite' か 'insert' を渡す）
  //   selectedNote … 選んでいる音符のデータ（音符を選んでいないときは null。「記号」タブで使う）
  //   onsymbol     … 「記号」タブのボタンが押されたときに呼ぶ関数（記号の種類と名前を渡す）
  //   spanState    … 選んだ範囲に付いているスラー・松葉（「記号」タブで使う）
  //   canSpanRange … 範囲にスラー・松葉を付けられるか（「記号」タブで使う）
  //   onspanner    … スラー・松葉のボタンが押されたときに呼ぶ関数（「記号」タブで使う）
  //   score        … 楽譜データ（「楽譜の設定」タブで、今の値を出すのに使う）
  //   onsettings   … 「楽譜の設定」タブで値が確定したときに呼ぶ関数（項目の名前と値を渡す）
  //   canDeleteMeasure … 小節を消せるか（「小節」タブで使う）
  //   onmeasure    … 「小節」タブのボタンが押されたときに呼ぶ関数（"before"・"after"・"delete" を渡す）
  //   currentTime  … 選んでいる小節の拍子 { beats, beatType }（「小節」タブで使う）
  //   ontime       … 拍子のボタンが押されたときに呼ぶ関数（新しい拍子を渡す。「小節」タブで使う）
  //   currentKey   … 選んでいる小節の調（「小節」タブで使う）
  //   onkey        … 調を選んだときに呼ぶ関数（新しい調の数字を渡す。「小節」タブで使う）
  //   currentClef  … 選んでいるパート・小節の音部記号（何も選んでいないときは null。「小節」タブで使う）
  //   onclef       … 音部記号のボタンが押されたときに呼ぶ関数（「小節」タブで使う）
  //   selectedPart … 選んでいるパートの番号（何も選んでいないときは null。「パート」タブで使う）
  //   onaddpart    … パートの追加のボタンが押されたときに呼ぶ関数（「パート」タブで使う）
  //   onmovepart   … パートの ↑ ↓ が押されたときに呼ぶ関数（「パート」タブで使う）
  //   ondeletepart … パートの削除が押されたときに呼ぶ関数（「パート」タブで使う）
  //   canCopy      … コピー・切り取りができるか（音か範囲を選んでいるか）
  //   canPaste     … 貼り付けができるか（コピーした音があって、場所を選んでいるか）
  //   onclipboard  … コピー・切り取り・貼り付けのボタンが押されたときに呼ぶ関数（"copy"・"cut"・"paste" を渡す）
  //   isNew        … 新しく作った楽譜か（true なら「楽譜の設定」タブで始めて、タイトルの入力欄にカーソルを入れる）（ステップ7-3）
  //   canTuplet    … 連符のボタンを押せるか（音か休符を選んでいるか）（ステップ10-2）
  //   ontuplet     … 連符のボタンが押されたときに呼ぶ関数（連符の数字を渡す）（ステップ10-2）
  //   inTuplet     … 選んでいる音が連符の中か（true なら［連符を解除］のボタンを出す）（ステップ10-3）
  //   onremovetuplet … ［連符を解除］が押されたときに呼ぶ関数（ステップ10-3）
  let {
    canTuplet = false,
    ontuplet = () => {},
    inTuplet = false,
    onremovetuplet = () => {},
    isNew = false,
    score,
    onsettings = () => {},
    canDeleteMeasure = false,
    onmeasure = () => {},
    currentTime = { beats: 4, beatType: 4 },
    ontime = () => {},
    currentKey = 0,
    onkey = () => {},
    currentClef = null,
    onclef = () => {},
    selectedPart = null,
    onaddpart = () => {},
    onmovepart = () => {},
    ondeletepart = () => {},
    canCopy = false,
    canPaste = false,
    onclipboard = () => {},
    selectedNote = null,
    onsymbol = () => {},
    spanState = { slur: false, wedge: null },
    canSpanRange = false,
    onspanner = () => {},
    mode = "overwrite",
    onmode = () => {},
    duration,
    dotted,
    canUse = () => true,
    onduration = () => {},
    ondot = () => {},
    onrest = () => {},
    canRest = true,
    noteSelected = false,
    rangeEditable = false,
    onaccidental = () => {},
    onstep = () => {},
    ontie = () => {},
    ondelete = () => {},
  } = $props();

  // タブの一覧（id はプログラムの中で使う名前、label は画面に出す名前）
  const TABS = [
    { id: "note", label: "音符" },
    { id: "symbol", label: "記号" },
    { id: "technique", label: "奏法" }, // ステップ11-2
    { id: "measure", label: "小節" },
    { id: "part", label: "パート" },
    { id: "settings", label: "楽譜の設定" },
  ];

  // 長さのボタンに出す記号と名前
  //   icon … 楽譜用フォント（Bravura）の文字。Bravura では音楽記号に決まった番号が付いている
  //   name … マウスを乗せたときに出す名前
  //   flat … 符尾のない平たい記号なら true（下にずらさなくてよいので、位置の調整を変える）
  //   key  … ショートカットのキー（マウスを乗せたときの説明に出す）
  const DURATION_LABELS = {
    whole: { icon: "\uE1D2", name: "全音符", flat: true, key: "7" },
    half: { icon: "\uE1D3", name: "2分音符", key: "6" },
    quarter: { icon: "\uE1D5", name: "4分音符", key: "5" },
    eighth: { icon: "\uE1D7", name: "8分音符", key: "4" },
    "16th": { icon: "\uE1D9", name: "16分音符", key: "3" },
  };

  // 付点・休符のボタンに出す記号（楽譜用フォントの文字）
  const DOT_ICON = "\uE1D5\uE1E7"; // 4分音符＋付点
  const REST_ICON = "\uE4E5"; // 4分休符

  // 臨時記号のボタン（alter：音の高さをどれだけ変えるか、icon：楽譜用フォントの文字）
  const ACCIDENTALS = [
    { alter: 1, icon: "\uE262", name: "シャープ（♯）" },
    { alter: -1, icon: "\uE260", name: "フラット（♭）" },
    { alter: 0, icon: "\uE261", name: "ナチュラル（♮）" },
  ];

  // 今選んでいるタブ（新しく作った楽譜なら「楽譜の設定」、それ以外は「音符」で始める）
  // untrack：isNew の「最初の値だけ」を使う、という意味（あとで isNew が変わっても、タブは変えない）
  let activeTab = $state(untrack(() => isNew) ? "settings" : "note");

  // 「楽譜の設定」タブを出したときに、タイトルの入力欄にカーソルを入れるか
  // （最初の1回だけ。タブを押したら false にして、あとで「楽譜の設定」に戻ってきても入れない）
  let focusTitle = $state(untrack(() => isNew));
</script>

<div class="tool-tabs">
  <!-- タブのボタンの並び -->
  <div class="tab-list">
    {#each TABS as tab (tab.id)}
      <button
        class="tab"
        class:active={activeTab === tab.id}
        onclick={() => {
          activeTab = tab.id;
          focusTitle = false;
        }}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- 選んでいるタブの中身 -->
  <div class="tab-content">
    {#if activeTab === "note"}
      <!-- 入力のしかたの切り替え（上書き・挿入） -->
      <div class="mode-switch">
        <button class:on={mode === "overwrite"} onclick={() => onmode("overwrite")} title="選んでいる所を新しい音に置き換える（I キーで切り替え）"> 上書き </button>
        <button class:on={mode === "insert"} onclick={() => onmode("insert")} title="選んでいる音の前に入れて、後ろの音をずらす（I キーで切り替え）"> 挿入 </button>
      </div>

      <!-- 長さのボタン（今の長さは色が付く。入らない長さは押せない） -->
      <div class="group">
        {#each DURATION_ORDER as d (d)}
          <button
            class="tool"
            class:on={duration === d}
            disabled={!canUse(d, dotted ? 1 : 0) && !canUse(d, 0)}
            onclick={() => onduration(d)}
            title="{DURATION_LABELS[d].name}（{DURATION_LABELS[d].key}）"
            aria-label={DURATION_LABELS[d].name}
          >
            <span class="icon" class:flat={DURATION_LABELS[d].flat}>{DURATION_LABELS[d].icon}</span>
          </button>
        {/each}
      </div>

      <!-- 付点 -->
      <div class="group">
        <button class="tool" class:on={dotted} onclick={() => ondot()} title="付点（.）" aria-label="付点">
          <span class="icon">{DOT_ICON}</span>
        </button>
      </div>

      <!-- 休符 -->
      <div class="group">
        <button class="tool" disabled={!canRest} onclick={() => onrest()} title="休符にする（0）" aria-label="休符にする">
          <span class="icon flat">{REST_ICON}</span>
        </button>
      </div>

      <!-- 連符（音か休符を選んでいるときだけ押せる）（ステップ10-2） -->
      <!-- 連符の中の音を選んでいるときは、かわりに［連符を解除］を出す（ステップ10-3） -->
      <div class="group">
        {#if inTuplet}
          <button class="tool text clip" onclick={() => onremovetuplet()} title="選んでいる音が入っている連符を、ふつうの音符に戻す（入りきらない音は消える）"> 連符を解除 </button>
        {:else}
          <button class="tool text clip" disabled={!canTuplet} onclick={() => ontuplet(3)} title="選んでいる音の長さで3連符を作る（例：8分音符を選んで押すと、8分音符2つ分に3つ入る）"> 3連符 </button>
          <!-- ほかの連符（2〜12連符）は、プルダウンから選ぶ（ステップ10-3） -->
          <!-- 選んだらすぐ連符を作り、表示は「その他」に戻す -->
          <select
            class="tool-select"
            disabled={!canTuplet}
            value=""
            onchange={(event) => {
              const actual = Number(event.currentTarget.value);
              event.currentTarget.value = ""; // 「その他」に戻す（同じ数字をもう一度選べるように）
              if (actual) ontuplet(actual);
            }}
            title="ほかの連符を作る（選んでいる音の長さで作る）"
          >
            <option value="">その他</option>
            {#each [2, 4, 5, 6, 7, 8, 9, 10, 11, 12] as n (n)}
              <option value={n}>{n}連符</option>
            {/each}
          </select>
        {/if}
      </div>

      <!-- 臨時記号（音符を選んでいるときだけ押せる） -->
      <div class="group">
        {#each ACCIDENTALS as acc (acc.alter)}
          <button class="tool" disabled={!noteSelected} onclick={() => onaccidental(acc.alter)} title={acc.name} aria-label={acc.name}>
            <span class="icon accidental">{acc.icon}</span>
          </button>
        {/each}
      </div>

      <!-- 半音上げる・下げる -->
      <div class="group">
        <button class="tool text" disabled={!noteSelected && !rangeEditable} onclick={() => onstep(1)} title="半音上げる（↑。⌘ / Ctrl＋↑ で1オクターブ）"> ▲ </button>
        <button class="tool text" disabled={!noteSelected && !rangeEditable} onclick={() => onstep(-1)} title="半音下げる（↓。⌘ / Ctrl＋↓ で1オクターブ）"> ▼ </button>
      </div>

      <!-- タイ・削除 -->
      <div class="group">
        <button class="tool text wide" disabled={!noteSelected} onclick={() => ontie()} title="次の音とタイでつなぐ（T）"> タイ </button>
        <button class="tool text wide" disabled={!noteSelected && !rangeEditable} onclick={() => ondelete()} title="音符を休符にする（Delete）。範囲を選んでいるときは、範囲の中をぜんぶ休符にする">
          削除
        </button>
      </div>

      <!-- コピー・切り取り・貼り付け -->
      <div class="group">
        <button class="tool text clip" disabled={!canCopy} onclick={() => onclipboard("copy")} title="選んでいる音（範囲）をコピーする（⌘ / Ctrl＋C）"> コピー </button>
        <button class="tool text clip" disabled={!canCopy} onclick={() => onclipboard("cut")} title="コピーしてから、音符を休符にする（⌘ / Ctrl＋X）"> 切り取り </button>
        <button class="tool text clip" disabled={!canPaste} onclick={() => onclipboard("paste")} title="選んでいる音の頭から、コピーした音を上書きで貼り付ける（⌘ / Ctrl＋V）"> 貼り付け </button>
      </div>
    {:else if activeTab === "symbol"}
      <SymbolTools note={selectedNote} {onsymbol} {spanState} {canSpanRange} {onspanner} />
    {:else if activeTab === "technique"}
      <!-- 選んでいるパートの楽器を渡す（楽器にない弦の指定のボタンを押せないようにするため）（ステップ11-2） -->
      <TechniqueTools note={selectedNote} instrument={selectedPart !== null ? score.parts[selectedPart].instrument : null} {onsymbol} />
    {:else if activeTab === "measure"}
      <MeasureTools canDelete={canDeleteMeasure} {onmeasure} {currentTime} {ontime} {currentKey} {onkey} {currentClef} {onclef} />
    {:else if activeTab === "part"}
      <PartTools parts={score.parts} {selectedPart} {onaddpart} {onmovepart} {ondeletepart} />
    {:else if activeTab === "settings"}
      <ScoreSettings {score} {onsettings} {focusTitle} />
    {/if}
  </div>
</div>

<style>
  .tool-tabs {
    border-bottom: 1px solid #ddd;
    background: #fff;
  }
  .tab-list {
    display: flex; /* タブを横に並べる */
    gap: 2px;
    padding: 6px 16px 0;
  }
  .tab {
    padding: 6px 16px;
    border: 1px solid #ddd;
    border-bottom: none;
    border-radius: 6px 6px 0 0; /* 上の角だけ丸くする */
    background: #f3f4f6;
    cursor: pointer;
  }
  .tab.active {
    background: #fff; /* 選んでいるタブは白くして、中身とつながって見えるようにする */
    font-weight: bold;
  }
  .tab-content {
    min-height: 44px; /* ボタンが並ぶ高さを先に確保しておく */
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 16px;
    border-top: 1px solid #ddd;
  }
  .group {
    display: flex;
    gap: 4px;
  }
  .tool {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px; /* 記号だけのボタンなので、幅をそろえる */
    height: 40px;
    padding: 0;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .tool.on {
    background: #2563eb; /* 選んでいるものは青 */
    color: #fff;
    border-color: #2563eb;
  }
  .tool:disabled {
    opacity: 0.35; /* 押せないものはうすく */
    cursor: not-allowed;
  }
  .icon {
    font-family: "Bravura"; /* 楽譜用フォント（VexFlow が読み込んだもの） */
    font-size: 24px;
    line-height: 1;
    /* Bravura の音符は、玉が文字の基準線の上にあって符尾が上に長く伸びる形なので、
		   そのままだとボタンの上にはみ出す。少し下にずらしてまん中に見せる */
    position: relative;
    top: 9px;
    /* 楽譜用フォントの文字は、見た目より上に大きく広がった「透明な箱」を持つので、
		   その箱がタブのボタンに重なって、タブを押したつもりがこのボタンを押したことになっていた。
		   マウスの操作をこの文字では受け取らず、下にあるものに通す */
    pointer-events: none;
  }
  .icon.flat {
    top: -1px; /* 全音符・休符は符尾がないので、ずらす量を小さくする */
  }
  .icon.accidental {
    top: 0; /* 臨時記号は文字の基準線の上下にまたがる形なので、ずらさない */
  }
  .tool.text {
    font-size: 15px; /* 文字のボタン（▲ ▼ タイ 削除） */
  }
  .tool.wide {
    width: 52px;
  }
  .tool.clip {
    width: auto; /* コピーなどは文字が長いので、文字に合わせた幅にする */
    padding: 0 10px;
    font-size: 14px;
  }
  .tool-select {
    height: 40px; /* ボタンと同じ高さ（その他の連符のプルダウン）（ステップ10-3） */
    padding: 0 4px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
  }
  .tool-select:disabled {
    opacity: 0.35; /* 押せないときはうすく（ボタンと同じ） */
    cursor: not-allowed;
  }
  .mode-switch {
    display: flex; /* 2つのボタンをくっつけて並べる */
    border: 1px solid #ccc;
    border-radius: 4px;
    overflow: hidden; /* 角の丸みからボタンがはみ出さないようにする */
  }
  .mode-switch button {
    height: 40px;
    padding: 0 12px;
    font-size: 14px;
    border: none;
    background: #fff;
    cursor: pointer;
  }
  .mode-switch button + button {
    border-left: 1px solid #ccc; /* 2つのボタンの間の線 */
  }
  .mode-switch button.on {
    background: #f59e0b; /* 今のモードはオレンジ（長さのボタンの青と区別する） */
    color: #fff;
    font-weight: bold;
  }
</style>
