// ==========================================================
// render.js
// 楽譜データを VexFlow で五線譜に描くファイル
// （ステップ3-1：音符1つに付く記号（弓・指番号・アーティキュレーション・フェルマータ・奏法の文字・強弱）まで）
// ==========================================================

import { DURATIONS, CLEFS, pitchToVexKey } from "./model.js";
import { computeAccidentals } from "./accidentals.js";
import { BOWINGS, ARTICULATIONS, FERMATA, TECHNIQUES, DYNAMICS } from "./symbols.js";

// ----------------------------------------------------------
// 見た目の大きさの設定（単位はピクセル）
// ----------------------------------------------------------
const LEFT = 10; // 左右の余白
const NAME_WIDTH_FIRST = 80; // 1段目のパート名（フルネーム）を書くための幅
const NAME_WIDTH_OTHER = 70; // 2段目以降のパート名（短い名前）を書くための幅
const TITLE_AREA = 80; // タイトルと作曲者を書く場所の高さ
const TOP = 30; // 段の上の余白（五線の上に飛び出す音符のぶん）
const PART_SPACING = 110; // パートとパートの五線の間隔（上の五線の上端から下の五線の上端まで）
const SYSTEM_GAP = 150; // 段と段の間隔（上の段の一番下の五線の上端から、下の段の一番上の五線の上端まで）
const BOTTOM = 130; // 一番下の余白（五線の下に飛び出す音符のぶん）
const MEASURE_BASE_WIDTH = 40; // 小節の最低限の幅
const NOTE_WIDTH = 32; // 音符1つあたりに足す幅
const ACCIDENTAL_WIDTH = 12; // 臨時記号1つあたりに足す幅
const MIN_WIDTH = 600; // 楽譜の最低限の幅（これより狭い画面でも、この幅で描く）

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

  // 記号（弓・指番号・アーティキュレーションなど）を付ける（休符には付けない）
  if (!note.rest) {
    addSymbols(VF, staveNote, note);
  }

  return staveNote;
}

// ----------------------------------------------------------
// 関数：addSymbols
// 音符に、五線の上や音符の近くに付く記号を付ける
// （強弱は五線の下にそろえて描きたいので、ここでは付けずに drawDynamic で描く）
// 付けた順番に、音符から近い順に積み重なる
//   VF        … VexFlow の部品一式
//   staveNote … 記号を付ける VexFlow の音符
//   note      … 音符1つ分のデータ
// ----------------------------------------------------------
function addSymbols(VF, staveNote, note) {
  const ABOVE = VF.Modifier.Position.ABOVE; // 上に付ける
  const BELOW = VF.Modifier.Position.BELOW; // 下に付ける

  // ① アーティキュレーション（スタッカートなど）
  //    符尾が上向きの音符は玉の下に、下向きの音符は玉の上に付ける
  const stemUp = staveNote.getStemDirection() === VF.Stem.UP;
  for (const name of note.articulations ?? []) {
    const symbol = ARTICULATIONS[name];
    if (!symbol) continue; // 表にない名前は無視する
    const articulation = new VF.Articulation(symbol.vf);
    articulation.setPosition(stemUp ? BELOW : ABOVE);
    staveNote.addModifier(articulation, 0);
  }

  // ② 弓の記号（いつも五線の上）
  if (note.bowing && BOWINGS[note.bowing]) {
    const bowing = new VF.Articulation(BOWINGS[note.bowing].vf);
    bowing.setPosition(ABOVE);
    staveNote.addModifier(bowing, 0);
  }

  // ③ 指番号（弓の記号の上に小さい数字で書く）
  if (note.fingering !== undefined && note.fingering !== null) {
    const fingering = new VF.Annotation(String(note.fingering));
    fingering.setFont("Academico", 11);
    fingering.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    staveNote.addModifier(fingering, 0);
  }

  // ④ 奏法の文字（pizz.・arco。斜めの文字で上に書く）
  if (note.technique && TECHNIQUES[note.technique]) {
    const technique = new VF.Annotation(TECHNIQUES[note.technique].text);
    technique.setFont("Academico", 13, "normal", "italic");
    technique.setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
    staveNote.addModifier(technique, 0);
  }

  // ⑤ フェルマータ（一番上）
  if (note.fermata) {
    const fermata = new VF.Articulation(FERMATA.vf);
    fermata.setPosition(ABOVE);
    staveNote.addModifier(fermata, 0);
  }
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
//   VF          … VexFlow の部品一式
//   stave       … 記号を付ける五線
//   state       … その小節の状態（buildStates で作ったもの）
//   p           … パートの番号（0 が一番上）
//   isLineStart … 段の最初の小節なら true
//   isFirst     … 楽譜の最初の小節なら true
// ----------------------------------------------------------
function addModifiers(VF, stave, state, p, isLineStart, isFirst) {
  // 音部記号
  //   段の頭 → いつもふつうの大きさで付ける
  //   段の途中で変わる → 少し小さめで付ける
  if (isLineStart) {
    stave.addClef(CLEFS[state.clefs[p]].vf, "default");
  } else if (state.clefChanged[p]) {
    stave.addClef(CLEFS[state.clefs[p]].vf, "small");
  }

  // 調号
  //   途中で変わる → 前の調号の記号を♮で消してから新しい調号
  //   段の頭（変わらない）→ 今の調号をそのまま付ける
  if (state.keyChanged && !isFirst) {
    stave.addKeySignature(keyToVexKey(state.key), keyToVexKey(state.prevKey));
  } else if (isLineStart) {
    stave.addKeySignature(keyToVexKey(state.key));
  }

  // 拍子記号（変わる小節だけ。最初の小節は変わる扱い）
  if (state.timeChanged) {
    stave.addTimeSignature(timeToString(state.time));
  }
}

// ----------------------------------------------------------
// 関数：measureModifierWidth
// 小節の頭の記号（音部記号・調号・拍子記号）の幅を、全パートの中で一番広いもので測る
// （試しの五線を作って、記号を付けたときに音符がどこから始まるかを見る）
// ----------------------------------------------------------
function measureModifierWidth(VF, state, partCount, isLineStart, isFirst) {
  let maxWidth = 0;
  for (let p = 0; p < partCount; p++) {
    const testStave = new VF.Stave(0, 0, 500);
    addModifiers(VF, testStave, state, p, isLineStart, isFirst);
    const width = testStave.getNoteStartX() - testStave.getX();
    if (width > maxWidth) maxWidth = width;
  }
  return maxWidth;
}

// ----------------------------------------------------------
// 関数：layoutLines
// 小節をどの段に置くかを決める（改行の位置を決める）
//   noteWidths     … 小節ごとの「音符のための幅」の配列
//   startWidths    … 小節ごとの「段の頭に来たときの記号の幅」の配列
//   middleWidths   … 小節ごとの「段の途中に来たときの記号の幅」の配列
//   firstLineWidth … 1段目で小節に使える幅
//   otherLineWidth … 2段目以降で小節に使える幅
// 戻り値：段ごとの配列。それぞれ { measures: [小節の番号...], widths: [幅...] }
// ----------------------------------------------------------
function layoutLines(noteWidths, startWidths, middleWidths, firstLineWidth, otherLineWidth) {
  const lines = [];
  let current = { measures: [], widths: [] }; // 今詰めている段
  let used = 0; // 今の段で使った幅

  for (let i = 0; i < noteWidths.length; i++) {
    // 今の段に使える幅（1段目かどうかで変わる）
    const available = lines.length === 0 ? firstLineWidth : otherLineWidth;

    // この小節を今の段の続きに置いたときの幅
    const isLineStart = current.measures.length === 0;
    const width = noteWidths[i] + (isLineStart ? startWidths[i] : middleWidths[i]);

    if (!isLineStart && used + width > available) {
      // 入らないので改行する：今の段を確定して、新しい段の頭に置く
      lines.push(current);
      current = { measures: [], widths: [] };
      const startWidth = noteWidths[i] + startWidths[i];
      current.measures.push(i);
      current.widths.push(startWidth);
      used = startWidth;
    } else {
      // 入るので今の段に置く（段の頭なら、入らなくても1小節は置く）
      current.measures.push(i);
      current.widths.push(width);
      used = used + width;
    }
  }
  // 最後の段を確定する
  if (current.measures.length > 0) lines.push(current);

  // 最後の段以外は、段の幅ぴったりになるよう小節の幅を同じ割合で広げる
  lines.forEach((line, l) => {
    if (l === lines.length - 1) return; // 最後の段は広げない
    const available = l === 0 ? firstLineWidth : otherLineWidth;
    const total = line.widths.reduce((sum, w) => sum + w, 0);
    const ratio = available / total;
    line.widths = line.widths.map((w) => w * ratio);
  });

  return lines;
}

// ----------------------------------------------------------
// 関数：renderScore
// 楽譜データを、指定した HTML の要素の中に五線譜として描く
//   VF        … VexFlow の部品一式（import したもの）
//   container … 描く先の HTML の要素（div）
//   score     … 楽譜データ
//   width     … 楽譜全体の幅（画面の幅に合わせる）
// ----------------------------------------------------------
export function renderScore(VF, container, score, width) {
  // 前に描いたものを消す
  container.innerHTML = "";

  // 狭すぎるときは最低限の幅にする
  const totalWidth = Math.max(width, MIN_WIDTH);

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

  // ----- 3. 小節ごとに必要な幅を計算する -----
  const noteWidths = []; // 音符のための幅（全パートの中で一番広いもの）
  const startWidths = []; // 段の頭に来たときの記号の幅
  const middleWidths = []; // 段の途中に来たときの記号の幅
  for (let i = 0; i < measureCount; i++) {
    // 音符と臨時記号の幅
    let maxNotes = 0;
    for (let p = 0; p < partCount; p++) {
      const notes = score.parts[p].measures[i].notes;
      const accCount = accidentalsList[p][i].filter((a) => a !== null).length;
      const w = MEASURE_BASE_WIDTH + notes.length * NOTE_WIDTH + accCount * ACCIDENTAL_WIDTH;
      if (w > maxNotes) maxNotes = w;
    }
    noteWidths.push(maxNotes);

    // 記号の幅（段の頭のときと、途中のときの2通り）
    startWidths.push(measureModifierWidth(VF, states[i], partCount, true, i === 0));
    middleWidths.push(measureModifierWidth(VF, states[i], partCount, false, i === 0));
  }

  // ----- 4. 改行の位置を決める -----
  const firstLeft = LEFT + NAME_WIDTH_FIRST; // 1段目の五線が始まる横の位置
  const otherLeft = LEFT + NAME_WIDTH_OTHER; // 2段目以降の五線が始まる横の位置
  const lines = layoutLines(noteWidths, startWidths, middleWidths, totalWidth - firstLeft - LEFT, totalWidth - otherLeft - LEFT);

  // 1つの段の高さ（一番上の五線の上端から、次の段の一番上の五線の上端まで）
  const systemHeight = PART_SPACING * (partCount - 1) + SYSTEM_GAP;
  // タイトルか作曲者があるときだけ、上に場所を空ける
  const hasHeader = !!(score.title || score.composer);
  const headerHeight = hasHeader ? TITLE_AREA : 0;
  // 全体の高さ
  const totalHeight = headerHeight + TOP + systemHeight * (lines.length - 1) + PART_SPACING * (partCount - 1) + BOTTOM;

  // SVG で描く準備
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(totalWidth, totalHeight);
  const context = renderer.getContext();

  // ----- 5. タイトルと作曲者を描く -----
  context.save();
  if (score.title) {
    context.setFont("Academico", 24, "bold");
    const titleWidth = context.measureText(score.title).width;
    context.fillText(score.title, (totalWidth - titleWidth) / 2, 40); // 中央
  }
  if (score.composer) {
    context.setFont("Academico", 14);
    const composerWidth = context.measureText(score.composer).width;
    context.fillText(score.composer, totalWidth - LEFT - composerWidth, 68); // 右寄せ
  }
  context.restore();

  // タイを描くために、作った音符をパートごとに全部ためておく（小節・段をまたぐタイのため）
  // allNotes[p] の中身：{ staveNote: VexFlow の音符, data: 音符のデータ, line: 何段目か }
  const allNotes = score.parts.map(() => []);

  // ----- 6. 段ごとに描く -----
  lines.forEach((line, l) => {
    const isFirstLine = l === 0;
    const lineTop = headerHeight + TOP + systemHeight * l; // この段の一番上の五線の上端
    let x = isFirstLine ? firstLeft : otherLeft; // 次の小節を描き始める横の位置

    // この段の最初の小節の五線（括弧とパート名を描くのに使う）
    let lineStartStaves = [];

    line.measures.forEach((i, m) => {
      const state = states[i];
      const isFirst = i === 0; // 楽譜の最初の小節か
      const isLast = i === measureCount - 1; // 楽譜の最後の小節か
      const isLineStart = m === 0; // 段の最初の小節か
      const measureWidth = line.widths[m];

      // 次の小節で調が変わるなら、この小節の終わりを複縦線にする
      const nextKeyChanges = !isLast && states[i + 1].keyChanged;

      // --- 6-1. パートごとに五線を作り、記号を付ける ---
      const staves = score.parts.map((part, p) => {
        const y = lineTop + PART_SPACING * p;
        const stave = new VF.Stave(x, y, measureWidth);
        addModifiers(VF, stave, state, p, isLineStart, isFirst);

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

      // --- 6-2. パートごとに音符を作る ---
      const voices = [];
      const beamsList = [];
      score.parts.forEach((part, p) => {
        const measure = part.measures[i];
        const notes = measure.notes.map((note, j) => {
          const staveNote = createNote(VF, note, state.clefs[p], accidentalsList[p][i][j]);
          allNotes[p].push({ staveNote: staveNote, data: note, line: l });
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

      // --- 6-3. 全パートの音符の横の位置をそろえて並べる ---
      const formatter = new VF.Formatter();
      voices.forEach((voice) => formatter.joinVoices([voice]));
      const noteAreaWidth = staves[0].getNoteEndX() - staves[0].getNoteStartX() - 10;
      formatter.format(voices, noteAreaWidth);

      // 音符と連桁を描く
      voices.forEach((voice, p) => voice.draw(context, staves[p]));
      beamsList.forEach((beams) => beams.forEach((beam) => beam.setContext(context).draw()));

      // 強弱を描く（音符の横の位置が決まったあとでないと描けないので、ここで描く）
      score.parts.forEach((part, p) => {
        const tickables = voices[p].getTickables();
        part.measures[i].notes.forEach((note, j) => {
          if (note.rest || !note.dynamic) return;
          drawDynamic(VF, context, tickables[j], staves[p], note.dynamic);
        });
      });

      // --- 6-4. 小節線を全パートつなげる ---
      const topStave = staves[0];
      const bottomStave = staves[partCount - 1];
      let connectorType = VF.StaveConnector.type.SINGLE_RIGHT; // ふつうの小節線
      if (isLast) {
        connectorType = VF.StaveConnector.type.BOLD_DOUBLE_RIGHT; // 曲の終わり
      } else if (nextKeyChanges) {
        connectorType = VF.StaveConnector.type.THIN_DOUBLE; // 複縦線
      }
      new VF.StaveConnector(topStave, bottomStave).setType(connectorType).setContext(context).draw();

      if (isLineStart) lineStartStaves = staves;

      // 次の小節の位置へ進む
      x = x + measureWidth;
    });

    // --- 6-5. この段の左端の線・括弧・パート名を描く ---
    const lineTopStave = lineStartStaves[0];
    const lineBottomStave = lineStartStaves[partCount - 1];
    // 左端の縦線（全パートをつなぐ）
    new VF.StaveConnector(lineTopStave, lineBottomStave).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
    // 角ばった括弧（ブラケット）。パートが2つ以上のときだけ
    if (partCount > 1) {
      new VF.StaveConnector(lineTopStave, lineBottomStave).setType(VF.StaveConnector.type.BRACKET).setContext(context).draw();
    }
    // パート名（1段目はフルネーム、2段目以降は短い名前。五線のまん中の高さに右寄せ）
    const staveLeft = isFirstLine ? firstLeft : otherLeft;
    context.save();
    context.setFont("Academico", 14);
    score.parts.forEach((part, p) => {
      const name = isFirstLine ? part.name : (part.abbreviation ?? part.name);
      const stave = lineStartStaves[p];
      const textWidth = context.measureText(name).width;
      const textX = staveLeft - 14 - textWidth; // 括弧とぶつからないように少し離す
      const textY = stave.getYForLine(2) + 5; // 第3線（まん中の線）の高さ
      context.fillText(name, textX, textY);
    });
    context.restore();
  });

  // ----- 7. タイを描く（パートごと） -----
  allNotes.forEach((notesOfPart) => {
    for (let k = 0; k < notesOfPart.length - 1; k++) {
      const current = notesOfPart[k];
      const next = notesOfPart[k + 1];
      // 休符にはタイを付けない
      if (current.data.rest || next.data.rest) continue;
      if (!current.data.tie) continue;

      if (current.line === next.line) {
        // 同じ段の中：1本の弧でつなぐ
        drawTie(VF, context, current.staveNote, next.staveNote);
      } else {
        // 段をまたぐ：段の終わりまでの弧と、次の段の頭からの弧に分ける
        drawTie(VF, context, current.staveNote, null);
        drawTie(VF, context, null, next.staveNote);
      }
    }
  });
}

// ----------------------------------------------------------
// 関数：drawDynamic
// 強弱記号を、音符の下・五線の下にそろえて描く
// （音符が五線より低いときは、ぶつからないようにさらに下に描く）
//   VF        … VexFlow の部品一式
//   context   … 描く先
//   staveNote … 強弱を付ける VexFlow の音符（位置が決まったあとのもの）
//   stave     … その音符の五線
//   dynamic   … 強弱の名前（'mf' など）
// ----------------------------------------------------------
function drawDynamic(VF, context, staveNote, stave, dynamic) {
  const symbol = DYNAMICS[dynamic];
  if (!symbol) return; // 表にない名前は無視する

  // 基本の高さ：五線の一番下の線から少し下
  let y = stave.getYForLine(4) + 32;
  // 音符の玉が低いときは、その下にずらす
  // （玉の下にアクセントなどの記号が付いているときは、そのぶんもさらに下げる）
  const belowCount = staveNote.getModifiersByType("Articulation").filter((a) => a.getPosition() === VF.Modifier.Position.BELOW).length;
  const lowestNoteY = Math.max(...staveNote.getYs()) + belowCount * 12;
  if (lowestNoteY + 26 > y) y = lowestNoteY + 26;

  // 横の位置：音符の玉の左端にそろえる
  const x = staveNote.getAbsoluteX();

  context.save();
  context.setFont("Bravura", 24); // 楽譜用フォントで強弱記号の形を描く
  context.fillText(symbol.glyph, x, y);
  context.restore();
}

// ----------------------------------------------------------
// 関数：drawTie
// タイの弧を1本描く
//   firstNote … タイの始まりの音（null なら段の頭から始まる弧）
//   lastNote  … タイの終わりの音（null なら段の終わりまでの弧）
// ----------------------------------------------------------
function drawTie(VF, context, firstNote, lastNote) {
  new VF.StaveTie({
    firstNote: firstNote,
    lastNote: lastNote,
    firstIndexes: [0], // 始まりの音の1つ目の音（重音なしなので常に 0）
    lastIndexes: [0], // 終わりの音の1つ目の音
  })
    .setContext(context)
    .draw();
}
