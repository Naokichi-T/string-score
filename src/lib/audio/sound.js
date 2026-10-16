// ==========================================================
// sound.js
// 音を鳴らす
// （ステップ6-1：録音した楽器の音（smplr のサウンドフォント）で鳴らすようにした）
//   ・ページを開いたら loadInstruments で、バイオリン・ビオラ・チェロの音を先に読み込む
//   ・読み込みが終わる前は、今までの電子音（のこぎり波）で鳴らす
//   ・楽譜の再生は playEvents で全部の音をまとめて予約し、stopPlayback でまとめて止める
// （ステップ6-1 追加：setSoundType で「楽器の音」と「電子音」を切り替えられるようにした）
// （ステップ6-3c：pizz. の音は、ピチカートの録音（電子音のときは、はじいたような音）で鳴らす）
// （ステップ12-2：楽器の音を2種類にした。「楽器の音A」（FluidR3_GM）と「楽器の音B」（MusyngKite））
//   ・ページを開いたら、選んでいる方の楽器の音だけを読み込む（電子音のときは A）
//   ・もう一方は、初めて選んだときに読み込む（一度読み込んだら、切り替えても読み直さない）
//   ・B は、のばすときにくり返す範囲（ループ）の情報を、自分で作ったファイルから読み込む
// ==========================================================

import { pitchToMidi } from "../score/playback.js";

// 音を鳴らすための仕組み（AudioContext）
// ブラウザは「ユーザーが何か操作したあと」でないと音を鳴らせないが、
// 作ること・音のデータを読み込むことは先にできる（そのときは一時停止の状態で作られる）
let audioContext = null;

// 音の種類ごとの、録音のセットの名前（ステップ12-2）
//   "instrument"  … 楽器の音A（FluidR3_GM）
//   "instrumentB" … 楽器の音B（MusyngKite）
const KITS = { instrument: "FluidR3_GM", instrumentB: "MusyngKite" };

// 音の種類ごとの、読み込んだ楽器の音（読み込みが終わるまでは null）（ステップ12-2）
// 中身は { violin: …, viola: …, cello: …, pizz: … }
// pizz はピチカートの音（弦楽合奏のピチカート。3つの楽器で共通に使う）
let instrumentsByType = { instrument: null, instrumentB: null };

// 音の種類ごとの、読み込みの途中の Promise（2回呼ばれても、読み込みは1回だけにするため）（ステップ12-2）
let loadingByType = { instrument: null, instrumentB: null };

// 再生中の音を止めるための関数の一覧（smplr の start が返してくれる）
let stopFunctions = [];

// 再生が最後まで行ったことを知らせるためのタイマー
let endTimer = null;

// 再生を始めた時刻（AudioContext の時計で。再生していないときは null）（ステップ6-2）
let playStartTime = null;

// ----------------------------------------------------------
// 関数：getPlaybackTime
// 再生を始めてから何秒たったかを返す（再生していないときは null）
// 鳴っている音符を緑にするのに使う（ステップ6-2）
// 始めてすぐの 0.1 秒（予約の待ち時間）はマイナスになる
// ----------------------------------------------------------
export function getPlaybackTime() {
  if (playStartTime === null || !audioContext) return null;
  return audioContext.currentTime - playStartTime;
}

// 録音の音はラ4 = 440Hz なので、442Hz に合わせるために上げる量（セント。半音 = 100セント）
// 1200 × log2(442 ÷ 440) ≒ 7.85
const DETUNE_CENTS = 1200 * Math.log2(442 / 440);

// 読み込む楽器（データの instrument の名前 → サウンドフォントの楽器の名前）
const SOUNDFONT_NAMES = { violin: "violin", viola: "viola", cello: "cello" };

// 鍵盤を押したときの音の強さ（0〜127）
const KEY_VELOCITY = 90;

// 楽器の音で、次の音とつなげない音（ふつうの音・スタッカート）の鳴らし方（ステップ6-3a）
// 楽器の音は、止めたあと少しずつ小さくなる「余韻」があり、そのままだと次の音まで残ってつながって聞こえる
// （smplr の余韻は、何も指定しないと 0.3 秒）
const SHORT_RELEASE = 0.05; // つなげない音の余韻（秒）
const NOTE_GAP = 0.04; // つなげない音で、余韻が消えてから次の音までに空ける時間（秒）

// 音の種類（"instrument"：楽器の音A、"instrumentB"：楽器の音B、"synth"：電子音（のこぎり波））
// 最初は楽器の音A。上のバーの欄で切り替える（setSoundType）
let soundType = "instrument";

// ----------------------------------------------------------
// 関数：setSoundType
// 鳴らす音の種類を切り替える（鍵盤の音と、再生の音の両方が変わる）
//   type … "instrument"（楽器の音A）・"instrumentB"（楽器の音B）・"synth"（電子音）
// ----------------------------------------------------------
export function setSoundType(type) {
  soundType = type;
}

// ----------------------------------------------------------
// 関数：currentInstruments
// 今選んでいる音の種類の、読み込んだ楽器の音を返す（ステップ12-2）
// 電子音を選んでいるとき・まだ読み込みが終わっていないときは null
// ----------------------------------------------------------
function currentInstruments() {
  if (soundType === "synth") return null;
  return instrumentsByType[soundType];
}

// ----------------------------------------------------------
// 関数：getAudioContext
// 音を鳴らす仕組みを用意する（まだなければ作る）
// ----------------------------------------------------------
function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// ----------------------------------------------------------
// 関数：resumeAudio
// 一時停止の状態になっていたら再開する（ボタンや鍵盤を押したときに呼ぶ）
// ----------------------------------------------------------
function resumeAudio() {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return ctx;
}

// ピチカートの録音の名前（サウンドフォントの楽器の名前）（ステップ6-3c）
const PIZZ_SOUNDFONT_NAME = "pizzicato_strings";

// 電子音のピチカートで、はじいた音が消えるまでの時間（秒）
const PIZZ_SYNTH_DECAY = 0.6;

// ----------------------------------------------------------
// 関数：loopDataUrl
// 楽器の音B（MusyngKite）の、のばすときにくり返す範囲（ループ）の情報のファイルの場所（ステップ12-2）
// static フォルダに置いたファイルを読む
// 例："violin" → "/soundfont-loops/MusyngKite/violin-loop.json"
// ----------------------------------------------------------
function loopDataUrl(name) {
  return `/soundfont-loops/MusyngKite/${name}-loop.json`;
}

// ----------------------------------------------------------
// 関数：loadInstruments
// バイオリン・ビオラ・チェロと、ピチカートの録音した音を、インターネットから読み込む
//   type … どちらの楽器の音を読み込むか（"instrument"：楽器の音A、"instrumentB"：楽器の音B）（ステップ12-2）
// （同じ type で2回目からは同じ Promise を返す。読み込みは1回だけ）
// 戻り値：読み込みが終わったら完了する Promise
// ----------------------------------------------------------
export function loadInstruments(type = "instrument") {
  if (loadingByType[type]) return loadingByType[type];

  // 録音のセットの名前（"FluidR3_GM" か "MusyngKite"）
  const kit = KITS[type];

  const loading = (async () => {
    // smplr はブラウザの中でしか動かないので、ここで読み込む
    const { Soundfont } = await import("smplr");
    const ctx = getAudioContext();

    // 3つの楽器をいっしょに読み込み始める
    const loaded = {};
    const waits = Object.entries(SOUNDFONT_NAMES).map(([key, name]) => {
      // 読み込みの設定
      const options = {
        instrument: name,
        kit: kit, // 録音のセット（"FluidR3_GM" か "MusyngKite"。音の感じが違う）
        // くり返しの情報を読み込む（録音より長い音を、録音の一部をくり返してのばすため）
        // ・録音はどの音も 3.1 秒しかないので、読み込まないと、それより長い音が途中で消える
        loadLoopData: true,
      };
      // 楽器の音B（MusyngKite）は、自分で作ったくり返しの情報を使う（ステップ12-2）
      // （いつもの情報だと、くり返す範囲が短くて「ラララ」と聞こえたため）
      if (kit === "MusyngKite") {
        options.loopDataUrl = loopDataUrl(name);
      }
      const instrument = Soundfont(ctx, options);
      loaded[key] = instrument;
      return instrument.ready; // 読み込みが終わるのを待つ
    });

    // ピチカートの音も読み込む（ステップ6-3c）
    // はじいた音は自然に消えていく音なので、くり返しの情報は読み込まない（読み込むと、ずっと鳴り続けてしまう）
    const pizzInstrument = Soundfont(ctx, {
      instrument: PIZZ_SOUNDFONT_NAME,
      kit: kit,
      loadLoopData: false,
    });
    loaded.pizz = pizzInstrument;
    waits.push(pizzInstrument.ready);

    await Promise.all(waits);

    // 全部終わってから使えるようにする（途中の楽器で鳴らさないため）
    instrumentsByType[type] = loaded;
  })();

  // 失敗したときは、次に呼ばれたらもう一度読み込めるようにしておく
  loading.catch(() => {
    loadingByType[type] = null;
  });

  loadingByType[type] = loading;
  return loading;
}

// ----------------------------------------------------------
// 関数：isLoaded
// 録音した音の読み込みが終わっているか
//   type … どちらの楽器の音か（"instrument" か "instrumentB"）（ステップ12-2）
// ----------------------------------------------------------
export function isLoaded(type = "instrument") {
  return instrumentsByType[type] !== null;
}

// ----------------------------------------------------------
// 関数：pitchToFrequency
// 音の高さを周波数（Hz）にする（平均律、ラ4 = 442Hz）
// 例：{ step: "A", alter: 0, octave: 4 } → 442
// ----------------------------------------------------------
export function pitchToFrequency(pitch) {
  // ラ4（69番）から何半音離れているかで計算する
  return 442 * Math.pow(2, (pitchToMidi(pitch) - 69) / 12);
}

// ----------------------------------------------------------
// 関数：playSynth
// 電子音（のこぎり波）で音を1つ鳴らす
// 電子音を選んでいるときと、録音した音の読み込みが終わる前の鍵盤に使う
//   pitch     … 音の高さ { step, alter, octave }
//   duration  … 鳴らす長さ（秒）
//   startTime … 鳴らし始める時刻（AudioContext の時計で。省略したら今すぐ）
//   velocity  … 音の強さ（0〜127。省略したら 100）
//   pluck     … true なら、はじいたような音（ピチカート）にする（ステップ6-3c）
// 戻り値：途中で止めるための関数
// ----------------------------------------------------------
function playSynth(pitch, duration = 0.5, startTime = null, velocity = 100, pluck = false) {
  const ctx = resumeAudio();
  const start = startTime ?? ctx.currentTime;
  // ピチカートは、楽譜の長さより早く自然に消える（長くても PIZZ_SYNTH_DECAY 秒まで）
  const end = pluck ? start + Math.min(duration, PIZZ_SYNTH_DECAY) : start + duration;

  // 音の大きさ（強さ 100 のときに 0.15。強さに合わせて大きく・小さくする）
  const volume = 0.15 * (velocity / 100);

  // 鳴り始めと鳴り終わりを少しずつ変える時間（短い音でも、合わせて長さを超えないようにする）
  const attack = Math.min(0.02, duration / 3);
  const release = Math.min(0.08, duration / 3);

  // 音のもと（のこぎり波）
  const oscillator = ctx.createOscillator();
  oscillator.type = "sawtooth";
  oscillator.frequency.value = pitchToFrequency(pitch);

  // 高い成分を少し削って、やわらかい音にするフィルター
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2000;

  // 音量（急に鳴り始めたり止まったりすると「プチッ」となるので、少しずつ変える）
  const gain = ctx.createGain();
  if (pluck) {
    // ピチカート：一瞬で大きくなって、すぐに小さくなっていく
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, end); // 0 にはできないので、とても小さい数まで下げる
  } else {
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack); // 少しずつ大きくする
    gain.gain.setValueAtTime(volume, end - release);
    gain.gain.linearRampToValueAtTime(0, end); // 最後に少しずつ小さくする
  }

  // つなぐ：音のもと → フィルター → 音量 → スピーカー
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(start);
  oscillator.stop(end);

  // 途中で止めるための関数（停止ボタン用。鳴り終わったあとに呼ばれてもエラーにしない）
  return () => {
    try {
      oscillator.stop();
    } catch (error) {
      // すでに止まっていたら何もしない
    }
  };
}

// ----------------------------------------------------------
// 関数：playPitch
// 音を1つ、短く鳴らす（鍵盤を押したとき・高さを変えたときなど）
//   pitch      … 音の高さ { step, alter, octave }
//   instrument … 楽器（"violin"・"viola"・"cello"。省略したらバイオリン）
//   duration   … 鳴らす長さ（秒）
//   pizz       … true ならピチカートで鳴らす（ステップ6-3c）
// 録音した音の読み込みが終わっていなければ、電子音で鳴らす
// ----------------------------------------------------------
export function playPitch(pitch, instrument = "violin", duration = 0.5, pizz = false) {
  // 今選んでいる楽器の音（電子音のとき・読み込みが終わっていないときは null）（ステップ12-2）
  const instruments = currentInstruments();
  // 電子音を選んでいるとき・読み込みが終わっていないときは、電子音で鳴らす
  if (!instruments) {
    playSynth(pitch, duration, null, 100, pizz);
    return;
  }
  const ctx = resumeAudio();
  // ピチカートなら、ピチカートの録音で鳴らす
  const sampler = pizz ? instruments.pizz : instruments[instrument];
  sampler.start({
    note: pitchToMidi(pitch),
    velocity: KEY_VELOCITY,
    detune: DETUNE_CENTS,
    time: ctx.currentTime,
    duration: duration,
  });
}

// ----------------------------------------------------------
// 関数：playEvents
// 鳴らす音の一覧（score/playback.js の buildEvents で作ったもの）を、まとめて予約して鳴らす
//   events     … 鳴らす音の一覧
//   totalTicks … 最後までの長さ（ティック）
//   tickSeconds … 1ティックが何秒か
//   onend      … 最後まで鳴り終わったときに呼ぶ関数
//                （ステップ12-5b：null を渡すと、最後まで行っても終わらせない。区間リピートで、続きを scheduleMore で足すため）
//   clicks     … メトロノームのクリックの一覧 [{ startTick, strong }, ...]（鳴らさないときは空の配列）（ステップ12-4a）
//   clickVolume … クリックの音量（0〜100）（ステップ12-4a）
// 楽器の音を選んでいて、読み込みが終わっていないときは、何もせずに false を返す
// （電子音を選んでいるときは、読み込みが終わっていなくても鳴らせる）
// ----------------------------------------------------------
export function playEvents(events, totalTicks, tickSeconds, onend = () => {}, clicks = [], clickVolume = 70) {
  // 今選んでいる楽器の音（電子音のとき・読み込みが終わっていないときは null）（ステップ12-2）
  const instruments = currentInstruments();
  if (soundType !== "synth" && !instruments) return false;

  // 前の再生が残っていたら止める
  stopPlayback();

  const ctx = resumeAudio();
  // 予約が間に合うように、ほんの少し（0.1秒）あとから始める
  const startTime = ctx.currentTime + 0.1;
  playStartTime = startTime; // 緑にする音符を決めるために覚えておく

  // 音とクリックを予約する（ステップ12-5b：scheduleEvents に分けた）
  scheduleEvents(events, clicks, startTime, tickSeconds, clickVolume);

  // 最後まで行ったら知らせる（音の余韻のぶん、0.3秒だけ待つ）
  // onend が null のとき（区間リピート）は、終わらせない（止めるのは stopPlayback）（ステップ12-5b）
  if (onend) {
    const totalSeconds = 0.1 + totalTicks * tickSeconds + 0.3;
    endTimer = setTimeout(() => {
      endTimer = null;
      stopFunctions = [];
      playStartTime = null;
      onend();
    }, totalSeconds * 1000);
  }

  return true;
}

// ----------------------------------------------------------
// 関数：scheduleMore
// 再生中に、続きの音とクリックを足して予約する（ステップ12-5b）
// 区間リピートで、2回目・3回目…を、前の回のすぐあとに予約するのに使う
//   events      … 鳴らす音の一覧（時刻は、その回の頭を 0 にしたもの）
//   clicks      … クリックの一覧（同じく、その回の頭を 0 にしたもの）
//   offsetTicks … その回が、再生を始めてから何ティック目に始まるか
//   tickSeconds … 1ティックが何秒か
//   clickVolume … クリックの音量（0〜100）
// 再生していないときは何もしない
// ----------------------------------------------------------
export function scheduleMore(events, clicks, offsetTicks, tickSeconds, clickVolume) {
  if (playStartTime === null) return;
  scheduleEvents(events, clicks, playStartTime + offsetTicks * tickSeconds, tickSeconds, clickVolume);
}

// ----------------------------------------------------------
// 関数：scheduleEvents
// 音とクリックを、決めた時刻を頭にして予約する（ステップ12-5b：playEvents から分けた）
//   events      … 鳴らす音の一覧
//   clicks      … クリックの一覧
//   startTime   … 頭の時刻（AudioContext の時計で）。音の startTick は、ここから数える
//   tickSeconds … 1ティックが何秒か
//   clickVolume … クリックの音量（0〜100）
// 止めるための関数は stopFunctions に入れる（stopPlayback でまとめて止める）
// ----------------------------------------------------------
function scheduleEvents(events, clicks, startTime, tickSeconds, clickVolume) {
  // 今選んでいる楽器の音（電子音のときは null）
  const instruments = currentInstruments();

  events.forEach((event) => {
    const time = startTime + event.startTick * tickSeconds; // 鳴らし始める時刻
    const duration = event.soundTicks * tickSeconds; // 鳴らす長さ（スタッカートなどは playback.js で決めてある）

    // 電子音を選んでいるときは、電子音で予約する
    if (soundType === "synth") {
      stopFunctions.push(playSynth(event.pitch, duration, time, event.velocity, event.pizz));
      return;
    }

    // 楽器の音：つなげる音（スラーの中・テヌート）は、いつもの余韻のまま次の音に重ねて、なめらかにする
    // つなげない音は、余韻を短くして、余韻と「すき間」のぶんだけ早く止める
    // （ただし、短くしすぎないように、もとの長さの半分は鳴らす）
    let soundDuration = duration;
    let release = undefined; // undefined なら smplr のいつもの余韻（0.3 秒）
    if (event.ornamentPiece && !event.connected) {
      // トリルなどで分けた短いかけら：長さはそのまま鳴らし、余韻だけ短くして、次のかけらと重ならないようにする（ステップ11-3a）
      release = SHORT_RELEASE;
    } else if (!event.connected) {
      soundDuration = Math.max(duration * 0.5, duration - SHORT_RELEASE - NOTE_GAP);
      release = SHORT_RELEASE;
    }

    // ピチカートなら、ピチカートの録音で鳴らす（ステップ6-3c）
    const sampler = event.pizz ? instruments.pizz : instruments[event.instrument];
    const stop = sampler.start({
      note: pitchToMidi(event.pitch),
      velocity: event.velocity,
      detune: DETUNE_CENTS,
      time: time,
      duration: soundDuration,
      ampRelease: release,
    });
    stopFunctions.push(stop);
  });

  // メトロノームのクリックを予約する（ステップ12-4a）
  clicks.forEach((click) => {
    const time = startTime + click.startTick * tickSeconds;
    stopFunctions.push(playClick(time, click.strong, clickVolume));
  });
}

// ----------------------------------------------------------
// 関数：playClick
// メトロノームのクリックを1つ鳴らす（ステップ12-4a）
// 楽器の音・電子音のどちらを選んでいても、いつもこの音で鳴らす
//   time   … 鳴らす時刻（AudioContext の時計で）
//   strong … true なら1拍目の高い音、false ならほかの拍の低い音
//   volume … 音量（0〜100）
// 戻り値：途中で止めるための関数
// ----------------------------------------------------------
function playClick(time, strong, volume) {
  const ctx = resumeAudio();
  const length = 0.05; // 鳴らす長さ（秒）。短い「ピッ」

  // 音のもと（なめらかな波）。1拍目は高く、ほかは低く
  const oscillator = ctx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = strong ? 1760 : 1320;

  // 音量：一瞬で大きくなって、すぐに小さくなる（音量 100 のときに 0.5）
  const gain = ctx.createGain();
  const peak = 0.5 * (volume / 100);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(peak, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length); // 0 にはできないので、とても小さい数まで下げる

  // つなぐ：音のもと → 音量 → スピーカー
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(time);
  oscillator.stop(time + length);

  // 途中で止めるための関数（停止ボタン用。鳴り終わったあとに呼ばれてもエラーにしない）
  return () => {
    try {
      oscillator.stop();
    } catch (error) {
      // すでに止まっていたら何もしない
    }
  };
}

// ----------------------------------------------------------
// 関数：stopPlayback
// 再生中の音を全部止める（まだ鳴っていない予約も取り消す）
// ----------------------------------------------------------
export function stopPlayback() {
  stopFunctions.forEach((stop) => stop());
  stopFunctions = [];
  playStartTime = null;
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
}
