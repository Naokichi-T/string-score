<script>
  // ==========================================================
  // 編集ページ（/edit）
  // 楽譜データと「選択中の場所」を持ち、画面の部品に配る
  // （ステップ4-2：長さのボタン・付点・休符・鍵盤で音を入れる（上書き））
  // （ステップ4-3：高さ・臨時記号・タイ・削除・元に戻す・やり直し）
  // （ステップ4-4：挿入モード）
  // （ステップ4-5：記号タブで音符に記号を付ける）
  // （ステップ4-6：範囲選択と、スラー・松葉）
  // （ステップ4-7a：ショートカット・範囲の音をまとめて変える・音名キーで入れる）
  // （ステップ4-7b：休符のボタンを押せるかどうかを、鍵盤と同じ判定にする）
  // （ステップ5-1：タイトル・作曲者・速度記号・テンポを変える）
  // （ステップ5-2：小節の追加・削除）
  // （ステップ6-1：録音した楽器の音で再生する（全体・パート別）、鍵盤の音も楽器の音にする）
  // （ステップ6-2：再生中に鳴っている音符を緑にする）
  // （ステップ7-1：URL の id の楽譜を読み込み、変えるたびに自動で保存する）
  // （ステップ8-4c：MusicXML を読み込んだときに、知らせることを黄色い枠で出す）
  // （ステップ8-1：MusicXML の書き出し）
  // ==========================================================
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import TopBar from "#lib/components/TopBar.svelte";
  import ToolTabs from "#lib/components/ToolTabs.svelte";
  import SelectionInfo from "#lib/components/SelectionInfo.svelte";
  import ScoreView from "#lib/components/ScoreView.svelte";
  import PianoKeyboard from "#lib/components/PianoKeyboard.svelte";
  import ImportNotice from "#lib/components/ImportNotice.svelte";
  import PrintView from "#lib/components/PrintView.svelte";
  import { createEmptyScore, keyAt, timeAt, INSTRUMENTS } from "#lib/score/model.js";
  import { moveSelection, getSelectedNote, makeRange } from "#lib/score/selection.js";
  import {
    canFit,
    replaceAt,
    setDuration,
    nextPosition,
    transposeNote,
    setAccidental,
    deleteNote,
    toggleTie,
    canInsert,
    canResize,
    insertAt,
    resizeAt,
    toggleNoteSymbol,
    canSpan,
    getSpanState,
    toggleSpanner,
    rangeHasNotes,
    deleteRange,
    transposeRange,
    pitchForLetter,
    setScoreInfo,
    insertMeasure,
    deleteMeasures,
    changeTime,
    changeKey,
    changeClef,
    clefAt,
    addPart,
    movePart,
    deletePart,
  } from "#lib/score/edit.js";
  import { createHistory, record, undo, redo } from "#lib/score/history.js";
  import { copyNotes, pasteNotes } from "#lib/score/clipboard.js";
  import { playPitch, loadInstruments, playEvents, stopPlayback, setSoundType, getPlaybackTime } from "#lib/audio/sound.js";
  import { buildEvents, secondsPerTick, isPizzAt } from "#lib/score/playback.js";
  import { loadScore, saveScore, loadSettings, saveSetting } from "#lib/score/library.js";
  import { scoreToMusicXML, musicXMLFileName } from "#lib/score/musicxml.js";

  // 楽譜データ（ページを開いたら、保存してある楽譜に入れ替える）
  let score = $state(createEmptyScore());

  // 読み込みの状態（ステップ7-1）
  //   "loading"  … 読み込み中（楽譜はまだ出さない）
  //   "ready"    … 読み込み完了（楽譜を出す）
  //   "notfound" … URL の id の楽譜が見つからない
  let loadState = $state("loading");

  // 今開いている楽譜の id（保存するときに使う）
  let scoreId = null;

  // 保存の状態（"saved"：保存済み、"error"：保存できなかった）（上のバーに出す）
  let saveState = $state("saved");

  // 最後に保存した楽譜データ（同じものを何度も保存しないように覚えておく）
  let savedScore = null;

  // 選択中の場所 { part, measure, note }（何も選んでいないときは null）
  let selection = $state(null);

  // 範囲選択の「もう一方の端」{ part, measure, note }（範囲を選んでいないときは null）
  // 範囲は「選択中の場所」から「もう一方の端」まで（Shift＋クリックか Shift＋← → で決める）
  let rangeEnd = $state(null);

  // 選んでいる範囲 { part, start, end }（範囲を選んでいないときは null）
  let range = $derived(makeRange(selection, rangeEnd));

  // 範囲にスラー・松葉を付けられるか（範囲の中に音符が2つ以上あるか）
  let canSpanRange = $derived(canSpan(score, range));

  // 範囲に付いているスラー・松葉（ボタンを青くするため）
  let spanState = $derived(getSpanState(score, range));

  // 範囲の中に音符が1つでもあるか（範囲をまとめて ▲ ▼・削除できるかどうかに使う）
  let rangeEditable = $derived(!!range && rangeHasNotes(score, range));

  // 数字キーと音の長さの対応（MuseScore と同じ割り当て）
  const DURATION_KEYS = { 3: "16th", 4: "eighth", 5: "quarter", 6: "half", 7: "whole" };

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

  // 再生中か
  let playing = $state(false);

  // 楽器の音の読み込みの状態（"loading"：読み込み中、"ready"：完了、"error"：失敗）
  let soundState = $state("loading");

  // 鳴らすパート（"all" なら全体、数字ならそのパートの番号）
  let playTarget = $state("all");

  // 音の種類（"instrument"：録音した楽器の音、"synth"：電子音）。最初は楽器の音
  let soundType = $state("instrument");

  // 再生できるか（電子音ならいつでも、楽器の音なら読み込みが終わってから）
  let canPlay = $derived(soundType === "synth" || soundState === "ready");

  // 今鳴っている音符の場所の一覧 [{ part, measure, note }, ...]（五線譜で緑にする）（ステップ6-2）
  // （$state.raw：入れ替えたときだけ画面を更新する）
  let playingNotes = $state.raw([]);

  // 緑にする音符の一覧（再生を始めたときに buildEvents で作る）
  let highlights = [];

  // 1ティックが何秒か（再生を始めたときのテンポで決める）
  let highlightTickSeconds = 0;

  // 前の画面の更新のときに鳴っていた音符（変わったときだけ描き直すため）
  let lastHighlightKey = "";

  // 画面の更新のたびに呼ぶ予約の番号（止めるときに使う）
  let highlightFrame = 0;

  // ----------------------------------------------------------
  // 関数：updateHighlight
  // 今鳴っている音符を調べて、変わっていたら playingNotes を入れ替える
  // 画面が更新されるたび（1秒に60回くらい）に、自分で自分を予約して呼ばれ続ける
  // ----------------------------------------------------------
  function updateHighlight() {
    const time = getPlaybackTime(); // 再生を始めてから何秒たったか
    if (time === null) return; // 再生していなければ終わり

    // 秒をティックに直して、その時間に鳴っている音符を探す
    const tick = time / highlightTickSeconds;
    const now = highlights.filter((h) => h.startTick <= tick && tick < h.endTick);

    // 前と同じなら描き直さない（描き直しは時間がかかるので）
    const key = now.map((h) => `${h.part}-${h.measure}-${h.note}`).join(",");
    if (key !== lastHighlightKey) {
      lastHighlightKey = key;
      playingNotes = now.map((h) => ({ part: h.part, measure: h.measure, note: h.note }));
    }

    // 次の画面の更新のときに、もう一度呼ぶ
    highlightFrame = requestAnimationFrame(updateHighlight);
  }

  // ----------------------------------------------------------
  // 関数：clearHighlight
  // 緑を消して、調べるのをやめる（止めたとき・最後まで鳴ったとき）
  // ----------------------------------------------------------
  function clearHighlight() {
    cancelAnimationFrame(highlightFrame);
    highlights = [];
    lastHighlightKey = "";
    playingNotes = [];
  }

  // ----------------------------------------------------------
  // 関数：handleSoundType
  // 上のバーで音の種類が選ばれたとき
  //   type … "instrument"（楽器の音）か "synth"（電子音）
  // 再生中なら止める（選び直した音で、もう一度再生してもらう）
  // ----------------------------------------------------------
  function handleSoundType(type) {
    handleStop();
    soundType = type;
    setSoundType(type); // 鳴らす仕組み（sound.js）にも知らせる
    saveSetting("soundType", type); // 次に開いたときのために覚えておく（アプリ全体で1つ）（ステップ7-4）
  }

  // 鍵盤などで音を鳴らすときの楽器（選んでいるパートの楽器。何も選んでいないときはバイオリン）
  let currentInstrument = $derived(selection ? score.parts[selection.part].instrument : "violin");

  // ----------------------------------------------------------
  // ページが開いたら、楽器の音（バイオリン・ビオラ・チェロ）を裏で読み込み始める
  // （読み込みが終わるまでは、鍵盤は電子音で鳴る。再生ボタンは押せない）
  // ----------------------------------------------------------
  onMount(() => {
    // URL の id の楽譜を開く（id がなければトップページへ戻す）
    openScore();

    // 前に選んだ音の種類を読み込む（保存していなければ「楽器の音」のまま）（ステップ7-4）
    const savedType = loadSettings().soundType;
    if (savedType === "instrument" || savedType === "synth") {
      soundType = savedType;
      setSoundType(savedType); // 鳴らす仕組み（sound.js）にも知らせる
    }

    loadInstruments()
      .then(() => {
        soundState = "ready";
      })
      .catch((error) => {
        console.error("楽器の音を読み込めませんでした", error);
        soundState = "error";
      });

    // ページから離れるときは、鳴っている音を止めて、緑を調べるのもやめる
    return () => {
      stopPlayback();
      cancelAnimationFrame(highlightFrame);
    };
  });

  // ----------------------------------------------------------
  // 関数：openScore
  // URL の id（/edit?id=xxx）の楽譜を、ブラウザの中から読み込む（ステップ7-1）
  //   id がある   → その楽譜を開く（見つからなければ「見つかりませんでした」を出す）
  //   id がない   → トップページへ戻す（楽譜を作るのはトップページの［作成］だけにする）（ステップ7-3）
  // ----------------------------------------------------------
  function openScore() {
    const id = page.url.searchParams.get("id");

    if (!id) {
      // replace：「戻る」で id のない /edit に戻ってこないようにする
      goto("/", { replace: true });
      return;
    }

    const loaded = loadScore(id);
    if (!loaded) {
      loadState = "notfound";
      return;
    }
    scoreId = id;
    score = loaded;
    savedScore = score; // 開いただけでは保存しない（更新日時を変えないため）
    loadState = "ready";
  }

  // ----------------------------------------------------------
  // 自動保存（ステップ7-1）
  // 楽譜データが入れ替わったら（commit・元に戻す・やり直し）、すぐに保存する
  // ----------------------------------------------------------
  $effect(() => {
    const current = score; // score が入れ替わったら、ここがもう一度動く
    if (!scoreId || current === savedScore) return; // 開く前・保存済みなら何もしない
    // $state.snapshot：画面と連動している楽譜データから、ふつうのデータのコピーを作る
    const ok = saveScore(scoreId, $state.snapshot(current));
    saveState = ok ? "saved" : "error";
    savedScore = current;
  });

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
    // 再生中に楽譜を変えたら、再生を止める（鳴っている音と楽譜がずれないようにするため）
    handleStop();
    history = record(history, { score: score, selection: selection });
    score = newScore;
    selection = newSelection;
    // 楽譜が変わると範囲の場所がずれることがあるので、範囲選択はやめる
    rangeEnd = null;
  }

  // ----------------------------------------------------------
  // 関数：handleUndo
  // 元に戻す
  // ----------------------------------------------------------
  function handleUndo() {
    const result = undo(history, { score: score, selection: selection });
    if (!result) return;
    handleStop(); // 楽譜が変わるので、再生を止める
    history = result.history;
    score = result.entry.score;
    selection = result.entry.selection;
    rangeEnd = null; // 範囲選択はやめる
    message = "";
  }

  // ----------------------------------------------------------
  // 関数：handleRedo
  // やり直す
  // ----------------------------------------------------------
  function handleRedo() {
    const result = redo(history, { score: score, selection: selection });
    if (!result) return;
    handleStop(); // 楽譜が変わるので、再生を止める
    history = result.history;
    score = result.entry.score;
    selection = result.entry.selection;
    rangeEnd = null; // 範囲選択はやめる
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

  // 休符のボタンを押せるか（鍵盤で音を入れるときと同じ canPlace で調べる）
  // 何も選んでいないときは押せる（押すと「先に場所を選んでください」と知らせる）
  let canRest = $derived(!selection || canPlace(duration, dotted ? 1 : 0));

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
  //   newSelection … クリックされた場所（何もない所なら null）
  //   shift        … Shift キーを押しながらのクリックか
  // Shift＋クリックで、選んでいる音と同じパートの音なら、そこまでを範囲にする
  // ----------------------------------------------------------
  function handleSelect(newSelection, shift = false) {
    message = "";
    if (shift && selection && newSelection && newSelection.part === selection.part) {
      // 範囲のもう一方の端にする（選んでいる音そのものをクリックしたら範囲をやめる）
      rangeEnd = samePlace(newSelection, selection) ? null : newSelection;
      return;
    }
    // ふつうのクリック（または違うパート）：その音だけを選ぶ
    selection = newSelection;
    rangeEnd = null;
  }

  // ----------------------------------------------------------
  // 関数：samePlace
  // 2つの場所が同じかどうかを調べる
  // ----------------------------------------------------------
  function samePlace(a, b) {
    return a.part === b.part && a.measure === b.measure && a.note === b.note;
  }

  // ----------------------------------------------------------
  // 関数：extendRange
  // Shift＋← → で、範囲のもう一方の端を前後の音に動かす
  //   direction … 1 なら次の音へ、-1 なら前の音へ
  // ----------------------------------------------------------
  function extendRange(direction) {
    if (!selection) return;
    // まだ範囲がなければ、選択中の場所から動かし始める
    const from = rangeEnd ?? selection;
    const to = moveSelection(score, from, direction);
    // 選択中の場所まで戻ってきたら、範囲をやめる
    rangeEnd = samePlace(to, selection) ? null : to;
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

    inputPitch(pitch);
  }

  // ----------------------------------------------------------
  // 関数：handleLetter
  // 音名キー（C D E F G A B）が押されたとき
  // 調号どおりの♯♭で、前の音にいちばん近い高さの音を入れる
  //   step … 音名（"C"〜"B"）
  // ----------------------------------------------------------
  function handleLetter(step) {
    if (!selection) {
      message = "先に、音を入れたい場所（休符など）をクリックして選んでください";
      return;
    }
    inputPitch(pitchForLetter(score, selection, step));
  }

  // ----------------------------------------------------------
  // 関数：inputPitch
  // 今の長さ・付点で、選んでいる場所に音を入れる（鍵盤と音名キーで共通）
  // 入れられたら、選んでいるパートの楽器の音で鳴らす
  //   pitch … 音の高さ { step, alter, octave }
  // ----------------------------------------------------------
  function inputPitch(pitch) {
    const dots = dotted ? 1 : 0;
    // 入れる場所がピチカートの範囲かどうか（入れる前に調べる。入れると選択が次の音に進むため）
    const pizz = selection ? isPizzAt(score, selection) : false;
    const ok = putNote({ pitch: pitch, duration: duration, dots: dots, tie: false });
    // 入れたあとは選択が次の音に進むが、同じパートなので楽器は変わらない
    if (ok) playPitch(pitch, currentInstrument, 0.5, pizz);
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
    // ピチカートの範囲なら、ピチカートで鳴らす
    if (note && !note.rest) playPitch(note.pitch, currentInstrument, 0.5, isPizzAt(score, selection));
  }

  // ----------------------------------------------------------
  // 関数：handleTranspose
  // 選んでいる音の高さを変える（▲ ▼ ボタン、↑ ↓ キー）
  // 範囲を選んでいるときは、範囲の中の音符をぜんぶ変える
  //   semitones … 半音の数（1・-1 で半音、12・-12 で1オクターブ）
  // ----------------------------------------------------------
  function handleTranspose(semitones) {
    if (rangeEditable) {
      message = "";
      const newScore = transposeRange(score, range, semitones);
      if (newScore === score) {
        message = "これ以上は高さを変えられません";
        return;
      }
      // commit で範囲選択が消えるので、覚えておいて元に戻す（音の並びは変わらない）
      const end = rangeEnd;
      commit(newScore);
      rangeEnd = end;
      playSelected();
      return;
    }

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
  // 範囲を選んでいるときは、範囲の中の音符をぜんぶ休符にする
  // ----------------------------------------------------------
  function handleDelete() {
    if (rangeEditable) {
      message = "";
      // commit で範囲選択が消えるので、覚えておいて元に戻す（音の並びは変わらない）
      const end = rangeEnd;
      commit(deleteRange(score, range));
      rangeEnd = end;
      return;
    }

    if (!noteSelected) return;
    message = "";
    commit(deleteNote(score, selection));
  }

  // ----------------------------------------------------------
  // 関数：handleSymbol
  // 「記号」タブのボタンが押されたとき：選んでいる音符に記号を付ける・外す
  //   kind  … 記号の種類（'bowing'・'fingering' など）
  //   value … 記号の名前や数字
  // ----------------------------------------------------------
  function handleSymbol(kind, value) {
    if (!noteSelected) return;
    message = "";
    commit(toggleNoteSymbol(score, selection, kind, value));
  }

  // ----------------------------------------------------------
  // 関数：handleSpanner
  // スラー・＜・＞ のボタンが押されたとき：選んだ範囲に付ける・外す
  //   kind … 'slur'（スラー）・'crescendo'（＜）・'diminuendo'（＞）
  // ----------------------------------------------------------
  function handleSpanner(kind) {
    if (!canSpanRange) return;
    message = "";
    // commit で範囲選択が消えるので、覚えておいて元に戻す
    // （スラーや松葉を付けても音の並びは変わらないので、範囲はずれない）
    const end = rangeEnd;
    commit(toggleSpanner(score, range, kind));
    rangeEnd = end;
  }

  // ----------------------------------------------------------
  // 関数：handleSettings
  // 「楽譜の設定」タブで値が確定したとき：値をチェックして楽譜データを変える
  //   field … 項目の名前（"title"・"composer"・"tempoText"・"tempo"）
  //   text  … 入力された文字
  // ----------------------------------------------------------
  function handleSettings(field, text) {
    message = "";
    const trimmed = text.trim(); // 前後の空白を取る

    if (field === "tempo") {
      // テンポ：20〜300 の整数だけ受け付ける
      const tempo = Number(trimmed);
      if (trimmed === "" || !Number.isInteger(tempo) || tempo < 20 || tempo > 300) {
        message = "テンポは 20〜300 の数字で入れてください";
        return;
      }
      commit(setScoreInfo(score, "tempo", tempo));
      return;
    }

    if (field === "title") {
      // タイトル：空にしたら「無題」に戻す
      commit(setScoreInfo(score, "title", trimmed === "" ? "無題" : trimmed));
      return;
    }

    // 作曲者・速度記号：そのまま（空でもよい）
    commit(setScoreInfo(score, field, trimmed));
  }

  // ----------------------------------------------------------
  // 関数：measureSpan
  // 「小節を削除」で消す小節の範囲を返す
  //   範囲を選んでいるとき … 範囲にかかる小節ぜんぶ
  //   音を選んでいるとき   … その音がある小節
  // 戻り値：{ from, to }（小節の番号。何も選んでいなければ null）
  // ----------------------------------------------------------
  function measureSpan() {
    if (range) return { from: range.start.measure, to: range.end.measure };
    if (selection) return { from: selection.measure, to: selection.measure };
    return null;
  }

  // 小節を消せるか（何か選んでいて、消したあとに小節が1つ以上残るか）
  let canDeleteMeasure = $derived.by(() => {
    const span = measureSpan();
    return !!span && span.to - span.from + 1 < score.measures.length;
  });

  // ----------------------------------------------------------
  // 関数：handleMeasure
  // 「小節」タブのボタンが押されたとき
  //   action … "before"（前に追加）・"after"（後ろに追加）・"delete"（削除）
  // ----------------------------------------------------------
  function handleMeasure(action) {
    message = "";
    const count = score.measures.length; // 今の小節の数

    if (action === "delete") {
      if (!canDeleteMeasure) return;
      const span = measureSpan();
      const newScore = deleteMeasures(score, span.from, span.to);
      // 消したあとは、同じ位置の小節（最後の小節を消したときは1つ前）の最初の音を選ぶ
      const measure = Math.min(span.from, newScore.measures.length - 1);
      commit(newScore, { part: selection.part, measure: measure, note: 0 });
      return;
    }

    // 追加：何も選んでいないときは最後に足す（選択はそのまま）
    if (!selection) {
      commit(insertMeasure(score, count));
      return;
    }
    // 選んでいる小節の前か後ろに足して、足した小節の最初の音を選ぶ
    const index = action === "before" ? selection.measure : selection.measure + 1;
    commit(insertMeasure(score, index), { part: selection.part, measure: index, note: 0 });
  }

  // 選んでいる小節の拍子（「小節」タブの拍子のボタンを青くするのに使う。何も選んでいないときは1小節目）
  let currentTime = $derived(timeAt(score, selection ? selection.measure : 0));

  // ----------------------------------------------------------
  // 関数：handleTime
  // 「小節」タブの拍子のボタンが押されたとき
  //   time … 新しい拍子 { beats, beatType }
  // 効かせる小節
  //   範囲を選んでいるとき … 範囲にかかる小節だけ
  //   音を選んでいるとき   … その小節から、次に拍子が変わる所まで
  //   何も選んでいないとき … 1小節目から、次に拍子が変わる所まで
  // ----------------------------------------------------------
  function handleTime(time) {
    message = "";
    let result;
    if (range) {
      result = changeTime(score, range.start.measure, range.end.measure, time);
    } else if (selection) {
      result = changeTime(score, selection.measure, null, time);
    } else {
      result = changeTime(score, 0, null, time);
    }

    // 入りきらない音があったときは、知らせて終わり（楽譜は変えない）
    if (result.error) {
      message = result.error;
      return;
    }

    // 小節の中の音の数が変わることがあるので、選んでいた小節の最初の音を選び直す
    const newSelection = selection ? { part: selection.part, measure: selection.measure, note: 0 } : null;
    commit(result.score, newSelection);
  }

  // 選んでいる小節の調（「小節」タブの調の選ぶ欄に出す。何も選んでいないときは1小節目）
  let currentKey = $derived(keyAt(score, selection ? selection.measure : 0));

  // ----------------------------------------------------------
  // 関数：handleKeySignature
  // 「小節」タブで調を選んだとき
  //   key … 新しい調（♯の数がプラス、♭の数がマイナス）
  // 効かせる小節は、拍子と同じ決め方
  //   範囲を選んでいるとき … 範囲にかかる小節だけ
  //   音を選んでいるとき   … その小節から、次に調が変わる所まで
  //   何も選んでいないとき … 1小節目から、次に調が変わる所まで
  // 音の高さは変えないので、選択はそのまま
  // ----------------------------------------------------------
  function handleKeySignature(key) {
    message = "";
    if (range) {
      commit(changeKey(score, range.start.measure, range.end.measure, key));
    } else if (selection) {
      commit(changeKey(score, selection.measure, null, key));
    } else {
      commit(changeKey(score, 0, null, key));
    }
  }

  // 選んでいるパート・小節の音部記号（「小節」タブのボタンを青くするのに使う。何も選んでいないときは null）
  let currentClef = $derived(selection ? clefAt(score.parts[selection.part], selection.measure) : null);

  // ----------------------------------------------------------
  // 関数：handleClef
  // 「小節」タブの音部記号のボタンが押されたとき
  //   clef … 新しい音部記号（"treble"・"alto"・"tenor"・"bass"）
  // 選んでいるパートだけに効かせる（何も選んでいないときは何もしない）
  //   範囲を選んでいるとき … 範囲にかかる小節だけ
  //   音を選んでいるとき   … その小節から、次に音部記号が変わる所まで
  // 音の高さは変えないので、選択はそのまま
  // ----------------------------------------------------------
  function handleClef(clef) {
    if (!selection) return;
    message = "";
    if (range) {
      commit(changeClef(score, range.part, range.start.measure, range.end.measure, clef));
    } else {
      commit(changeClef(score, selection.part, selection.measure, null, clef));
    }
  }

  // ----------------------------------------------------------
  // 関数：handleAddPart
  // 「パート」タブの追加のボタンが押されたとき
  //   instrument … 楽器（"violin"・"viola"・"cello"）
  // 一番下に足して、足したパートの1小節目の最初の音を選ぶ
  // ----------------------------------------------------------
  function handleAddPart(instrument) {
    message = "";
    const newScore = addPart(score, instrument);
    commit(newScore, { part: newScore.parts.length - 1, measure: 0, note: 0 });
  }

  // ----------------------------------------------------------
  // 関数：handleMovePart
  // 「パート」タブの ↑ ↓ が押されたとき
  //   index … 動かすパートの番号
  //   delta … -1（上へ）か 1（下へ）
  // 選んでいたパートが入れ替わったときは、選択も一緒に動かす（同じ音を選んだままにする）
  // ----------------------------------------------------------
  function handleMovePart(index, delta) {
    message = "";
    const target = index + delta; // 入れ替える相手の番号
    let newSelection = selection;
    if (selection && selection.part === index) {
      newSelection = { ...selection, part: target };
    } else if (selection && selection.part === target) {
      newSelection = { ...selection, part: index };
    }
    commit(movePart(score, index, delta), newSelection);

    // 鳴らすパートも、入れ替わったパートについていく
    if (playTarget === index) {
      playTarget = target;
    } else if (playTarget === target) {
      playTarget = index;
    }
  }

  // ----------------------------------------------------------
  // 関数：handleDeletePart
  // 「パート」タブの削除が押されたとき
  //   index … 消すパートの番号
  // 選択の動かし方
  //   消したパートを選んでいた → 同じ小節の、すぐ上のパートの最初の音（一番上なら、新しく一番上になったパート）
  //   消したパートより下を選んでいた → 番号が1つずれるので、1つ減らす（同じ音を選んだまま）
  // ----------------------------------------------------------
  function handleDeletePart(index) {
    message = "";
    const newScore = deletePart(score, index);
    if (newScore === score) return; // 1パートしかないときは消さない

    let newSelection = selection;
    if (selection && selection.part === index) {
      newSelection = { part: Math.max(index - 1, 0), measure: selection.measure, note: 0 };
    } else if (selection && selection.part > index) {
      newSelection = { ...selection, part: selection.part - 1 };
    }
    commit(newScore, newSelection);

    // 鳴らすパートを消したときは「全体」に戻す。下のパートなら番号を1つ減らす
    if (playTarget === index) {
      playTarget = "all";
    } else if (playTarget !== "all" && playTarget > index) {
      playTarget = playTarget - 1;
    }
  }

  // ----------------------------------------------------------
  // 関数：handlePlay
  // 再生のボタン（Space キー）が押されたとき
  //   ・音か範囲を選んでいれば、その小節の頭から。何も選んでいなければ1小節目から
  //   ・鳴らすパートの欄で選んだパートだけ（「全体」なら全パート）を鳴らす
  // ----------------------------------------------------------
  function handlePlay() {
    if (!canPlay) return;
    message = "";

    // 始める小節（範囲を選んでいるときは、範囲の最初の小節）
    let startMeasure = 0;
    if (range) {
      startMeasure = range.start.measure;
    } else if (selection) {
      startMeasure = selection.measure;
    }

    // 楽譜を、鳴らす音の一覧に直す
    const result = buildEvents(score, startMeasure, playTarget);
    if (result.events.length === 0) {
      message = "鳴らす音がありません（休符だけです）";
      return;
    }

    // まとめて予約して鳴らす（最後まで行ったら、再生中をやめて緑を消す）
    const tickSeconds = secondsPerTick(score.tempo);
    const started = playEvents(result.events, result.totalTicks, tickSeconds, () => {
      playing = false;
      clearHighlight();
    });
    playing = started;

    // 鳴っている音符を緑にし始める
    if (started) {
      highlights = result.highlights;
      highlightTickSeconds = tickSeconds;
      lastHighlightKey = "";
      cancelAnimationFrame(highlightFrame);
      highlightFrame = requestAnimationFrame(updateHighlight);
    }
  }

  // ----------------------------------------------------------
  // 関数：handleStop
  // 停止のボタン（Space キー）が押されたとき・楽譜が変わったとき：再生を止める
  // ----------------------------------------------------------
  function handleStop() {
    if (!playing) return;
    stopPlayback();
    playing = false;
    clearHighlight(); // 緑を消す
  }

  // ----------------------------------------------------------
  // 関数：handleTarget
  // 鳴らすパートの欄が変わったとき
  //   target … "all"（全体）か、パートの番号
  // 再生中なら止める（選び直したパートで、もう一度再生してもらう）
  // ----------------------------------------------------------
  function handleTarget(target) {
    handleStop();
    playTarget = target;
  }

  // ----------------------------------------------------------
  // 関数：handleExport
  // ［MusicXML 書き出し］が押されたとき：今の楽譜を MusicXML のファイルにしてダウンロードする（ステップ8-1）
  // ファイルの名前は「タイトル.musicxml」
  // ----------------------------------------------------------
  function handleExport() {
    // 楽譜データ → MusicXML の文字（$state.snapshot で、画面と連動していないふつうのデータにしてから渡す）
    const xml = scoreToMusicXML($state.snapshot(score));

    // 文字を「ファイルのかたまり（Blob）」にする（type は MusicXML のファイルの種類の名前）
    const blob = new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" });

    // かたまりを指す一時的な URL を作り、見えないリンクを押したことにしてダウンロードさせる
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = musicXMLFileName(score.title); // download：開くのではなく、この名前で保存させる
    document.body.appendChild(link); // ページに一度入れてから押す（入れないと名前が付かないブラウザがある）
    link.click();
    link.remove();

    // 使い終わった一時的な URL を消す（メモリを空けるため）
    // すぐ消すとダウンロードが始まる前に消えてしまうことがあるので、少し（1秒）待ってから消す
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 印刷用のページを作っているか（true の間だけ PrintView を出す）（ステップ9）
  let printing = $state(false);

  // ----------------------------------------------------------
  // 関数：handlePrint
  // ［PDF 出力］が押されたとき：再生を止めて、印刷用のページを作る（ステップ9）
  // （PrintView が出てくると、ページを作って印刷の画面を開く）
  // ----------------------------------------------------------
  function handlePrint() {
    handleStop();
    printing = true;
  }

  // コピーした音の配列（まだ何もコピーしていないときは null。ページを再読み込みすると消える）
  let clipboard = $state.raw(null);

  // コピー・切り取りができるか（音か範囲を選んでいるか）
  let canCopy = $derived(!!selection);

  // 貼り付けができるか（コピーした音があって、場所を選んでいるか）
  let canPaste = $derived(!!clipboard && !!selection);

  // ----------------------------------------------------------
  // 関数：handleClipboard
  // コピー・切り取り・貼り付けのボタン（キー）が押されたとき
  //   action … "copy"（コピー）・"cut"（切り取り）・"paste"（貼り付け）
  // ----------------------------------------------------------
  function handleClipboard(action) {
    message = "";

    if (action === "copy" || action === "cut") {
      if (!canCopy) return;
      clipboard = copyNotes(score, range, selection);
      // 切り取り：コピーしたあと、音符を休符にする（削除のボタンと同じ）
      if (action === "cut") handleDelete();
      return;
    }

    // 貼り付け：選んでいる音の頭から上書きして、貼り付けた所を範囲で選ぶ
    if (!canPaste) return;
    const result = pasteNotes(score, selection, clipboard);
    commit(result.score, result.start);
    // commit で範囲選択が消えるので、そのあとで範囲の終わりを決める（1つだけなら範囲にしない）
    const single = result.start.measure === result.end.measure && result.start.note === result.end.note;
    rangeEnd = single ? null : result.end;
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
    // 楽譜を読み込む前は何もしない（ステップ7-1）
    if (loadState !== "ready") return;

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
      if (event.shiftKey) {
        // Shift＋→：範囲を次の音まで広げる（縮める）
        extendRange(1);
      } else {
        // → キー：次の音へ（範囲選択はやめる）
        selection = moveSelection(score, selection, 1);
        rangeEnd = null;
        message = "";
      }
      event.preventDefault(); // 画面が横にスクロールしないようにする
    } else if (event.key === "ArrowLeft") {
      if (event.shiftKey) {
        // Shift＋←：範囲を前の音まで広げる（縮める）
        extendRange(-1);
      } else {
        // ← キー：前の音へ（範囲選択はやめる）
        selection = moveSelection(score, selection, -1);
        rangeEnd = null;
        message = "";
      }
      event.preventDefault();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      // Delete / Backspace：音符を休符にする
      handleDelete();
      event.preventDefault(); // Backspace でブラウザが前のページに戻らないようにする
    } else if (event.key === " ") {
      // Space キー：再生・停止の切り替え（押しっぱなしのくり返しは無視する）
      event.preventDefault(); // 画面が下にスクロールしないようにする
      // ボタンを押したあとは、そのボタンが選ばれたままになっていて、
      // Space で「もう一度押した」ことになってしまうので、ボタンの選択を外す
      if (event.target.tagName === "BUTTON") event.target.blur();
      if (event.repeat) return;
      if (playing) {
        handleStop();
      } else {
        handlePlay();
      }
    } else if (event.key === "Escape") {
      // Esc キー：選択と範囲を外す
      selection = null;
      rangeEnd = null;
      message = "";
    } else if (command && (event.key === "c" || event.key === "C") && selection) {
      // Ctrl / ⌘＋C：コピー（何も選んでいないときは、ブラウザのふつうのコピーにまかせる）
      handleClipboard("copy");
      event.preventDefault();
    } else if (command && (event.key === "x" || event.key === "X") && selection) {
      // Ctrl / ⌘＋X：切り取り
      handleClipboard("cut");
      event.preventDefault();
    } else if (command && (event.key === "v" || event.key === "V") && canPaste) {
      // Ctrl / ⌘＋V：貼り付け
      handleClipboard("paste");
      event.preventDefault();
    } else if (command) {
      // ここから下は Ctrl / ⌘ なしのキーだけ（ブラウザのほかのショートカットを邪魔しないため）
      return;
    } else if (DURATION_KEYS[event.key]) {
      // 3〜7：音の長さ（ボタンを押したときと同じ）
      handleDuration(DURATION_KEYS[event.key]);
    } else if (event.key === ".") {
      // .（ピリオド）：付点
      handleDot();
    } else if (event.key === "0") {
      // 0：休符
      handleRest();
    } else if ("ABCDEFG".includes(event.key.toUpperCase()) && event.key.length === 1) {
      // C D E F G A B：その音名の音を入れる
      handleLetter(event.key.toUpperCase());
    } else if (event.key === "t" || event.key === "T") {
      // T：タイ
      handleTie();
    } else if (event.key === "s" || event.key === "S") {
      // S：スラー（範囲を選んでいるとき）
      handleSpanner("slur");
    } else if (event.key === "i" || event.key === "I") {
      // I キー：上書き・挿入を切り替える
      handleMode(mode === "insert" ? "overwrite" : "insert");
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <!-- ブラウザのタブに楽譜のタイトルを出す（読み込む前は「編集」）（ステップ7-4） -->
  <title>{loadState === "ready" ? score.title : "編集"} - string-score</title>
</svelte:head>

{#if loadState === "ready"}
  <!-- 画面全体：上から 上のバー・タブ・選択中の表示・五線譜・鍵盤 -->
  <div class="editor">
    <TopBar
      {saveState}
      tempo={score.tempo}
      tempoText={score.tempoText}
      canUndo={history.undo.length > 0}
      canRedo={history.redo.length > 0}
      onundo={handleUndo}
      onredo={handleRedo}
      parts={score.parts}
      {playing}
      {soundState}
      {playTarget}
      {canPlay}
      {soundType}
      onplay={handlePlay}
      onstop={handleStop}
      ontarget={handleTarget}
      onsoundtype={handleSoundType}
      onexport={handleExport}
      onprint={handlePrint}
    />
    <ToolTabs
      isNew={page.state.isNew === true}
      {duration}
      {dotted}
      {canUse}
      onduration={handleDuration}
      ondot={handleDot}
      onrest={handleRest}
      {canRest}
      {noteSelected}
      onaccidental={handleAccidental}
      onstep={handleTranspose}
      {rangeEditable}
      ontie={handleTie}
      ondelete={handleDelete}
      {mode}
      onmode={handleMode}
      selectedNote={noteSelected ? getSelectedNote(score, selection) : null}
      onsymbol={handleSymbol}
      {spanState}
      {canSpanRange}
      onspanner={handleSpanner}
      {score}
      onsettings={handleSettings}
      {canDeleteMeasure}
      onmeasure={handleMeasure}
      {currentTime}
      ontime={handleTime}
      {currentKey}
      onkey={handleKeySignature}
      {currentClef}
      onclef={handleClef}
      selectedPart={selection ? selection.part : null}
      onaddpart={handleAddPart}
      onmovepart={handleMovePart}
      ondeletepart={handleDeletePart}
      {canCopy}
      {canPaste}
      onclipboard={handleClipboard}
    />
    <SelectionInfo {score} {selection} {range} {message} />
    <!-- MusicXML を読み込んだときに知らせること（なければ何も出ない）（ステップ8-4c） -->
    <ImportNotice />

    <!-- 五線譜の部分だけスクロールする -->
    <main class="score-area">
      <ScoreView {score} {selection} {range} {playingNotes} {playing} onselect={handleSelect} />
    </main>

    <PianoKeyboard startOctave={keyboardOctave} onpress={handleKey} onshift={handleShift} />
  </div>

  <!-- 印刷用のページ（［PDF 出力］を押したときだけ出す。印刷の画面が閉じたら消す）（ステップ9） -->
  {#if printing}
    <PrintView {score} onclose={() => (printing = false)} />
  {/if}
{:else if loadState === "loading"}
  <!-- 読み込み中（すぐに終わるので、ほとんど見えない） -->
  <p class="load-status">読み込み中…</p>
{:else}
  <!-- URL の id の楽譜が見つからない -->
  <div class="load-status">
    <p>楽譜が見つかりませんでした（削除されたか、別のブラウザで作った楽譜かもしれません）。</p>
    <p><a href="/">楽譜の一覧へ</a></p>
  </div>
{/if}

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
  .load-status {
    padding: 16px; /* 読み込み中・見つからないときの文字のまわりの余白 */
  }
</style>
