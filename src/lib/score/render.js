// ==========================================================
// render.js
// 楽譜データを VexFlow で五線譜に描くファイル
// （ステップ2-1：1パート・1段だけ。改行や複数パートは後で追加）
// ==========================================================

import { DURATIONS, CLEFS, pitchToVexKey } from "./model.js";

// ----------------------------------------------------------
// 見た目の大きさの設定（単位はピクセル）
// ----------------------------------------------------------
const LEFT = 10; // 左の余白
const TOP = 40; // 上の余白（五線の上に飛び出す音符のぶん）
const STAVE_HEIGHT = 120; // 1つの五線が使う高さ（下に飛び出す音符のぶんも含む）
const MEASURE_BASE_WIDTH = 50; // 小節の最低限の幅
const NOTE_WIDTH = 32; // 音符1つあたりに足す幅
const HEADER_WIDTH = 90; // 音部記号・調号・拍子記号のために足す幅

// ----------------------------------------------------------
// 関数：timeToString
// 拍子のデータを VexFlow の書き方に変換する
// 例：{ beats: 4, beatType: 4 } → '4/4'
// ----------------------------------------------------------
function timeToString(time) {
  return `${time.beats}/${time.beatType}`;
}

// ----------------------------------------------------------
// 関数：keyToVexKey
// 調号（♯の数がプラス、♭の数がマイナス）を VexFlow の長調の名前に変換する
// 例：0 → 'C'、2 → 'D'（♯2つ）、-1 → 'F'（♭1つ）
// ----------------------------------------------------------
function keyToVexKey(key) {
  // 添え字 0 が ♭7つ、7 が調号なし、14 が ♯7つ
  const names = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  return names[key + 7];
}

// ----------------------------------------------------------
// 関数：createNote
// 音符・休符1つ分のデータから VexFlow の音符を作る
//   VF   … VexFlow の部品一式
//   note … 音符1つ分のデータ
//   clef … 今の音部記号（'treble' など）
// ----------------------------------------------------------
function createNote(VF, note, clef) {
  // VexFlow での長さの書き方（例：'q'）
  let duration = DURATIONS[note.duration].vf;
  // 付点の数だけ 'd' を付ける（例：'qd' は付点4分音符）
  // これで VexFlow が音の長さを正しく計算できる
  duration = duration + "d".repeat(note.dots ?? 0);
  // 休符なら後ろに 'r' を付ける（例：'qr' は4分休符）
  if (note.rest) {
    duration = duration + "r";
  }

  // 音の高さ（休符は五線のまん中に置く）
  const key = note.rest ? CLEFS[clef].restKey : pitchToVexKey(note.pitch);

  // VexFlow の音符を作る
  const staveNote = new VF.StaveNote({
    keys: [key], // 音の高さ（重音は今回なしなので1つだけ）
    duration: duration, // 長さ
    clef: CLEFS[clef].vf, // 音部記号（これで五線上の位置が決まる）
    autoStem: true, // 符尾（棒）の向きを自動で決める
  });

  // 付点の「点」を描くための部品を付ける（長さの計算は上の 'd' で済んでいる）
  for (let i = 0; i < (note.dots ?? 0); i++) {
    VF.Dot.buildAndAttach([staveNote], { all: true });
  }

  return staveNote;
}

// ----------------------------------------------------------
// 関数：measureWidth
// 小節の幅を音符の数から決める
//   notesCount … 小節の中の音符・休符の数
//   hasHeader  … 音部記号などを描く小節なら true
// ----------------------------------------------------------
function measureWidth(notesCount, hasHeader) {
  let width = MEASURE_BASE_WIDTH + notesCount * NOTE_WIDTH;
  if (hasHeader) {
    width = width + HEADER_WIDTH;
  }
  return width;
}

// ----------------------------------------------------------
// 関数：renderScore
// 楽譜データを、指定した HTML の要素の中に五線譜として描く
//   VF        … VexFlow の部品一式（import したもの）
//   container … 描く先の HTML の要素（div）
//   score     … 楽譜データ
// ----------------------------------------------------------
export function renderScore(VF, container, score) {
  // 前に描いたものを消す
  container.innerHTML = "";

  // ステップ2-1では最初のパートだけ描く
  const part = score.parts[0];

  // それぞれの小節の幅を先に計算して、全体の幅を決める
  const widths = part.measures.map((measure, i) => measureWidth(measure.notes.length, i === 0));
  const totalWidth = LEFT * 2 + widths.reduce((sum, w) => sum + w, 0);

  // SVG で描く準備
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(totalWidth, TOP + STAVE_HEIGHT);
  const context = renderer.getContext();

  // 今の拍子・調・音部記号（小節を進みながら、変わったら更新する）
  let time = null;
  let key = 0;
  let clef = "treble";

  // 次の小節を描き始める横の位置
  let x = LEFT;

  // 小節ごとに描く
  part.measures.forEach((measure, i) => {
    // 楽譜全体の小節の情報（拍子・調）
    const info = score.measures[i] ?? {};

    // 変更があれば今の値を更新する
    if (info.time) time = info.time;
    if (info.key !== undefined) key = info.key;
    if (measure.clef) clef = measure.clef;

    // 五線を作る
    const stave = new VF.Stave(x, TOP, widths[i]);

    // 最初の小節だけ、音部記号・調号・拍子記号を付ける
    if (i === 0) {
      stave.addClef(CLEFS[clef].vf);
      stave.addKeySignature(keyToVexKey(key));
      stave.addTimeSignature(timeToString(time));
    }

    // 五線を描く
    stave.setContext(context).draw();

    // 音符・休符を作る
    const notes = measure.notes.map((note) => createNote(VF, note, clef));

    // 音符を1小節分まとめる「声部（Voice）」を作る
    const voice = new VF.Voice({ numBeats: time.beats, beatValue: time.beatType });
    voice.addTickables(notes);

    // 連桁（8分音符などをつなぐ横棒）を拍子に合わせて自動で作る
    const beams = VF.Beam.generateBeams(notes, {
      groups: VF.Beam.getDefaultBeamGroups(timeToString(time)),
    });

    // 音符の横の位置を、五線の幅に合わせて並べる
    new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);

    // 音符と連桁を描く
    voice.draw(context, stave);
    beams.forEach((beam) => beam.setContext(context).draw());

    // 次の小節の位置へ進む
    x = x + widths[i];
  });
}
