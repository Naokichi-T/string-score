<script>
  // ==========================================================
  // 編集ページ（/edit）
  // 楽譜データと「選択中の場所」を持ち、画面の部品に配る
  // （ステップ4-2：長さのボタン・付点・休符・鍵盤で音を入れる（上書き））
  // ==========================================================
  import TopBar from "#lib/components/TopBar.svelte";
  import ToolTabs from "#lib/components/ToolTabs.svelte";
  import SelectionInfo from "#lib/components/SelectionInfo.svelte";
  import ScoreView from "#lib/components/ScoreView.svelte";
  import PianoKeyboard from "#lib/components/PianoKeyboard.svelte";
  import { createEmptyScore, keyAt, INSTRUMENTS } from "#lib/score/model.js";
  import { moveSelection, getSelectedNote } from "#lib/score/selection.js";
  import { canFit, replaceAt, setDuration, nextPosition } from "#lib/score/edit.js";
  import { playPitch } from "#lib/audio/sound.js";

  // 楽譜データ（空の弦楽四重奏で始める）
  let score = $state(createEmptyScore());

  // 選択中の場所 { part, measure, note }（何も選んでいないときは null）
  let selection = $state(null);

  // 次に入れる音の長さと付点
  let duration = $state("quarter");
  let dotted = $state(false);

  // 知らせたいこと（画面の「選択中」の右に赤く出す）
  let message = $state("");

  // 鍵盤の一番左のドのオクターブ
  let keyboardOctave = $state(4);

  // 最後に選んでいたパート（パートが変わったときだけ鍵盤の音域を切り替えるため）
  let lastPart = null;

  // ----------------------------------------------------------
  // 選んでいるパートが変わったら、鍵盤の音域をその楽器に合わせる
  // ----------------------------------------------------------
  $effect(() => {
    const part = selection ? selection.part : null;
    if (part !== null && part !== lastPart) {
      const instrument = score.parts[part].instrument;
      keyboardOctave = INSTRUMENTS[instrument].keyboardOctave;
    }
    lastPart = part;
  });

  // ----------------------------------------------------------
  // 関数：canUse
  // その長さ（＋付点）が、選んでいる場所に入るかを調べる（ボタンを押せるかどうかに使う）
  // 何も選んでいないときは、どの長さも選べる（次に入れる長さを決めるだけなので）
  // ----------------------------------------------------------
  function canUse(d, dots) {
    if (!selection) return true;
    return canFit(score, selection, d, dots);
  }

  // ----------------------------------------------------------
  // 関数：handleSelect
  // 五線譜で音符がクリックされたとき（ScoreView から呼ばれる）
  // ----------------------------------------------------------
  function handleSelect(newSelection) {
    selection = newSelection;
    message = "";
  }

  // ----------------------------------------------------------
  // 関数：handleDuration
  // 長さのボタンが押されたとき
  //   ・次に入れる長さを変える
  //   ・音を選んでいれば、その音の長さも変える
  // ----------------------------------------------------------
  function handleDuration(d) {
    message = "";
    // 今の付点のまま入らないなら、付点を外す
    let dots = dotted ? 1 : 0;
    if (selection && !canFit(score, selection, d, dots)) dots = 0;

    duration = d;
    dotted = dots === 1;
    // 16分音符には付点を付けられない
    if (d === "16th") dotted = false;

    if (selection && canFit(score, selection, d, dotted ? 1 : 0)) {
      score = setDuration(score, selection, d, dotted ? 1 : 0);
    }
  }

  // ----------------------------------------------------------
  // 関数：handleDot
  // 付点のボタンが押されたとき
  //   ・音を選んでいれば、その音の付点を付ける・外す
  //   ・選んでいなければ、次に入れる音の付点を切り替える
  // ----------------------------------------------------------
  function handleDot() {
    message = "";
    const note = getSelectedNote(score, selection);

    if (!note) {
      // 選んでいない：次に入れる音の付点を切り替えるだけ
      if (duration === "16th") {
        message = "16分音符には付点を付けられません";
        return;
      }
      dotted = !dotted;
      return;
    }

    // 選んでいる音の付点を切り替える
    const newDots = (note.dots ?? 0) > 0 ? 0 : 1;
    if (!canFit(score, selection, note.duration, newDots)) {
      message = newDots === 1 && note.duration === "16th" ? "16分音符には付点を付けられません" : "付点を付けると小節に入りきりません";
      return;
    }
    score = setDuration(score, selection, note.duration, newDots);
    // ボタンの表示も、選んでいる音に合わせる
    duration = note.duration;
    dotted = newDots === 1;
  }

  // ----------------------------------------------------------
  // 関数：putNote
  // 選んでいる場所に音（休符）を置いて、次の場所に進む
  //   newNote … 置く音（休符）のデータ
  // 置けたら true、置けなかったら false を返す
  // ----------------------------------------------------------
  function putNote(newNote) {
    if (!selection) {
      message = "先に、音を入れたい場所（休符など）をクリックして選んでください";
      return false;
    }
    if (!canFit(score, selection, newNote.duration, newNote.dots)) {
      message = "その長さは小節に入りきりません。短い長さを選んでください";
      return false;
    }
    message = "";
    // 置く
    const placed = replaceAt(score, selection, newNote);
    // 次の場所へ（最後の小節の終わりなら、小節が1つ増える）
    const next = nextPosition(placed, selection);
    score = next.score;
    selection = next.selection;
    return true;
  }

  // ----------------------------------------------------------
  // 関数：handleKey
  // 鍵盤が押されたとき
  //   key … { step, alter, octave }（黒鍵は「左どなりの白鍵の♯」で来る）
  // ----------------------------------------------------------
  function handleKey(key) {
    let pitch = { step: key.step, alter: key.alter, octave: key.octave };

    // ♭の調では、黒鍵を♭で呼ぶ（例：ド♯ → レ♭）
    if (key.alter === 1 && selection && keyAt(score, selection.measure) < 0) {
      const NEXT_STEP = { C: "D", D: "E", F: "G", G: "A", A: "B" };
      pitch = { step: NEXT_STEP[key.step], alter: -1, octave: key.octave };
    }

    const dots = dotted ? 1 : 0;
    const ok = putNote({ pitch: pitch, duration: duration, dots: dots, tie: false });
    // 入れられたら音を鳴らす
    if (ok) playPitch(pitch);
  }

  // ----------------------------------------------------------
  // 関数：handleRest
  // 休符のボタンが押されたとき：選んでいる場所を、今の長さの休符にする
  // ----------------------------------------------------------
  function handleRest() {
    putNote({ rest: true, duration: duration, dots: dotted ? 1 : 0 });
  }

  // ----------------------------------------------------------
  // 関数：handleShift
  // 鍵盤の ◀ ▶ が押されたとき：1オクターブずつずらす（ド1〜ド6 の範囲）
  // ----------------------------------------------------------
  function handleShift(delta) {
    keyboardOctave = Math.min(6, Math.max(1, keyboardOctave + delta));
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
      message = "";
      event.preventDefault(); // 画面が横にスクロールしないようにする
    } else if (event.key === "ArrowLeft") {
      // ← キー：前の音へ
      selection = moveSelection(score, selection, -1);
      message = "";
      event.preventDefault();
    } else if (event.key === "Escape") {
      // Esc キー：選択を外す
      selection = null;
      message = "";
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
  <ToolTabs {duration} {dotted} {canUse} onduration={handleDuration} ondot={handleDot} onrest={handleRest} />
  <SelectionInfo {score} {selection} {message} />

  <!-- 五線譜の部分だけスクロールする -->
  <main class="score-area">
    <ScoreView {score} {selection} onselect={handleSelect} />
  </main>

  <PianoKeyboard startOctave={keyboardOctave} onpress={handleKey} onshift={handleShift} />
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
