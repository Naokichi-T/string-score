// ==========================================================
// render.js
// 楽譜データを VexFlow で五線譜に描くファイル
// （ステップ2-3：複数パート・1段。音部記号・調号・拍子の途中変更まで。改行は後で追加）
// ==========================================================

import { DURATIONS, CLEFS, pitchToVexKey } from "./model.js";
import { computeAccidentals } from "./accidentals.js";

// ----------------------------------------------------------
// 見た目の大きさの設定（単位はピクセル）
// ----------------------------------------------------------
const LEFT = 10; // 左の余白
const NAME_WIDTH = 80; // パート名を書くための幅
const TOP = 40; // 上の余白（五線の上に飛び出す音符のぶん）
const PART_SPACING = 110; // パートとパートの五線の間隔（上の五線の上端から下の五線の上端まで）
const BOTTOM = 70; // 下の余白（一番下の五線の下に飛び出す音符のぶん）
const MEASURE_BASE_WIDTH = 40; // 小節の最低限の幅
const NOTE_WIDTH = 32; // 音符1つあたりに足す幅
const ACCIDENTAL_WIDTH = 12; // 臨時記号1つあたりに足す幅

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
//   VF         … VexFlow の部品一式
//   note       … 音符1つ分のデータ
//   clef       … 今の音部記号（'treble' など）
//   accidental … 付ける臨時記号（'#'・'b'・'n' など。付けないときは null）
// ----------------------------------------------------------
function createNote(VF, note, clef, accidental) {
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

  // 臨時記号を付ける（0 は「1つ目の音」という意味。重音なしなので常に 0）
  if (accidental) {
    staveNote.addModifier(new VF.Accidental(accidental), 0);
  }

  // 付点の「点」を描くための部品を付ける（長さの計算は上の 'd' で済んでいる）
  for (let i = 0; i < (note.dots ?? 0); i++) {
    VF.Dot.buildAndAttach([staveNote], { all: true });
  }

  return staveNote;
}

// ----------------------------------------------------------
// 関数：buildStates
// 楽譜全体を最初の小節から順に見ていき、小節ごとの「状態」を作る
//   状態 = その小節の拍子・調・パートごとの音部記号と、
//          その小節の頭で「何が変わったか」
// こうしておくと、描くときに前の小節をさかのぼらなくてよい
// 戻り値の例（小節ごと）：
//   { time, key, prevKey, clefs: ['treble', ...],
//     timeChanged, keyChanged, clefChanged: [false, ...] }
// ----------------------------------------------------------
function buildStates(score) {
  const states = [];

  // 今の値（小節を進みながら更新する）
  let time = null;
  let key = 0;
  const clefs = score.parts.map(() => "treble");

  score.measures.forEach((info, i) => {
    // 拍子が変わったか（最初の小節は必ず表示するので true 扱い）
    const timeChanged = i === 0 || (info.time !== undefined && timeToString(info.time) !== timeToString(time));
    if (info.time) time = info.time;

    // 調が変わったか（最初の小節は必ず表示するので true 扱い）
    const prevKey = key;
    const keyChanged = i === 0 || (info.key !== undefined && info.key !== key);
    if (info.key !== undefined) key = info.key;

    // パートごとに音部記号が変わったか（最初の小節は必ず表示する）
    const clefChanged = score.parts.map((part, p) => {
      const newClef = part.measures[i].clef;
      const changed = i === 0 || (newClef !== undefined && newClef !== clefs[p]);
      if (newClef) clefs[p] = newClef;
      return changed;
    });

    states.push({
      time: time,
      key: key,
      prevKey: prevKey,
      clefs: [...clefs], // その時点の値を写しておく
      timeChanged: timeChanged,
      keyChanged: keyChanged,
      clefChanged: clefChanged,
    });
  });

  return states;
}

// ----------------------------------------------------------
// 関数：addModifiers
// 小節の頭に付ける記号（音部記号・調号・拍子記号）を五線に付ける
//   VF     … VexFlow の部品一式
//   stave  … 記号を付ける五線
//   state  … その小節の状態（buildStates で作ったもの）
//   p      … パートの番号（0 が一番上）
//   isFirst … 楽譜の最初の小節なら true
// ----------------------------------------------------------
function addModifiers(VF, stave, state, p, isFirst) {
  // 音部記号：最初の小節はふつうの大きさ、途中で変わるときは少し小さめ
  if (state.clefChanged[p]) {
    stave.addClef(CLEFS[state.clefs[p]].vf, isFirst ? "default" : "small");
  }

  // 調号：途中で変わるときは、前の調号の記号を♮で消す
  if (state.keyChanged) {
    if (isFirst) {
      stave.addKeySignature(keyToVexKey(state.key));
    } else {
      stave.addKeySignature(keyToVexKey(state.key), keyToVexKey(state.prevKey));
    }
  }

  // 拍子記号
  if (state.timeChanged) {
    stave.addTimeSignature(timeToString(state.time));
  }
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

  const partCount = score.parts.length; // パートの数
  const measureCount = score.measures.length; // 小節の数

  // ----- 1. 小節ごとの状態（拍子・調・音部記号と、その変化）を作る -----
  const states = buildStates(score);

  // ----- 2. パートごと・小節ごとの臨時記号を決める -----
  // accidentalsList[p][i] = パート p の i 小節目の臨時記号の配列
  const accidentalsList = score.parts.map((part) => {
    let tiedIn = false; // 前の小節の最後の音がタイでつながっているか
    return part.measures.map((measure, i) => {
      const accidentals = computeAccidentals(measure.notes, states[i].key, tiedIn);
      // 次の小節のために、この小節の最後の音がタイかどうかを覚えておく
      const last = measure.notes[measure.notes.length - 1];
      tiedIn = !!(last && !last.rest && last.tie);
      return accidentals;
    });
  });

  // ----- 3. 小節の幅を決める（全パートの中で一番広く必要なパートに合わせる） -----
  const widths = [];
  for (let i = 0; i < measureCount; i++) {
    let maxWidth = 0;
    for (let p = 0; p < partCount; p++) {
      // 記号（音部記号・調号・拍子記号）の幅を、試しの五線を作って測る
      const testStave = new VF.Stave(0, 0, 500);
      addModifiers(VF, testStave, states[i], p, i === 0);
      const modifierWidth = testStave.getNoteStartX() - testStave.getX();

      // 音符と臨時記号の幅
      const notes = score.parts[p].measures[i].notes;
      const accCount = accidentalsList[p][i].filter((a) => a !== null).length;
      const notesWidth = notes.length * NOTE_WIDTH + accCount * ACCIDENTAL_WIDTH;

      const width = modifierWidth + MEASURE_BASE_WIDTH + notesWidth;
      if (width > maxWidth) maxWidth = width;
    }
    widths.push(maxWidth);
  }

  // 全体の大きさ
  const scoreLeft = LEFT + NAME_WIDTH; // 五線が始まる横の位置
  const totalWidth = scoreLeft + widths.reduce((sum, w) => sum + w, 0) + LEFT;
  const totalHeight = TOP + PART_SPACING * (partCount - 1) + BOTTOM + 40;

  // SVG で描く準備
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(totalWidth, totalHeight);
  const context = renderer.getContext();

  // ----- 4. 小節ごとに描く -----
  // 次の小節を描き始める横の位置
  let x = scoreLeft;

  // タイを描くために、作った音符をパートごとに全部ためておく（小節をまたぐタイのため）
  // allNotes[p] の中身：{ staveNote: VexFlow の音符, data: 音符のデータ }
  const allNotes = score.parts.map(() => []);

  // 最初の小節の五線（括弧とパート名を描くのに使う）
  let firstStaves = [];

  for (let i = 0; i < measureCount; i++) {
    const state = states[i];
    const isFirst = i === 0;
    const isLast = i === measureCount - 1;

    // 次の小節で調が変わるなら、この小節の終わりを複縦線にする
    const nextKeyChanges = !isLast && states[i + 1].keyChanged;

    // --- 4-1. パートごとに五線を作り、記号を付ける ---
    const staves = score.parts.map((part, p) => {
      const y = TOP + PART_SPACING * p;
      const stave = new VF.Stave(x, y, widths[i]);
      addModifiers(VF, stave, state, p, isFirst);

      // 小節の終わりの線の種類
      if (isLast) {
        stave.setEndBarType(VF.Barline.type.END); // 曲の終わり（細い線＋太い線）
      } else if (nextKeyChanges) {
        stave.setEndBarType(VF.Barline.type.DOUBLE); // 複縦線
      }
      return stave;
    });

    // 全パートで、音符が始まる位置をそろえる
    // （音部記号が変わるパートだけ記号の幅が広い、などのずれをなくす）
    VF.Stave.formatBegModifiers(staves);

    // 五線を描く
    staves.forEach((stave) => stave.setContext(context).draw());

    // --- 4-2. パートごとに音符を作る ---
    const voices = [];
    const beamsList = [];
    score.parts.forEach((part, p) => {
      const measure = part.measures[i];
      const notes = measure.notes.map((note, j) => {
        const staveNote = createNote(VF, note, state.clefs[p], accidentalsList[p][i][j]);
        allNotes[p].push({ staveNote: staveNote, data: note });
        return staveNote;
      });

      // 音符を1小節分まとめる「声部（Voice）」を作る
      const voice = new VF.Voice({ numBeats: state.time.beats, beatValue: state.time.beatType });
      voice.addTickables(notes);
      voices.push(voice);

      // 連桁（8分音符などをつなぐ横棒）を拍子に合わせて自動で作る
      const beams = VF.Beam.generateBeams(notes, {
        groups: VF.Beam.getDefaultBeamGroups(timeToString(state.time)),
      });
      beamsList.push(beams);
    });

    // --- 4-3. 全パートの音符の横の位置をそろえて並べる ---
    const formatter = new VF.Formatter();
    voices.forEach((voice) => formatter.joinVoices([voice]));
    const noteAreaWidth = staves[0].getNoteEndX() - staves[0].getNoteStartX() - 10;
    formatter.format(voices, noteAreaWidth);

    // 音符と連桁を描く
    voices.forEach((voice, p) => voice.draw(context, staves[p]));
    beamsList.forEach((beams) => beams.forEach((beam) => beam.setContext(context).draw()));

    // --- 4-4. 小節線を全パートつなげる ---
    const topStave = staves[0];
    const bottomStave = staves[partCount - 1];
    let connectorType = VF.StaveConnector.type.SINGLE_RIGHT; // ふつうの小節線
    if (isLast) {
      connectorType = VF.StaveConnector.type.BOLD_DOUBLE_RIGHT; // 曲の終わり
    } else if (nextKeyChanges) {
      connectorType = VF.StaveConnector.type.THIN_DOUBLE; // 複縦線
    }
    new VF.StaveConnector(topStave, bottomStave).setType(connectorType).setContext(context).draw();

    if (isFirst) firstStaves = staves;

    // 次の小節の位置へ進む
    x = x + widths[i];
  }

  // ----- 5. 左端の線・括弧・パート名を描く -----
  const firstTop = firstStaves[0];
  const firstBottom = firstStaves[partCount - 1];
  // 左端の縦線（全パートをつなぐ）
  new VF.StaveConnector(firstTop, firstBottom).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
  // 角ばった括弧（ブラケット）。パートが2つ以上のときだけ
  if (partCount > 1) {
    new VF.StaveConnector(firstTop, firstBottom).setType(VF.StaveConnector.type.BRACKET).setContext(context).draw();
  }
  // パート名（五線のまん中の高さに、右寄せで書く）
  context.save();
  context.setFont("Academico", 14);
  score.parts.forEach((part, p) => {
    const stave = firstStaves[p];
    const textWidth = context.measureText(part.name).width;
    const textX = scoreLeft - 14 - textWidth; // 括弧とぶつからないように少し離す
    const textY = stave.getYForLine(2) + 5; // 第3線（まん中の線）の高さ
    context.fillText(part.name, textX, textY);
  });
  context.restore();

  // ----- 6. タイを描く（パートごと） -----
  allNotes.forEach((notesOfPart) => {
    for (let k = 0; k < notesOfPart.length - 1; k++) {
      const current = notesOfPart[k];
      const next = notesOfPart[k + 1];
      // 休符にはタイを付けない
      if (current.data.rest || next.data.rest) continue;
      if (!current.data.tie) continue;

      new VF.StaveTie({
        firstNote: current.staveNote, // タイの始まりの音
        lastNote: next.staveNote, // タイの終わりの音
        firstIndexes: [0], // 始まりの音の1つ目の音（重音なしなので常に 0）
        lastIndexes: [0], // 終わりの音の1つ目の音
      })
        .setContext(context)
        .draw();
    }
  });
}
