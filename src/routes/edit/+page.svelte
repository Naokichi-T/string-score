<script>
  // ==========================================================
  // 編集ページ（/edit）
  // 楽譜データと「選択中の場所」を持ち、画面の部品に配る
  // （ステップ4-1：音符をクリックで選ぶ・← → で前後へ・Esc で外す）
  // ==========================================================
  import TopBar from "#lib/components/TopBar.svelte";
  import ToolTabs from "#lib/components/ToolTabs.svelte";
  import SelectionInfo from "#lib/components/SelectionInfo.svelte";
  import ScoreView from "#lib/components/ScoreView.svelte";
  import PianoKeyboard from "#lib/components/PianoKeyboard.svelte";
  import { sampleScore } from "#lib/score/sampleScore.js";
  import { moveSelection } from "#lib/score/selection.js";

  // 楽譜データ（ステップ4-1では選ぶ練習のためにお試しの楽譜を使う）
  let score = $state(sampleScore);

  // 選択中の場所 { part, measure, note }（何も選んでいないときは null）
  let selection = $state(null);

  // ----------------------------------------------------------
  // 関数：handleSelect
  // 五線譜で音符がクリックされたとき（ScoreView から呼ばれる）
  // ----------------------------------------------------------
  function handleSelect(newSelection) {
    selection = newSelection;
  }

  // ----------------------------------------------------------
  // 関数：handleKeydown
  // キーボードが押されたときの処理（ページ全体で受け取る）
  // ----------------------------------------------------------
  function handleKeydown(event) {
    // 文字を入力する欄で押されたときは何もしない（後のステップで入力欄を作るため）
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (event.key === "ArrowRight") {
      // → キー：次の音へ
      selection = moveSelection(score, selection, 1);
      event.preventDefault(); // 画面が横にスクロールしないようにする
    } else if (event.key === "ArrowLeft") {
      // ← キー：前の音へ
      selection = moveSelection(score, selection, -1);
      event.preventDefault();
    } else if (event.key === "Escape") {
      // Esc キー：選択を外す
      selection = null;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>編集 - string-score</title>
</svelte:head>

<!-- 画面全体：上から 上のバー・タブ・選択中の表示・五線譜・鍵盤 -->
<div class="editor">
  <TopBar tempo={score.tempo} />
  <ToolTabs />
  <SelectionInfo {score} {selection} />

  <!-- 五線譜の部分だけスクロールする -->
  <main class="score-area">
    <ScoreView {score} {selection} onselect={handleSelect} />
  </main>

  <PianoKeyboard />
</div>

<style>
  /* ページ全体の余白をなくす（このページだけ） */
  :global(body) {
    margin: 0;
    font-family: sans-serif;
  }
  .editor {
    display: flex;
    flex-direction: column; /* 上から順に縦に並べる */
    height: 100vh; /* 画面の高さちょうどにする */
  }
  .score-area {
    flex: 1; /* 残りの高さを全部使う */
    overflow-y: auto; /* はみ出したらここだけスクロール */
    padding: 12px 16px;
    background: #e5e7eb; /* 紙のまわりは少し濃いグレー */
  }
</style>
