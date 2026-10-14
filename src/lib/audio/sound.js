// ==========================================================
// sound.js
// 音を鳴らす
// のこぎり波（明るくて弦楽器っぽい音）を、フィルターでやわらかくして鳴らす
// ステップ6の再生でも、この関数を使う予定
// ==========================================================

// 音を鳴らすための仕組み（AudioContext）
// ブラウザは「ユーザーが何か操作したあと」でないと音を鳴らせないので、
// 最初に音を鳴らすときに作る
let audioContext = null;

// ドからの半音の数（ド=0、レ=2、ミ=4 …）
const STEP_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ----------------------------------------------------------
// 関数：getAudioContext
// 音を鳴らす仕組みを用意する（まだなければ作る）
// ----------------------------------------------------------
function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  // 一時停止の状態になっていたら再開する（ブラウザによってはそうなっていることがある）
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

// ----------------------------------------------------------
// 関数：pitchToFrequency
// 音の高さを周波数（Hz）にする（平均律、ラ4 = 442Hz）
// 例：{ step: 'A', alter: 0, octave: 4 } → 442
// ----------------------------------------------------------
export function pitchToFrequency(pitch) {
  // MIDI の番号に直す（ド4 = 60、ラ4 = 69）
  const midi = (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
  // ラ4（69番）から何半音離れているかで計算する
  return 442 * Math.pow(2, (midi - 69) / 12);
}

// ----------------------------------------------------------
// 関数：playPitch
// 音を1つ、短く鳴らす
//   pitch    … 音の高さ { step, alter, octave }
//   duration … 鳴らす長さ（秒）
// ----------------------------------------------------------
export function playPitch(pitch, duration = 0.5) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

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
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.02); // 0.02秒で大きくする
  gain.gain.setValueAtTime(0.15, now + duration - 0.08);
  gain.gain.linearRampToValueAtTime(0, now + duration); // 最後の0.08秒で小さくする

  // つなぐ：音のもと → フィルター → 音量 → スピーカー
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + duration);
}
