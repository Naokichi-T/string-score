<script>
  // ==========================================================
  // 編集ページ（/edit）
  // 楽譜データと「選択中の場所」を持ち、画面の部品に配る
  // （ステップ4-2：長さのボタン・付点・休符・鍵盤で音を入れる（上書き））
  // （ステップ4-3：高さ・臨時記号・タイ・削除・元に戻す・やり直し）
  // （ステップ4-4：挿入モード）
  // ==========================================================
  import TopBar from "#lib/components/TopBar.svelte";
  import ToolTabs from "#lib/components/ToolTabs.svelte";
  import SelectionInfo from "#lib/components/SelectionInfo.svelte";
  import ScoreView from "#lib/components/ScoreView.svelte";
  import PianoKeyboard from "#lib/components/PianoKeyboard.svelte";
  import { createEmptyScore, keyAt, INSTRUMENTS } from "#lib/score/model.js";
  import { moveSelection, getSelectedNote } from "#lib/score/selection.js";
  import { canFit, replaceAt, setDuration, nextPosition, transposeNote, setAccidental, deleteNote, toggleTie, canInsert, canResize, insertAt, resizeAt } from "#lib/score/edit.js";
  import { createHistory, record, undo, redo } from "#lib/score/history.js";
  import { playPitch } from "#lib/audio/sound.js";

  // 楽譜データ（空の弦楽四重奏で始める）
  let score = $state(createEmptyScore());

  // 選択中の場所 { part, measure, note }（何も選んでいないときは null）
  let selection = $state(null);

  // 元に戻す・やり直しの履歴
  // （$state.raw：中身を細かく見張らず、入れ替えたときだけ画面を更新する）
  let history = $state.raw(createHistory());

  // 次に入れる音の長さと付点
  let duration = $state("quarter");
  let dotted = $state(false);

  // 入力のしかた（'overwrite'：上書き、'insert'：挿入）
  let mode = $state("overwrite");

  // 知らせたいこと（画面の「選択中」の右に赤く出す）
  let message = $state("");

  // 鍵盤の一番左のドのオクターブ
  let keyboardOctave = $state(4);

  // 最後に選んでいたパート（パートが変わったときだけ鍵盤の音域を切り替えるため）
  let lastPart = null;

  // 選んでいるのが音符（休符ではない）か（臨時記号などのボタンを押せるかどうかに使う）
  let noteSelected = $derived.by(() => {
    const note = getSelectedNote(score, selection);
    return !!note && !note.rest;
  });

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
  // 関数：commit
  // 楽譜を変えるときは必ずこの関数を通す
  // 変える前の状態を履歴に残してから、新しい楽譜データと選択中の場所に入れ替える
  //   newScore     … 新しい楽譜データ
  //   newSelection … 新しい選択中の場所（省略したら今のまま）
  // ----------------------------------------------------------
  function commit(newScore, newSelection = selection) {
    // 何も変わっていなければ、履歴に残さない
    if (newScore === score) return;
    history = record(history, { score: score, selection: selection });
    score = newScore;
    selection = newSelection;
  }

  // ----------------------------------------------------------
  // 関数：handleUndo
  // 元に戻す
  // ----------------------------------------------------------
  function handleUndo() {
    const result = undo(history, { score: score, selection: selection });
    if (!result) return;
    history = result.history;
    score = result.entry.score;
    selection = result.entry.selection;
    message = "";
  }

  // ----------------------------------------------------------
  // 関数：handleRedo
  // やり直す
  // ----------------------------------------------------------
  function handleRedo() {
    const result = redo(history, { score: score, selection: selection });
    if (!result) return;
    history = result.history;
    score = result.entry.score;
    selection = result.entry.selection;
    message = "";
  }

  // ----------------------------------------------------------
  // 関数：canUse
  // その長さ（＋付点）が、選んでいる場所に入るかを調べる（ボタンを押せるかどうかに使う）
  // 何も選んでいないときは、どの長さも選べる（次に入れる長さを決めるだけなので）
  // ----------------------------------------------------------
  function canUse(d, dots) {
    if (!selection) return true;
    // 挿入モードでは「長さを変えて後ろをずらせるか」で調べる
    if (mode === "insert") return canResize(score, selection, d, dots);
    return canFit(score, selection, d, dots);
  }

  // ----------------------------------------------------------
  // 関数：canPlace
  // 選んでいる場所に、この長さの音を入れられるかを調べる（鍵盤・休符ボタン用）
  //   上書きモード … 選んでいる音の頭から小節の終わりまでに入るか
  //   挿入モード   … 小節の終わりの休符の分だけずらして入るか
  // ----------------------------------------------------------
  function canPlace(d, dots) {
    if (!selection) return false;
    if (mode === "insert") return canInsert(score, selection, d, dots);
    return canFit(score, selection, d, dots);
  }

  // ----------------------------------------------------------
  // 関数：changeLength
  // 選んでいる音の長さを変える（モードに合わせて上書きか、後ろをずらすかを選ぶ）
  // 変えられたら true を返す
  // ----------------------------------------------------------
  function changeLength(d, dots) {
    if (mode === "insert") {
      const result = resizeAt(score, selection, d, dots);
      if (result.error) {
        message = result.error;
        return false;
      }
      commit(result.score);
      return true;
    }
    if (!canFit(score, selection, d, dots)) return false;
    commit(setDuration(score, selection, d, dots));
    return true;
  }

  // ----------------------------------------------------------
  // 関数：handleMode
  // 上書き・挿入の切り替え
  // ----------------------------------------------------------
  function handleMode(newMode) {
    mode = newMode;
    message = "";
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
    if (selection && !canUse(d, dots)) dots = 0;

    duration = d;
    dotted = dots === 1;
    // 16分音符には付点を付けられない
    if (d === "16th") dotted = false;

    if (selection && canUse(d, dotted ? 1 : 0)) {
      changeLength(d, dotted ? 1 : 0);
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
    if (!canUse(note.duration, newDots)) {
      message = newDots === 1 && note.duration === "16th" ? "16分音符には付点を付けられません" : "付点を付けると小節に入りきりません";
      return;
    }
    changeLength(note.duration, newDots);
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
    if (!canPlace(newNote.duration, newNote.dots)) {
      message = mode === "insert" ? "この小節には空きがありません（小節の終わりの休符の分だけ挿入できます）" : "その長さは小節に入りきりません。短い長さを選んでください";
      return false;
    }
    message = "";

    // 挿入モード：選んでいる音の前に入れて、後ろをずらす
    if (mode === "insert") {
      const result = insertAt(score, selection, newNote);
      commit(result.score, result.selection);
      return true;
    }

    // 上書きモード：置く
    const placed = replaceAt(score, selection, newNote);
    // 次の場所へ（最後の小節の終わりなら、小節が1つ増える）
    const next = nextPosition(placed, selection);
    commit(next.score, next.selection);
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
  // 関数：playSelected
  // 選んでいる音を鳴らす（高さを変えたあとなどに、耳で確かめるため）
  // ----------------------------------------------------------
  function playSelected() {
    const note = getSelectedNote(score, selection);
    if (note && !note.rest) playPitch(note.pitch);
  }

  // ----------------------------------------------------------
  // 関数：handleTranspose
  // 選んでいる音の高さを変える（▲ ▼ ボタン、↑ ↓ キー）
  //   semitones … 半音の数（1・-1 で半音、12・-12 で1オクターブ）
  // ----------------------------------------------------------
  function handleTranspose(semitones) {
    if (!noteSelected) return;
    message = "";
    const newScore = transposeNote(score, selection, semitones);
    if (newScore === score) {
      message = "これ以上は高さを変えられません";
      return;
    }
    commit(newScore);
    playSelected();
  }

  // ----------------------------------------------------------
  // 関数：handleAccidental
  // 臨時記号のボタンが押されたとき
  //   alter … 1：♯、-1：♭、0：♮
  // ----------------------------------------------------------
  function handleAccidental(alter) {
    if (!noteSelected) return;
    message = "";
    commit(setAccidental(score, selection, alter));
    playSelected();
  }

  // ----------------------------------------------------------
  // 関数：handleTie
  // タイのボタンが押されたとき
  // ----------------------------------------------------------
  function handleTie() {
    if (!noteSelected) return;
    const result = toggleTie(score, selection);
    message = result.error;
    commit(result.score);
  }

  // ----------------------------------------------------------
  // 関数：handleDelete
  // 削除のボタン・Delete キー：選んでいる音符を同じ長さの休符にする
  // ----------------------------------------------------------
  function handleDelete() {
    if (!noteSelected) return;
    message = "";
    commit(deleteNote(score, selection));
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

    // Ctrl キー（Mac は ⌘ キー）を押しているか
    const command = event.ctrlKey || event.metaKey;

    if (command && (event.key === "z" || event.key === "Z")) {
      // Ctrl＋Z：元に戻す、Ctrl＋Shift＋Z：やり直し
      if (event.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      event.preventDefault();
    } else if (command && (event.key === "y" || event.key === "Y")) {
      // Ctrl＋Y：やり直し（Windows でよく使われる）
      handleRedo();
      event.preventDefault();
    } else if (event.key === "ArrowUp") {
      // ↑：半音上げる（Ctrl / ⌘ と一緒なら1オクターブ上げる）
      handleTranspose(command ? 12 : 1);
      event.preventDefault(); // 画面が上にスクロールしないようにする
    } else if (event.key === "ArrowDown") {
      // ↓：半音下げる（Ctrl / ⌘ と一緒なら1オクターブ下げる）
      handleTranspose(command ? -12 : -1);
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      // → キー：次の音へ
      selection = moveSelection(score, selection, 1);
      message = "";
      event.preventDefault(); // 画面が横にスクロールしないようにする
    } else if (event.key === "ArrowLeft") {
      // ← キー：前の音へ
      selection = moveSelection(score, selection, -1);
      message = "";
      event.preventDefault();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      // Delete / Backspace：音符を休符にする
      handleDelete();
      event.preventDefault(); // Backspace でブラウザが前のページに戻らないようにする
    } else if (event.key === "Escape") {
      // Esc キー：選択を外す
      selection = null;
      message = "";
    } else if (!command && (event.key === "i" || event.key === "I")) {
      // I キー：上書き・挿入を切り替える
      handleMode(mode === "insert" ? "overwrite" : "insert");
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>編集 - string-score</title>
</svelte:head>

<!-- 画面全体：上から 上のバー・タブ・選択中の表示・五線譜・鍵盤 -->
<div class="editor">
  <TopBar tempo={score.tempo} canUndo={history.undo.length > 0} canRedo={history.redo.length > 0} onundo={handleUndo} onredo={handleRedo} />
  <ToolTabs
    {duration}
    {dotted}
    {canUse}
    onduration={handleDuration}
    ondot={handleDot}
    onrest={handleRest}
    {noteSelected}
    onaccidental={handleAccidental}
    onstep={handleTranspose}
    ontie={handleTie}
    ondelete={handleDelete}
    {mode}
    onmode={handleMode}
  />
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
