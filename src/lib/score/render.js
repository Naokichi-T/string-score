// ==========================================================
// render.js
// 楽譜データを VexFlow で五線譜に描くファイル
// ここには「どの順番で何を描くか」という全体の流れだけを書く
// 細かい処理は render フォルダの中のファイルに分けてある
//   render/helpers.js  … 拍子・調の書き方の変換
//   render/notes.js    … 音符を作る
//   render/symbols.js  … 記号を付ける・描く
//   render/measures.js … 小節の状態と、小節の頭の記号
//   render/layout.js   … 改行の位置を決める
//   render/ties.js     … タイを描く
//   render/spanners.js … スラー・松葉を描く
// ==========================================================

import { computeAccidentals } from "./accidentals.js";
import { timeToString } from "./render/helpers.js";
import { createNote } from "./render/notes.js";
import { drawDynamic } from "./render/symbols.js";
import { buildStates, addModifiers, measureModifierWidth, LINE_START_PADDING } from "./render/measures.js";
import { layoutLines } from "./render/layout.js";
import { drawTie } from "./render/ties.js";
import { drawSpanners } from "./render/spanners.js";
import { isInRange } from "./selection.js";

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

// 選択中の音符の色（青）と、範囲選択の中の音符の色（明るい青）
const SELECTED_COLOR = "#2563eb";
const RANGE_COLOR = "#60a5fa";

// ----------------------------------------------------------
// 関数：renderScore
// 楽譜データを、指定した HTML の要素の中に五線譜として描く
//   VF        … VexFlow の部品一式（import したもの）
//   container … 描く先の HTML の要素（div）
//   score     … 楽譜データ
//   width     … 楽譜全体の幅（画面の幅に合わせる）
//   selection … 選択中の場所 { part, measure, note }（選んでいなければ null）
//   range     … 範囲選択 { part, start, end }（範囲を選んでいなければ null）
// 戻り値：クリックの当たり判定に使う、音符ごとの四角の一覧
//   [{ part, measure, note, x, y, w, h }, ...]
// ----------------------------------------------------------
export function renderScore(VF, container, score, width, selection = null, range = null) {
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

  // 段ごとの左右の端の位置（段をまたぐスラー・松葉を描くのに使う）
  // lineBounds[l] = { startX: 音符が始まる位置, endX: 段の右端 }
  const lineBounds = [];

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

      // 2段目からの段の頭では、音部記号・調号と最初の音符の間を少し空ける
      // （段をまたぐタイの弧を描く場所を作る）
      if (isLineStart && !isFirst) {
        staves.forEach((stave) => stave.setNoteStartX(stave.getNoteStartX() + LINE_START_PADDING));
      }

      // 五線を描く
      staves.forEach((stave) => stave.setContext(context).draw());

      // --- 6-2. パートごとに音符を作る ---
      const voices = [];
      const beamsList = [];
      score.parts.forEach((part, p) => {
        const measure = part.measures[i];
        const notes = measure.notes.map((note, j) => {
          const staveNote = createNote(VF, note, state.clefs[p], accidentalsList[p][i][j]);
          // 選択中の音なら青、範囲選択の中の音なら明るい青にする
          if (selection && selection.part === p && selection.measure === i && selection.note === j) {
            staveNote.setStyle({ fillStyle: SELECTED_COLOR, strokeStyle: SELECTED_COLOR });
          } else if (isInRange(range, p, i, j)) {
            staveNote.setStyle({ fillStyle: RANGE_COLOR, strokeStyle: RANGE_COLOR });
          }
          // 何パート目・何小節目・何番目の音かも一緒に覚えておく（当たり判定に使う）
          allNotes[p].push({ staveNote: staveNote, data: note, line: l, part: p, measure: i, note: j });
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

    // この段の左右の端の位置を覚えておく（x はこの段の右端まで進んでいる）
    lineBounds.push({ startX: lineStartStaves[0].getNoteStartX(), endX: x });

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

  // ----- 8. スラーと松葉を描く -----
  drawSpanners(VF, context, allNotes, lineBounds);

  // ----- 9. クリックの当たり判定に使う四角の一覧を作って返す -----
  const hitBoxes = [];
  allNotes.forEach((notesOfPart) => {
    notesOfPart.forEach((entry) => {
      const box = entry.staveNote.getBoundingBox(); // 音符を囲む四角
      hitBoxes.push({
        part: entry.part,
        measure: entry.measure,
        note: entry.note,
        x: box.getX(),
        y: box.getY(),
        w: box.getW(),
        h: box.getH(),
      });
    });
  });
  return hitBoxes;
}
