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
  // ==========================================================
  import TopBar from "#lib/components/TopBar.svelte";
  import ToolTabs from "#lib/components/ToolTabs.svelte";
  import SelectionInfo from "#lib/components/SelectionInfo.svelte";
  import ScoreView from "#lib/components/ScoreView.svelte";
  import PianoKeyboard from "#lib/components/PianoKeyboard.svelte";
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
  } from "#lib/score/edit.js";
  import { createHistory, record, undo, redo } from "#lib/score/history.js";
  import { playPitch } from "#lib/audio/sound.js";

  // 楽譜データ（空の弦楽四重奏で始める）
  let score = $state(createEmptyScore());

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
  // 入れられたら音を鳴らす
  //   pitch … 音の高さ { step, alter, octave }
  // ----------------------------------------------------------
  function inputPitch(pitch) {
    const dots = dotted ? 1 : 0;
    const ok = putNote({ pitch: pitch, duration: duration, dots: dots, tie: false });
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
    } else if (event.key === "Escape") {
      // Esc キー：選択と範囲を外す
      selection = null;
      rangeEnd = null;
      message = "";
    } else if (command) {
      // ここから下は Ctrl / ⌘ なしのキーだけ（Ctrl＋C のコピーなどを邪魔しないため）
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
  <title>編集 - string-score</title>
</svelte:head>

<!-- 画面全体：上から 上のバー・タブ・選択中の表示・五線譜・鍵盤 -->
<div class="editor">
  <TopBar tempo={score.tempo} tempoText={score.tempoText} canUndo={history.undo.length > 0} canRedo={history.redo.length > 0} onundo={handleUndo} onredo={handleRedo} />
  <ToolTabs
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
  />
  <SelectionInfo {score} {selection} {range} {message} />

  <!-- 五線譜の部分だけスクロールする -->
  <main class="score-area">
    <ScoreView {score} {selection} {range} onselect={handleSelect} />
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
