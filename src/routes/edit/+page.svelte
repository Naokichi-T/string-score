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
  // （ステップ14-1：［重音］が入のとき、鍵盤・音名キーで選んでいる音に音を足す）
  // （ステップ14-2：重音の中の1つの玉を選んで、▲▼・♯♭♮・削除をその玉だけに効かせる）
  // （ステップ14-5a：ハーモニクス（ひし形の玉のある音符）の音を確かめるときは、聞こえる音を鳴らす）
  // （ステップ17-1：「楽譜の設定」タブの［移調する］で、楽譜全体を移調する）
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
  import {
    createEmptyScore,
    keyAt,
    timeAt,
    tempoAt,
    INSTRUMENTS,
    ensurePartIds,
    isMeasureRest,
    notePitches,
    hasDiamond,
    measureName,
    measureNumber,
    hasPickup,
    NO_DOT_DURATIONS,
    upgradeWedges,
  } from "#lib/score/model.js";
  import { moveSelection, getSelectedNote, makeRange, selectedHead } from "#lib/score/selection.js";
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
    setGracePitch,
    canSpan,
    getSpanState,
    toggleSpanner,
    canWedgeInside,
    toggleWedgeInside,
    rangeHasNotes,
    deleteRange,
    transposeRange,
    pitchForLetter,
    setScoreInfo,
    insertMeasure,
    deleteMeasures,
    changeTime,
    setPickup,
    changeKey,
    changeClef,
    clefAt,
    addPart,
    movePart,
    deletePart,
    canGlissando,
    setTempoChange,
    removeTempoChange,
    toggleGradual,
    toggleATempo,
    setBarline,
    toggleRepeatStart,
    toggleRepeatEnd,
    toggleEnding,
    toggleJumpMark,
    setJump,
    toggleMeasureRest,
    toggleChordPitch,
    chordPitchForLetter,
    transposeChordHead,
    setChordHeadAccidental,
    removeChordHead,
    cleanAlternates,
  } from "#lib/score/edit.js";
  import { transposeScore } from "#lib/score/transpose.js"; // 楽譜全体の移調（ステップ17-1）
  import { createHistory, record, undo, redo } from "#lib/score/history.js";
  import { copyNotes, pasteNotes, expandToTuplets } from "#lib/score/clipboard.js";
  import { tupletError, makeTuplet, removeTuplet } from "#lib/score/tuplets.js";
  import { playPitch, loadInstruments, isLoaded, playEvents, scheduleMore, stopPlayback, setSoundType, getPlaybackTime } from "#lib/audio/sound.js";
  import { buildEvents, secondsPerTick, isPizzAt, addCountIn, soundingPitches } from "#lib/score/playback.js";
  import { loadScore, saveScore, loadSettings, saveSetting, loadMixer, saveMixer, loadHiddenParts, saveHiddenParts, loadClipboard, saveClipboard, CLIPBOARD_KEY } from "#lib/score/library.js";
  import { mixerOf } from "#lib/score/mixer.js";
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

  // 音符を1つだけ選んでいて、その音符の下だけに松葉を付けられるか（ステップ16-1）
  // （範囲にスラー・松葉を付けられるときは、範囲のほうを使う）
  let canWedgeNote = $derived(!canSpanRange && canWedgeInside(score, selection));

  // 範囲に付いているスラー・松葉（ボタンを青くするため）
  // （ステップ16-1：音符を1つだけ選んでいるときは、その音符の下だけの松葉）
  let spanState = $derived.by(() => {
    if (canSpanRange) return getSpanState(score, range);
    if (canWedgeNote) return { slur: false, wedge: getSelectedNote(score, selection)?.wedgeInside ?? null };
    return { slur: false, wedge: null };
  });

  // 選んでいる音にグリッサンドを付けられるか（「記号」タブのボタンを押せるようにするため）（ステップ11-5a）
  let glissandoAllowed = $derived(canGlissando(score, selection));

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

  // 移調で知らせること（黄色い枠で出す。なければ null）（ステップ17-1）
  //   { items: 知らせることの一覧 }（移調するたびに新しく作るので、{#key} で枠が作り直される）
  let transposeNotice = $state(null);

  // 鍵盤の一番左のドのオクターブ
  let keyboardOctave = $state(4);

  // 最後に選んでいたパート（パートが変わったときだけ鍵盤の音域を切り替えるため）
  let lastPart = null;

  // 再生中か
  let playing = $state(false);

  // 楽器の音の読み込みの状態（"loading"：読み込み中、"ready"：完了、"error"：失敗）
  let soundState = $state("loading");

  // パートごとの音量の設定（くわしくは score/mixer.js）（ステップ12-3）
  // 楽譜を開いたときに、その楽譜の設定を読み込む
  // （ステップ12-3b：上のバーの「鳴らすパート」の欄（playTarget）はやめて、これのソロで選ぶようにした）
  let mixer = $state({});

  // 再生中の、小節ごとの始まりの時刻 [{ measure, startTick }, ...]（再生を始めたときに buildEvents で作る）（ステップ12-3b）
  // 音量を変えたときに「今何小節目か」を調べて、その小節から鳴らし直すのに使う
  let playMeasureStarts = [];

  // ----------------------------------------------------------
  // 関数：handleMixer
  // 「再生」タブで音量・ミュート・ソロが変わったとき（ステップ12-3）
  //   partId  … パートの名札（id）
  //   changes … 変えた項目（例：{ volume: 80 }、{ mute: true }）
  //   final   … 変え終わったか（つまみを動かしている途中は false、離したときと M・S のボタンは true）（ステップ12-3b）
  // そのパートの設定に変えた項目を重ねて、すぐに保存する
  // （楽譜の中身ではないので、元に戻すの履歴には残さない）
  // 再生中に変え終わったら、今鳴っている小節の頭から、新しい設定で鳴らし直す（ステップ12-3b）
  // ----------------------------------------------------------
  function handleMixer(partId, changes, final = true) {
    mixer = { ...mixer, [partId]: { ...mixerOf(mixer, partId), ...changes } };
    saveMixer(scoreId, mixer);
    if (final) replayIfPlaying();
  }

  // 隠すパートの名札（id）の配列（ステップ12-6a）
  // 楽譜を開いたときに、その楽譜の設定を読み込む（楽譜ごとに覚える）
  let hiddenParts = $state([]);

  // 表示するパートの本当の番号の配列（例：[0, 2]）（ステップ12-6a）
  // 全部隠れてしまうとき（消したパートの名札が残っているなど）は、全部表示にする
  let visibleParts = $derived.by(() => {
    const shown = score.parts.map((part, p) => (hiddenParts.includes(part.id) ? -1 : p)).filter((p) => p >= 0);
    return shown.length > 0 ? shown : score.parts.map((_, p) => p);
  });

  // ----------------------------------------------------------
  // 関数：handleToggleView
  // 「パート」タブの表示のチェックが押されたとき（ステップ12-6a）
  //   partId … パートの名札（id）
  // 表示する・隠すを切り替えて保存する（表示しているのが1つだけなら、それは隠さない）
  // 選んでいた音や範囲のパートを隠したときは、選択を外す
  // ----------------------------------------------------------
  function handleToggleView(partId) {
    if (hiddenParts.includes(partId)) {
      hiddenParts = hiddenParts.filter((id) => id !== partId); // 表示に戻す
    } else {
      if (visibleParts.length <= 1) return; // 最後の1つは隠さない
      hiddenParts = [...hiddenParts, partId];
    }
    saveHiddenParts(scoreId, hiddenParts);

    // 選んでいるパートが隠れたら、選択を外す
    if (selection && hiddenParts.includes(score.parts[selection.part].id)) {
      selection = null;
      rangeEnd = null;
    }
  }

  // 拍の線を描くか（ステップ12-7）
  // アプリ全体で1つ（設定として保存する）。ページを開いたときに読み込む
  let beatLines = $state(false);

  // ----------------------------------------------------------
  // 関数：handleToggleBeats
  // 「パート」タブの［拍の線］が押されたとき：入・切を変えて保存する（ステップ12-7）
  // ----------------------------------------------------------
  function handleToggleBeats() {
    beatLines = !beatLines;
    saveSetting("beatLines", beatLines);
  }

  // 鍵盤をたたんでいるか（ステップ12-9）
  // アプリ全体で1つ（設定として保存する）。ページを開いたときに読み込む
  let keyboardCollapsed = $state(false);

  // ----------------------------------------------------------
  // 関数：handleToggleKeyboard
  // 鍵盤の［▼］［▲ 鍵盤］が押されたとき：たたむ・出すを変えて保存する（ステップ12-9）
  // ----------------------------------------------------------
  function handleToggleKeyboard() {
    keyboardCollapsed = !keyboardCollapsed;
    saveSetting("keyboardCollapsed", keyboardCollapsed);
  }

  // タブの中身をたたんでいるか（ステップ18-1）
  // 鍵盤と同じく、アプリ全体で1つ（設定として保存する）。ページを開いたときに読み込む
  let tabsCollapsed = $state(false);

  // ----------------------------------------------------------
  // 関数：handleToggleTabs
  // タブの［▲］［▼］が押されたとき・たたんでいる間にタブの名前が押されたとき：
  // たたむ・出すを変えて保存する（ステップ18-1）
  // ----------------------------------------------------------
  function handleToggleTabs() {
    tabsCollapsed = !tabsCollapsed;
    saveSetting("tabsCollapsed", tabsCollapsed);
  }

  // メトロノームの設定 { on: 鳴らすか, volume: 音量 0〜100, countIn: カウントインを入れるか }（ステップ12-4a・12-4b）
  // アプリ全体で1つ（音の種類と同じく、設定として保存する）。ページを開いたときに読み込む
  let metronome = $state({ on: false, volume: 70, countIn: false });

  // ----------------------------------------------------------
  // 関数：handleMetronome
  // 「再生」タブでメトロノームの設定が変わったとき（ステップ12-4a）
  //   changes … 変えた項目（例：{ on: true }、{ volume: 50 }）
  //   final   … 変え終わったか（つまみを動かしている途中は false）
  // 設定を保存し、再生中に変え終わったら、今の小節の頭から鳴らし直す
  // ----------------------------------------------------------
  function handleMetronome(changes, final = true) {
    metronome = { ...metronome, ...changes };
    saveSetting("metronome", $state.snapshot(metronome));
    if (final) replayIfPlaying();
  }

  // ----------------------------------------------------------
  // 関数：replayIfPlaying
  // 再生中なら、今鳴っている小節の頭から、新しい設定で鳴らし直す（ステップ12-4a：handleMixer から分けた）
  // （ステップ12-5b：区間リピートが入っていれば、範囲の終わりまで鳴らしたあと、範囲の頭からくり返しを続ける）
  // ----------------------------------------------------------
  function replayIfPlaying() {
    if (!playing) return;
    let measure = currentMeasure(); // 止める前に、今何小節目かを調べておく
    // くり返す範囲（切なら null）。くり返し中なら今の範囲のまま、そうでなければ選んでいる所から決める
    const repeat = repeatOn ? (repeatRange ?? getRepeatRange()) : null;
    // 今の小節が範囲の外なら、範囲の頭から
    if (repeat && (measure < repeat.start || measure > repeat.end)) measure = repeat.start;
    handleStop();
    playFrom(measure, false, repeat); // 鳴らし直しでは、カウントインは入れない（ステップ12-4b）
  }

  // 区間リピートが入っているか（ステップ12-5b）。ページを開き直したら切に戻る（保存しない）
  let repeatOn = $state(false);

  // 再生中にくり返している範囲 { start, end }（小節の番号。くり返していないときは null）（ステップ12-5b）
  let repeatRange = $state(null);

  // くり返しの予約のしかた（くり返していないときは null）（ステップ12-5b）
  //   firstTicks  … 最初の回（カウントインを含む）の長さ（ティック）
  //   period      … 2回目からの1回分の長さ（ティック）
  //   result      … 2回目からの1回分の buildEvents の結果（予約・緑の表示・小節の時刻に使う）
  //   clicks      … 2回目からの1回分のクリック（メトロノームが切なら空）
  //   tickSeconds … 1ティックが何秒か
  //   next        … 次に予約する回（0 なら2回目）
  let repeatPlan = null;

  // 次の回を予約するためのタイマー（ステップ12-5b）
  let repeatTimer = null;

  // 次の回を、始まる何秒前に予約するか（ステップ12-5b）
  const REPEAT_LEAD = 1.0;

  // ----------------------------------------------------------
  // 関数：getRepeatRange
  // 今選んでいる所から、くり返す範囲を決める（ステップ12-5b）
  //   範囲を選んでいる → 範囲にかかる小節まるごと
  //   音を1つ選んでいる → その小節1つ
  //   何も選んでいない → 曲の最初から最後まで
  // 戻り値：{ start, end }（小節の番号。0 から数える）
  // ----------------------------------------------------------
  function getRepeatRange() {
    if (range) return { start: range.start.measure, end: range.end.measure };
    if (selection) return { start: selection.measure, end: selection.measure };
    return { start: 0, end: score.measures.length - 1 };
  }

  // 「再生」タブに出す、くり返す範囲の文字（例："3〜5小節目"）（ステップ12-5b）
  // 再生中はくり返している範囲、止まっているときは今選んでいる所から決めた範囲
  // （ステップ15-1：アウフタクトがあるときは、アウフタクトを数えない番号にする。例："アウフタクト〜2小節目"）
  let repeatText = $derived.by(() => {
    const r = repeatRange ?? getRepeatRange();
    if (r.start === r.end) return measureName(score, r.start); // 1小節だけ（"3小節目"・"アウフタクト"）
    // 始まりの小節：アウフタクトなら "アウフタクト"、それ以外は番号だけ
    const startText = r.start === 0 && hasPickup(score) ? "アウフタクト" : String(measureNumber(score, r.start));
    return `${startText}〜${measureNumber(score, r.end)}小節目`;
  });

  // ----------------------------------------------------------
  // 関数：handleRepeat
  // 「再生」タブの［区間リピート］が押されたとき（ステップ12-5b）
  // 入・切を変え、再生中なら今の小節から鳴らし直す（入れたときは、選んでいる所からくり返す）
  // ----------------------------------------------------------
  function handleRepeat() {
    repeatOn = !repeatOn;
    replayIfPlaying();
  }

  // ----------------------------------------------------------
  // 関数：startRepeat
  // 区間リピートの2回目からの予約を始める（ステップ12-5b）
  //   repeat      … くり返す範囲 { start, end }
  //   firstTicks  … 最初の回（カウントインを含む）の長さ（ティック）
  //   tickSeconds … 1ティックが何秒か
  // ----------------------------------------------------------
  function startRepeat(repeat, firstTicks, tickSeconds) {
    // 2回目からは、いつも範囲の頭から終わりまで（カウントインなし）
    const result = buildEvents(score, repeat.start, mixer, repeat.end);
    repeatRange = repeat;
    repeatPlan = {
      firstTicks: firstTicks,
      period: result.totalTicks,
      result: result,
      clicks: metronome.on ? result.clicks : [],
      tickSeconds: tickSeconds,
      next: 0,
    };
    scheduleNextRepeat();
  }

  // ----------------------------------------------------------
  // 関数：scheduleNextRepeat
  // 次の回が始まる REPEAT_LEAD 秒前になったら、その回を予約する（ステップ12-5b）
  // 予約したら、さらに次の回のために自分をもう一度呼ぶ（止めるまで続く）
  // ----------------------------------------------------------
  function scheduleNextRepeat() {
    const plan = repeatPlan;
    if (!plan) return;
    const offset = plan.firstTicks + plan.next * plan.period; // この回が、再生を始めてから何ティック目に始まるか
    const wait = offset * plan.tickSeconds - REPEAT_LEAD - (getPlaybackTime() ?? 0); // 予約するまで待つ秒数
    repeatTimer = setTimeout(
      () => {
        if (repeatPlan !== plan) return; // 止めた・鳴らし直したあとなら何もしない
        scheduleMore(plan.result.events, plan.clicks, offset, plan.tickSeconds, metronome.volume);
        plan.next = plan.next + 1;
        scheduleNextRepeat();
      },
      Math.max(0, wait) * 1000,
    );
  }

  // ----------------------------------------------------------
  // 関数：playbackPosition
  // 再生を始めてからのティックを、「今の回の中の位置」に直す（ステップ12-5b）
  //   tick … 再生を始めてから何ティックたったか
  // 戻り値：{ tick: 回の中の位置, highlights: その回の緑の一覧, measureStarts: その回の小節の始まり }
  //   ・最初の回（区間リピートでないときは全部）：そのまま
  //   ・2回目から：最初の回の長さを引いて、1回分の長さで割った余り
  // ----------------------------------------------------------
  function playbackPosition(tick) {
    if (!repeatPlan || tick < repeatPlan.firstTicks) {
      return { tick: tick, highlights: highlights, measureStarts: playMeasureStarts };
    }
    const inner = (tick - repeatPlan.firstTicks) % repeatPlan.period; // % は割った余り
    return { tick: inner, highlights: repeatPlan.result.highlights, measureStarts: repeatPlan.result.measureStarts };
  }

  // 音の種類（"instrument"：楽器の音A、"instrumentB"：楽器の音B、"synth"：電子音）。最初は楽器の音A
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
    // （ステップ12-5b：区間リピートの2回目からは、今の回の中の位置で探す）
    const position = playbackPosition(time / highlightTickSeconds);
    const now = position.highlights.filter((h) => h.startTick <= position.tick && position.tick < h.endTick);

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
  // 関数：loadSound
  // 楽器の音（A か B）を読み込んで、終わったら soundState を変える（ステップ12-2）
  //   type … "instrument"（楽器の音A）か "instrumentB"（楽器の音B）
  // 読み込みの途中で別の音の種類に切り替えたときは、soundState を変えない
  // （soundState は「今選んでいる方」の状態なので、ちがう方の結果で書きかえないため）
  // ----------------------------------------------------------
  function loadSound(type) {
    // もう読み込み済みなら、すぐに「完了」にする
    if (isLoaded(type)) {
      soundState = "ready";
      return;
    }
    soundState = "loading";
    loadInstruments(type)
      .then(() => {
        if (soundType === type) soundState = "ready";
      })
      .catch((error) => {
        console.error("楽器の音を読み込めませんでした", error);
        if (soundType === type) soundState = "error";
      });
  }

  // ----------------------------------------------------------
  // 関数：handleSoundType
  // 上のバーで音の種類が選ばれたとき
  //   type … "instrument"（楽器の音A）・"instrumentB"（楽器の音B）・"synth"（電子音）
  // 再生中なら止める（選び直した音で、もう一度再生してもらう）
  // 楽器の音を選んだときは、まだ読み込んでいなければ読み込む（ステップ12-2）
  // ----------------------------------------------------------
  function handleSoundType(type) {
    handleStop();
    soundType = type;
    setSoundType(type); // 鳴らす仕組み（sound.js）にも知らせる
    saveSetting("soundType", type); // 次に開いたときのために覚えておく（アプリ全体で1つ）（ステップ7-4）
    if (type !== "synth") {
      loadSound(type);
    }
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

    // 前に選んだ音の種類を読み込む（保存していなければ「楽器の音A」のまま）（ステップ7-4）
    const savedType = loadSettings().soundType;
    if (savedType === "instrument" || savedType === "instrumentB" || savedType === "synth") {
      soundType = savedType;
      setSoundType(savedType); // 鳴らす仕組み（sound.js）にも知らせる
    }

    // 前に決めたメトロノームの設定を読み込む（保存していなければ、切・音量70 のまま）（ステップ12-4a）
    const savedMetronome = loadSettings().metronome;
    if (savedMetronome && typeof savedMetronome === "object") {
      metronome = { ...metronome, ...savedMetronome };
    }

    // 前に決めた拍の線の入・切を読み込む（保存していなければ切のまま）（ステップ12-7）
    beatLines = loadSettings().beatLines === true;

    // 前に決めた鍵盤のたたみ方を読み込む（保存していなければ出したまま）（ステップ12-9）
    keyboardCollapsed = loadSettings().keyboardCollapsed === true;

    // 前に決めたタブのたたみ方を読み込む（保存していなければ出したまま）（ステップ18-1）
    // ただし新しく作った楽譜のときは、タイトルの入力欄を見せたいので、いつも出す（保存はしない）
    tabsCollapsed = page.state.isNew === true ? false : loadSettings().tabsCollapsed === true;

    // 前に（ほかのタブ・ほかの楽譜で）コピーした音を読み込む（なければ null のまま）（ステップ13-1）
    clipboard = loadClipboard();

    // 楽器の音を読み込む（楽器の音B を選んでいれば B、それ以外（A・電子音）は A）（ステップ12-2）
    loadSound(soundType === "instrumentB" ? "instrumentB" : "instrument");

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
    mixer = loadMixer(id); // この楽譜の音量の設定（ステップ12-3）
    hiddenParts = loadHiddenParts(id); // この楽譜の、隠すパートの設定（ステップ12-6a）
    // パートに id（名札）がなければ付ける（ステップ12-3 より前に作った楽譜）（ステップ12-3）
    // （ステップ16-1：古い形の松葉の終わり（wedge: "stop"）も、新しい形（wedgeEnd）に直す）
    const withIds = upgradeWedges(ensurePartIds(loaded));
    score = withIds;
    if (withIds === loaded) {
      savedScore = score; // 開いただけでは保存しない（更新日時を変えないため）
    } else {
      savedScore = null; // id を付けたときは、付けた id を覚えておくために1回だけ保存する
    }
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

  // 選んでいる音符が重音か（ステップ14-1）
  // （ステップ14-2：重音でも、選んでいる玉の ♯♭♮ を変えられるようになった）
  let chordSelected = $derived(!!getSelectedNote(score, selection)?.chord);

  // ［重音］が入っているか（ステップ14-1）
  // 入のときは、鍵盤・音名キーで、選んでいる音に音を足す（次の音へは進まない）
  // ページを開き直したら切に戻る（保存しない。［範囲］と同じ）
  let chordMode = $state(false);

  // ----------------------------------------------------------
  // 関数：handleChordMode
  // 「音符」タブの［重音］が押されたとき：入・切を変える（ステップ14-1）
  // ----------------------------------------------------------
  function handleChordMode() {
    chordMode = !chordMode;
    message = "";
  }

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
  // （ステップ14-6a：2音トレモロにできなくなった音符の印などを、ここでまとめて直す（cleanAlternates））
  // ----------------------------------------------------------
  function commit(newScore, newSelection = selection) {
    // 何も変わっていなければ、履歴に残さない
    if (newScore === score) return;
    // 2音トレモロの印を、決まりどおりに直す（3音にした・8分音符にしたなど。直すものがなければそのまま）（ステップ14-6a）
    newScore = cleanAlternates(newScore);
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
    transposeNotice = null; // 移調の知らせも消す（元に戻したら、もう当てはまらないため）（ステップ17-1）
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
    transposeNotice = null; // 移調の知らせも消す（元に戻したら、もう当てはまらないため）（ステップ17-1）
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
    // Shift を押していたとき、または［範囲］が入っているとき（タブレット用）は、範囲を作る（ステップ12-8b）
    if ((shift || rangeMode) && selection && newSelection && newSelection.part === selection.part) {
      // 範囲のもう一方の端にする（選んでいる音そのものをクリックしたら範囲をやめる）
      rangeEnd = samePlace(newSelection, selection) ? null : newSelection;
      return;
    }
    // ふつうのクリック（または違うパート）：その音だけを選ぶ
    selection = newSelection;
    rangeEnd = null;
  }

  // ［範囲］が入っているか（ステップ12-8b）
  // 入のときは、Shift を押さなくても、選んでいる音から次にタップした音までが範囲になる（タブレットで範囲を選ぶため）
  // ページを開き直したら切に戻る（保存しない）
  let rangeMode = $state(false);

  // ----------------------------------------------------------
  // 関数：handleRangeMode
  // 「音符」タブの［範囲］が押されたとき：入・切を変える（ステップ12-8b）
  // 切にしても、今の範囲はそのまま残す
  // ----------------------------------------------------------
  function handleRangeMode() {
    rangeMode = !rangeMode;
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
  // 関数：handleMoveButton
  // 青い帯の［◀ 前の音］［次の音 ▶］が押されたとき（ステップ12-10a）
  //   direction … 1 なら次の音へ、-1 なら前の音へ
  // ［範囲］が入っていれば、範囲の端を動かす（Shift＋← → と同じ）
  // 入っていなければ、前後の音を選ぶ（← → と同じ。範囲選択はやめる）
  // ----------------------------------------------------------
  function handleMoveButton(direction) {
    if (!selection) return;
    if (rangeMode) {
      extendRange(direction);
      return;
    }
    selection = moveSelection(score, selection, direction);
    rangeEnd = null;
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
    // 連符の中の音を選んでいるときは、長さを変えない（ステップ10-3）
    if (selectedInTuplet) {
      message = "連符の中の音の長さは変えられません（［連符を解除］すると変えられます）";
      return;
    }
    // 今の付点のまま入らないなら、付点を外す
    let dots = dotted ? 1 : 0;
    if (selection && !canUse(d, dots)) dots = 0;

    duration = d;
    dotted = dots === 1;
    // 16分音符には付点を付けられない（32分音符のボタンはないので、ここには来ない）（ステップ15-5）
    if (NO_DOT_DURATIONS.includes(d)) dotted = false;

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
      if (NO_DOT_DURATIONS.includes(duration)) {
        message = "16分音符には付点を付けられません";
        return;
      }
      dotted = !dotted;
      return;
    }

    // 連符の中の音には付点を付けられない（ステップ10-3）
    if (note.tuplet) {
      message = "連符の中の音には付点を付けられません";
      return;
    }

    // 選んでいる音の付点を切り替える
    const newDots = (note.dots ?? 0) > 0 ? 0 : 1;
    if (!canUse(note.duration, newDots)) {
      // 16分・32分音符：付点を付けられない（32分音符は MusicXML の読み込みで出てくる）（ステップ15-5）
      const noDot = newDots === 1 && NO_DOT_DURATIONS.includes(note.duration);
      message = noDot ? `${note.duration === "32nd" ? "32" : "16"}分音符には付点を付けられません` : "付点を付けると小節に入りきりません";
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
    // 挿入モードでは、連符の中には入れられない（ステップ10-3）
    if (mode === "insert" && selectedInTuplet) {
      message = "連符の中には挿入できません。上書きモードにして入れてください";
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
    // ［重音］が入っていて音符を選んでいるときは、選んでいる重音のすぐ上の高さにする（ステップ14-1）
    inputPitch(chordMode ? chordPitchForLetter(score, selection, step) : pitchForLetter(score, selection, step));
  }

  // ----------------------------------------------------------
  // 関数：inputPitch
  // 今の長さ・付点で、選んでいる場所に音を入れる（鍵盤と音名キーで共通）
  // 入れられたら、選んでいるパートの楽器の音で鳴らす
  //   pitch … 音の高さ { step, alter, octave }
  // ----------------------------------------------------------
  function inputPitch(pitch) {
    // 「前打音の高さを入れる」状態なら、主音ではなく前打音の高さを変える（ステップ11-8a）
    if (graceTarget) {
      const pizzAtGrace = isPizzAt(score, selection);
      commit(setGracePitch(score, selection, pitch));
      graceTarget = null;
      message = "";
      playPitch(pitch, currentInstrument, 0.5, pizzAtGrace);
      return;
    }

    // ［重音］が入っていれば、選んでいる音に足す（次の音へは進まない）（ステップ14-1）
    if (chordMode) {
      addToChord(pitch);
      return;
    }

    const dots = dotted ? 1 : 0;
    // 入れる場所がピチカートの範囲かどうか（入れる前に調べる。入れると選択が次の音に進むため）
    const pizz = selection ? isPizzAt(score, selection) : false;
    const ok = putNote({ pitch: pitch, duration: duration, dots: dots, tie: false });
    // 入れたあとは選択が次の音に進むが、同じパートなので楽器は変わらない
    if (ok) playPitch(pitch, currentInstrument, 0.5, pizz);
  }

  // ----------------------------------------------------------
  // 関数：addToChord
  // ［重音］が入のときに、鍵盤・音名キーで押された高さを、選んでいる所に足す（ステップ14-1）
  //   pitch … 押された高さ { step, alter, octave }
  // ・選んでいるのが休符 → 今の長さの音を入れる（上書き。挿入モードでも、後ろはずらさない）。次の音へは進まない
  // ・選んでいるのが音符 → その高さを足す。同じ高さがもうあれば外す（最後の1音は外さない）。長さはその音符のまま
  // 入れたら、重音全体を鳴らす（響きを確かめられるように）
  // ----------------------------------------------------------
  function addToChord(pitch) {
    if (!selection) {
      message = "先に、音を入れたい場所（休符など）をクリックして選んでください";
      return;
    }
    const note = getSelectedNote(score, selection);

    // 休符：今の長さで音を入れる（選択はそのまま）
    if (note.rest) {
      const dots = dotted ? 1 : 0;
      if (!canFit(score, selection, duration, dots)) {
        message = "その長さは小節に入りきりません。短い長さを選んでください";
        return;
      }
      message = "";
      commit(replaceAt(score, selection, { pitch: pitch, duration: duration, dots: dots, tie: false }));
      playSelected();
      return;
    }

    // 音符：足す・外す（足した玉を選ぶ。外したときは、そのすぐ下の玉）（ステップ14-2）
    const result = toggleChordPitch(score, selection, pitch);
    message = result.error;
    if (result.error) return;
    commit(result.score, withHead(result.score, selection, result.head));
    playSelected();
  }

  // ----------------------------------------------------------
  // 関数：withHead
  // 選択中の場所に、重音の中の玉の番号（head）を付けたものを返す（ステップ14-2）
  // 重音でなくなったときは、head を付けない
  //   newScore … 変えたあとの楽譜データ
  //   place    … 選択中の場所
  //   head     … 玉の番号（低い順。0 から）
  // ----------------------------------------------------------
  function withHead(newScore, place, head) {
    const { head: _old, ...rest } = place; // 前の head を取りのぞいた形
    const note = getSelectedNote(newScore, rest);
    if (!note || note.rest || !note.chord) return rest;
    return { ...rest, head: head };
  }

  // ----------------------------------------------------------
  // 関数：moveHead
  // 重音の中で、上か下の玉へ選択を移す（⌥（Alt）＋↑↓）（ステップ14-2）
  //   direction … 1 なら上の玉へ、-1 なら下の玉へ（端まで来ていたら動かない）
  // ----------------------------------------------------------
  function moveHead(direction) {
    if (!chordSelected) return;
    const count = 1 + getSelectedNote(score, selection).chord.length;
    const head = Math.min(count - 1, Math.max(0, selectedHead(score, selection) + direction));
    selection = { ...selection, head: head };
    rangeEnd = null;
    message = "";
    playSelected(true); // 選んだ玉の音を鳴らす
  }

  // ----------------------------------------------------------
  // 関数：handleRest
  // 休符のボタンが押されたとき：選んでいる場所を、今の長さの休符にする
  // ----------------------------------------------------------
  function handleRest() {
    putNote({ rest: true, duration: duration, dots: dotted ? 1 : 0 });
  }

  // ［全休符］を押せるか（音か休符を選んでいるとき）と、選んでいる小節がもう全休符か（ボタンを青くする）（ステップ13-3b）
  let canMeasureRest = $derived(selection !== null);
  let measureRestActive = $derived(!!selection && isMeasureRest(score.parts[selection.part].measures[selection.measure].notes));

  // ----------------------------------------------------------
  // 関数：handleMeasureRest
  // ［全休符］が押されたとき：選んでいる小節を、小節まるごとの休符にする・拍ごとの休符に戻す（ステップ13-3b）
  // 範囲を選んでいるときは、範囲にかかる小節すべてに効かせる（全部が全休符なら戻す）
  // 押したあとは、最初の小節の1つ目（全休符なら全休符そのもの）を選ぶ
  // ----------------------------------------------------------
  function handleMeasureRest() {
    if (!selection) return;
    message = "";
    const part = selection.part;
    const from = range ? range.start.measure : selection.measure;
    const to = range ? range.end.measure : selection.measure;
    commit(toggleMeasureRest(score, part, from, to), { part: part, measure: from, note: 0 });
  }

  // 連符のボタンを押せるか（音か休符を1つ選んでいるとき）（ステップ10-2）
  let canTuplet = $derived(selection !== null);

  // 選んでいる音が連符の中か（ステップ10-3）
  let selectedInTuplet = $derived(!!getSelectedNote(score, selection)?.tuplet);

  // ----------------------------------------------------------
  // 関数：handleTuplet
  // 連符のボタンが押されたとき：選んでいる音を連符の1つ目にする（ステップ10-2）
  //   actual … 連符の数字（3連符なら 3）
  // 作ったあとも、連符の1つ目を選んだままにする（続けて鍵盤で入れられるように）
  // ----------------------------------------------------------
  function handleTuplet(actual) {
    const error = tupletError(score, selection, actual);
    if (error) {
      message = error;
      return;
    }
    message = "";
    commit(makeTuplet(score, selection, actual));
  }

  // ----------------------------------------------------------
  // 関数：handleRemoveTuplet
  // ［連符を解除］が押されたとき：選んでいる音が入っている連符を、ふつうの音符に戻す（ステップ10-3）
  // 解除したあとは、連符だった所の最初の音を選ぶ
  // ----------------------------------------------------------
  function handleRemoveTuplet() {
    message = "";
    const result = removeTuplet(score, selection);
    commit(result.score, result.selection);
  }

  // ----------------------------------------------------------
  // 関数：playSelected
  // 選んでいる音を鳴らす（高さを変えたあとなどに、耳で確かめるため）
  // 重音なら、全部の音をいっしょに鳴らす（ステップ14-1）
  //   onlyHead … true なら、重音の中で選んでいる玉の音だけを鳴らす（1つの玉を変えたとき）（ステップ14-2）
  // ハーモニクス（ひし形の玉のある音符）なら、どの玉を選んでいても、聞こえる音を鳴らす（ステップ14-5a）
  // ----------------------------------------------------------
  function playSelected(onlyHead = false) {
    const note = getSelectedNote(score, selection);
    if (!note || note.rest) return;
    // ピチカートの範囲なら、ピチカートで鳴らす
    const pizz = isPizzAt(score, selection);
    if (hasDiamond(note)) {
      soundingPitches(note, currentInstrument).forEach((pitch) => playPitch(pitch, currentInstrument, 0.5, pizz));
      return;
    }
    const pitches = notePitches(note);
    const targets = onlyHead ? [pitches[selectedHead(score, selection)]] : pitches;
    targets.forEach((pitch) => playPitch(pitch, currentInstrument, 0.5, pizz));
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

    // 重音：選んでいる玉だけを動かす（ほかの玉と同じ高さになるときは動かさない）（ステップ14-2）
    if (chordSelected) {
      const result = transposeChordHead(score, selection, semitones);
      if (result.error) {
        message = result.error;
        return;
      }
      commit(result.score, withHead(result.score, selection, result.head));
      playSelected(true);
      return;
    }

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

    // 重音：選んでいる玉だけを変える（ほかの玉と同じ高さになるときは変えない）（ステップ14-2）
    if (chordSelected) {
      const result = setChordHeadAccidental(score, selection, alter);
      if (result.error) {
        message = result.error;
        return;
      }
      commit(result.score, withHead(result.score, selection, result.head));
      playSelected(true);
      return;
    }

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

    // 重音：選んでいる玉だけを外す（残りが1つなら、ふつうの音符に戻る）（ステップ14-2）
    if (chordSelected) {
      const result = removeChordHead(score, selection);
      commit(result.score, withHead(result.score, selection, result.head));
      return;
    }

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

    // ハーモニクスのボタンのときは、聞こえる音を鳴らして確かめられるようにする（ステップ14-5a）
    if (kind === "artificialHarmonic" || kind === "diamond") playSelected();

    // 前打音を付けた（種類を変えた）ときは、「前打音の高さを入れる」状態にする（ステップ11-8a）
    // 外したときは、その状態をやめる
    graceTarget = null;
    if (kind === "grace" && getSelectedNote(score, selection)?.grace) {
      graceTarget = { ...selection };
      message = "鍵盤（か音名のキー）で、前打音の高さを選んでください";
    }
  }

  // 「前打音の高さを入れる」状態の音の場所（その状態でなければ null）（ステップ11-8a）
  // この音を選んでいる間に鍵盤を押すと、主音ではなく前打音の高さが変わる（1回押したら、ふつうに戻る）
  let graceTarget = $state(null);

  // ほかの音を選んだら、「前打音の高さを入れる」状態はやめる（ステップ11-8a）
  $effect(() => {
    const now = selection; // selection が変わったら、ここがもう一度動く
    if (graceTarget && !(now && now.part === graceTarget.part && now.measure === graceTarget.measure && now.note === graceTarget.note)) {
      graceTarget = null;
    }
  });

  // ----------------------------------------------------------
  // 関数：handleSpanner
  // スラー・＜・＞ のボタンが押されたとき：選んだ範囲に付ける・外す
  //   kind … 'slur'（スラー）・'crescendo'（＜）・'diminuendo'（＞）
  // （ステップ16-1：音符を1つだけ選んでいるときの ＜・＞ は、その音符の下だけの松葉を付ける・外す）
  // ----------------------------------------------------------
  function handleSpanner(kind) {
    if (!canSpanRange) {
      if (kind !== "slur" && canWedgeNote) {
        message = "";
        commit(toggleWedgeInside(score, selection, kind));
      }
      return;
    }
    message = "";
    // commit で範囲選択が消えるので、覚えておいて元に戻す
    // （スラーや松葉を付けても音の並びは変わらないので、範囲はずれない）
    const end = rangeEnd;
    commit(toggleSpanner(score, range, kind));
    rangeEnd = end;
  }

  // ----------------------------------------------------------
  // 関数：handleTransposeScore
  // 「楽譜の設定」タブの［移調する］が押されたとき：楽譜全体を移調する（ステップ17-1）
  //   toKey     … 行き先の調（♯の数がプラス、♭の数がマイナス）
  //   direction … "nearest"（近いほう）・"up"（上へ）・"down"（下へ）
  // （▲▼ で高さを変える handleTranspose とは別の関数）
  // 移調できないとき（ド1〜ド8 の外に出る音がある）は、赤い字で知らせて何もしない
  // いちばん低い開放弦より低い音ができたときは、移調して黄色い枠で知らせる
  // ----------------------------------------------------------
  function handleTransposeScore(toKey, direction) {
    message = "";
    transposeNotice = null;
    const result = transposeScore(score, toKey, direction);
    if (result.error) {
      message = result.error;
      return;
    }
    commit(result.score); // 選択中の場所はそのまま（音の数や並びは変わらないため）
    if (result.warnings.length > 0) {
      transposeNotice = { items: result.warnings };
    }
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

  // 1小節目の拍子と、今のアウフタクトの拍の数（「小節」タブのアウフタクトの欄に出す）（ステップ15-1）
  let pickup = $derived({ time: timeAt(score, 0), count: score.measures[0].pickup ?? 0 });

  // ----------------------------------------------------------
  // 関数：handlePickup
  // 「小節」タブでアウフタクトの長さを選んだとき（ステップ15-1）
  //   count … アウフタクトの拍の数（0 ならアウフタクトをやめる）
  // どの小節を選んでいても、1小節目に効く
  // 1小節目の前のほうに音があって短くできないときは、知らせて終わり（楽譜は変えない）
  // 1小節目の中の音の数が変わるので、1小節目を選んでいたときは、その最初の音を選び直す
  // ----------------------------------------------------------
  function handlePickup(count) {
    message = "";
    const result = setPickup(score, count);
    if (result.error) {
      message = result.error;
      return;
    }
    const newSelection = selection && selection.measure === 0 ? { part: selection.part, measure: 0, note: 0 } : selection;
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

  // テンポを変える小節（範囲を選んでいれば範囲の最初の小節、音を選んでいればその小節。何も選んでいなければ null）（ステップ11-6a）
  let tempoMeasure = $derived(range ? range.start.measure : selection ? selection.measure : null);

  // 「小節」タブのテンポの欄に出す、その小節の今のテンポ（ステップ11-6a）
  //   { measure: 何小節目か, tempo, tempoText, isChange: その小節でテンポが変わっているか }（何も選んでいなければ null）
  let currentTempo = $derived(
    tempoMeasure === null ? null : { measure: tempoMeasure, ...tempoAt(score, tempoMeasure), isChange: tempoMeasure > 0 && score.measures[tempoMeasure].tempo !== undefined },
  );

  // ----------------------------------------------------------
  // 関数：handleTempoChange
  // 「小節」タブの［変える］が押されたとき：選んでいる小節の頭からテンポを変える（ステップ11-6a）
  //   tempoText … 入れた数字の文字（20〜300 の整数だけ受け付ける）
  //   wordText  … 速度記号の文字（空でもよい）
  // 1小節目なら、「楽譜の設定」のテンポ・速度記号が変わる
  // ----------------------------------------------------------
  function handleTempoChange(tempoText, wordText) {
    if (tempoMeasure === null) return;
    message = "";
    const trimmed = String(tempoText).trim();
    const tempo = Number(trimmed);
    if (trimmed === "" || !Number.isInteger(tempo) || tempo < 20 || tempo > 300) {
      message = "テンポは 20〜300 の数字で入れてください";
      return;
    }
    // commit で範囲選択が消えるので、覚えておいて元に戻す（テンポを変えても音の並びは変わらないので、範囲はずれない）
    const end = rangeEnd;
    commit(setTempoChange(score, tempoMeasure, tempo, wordText.trim()));
    rangeEnd = end;
  }

  // ----------------------------------------------------------
  // 関数：handleTempoRemove
  // 「小節」タブの［元に戻す］が押されたとき：選んでいる小節のテンポ変更を消す（ステップ11-6a）
  // （前の小節のテンポが続く。1小節目のテンポは消せない）
  // ----------------------------------------------------------
  function handleTempoRemove() {
    if (tempoMeasure === null) return;
    message = "";
    const end = rangeEnd;
    commit(removeTempoChange(score, tempoMeasure));
    rangeEnd = end;
  }

  // 「小節」タブの rit.・accel.・a tempo のボタンを青くするための情報（ステップ11-6b）
  //   { gradual: その小節から始まる rit.・accel.（なければ null）, aTempo: a tempo が付いているか }（何も選んでいなければ null）
  let currentGradual = $derived(tempoMeasure === null ? null : { gradual: score.measures[tempoMeasure].gradual ?? null, aTempo: !!score.measures[tempoMeasure].aTempo });

  // ----------------------------------------------------------
  // 関数：handleGradual
  // 「小節」タブの［rit.］［accel.］が押されたとき（ステップ11-6b）
  //   type … "rit" か "accel"
  // 範囲を選んでいれば範囲にかかる小節、音1つならその小節に付ける（同じものが始まっている小節なら外す）
  // ----------------------------------------------------------
  function handleGradual(type) {
    if (tempoMeasure === null) return;
    message = "";
    const to = range ? range.end.measure : tempoMeasure; // 範囲の終わりの小節
    const end = rangeEnd;
    commit(toggleGradual(score, tempoMeasure, to, type));
    rangeEnd = end;
  }

  // ----------------------------------------------------------
  // 関数：handleATempo
  // 「小節」タブの［a tempo］が押されたとき：選んでいる小節の頭に付ける・外す（ステップ11-6b）
  // ----------------------------------------------------------
  function handleATempo() {
    if (tempoMeasure === null) return;
    message = "";
    const end = rangeEnd;
    commit(toggleATempo(score, tempoMeasure));
    rangeEnd = end;
  }

  // 「小節線」タブで使う小節（ステップ11-7a）
  //   barlineEndMeasure   … 終わりの線・くり返しの終わりを付ける小節（範囲なら最後の小節、音を選んでいればその小節）
  //   barlineStartMeasure … くり返しの始まりを付ける小節（範囲なら最初の小節、音を選んでいればその小節）
  let barlineEndMeasure = $derived(range ? range.end.measure : selection ? selection.measure : null);
  let barlineStartMeasure = $derived(tempoMeasure);

  // 「小節線」タブのボタンを青くするための情報（何も選んでいなければ null）（ステップ11-7a）
  let currentBarline = $derived(
    barlineEndMeasure === null
      ? null
      : {
          barline: score.measures[barlineEndMeasure].barline ?? null,
          repeatEnd: !!score.measures[barlineEndMeasure].repeatEnd,
          repeatStart: !!score.measures[barlineStartMeasure].repeatStart,
          ending: score.measures[barlineStartMeasure].ending ?? null, // 範囲の最初の小節から始まるかっこの番号（ステップ11-7b）
          // 𝄋・𝄌 は範囲の最初の小節の頭、To Coda・Fine・D.C.・D.S. は範囲の最後の小節の終わり（ステップ11-7c）
          segno: !!score.measures[barlineStartMeasure].segno,
          coda: !!score.measures[barlineStartMeasure].coda,
          toCoda: !!score.measures[barlineEndMeasure].toCoda,
          fine: !!score.measures[barlineEndMeasure].fine,
          jump: score.measures[barlineEndMeasure].jump ?? null,
          rehearsal: !!score.measures[barlineStartMeasure].rehearsal, // 練習番号は範囲の最初の小節の頭（ステップ11-7d）
        },
  );

  // ----------------------------------------------------------
  // 関数：handleBarline
  // 「小節線」タブの終わりの線のボタンが押されたとき（ステップ11-7a）
  //   type … null（ふつう）・"double"（複縦線）・"final"（終止線）
  // ----------------------------------------------------------
  function handleBarline(type) {
    if (barlineEndMeasure === null) return;
    message = "";
    const end = rangeEnd;
    commit(setBarline(score, barlineEndMeasure, type));
    rangeEnd = end;
  }

  // ----------------------------------------------------------
  // 関数：handleRepeatMark
  // 「小節線」タブのくり返しのボタンが押されたとき：付ける・外す（ステップ11-7a）
  //   kind … "start"（‖: を範囲の最初の小節の頭に）か "end"（:‖ を範囲の最後の小節の終わりに）
  // ----------------------------------------------------------
  function handleRepeatMark(kind) {
    if (barlineEndMeasure === null) return;
    message = "";
    const end = rangeEnd;
    if (kind === "start") {
      commit(toggleRepeatStart(score, barlineStartMeasure));
    } else {
      commit(toggleRepeatEnd(score, barlineEndMeasure));
    }
    rangeEnd = end;
  }

  // ----------------------------------------------------------
  // 関数：handleEnding
  // 「小節線」タブの［1番］［2番］が押されたとき：範囲にかかる小節に、かっこを付ける・外す（ステップ11-7b）
  //   number … 1 か 2
  // ----------------------------------------------------------
  function handleEnding(number) {
    if (barlineEndMeasure === null) return;
    message = "";
    const end = rangeEnd;
    commit(toggleEnding(score, barlineStartMeasure, barlineEndMeasure, number));
    rangeEnd = end;
  }

  // ----------------------------------------------------------
  // 関数：handleJumpMark
  // 「小節線」タブの［Segno］［Coda］［To Coda］［Fine］が押されたとき：付ける・外す（ステップ11-7c）
  // （ステップ11-7d：［練習番号］も、ここで付ける・外す）
  //   kind … "segno"・"coda"・"rehearsal"（範囲の最初の小節の頭に）か "toCoda"・"fine"（範囲の最後の小節の終わりに）
  // ----------------------------------------------------------
  function handleJumpMark(kind) {
    if (barlineEndMeasure === null) return;
    message = "";
    const end = rangeEnd;
    const atStart = kind === "segno" || kind === "coda" || kind === "rehearsal"; // 小節の頭に付けるものか
    const measure = atStart ? barlineStartMeasure : barlineEndMeasure;
    commit(toggleJumpMark(score, measure, kind));
    rangeEnd = end;
  }

  // ----------------------------------------------------------
  // 関数：handleJump
  // 「小節線」タブの D.C.・D.S. のプルダウンで選んだとき：範囲の最後の小節の終わりに付ける（ステップ11-7c）
  //   type … null（なし）・"dc"・"dcFine"・"dcCoda"・"ds"・"dsFine"・"dsCoda"
  // ----------------------------------------------------------
  function handleJump(type) {
    if (barlineEndMeasure === null) return;
    message = "";
    const end = rangeEnd;
    commit(setJump(score, barlineEndMeasure, type));
    rangeEnd = end;
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
  }

  // ----------------------------------------------------------
  // 関数：handlePlay
  // 再生のボタン（Space キー）が押されたとき
  //   ・音か範囲を選んでいれば、その小節の頭から。何も選んでいなければ1小節目から
  //   ・「再生」タブの設定（ミュート・ソロ・音量）に合わせて鳴らす（ステップ12-3b）
  // ----------------------------------------------------------
  function handlePlay() {
    // 区間リピートが入っていれば、くり返す範囲を決めて、その頭から（ステップ12-5b）
    if (repeatOn) {
      const repeat = getRepeatRange();
      playFrom(repeat.start, true, repeat);
      return;
    }

    // 始める小節（範囲を選んでいるときは、範囲の最初の小節）
    let startMeasure = 0;
    if (range) {
      startMeasure = range.start.measure;
    } else if (selection) {
      startMeasure = selection.measure;
    }
    playFrom(startMeasure);
  }

  // ----------------------------------------------------------
  // 関数：playFrom
  // 決めた小節の頭から再生する（ステップ12-3b：handlePlay から分けた）
  //   startMeasure … 何小節目から鳴らすか（0 から数える）
  //   allowCountIn … カウントインを入れてよいか（鳴らし直しのときは false）（ステップ12-4b）
  //   repeat       … 区間リピートの範囲 { start, end }（くり返さないときは null）（ステップ12-5b）
  //                  くり返すときは、範囲の終わりまで鳴らしたあと、範囲の頭からくり返す
  // 再生のボタンと、再生中に音量を変えたときの鳴らし直しで使う
  // ----------------------------------------------------------
  function playFrom(startMeasure, allowCountIn = true, repeat = null) {
    if (!canPlay) return;
    message = "";

    // 楽譜を、鳴らす音の一覧に直す（「再生」タブの設定も渡す。くり返すときは範囲の終わりまで）
    let result = buildEvents(score, startMeasure, mixer, repeat ? repeat.end : null);
    // カウントインが入っていれば、前に1小節ぶん足す（ステップ12-4b）
    let countInClicks = [];
    if (allowCountIn && metronome.countIn) {
      result = addCountIn(result, score, startMeasure);
      countInClicks = result.countInClicks;
    }
    // 鳴らすクリック：カウントイン＋メトロノーム（切のときは鳴らさない）（ステップ12-4a・12-4b）
    const clicks = [...countInClicks, ...(metronome.on ? result.clicks : [])];
    // 楽器の音もクリックもないときだけ、鳴らさない（クリックだけでも鳴らす）
    if (result.events.length === 0 && clicks.length === 0) {
      message = "鳴らす音がありません（休符だけか、全部のパートが鳴らない設定です）";
      return;
    }
    playMeasureStarts = result.measureStarts; // 鳴らし直しのために覚えておく（ステップ12-3b）

    // まとめて予約して鳴らす（最後まで行ったら、再生中をやめて緑を消す）
    const tickSeconds = secondsPerTick(score.tempo);
    const onend = () => {
      playing = false;
      clearHighlight();
    };
    // くり返すときは、最後まで行っても終わらせない（onend の代わりに null を渡す）（ステップ12-5b）
    const started = playEvents(result.events, result.totalTicks, tickSeconds, repeat ? null : onend, clicks, metronome.volume);
    playing = started;

    // 鳴っている音符を緑にし始める
    if (started) {
      highlights = result.highlights;
      highlightTickSeconds = tickSeconds;
      lastHighlightKey = "";
      cancelAnimationFrame(highlightFrame);
      highlightFrame = requestAnimationFrame(updateHighlight);
      // くり返すときは、2回目からの予約を始める（ステップ12-5b）
      if (repeat) startRepeat(repeat, result.totalTicks, tickSeconds);
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
    // 区間リピートの予約もやめる（ステップ12-5b）
    clearTimeout(repeatTimer);
    repeatTimer = null;
    repeatPlan = null;
    repeatRange = null;
  }

  // ----------------------------------------------------------
  // 関数：currentMeasure
  // 再生中に、今鳴っているのが何小節目かを返す（ステップ12-3b）
  // 再生を始めてからの時間を、小節ごとの始まりの時刻（playMeasureStarts）とくらべて決める
  // 戻り値：小節の番号（0 から数える）
  // ----------------------------------------------------------
  function currentMeasure() {
    const time = getPlaybackTime(); // 再生を始めてから何秒たったか（始めてすぐはマイナス）
    // 秒をティックに直し、今の回の中の位置にする（ステップ12-5b：区間リピートの2回目から）
    const position = playbackPosition(Math.max(0, time ?? 0) / highlightTickSeconds);
    // 始まりの時刻が今より前の小節のうち、一番うしろのもの
    let measure = position.measureStarts[0].measure;
    position.measureStarts.forEach((m) => {
      if (m.startTick <= position.tick) measure = m.measure;
    });
    return measure;
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

  // コピーした音の配列（まだ何もコピーしていないときは null）
  // （ステップ13-1：ブラウザの中にも保存するので、ほかのタブ・ページの再読み込みのあとでも貼り付けられる）
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
      // 範囲が連符の途中までなら、連符全体に広げて選び直す（コピーする所が見えるように）（ステップ10-4）
      const target = expandToTuplets(score, range, selection);
      const single = target.start.measure === target.end.measure && target.start.note === target.end.note;
      selection = { part: target.part, measure: target.start.measure, note: target.start.note };
      rangeEnd = single ? null : { part: target.part, measure: target.end.measure, note: target.end.note };

      clipboard = copyNotes(score, range, selection);
      saveClipboard(clipboard); // ほかのタブでも貼り付けられるように保存する（ステップ13-1）
      // 切り取り：コピーしたあと、音符を休符にする（削除のボタンと同じ）
      if (action === "cut") handleDelete();
      return;
    }

    // 貼り付け：選んでいる音の頭から上書きして、貼り付けた所を範囲で選ぶ
    if (!canPaste) return;
    const result = pasteNotes(score, selection, clipboard);
    // 貼り付けられないとき（連符の途中・連符が小節線をまたぐ）は知らせる（ステップ10-4）
    if (result.error) {
      message = result.error;
      return;
    }
    commit(result.score, result.start);
    // commit で範囲選択が消えるので、そのあとで範囲の終わりを決める（1つだけなら範囲にしない）
    const single = result.start.measure === result.end.measure && result.start.note === result.end.note;
    rangeEnd = single ? null : result.end;
  }

  // ----------------------------------------------------------
  // 関数：handleStorage
  // ほかのタブで、ブラウザの中の保存が変わったとき（ステップ13-1）
  // （storage という合図は、自分のタブで保存したときには来ず、ほかのタブで保存したときだけ来る）
  // ほかのタブでコピーしたら、このタブのコピーした音も入れ替える（すぐに［貼り付け］を押せるようにする）
  //   event … 合図の中身（key に、変わった場所の名前が入っている）
  // ----------------------------------------------------------
  function handleStorage(event) {
    if (event.key !== CLIPBOARD_KEY) return;
    clipboard = loadClipboard();
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

    // Ctrl キー（Mac は ⌘ キー）を押しているか
    const command = event.ctrlKey || event.metaKey;

    // ⌘P（Ctrl＋P）：ブラウザのふつうの印刷のかわりに、［PDF 出力］と同じ印刷用のページを出す（ステップ18-2）
    // 文字を入力する欄の中で押されたときも同じにするので、下の「入力欄なら何もしない」より前で調べる
    if (command && (event.key === "p" || event.key === "P")) {
      event.preventDefault(); // ブラウザの印刷の画面を開かせない
      // 印刷用のページを作っている途中なら、二重に作らない
      if (!printing) handlePrint();
      return;
    }

    // 文字を入力する欄で押されたときは何もしない（後のステップで入力欄を作るため）
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

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
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      // ⌥（Alt）＋↑↓：重音の中で、上・下の玉へ選択を移す（ステップ14-2）
      moveHead(event.key === "ArrowUp" ? 1 : -1);
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

<svelte:window onkeydown={handleKeydown} onstorage={handleStorage} />

<svelte:head>
  <!-- ブラウザのタブに楽譜のタイトルを出す（読み込む前は「編集」）（ステップ7-4） -->
  <title>{loadState === "ready" ? score.title : "編集"} - string-score</title>
  <!-- 編集ページは Google の検索結果に出さない（楽譜はブラウザの中にあるので、ほかの人が開いても中身がない）（ステップ17-3） -->
  <meta name="robots" content="noindex" />
</svelte:head>

{#if loadState === "ready"}
  <!-- 画面全体：上から 上のバー・タブ・選択中の表示・五線譜・鍵盤 -->
  <!-- no-print-view：印刷用のページを作っていない間だけ付ける（ステップ18-2） -->
  <!--   ブラウザのメニューから印刷したときに、編集の画面を紙に出さないようにするため -->
  <div class="editor" class:no-print-view={!printing}>
    <TopBar
      {saveState}
      tempo={score.tempo}
      tempoText={score.tempoText}
      canUndo={history.undo.length > 0}
      canRedo={history.redo.length > 0}
      onundo={handleUndo}
      onredo={handleRedo}
      {playing}
      {soundState}
      {canPlay}
      {soundType}
      onplay={handlePlay}
      onstop={handleStop}
      onsoundtype={handleSoundType}
      onexport={handleExport}
      onprint={handlePrint}
    />
    <!-- collapsed・ontoggle：タブの中身をたたむ（ステップ18-1） -->
    <ToolTabs
      collapsed={tabsCollapsed}
      ontoggle={handleToggleTabs}
      isNew={page.state.isNew === true}
      {duration}
      {dotted}
      {canUse}
      onduration={handleDuration}
      ondot={handleDot}
      onrest={handleRest}
      {canRest}
      onmeasurerest={handleMeasureRest}
      {canMeasureRest}
      {measureRestActive}
      {canTuplet}
      ontuplet={handleTuplet}
      inTuplet={selectedInTuplet}
      onremovetuplet={handleRemoveTuplet}
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
      {canWedgeNote}
      onspanner={handleSpanner}
      canGlissando={glissandoAllowed}
      {score}
      onsettings={handleSettings}
      ontranspose={handleTransposeScore}
      {canDeleteMeasure}
      onmeasure={handleMeasure}
      {currentTime}
      ontime={handleTime}
      {pickup}
      onpickup={handlePickup}
      {currentKey}
      {currentTempo}
      ontempo={handleTempoChange}
      onremovetempo={handleTempoRemove}
      {currentGradual}
      ongradual={handleGradual}
      onatempo={handleATempo}
      {currentBarline}
      onbarline={handleBarline}
      onrepeatmark={handleRepeatMark}
      onending={handleEnding}
      onjumpmark={handleJumpMark}
      onjump={handleJump}
      onkey={handleKeySignature}
      {currentClef}
      onclef={handleClef}
      selectedPart={selection ? selection.part : null}
      onaddpart={handleAddPart}
      onmovepart={handleMovePart}
      ondeletepart={handleDeletePart}
      {mixer}
      onmixer={handleMixer}
      {metronome}
      onmetronome={handleMetronome}
      {repeatOn}
      {repeatText}
      onrepeat={handleRepeat}
      {hiddenParts}
      ontoggleview={handleToggleView}
      {beatLines}
      ontogglebeats={handleToggleBeats}
      {canCopy}
      {canPaste}
      onclipboard={handleClipboard}
      {rangeMode}
      onrangemode={handleRangeMode}
      {chordMode}
      onchordmode={handleChordMode}
      {chordSelected}
      selectedHead={selection ? selectedHead(score, selection) : 0}
    />
    <!-- onmove：前後の音へ移るボタン（ステップ12-10a） -->
    <SelectionInfo {score} {selection} {range} {message} onmove={handleMoveButton} />
    <!-- MusicXML を読み込んだときに知らせること（なければ何も出ない）（ステップ8-4c） -->
    <ImportNotice />
    <!-- 移調で知らせること（なければ何も出ない）（ステップ17-1） -->
    {#key transposeNotice}
      {#if transposeNotice}
        <ImportNotice title="移調で、次のことがありました" items={transposeNotice.items} />
      {/if}
    {/key}

    <!-- 五線譜の部分だけスクロールする -->
    <main class="score-area">
      <!-- visibleParts：表示するパートだけを描く（ステップ12-6a） -->
      <!-- beatLines：拍の線（ステップ12-7） -->
      <!-- focus：範囲を広げているときは動かしている端、そうでなければ選んでいる音が見えるようにスクロールする（ステップ13-4） -->
      <ScoreView {score} {selection} {range} {playingNotes} {playing} onselect={handleSelect} {visibleParts} {beatLines} focus={rangeEnd ?? selection} />
    </main>

    <!-- collapsed・ontoggle：鍵盤をたたむ（ステップ12-9） -->
    <PianoKeyboard startOctave={keyboardOctave} onpress={handleKey} onshift={handleShift} collapsed={keyboardCollapsed} ontoggle={handleToggleKeyboard} />
  </div>

  <!-- メニューから印刷したときに紙に出す案内（ステップ18-2） -->
  <!-- 画面では見えず、印刷のときだけ出る。印刷用のページを作っている間は出さない -->
  <!-- （ブラウザのメニュー「ファイル → プリント」から開くと、印刷用のページを作る時間がないため） -->
  {#if !printing}
    <div class="print-fallback">
      <p>楽譜を印刷するときは、画面の右上の［PDF 出力］ボタンか、⌘P（Windows は Ctrl＋P）を使ってください。</p>
      <p>A4 の大きさに合わせた印刷用のページを作ってから、印刷の画面を開きます。</p>
    </div>
  {/if}

  <!-- 印刷用のページ（［PDF 出力］を押したときだけ出す。印刷の画面が閉じたら消す）（ステップ9） -->
  {#if printing}
    <!-- visibleParts：表示しているパートだけを印刷する（ステップ12-6b） -->
    <PrintView {score} onclose={() => (printing = false)} {visibleParts} />
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
    height: 100vh; /* 画面の高さちょうどにする（下の 100dvh が使えない古いブラウザのための予備） */
    /* 今見えている高さちょうどにする（ステップ12-11）
       iPad・iPhone の Safari では、100vh が「アドレスバーを引っ込めたときの高さ」で数えられるので、
       アドレスバーの分だけページが長くなり、下の鍵盤が隠れてしまう
       → dvh（dynamic viewport height）は、アドレスバーを除いた「今見えている高さ」で数える
       （同じ項目を2回書くと、ブラウザがわかるほうのうち、あとに書いたものが使われる） */
    height: 100dvh;
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
  /* メニューから印刷したときの案内（ステップ18-2）：画面では出さない */
  .print-fallback {
    display: none;
  }
  /* 印刷のとき（ステップ18-2） */
  @media print {
    /* 印刷用のページを作っていないときは、編集の画面を隠して、案内だけを出す */
    .editor.no-print-view {
      display: none;
    }
    .print-fallback {
      display: block;
      padding: 20mm 15mm;
      font-size: 12pt;
      line-height: 1.8;
    }
  }
</style>
