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
//   render/spacing.js  … パートの間・段の間を中身に合わせて決める（パートの間の自動調整）
//   render/beatLines.js … 拍の線を描く（ステップ12-7）
// ==========================================================

import { tempoAt } from "./model.js";
import { computeAccidentals } from "./accidentals.js";
import { createNote } from "./render/notes.js";
import { drawDynamic, drawBreath, drawTrillLine, shiftTremolo } from "./render/symbols.js";
import { buildStates, addModifiers, measureModifierWidth, LINE_START_PADDING } from "./render/measures.js";
import { layoutLines } from "./render/layout.js";
import { drawTie } from "./render/ties.js";
import { drawSpanners } from "./render/spanners.js";
import { measureExtents, computePositions } from "./render/spacing.js";
import { isInRange } from "./selection.js";
import { createTuplets, createBeams, placeTuplets } from "./render/tuplets.js";
import { drawBeatLines } from "./render/beatLines.js";

// ----------------------------------------------------------
// 見た目の大きさの設定（単位はピクセル）
// （パートの間・段の間・上下の余白は、render/spacing.js で中身に合わせて決める）
// ----------------------------------------------------------
const LEFT = 10; // 左右の余白
const NAME_WIDTH_FIRST = 80; // 1段目のパート名（フルネーム）を書くための幅
const NAME_WIDTH_OTHER = 70; // 2段目以降のパート名（短い名前）を書くための幅
const TITLE_AREA = 80; // タイトルと作曲者を書く場所の高さ
const TEMPO_AREA = 28; // テンポ（Allegro ♩ = 120）を書く場所の高さ
const TEMPO_CHANGE_RAISE = 18; // 途中のテンポ変更の文字の下端を、五線の一番上の線からどれだけ上にするか（ステップ11-6a）
const TEMPO_CHANGE_GAP = 6; // 音符が五線より上に出ているときの、音符の上端と文字の下端のすき間（ステップ11-6a）
const TEMPO_MARK_SPACE = 10; // テンポ変更・a tempo・rit. を同じ小節に並べるときの間（ステップ11-6b）
const GRADUAL_DASH_GAP = 6; // 「rit.」の文字と点線の間（ステップ11-6b）
const GRADUAL_TEXTS = { rit: "rit.", accel: "accel." }; // rit.・accel. で書く文字（ステップ11-6b）
const REPEAT_BAR_WIDTH = 14; // くり返しの小節線のために、小節に足す幅（ステップ11-7a）
const MEASURE_BASE_WIDTH = 40; // 小節の最低限の幅
const NOTE_WIDTH = 32; // 音符1つあたりに足す幅
const ACCIDENTAL_WIDTH = 12; // 臨時記号1つあたりに足す幅
const MIN_WIDTH = 600; // 楽譜の最低限の幅（これより狭い画面でも、この幅で描く）
const NOTE_END_PADDING = 22; // 小節の最後の音符と、小節線の間に空けるすき間

// 選択中の音符の色（青）と、範囲選択の中の音符の色（明るい青）
const SELECTED_COLOR = "#2563eb";
const RANGE_COLOR = "#60a5fa";

// 再生中に鳴っている音符の色（緑）（ステップ6-2）
const PLAYING_COLOR = "#16a34a";

// 最後に測った「五線の上下のはみ出し」を覚えておく
// 楽譜データと幅が前と同じなら測り直さない（選択の青や再生中の緑では、はみ出しは変わらないため）
// （楽譜データは書き換えずに新しく作る決まりなので、「同じものか」は === で比べられる）
let lastMeasured = { score: null, width: 0, extents: null };

// ----------------------------------------------------------
// 関数：renderScore
// 楽譜データを、指定した HTML の要素の中に五線譜として描く
//   VF        … VexFlow の部品一式（import したもの）
//   container … 描く先の HTML の要素（div）
//   score     … 楽譜データ
//   width     … 楽譜全体の幅（画面の幅に合わせる）
//   selection … 選択中の場所 { part, measure, note }（選んでいなければ null）
//   range     … 範囲選択 { part, start, end }（範囲を選んでいなければ null）
//   playingNotes … 再生中に鳴っている音符の場所の一覧 [{ part, measure, note }, ...]（ステップ6-2）
//   beatLines … true なら拍の線を描く（ステップ12-7）
// 戻り値：{ hitBoxes, lineTops, lineBottoms, totalHeight }
//   hitBoxes    … クリックの当たり判定に使う、音符ごとの四角の一覧
//                 [{ part, measure, note, x, y, w, h, lineTop, lineBottom }, ...]
//                 lineTop・lineBottom … その音符がある段の上端と下端（再生中の自動スクロールに使う）
//   lineTops    … 段ごとの上端の高さの配列（PDF 出力のページ分けに使う）（ステップ9）
//   lineBottoms … 段ごとの下端の高さの配列（PDF 出力のページ分けに使う）（ステップ9）
//   totalHeight … 楽譜全体の高さ（ステップ9）
// ----------------------------------------------------------
export function renderScore(VF, container, score, width, selection = null, range = null, playingNotes = [], beatLines = false) {
  // 鳴っている音符を「パート-小節-番号」の文字にして、すぐに探せるようにしておく
  const playingKeys = new Set(playingNotes.map((n) => `${n.part}-${n.measure}-${n.note}`));

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
    // くり返しの小節線（点の付いた太い線）があれば、そのぶん少し広くする（ステップ11-7a）
    if (score.measures[i].repeatStart) maxNotes = maxNotes + REPEAT_BAR_WIDTH;
    if (score.measures[i].repeatEnd) maxNotes = maxNotes + REPEAT_BAR_WIDTH;
    noteWidths.push(maxNotes);

    // 記号の幅（段の頭のときと、途中のときの2通り）
    startWidths.push(measureModifierWidth(VF, states[i], partCount, true, i === 0));
    middleWidths.push(measureModifierWidth(VF, states[i], partCount, false, i === 0));
  }

  // ----- 4. 改行の位置を決める -----
  const firstLeft = LEFT + NAME_WIDTH_FIRST; // 1段目の五線が始まる横の位置
  const otherLeft = LEFT + NAME_WIDTH_OTHER; // 2段目以降の五線が始まる横の位置
  const lines = layoutLines(noteWidths, startWidths, middleWidths, totalWidth - firstLeft - LEFT, totalWidth - otherLeft - LEFT);

  // タイトルか作曲者があるときだけ、上に場所を空ける（テンポの場所はいつも空ける）
  const hasHeader = !!(score.title || score.composer);
  const headerHeight = (hasHeader ? TITLE_AREA : 0) + TEMPO_AREA;

  // 段を描くのに使うもの（下書きと本番で共通）
  const drawInfo = {
    score: score,
    lines: lines,
    states: states,
    accidentalsList: accidentalsList,
    firstLeft: firstLeft,
    otherLeft: otherLeft,
    selection: selection,
    range: range,
    playingKeys: playingKeys,
    beatLines: beatLines, // 拍の線を描くか（ステップ12-7）
  };

  // ----- 5. 下書きを描いて、段ごと・パートごとに、五線の上下にどれだけはみ出すかを測る -----
  // （下書きでは、パートの間をとても広くとるので、となりのパートとは重ならない）
  // 楽譜データと幅が前回と同じなら、前回測った結果をそのまま使う
  let extents;
  if (lastMeasured.score === score && lastMeasured.width === totalWidth) {
    extents = lastMeasured.extents;
  } else {
    extents = measureExtents(VF, lines.length, partCount, totalWidth, (draftContext, draftStaveYs) => {
      drawSystems(VF, draftContext, drawInfo, draftStaveYs, true);
    });
    lastMeasured = { score: score, width: totalWidth, extents: extents };
  }

  // ----- 6. 測った結果から、五線を置く高さと全体の高さを決める -----
  const positions = computePositions(VF, extents, headerHeight);

  // ----- 7. 本番：SVG で描く準備 -----
  // 前に描いたものを消す
  // （消すのは、ここで新しい SVG を入れる直前にする。
  //   はじめに消すと、下書きで大きさを測っている間、楽譜の枠が空っぽで高さが 0 になり、
  //   スクロールしていた位置が一番上に戻ってしまうため）
  container.innerHTML = "";
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(totalWidth, positions.totalHeight);
  const context = renderer.getContext();

  // ----- 8. タイトルと作曲者を描く -----
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

  // ----- 8-2. テンポを描く（1段目の五線の左端の上） -----
  drawTempo(context, score, firstLeft, headerHeight - 8);

  // ----- 9. 段・音符・タイ・スラー・松葉を、決めた高さで描く -----
  const allNotes = drawSystems(VF, context, drawInfo, positions.staveYs, false);

  // ----- 10. クリックの当たり判定に使う四角の一覧を作って返す -----
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
        // この音符がある段の上端と下端（はみ出した中身も含める。spacing.js で決めたもの）
        lineTop: positions.lineTops[entry.line],
        lineBottom: positions.lineBottoms[entry.line],
      });
    });
  });
  return {
    hitBoxes: hitBoxes,
    lineTops: positions.lineTops,
    lineBottoms: positions.lineBottoms,
    totalHeight: positions.totalHeight,
  };
}

// ----------------------------------------------------------
// 関数：drawSystems
// 段ごとに、五線・音符・強弱・小節線・括弧・パート名を描き、
// そのあとタイ・スラー・松葉を描く
// 下書き（測るため）と本番の2回呼ばれる
//   VF        … VexFlow の部品一式
//   context   … 描く先
//   info      … 描くのに使うもの（score・lines・states・accidentalsList・firstLeft・otherLeft・
//                selection・range・playingKeys）
//   staveYs   … staveYs[l][p] = l 段目・p パート目の五線を置く高さ
//   isDraft   … 下書きなら true
//                （下書きでは、パートをまたぐ線（小節線のつなぎ・括弧）とパート名は描かない。
//                 パートごとのはみ出しを測るのに、じゃまになるため）
// 戻り値：パートごとの音符の一覧 allNotes[p] = [{ staveNote, data, line, part, measure, note }, ...]
// ----------------------------------------------------------
function drawSystems(VF, context, info, staveYs, isDraft) {
  const { score, lines, states, accidentalsList, firstLeft, otherLeft, selection, range, playingKeys } = info;
  const partCount = score.parts.length;
  const measureCount = score.measures.length;

  // タイを描くために、作った音符をパートごとに全部ためておく（小節・段をまたぐタイのため）
  // allNotes[p] の中身：{ staveNote: VexFlow の音符, data: 音符のデータ, line: 何段目か }
  const allNotes = score.parts.map(() => []);

  // パートごとに、前の音符から続いているトリルの波線（続いていなければ null）（ステップ11-3a）
  // 小節・段をまたいで続くので、段ごとの処理の外に置く
  const trillLines = score.parts.map(() => null);

  // 続いている rit.・accel. の点線（続いていなければ null）{ line: 何段目か, y: 高さ, x: 次に点線を始める横の位置 }（ステップ11-6b）
  // トリルの波線と同じく、小節・段をまたいで続くので、段ごとの処理の外に置く
  let gradualLine = null;

  // 段ごとの左右の端の位置（段をまたぐスラー・松葉を描くのに使う）
  // lineBounds[l] = { startX: 音符が始まる位置, endX: 段の右端 }
  const lineBounds = [];

  // ----- 段ごとに描く -----
  lines.forEach((line, l) => {
    const isFirstLine = l === 0;
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

      // 小節の終わりの線の種類（ステップ11-7a：くり返し・自分で決めた線を先に見る）
      //   "repeat"（くり返しの終わり :‖）・"final"（終止線）・"double"（複縦線）・null（ふつう）
      //   何も決めていなければ、今までどおり：曲の最後は終止線、調が変わる前は複縦線
      const measureInfo = score.measures[i];
      let endBar = null;
      if (measureInfo.repeatEnd) endBar = "repeat";
      else if (measureInfo.barline) endBar = measureInfo.barline;
      else if (isLast) endBar = "final";
      else if (nextKeyChanges) endBar = "double";

      // --- パートごとに五線を作り、記号を付ける ---
      const staves = score.parts.map((part, p) => {
        const y = staveYs[l][p]; // この段・このパートの五線を置く高さ（spacing.js で決めたもの）
        const stave = new VF.Stave(x, y, measureWidth);
        addModifiers(VF, stave, state, p, isLineStart, isFirst);

        // 小節の頭の線：くり返しの始まり（‖:）（ステップ11-7a）
        if (measureInfo.repeatStart) stave.setBegBarType(VF.Barline.type.REPEAT_BEGIN);

        // 小節の終わりの線の種類
        if (endBar === "repeat") {
          stave.setEndBarType(VF.Barline.type.REPEAT_END); // くり返しの終わり（点＋細い線＋太い線）（ステップ11-7a）
        } else if (endBar === "final") {
          stave.setEndBarType(VF.Barline.type.END); // 曲の終わり（細い線＋太い線）
        } else if (endBar === "double") {
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

      // --- パートごとに音符を作る ---
      const voices = [];
      const beamsList = [];
      const tupletsList = []; // パートごとの連符の一覧（ステップ10-2）
      score.parts.forEach((part, p) => {
        const measure = part.measures[i];
        const notes = measure.notes.map((note, j) => {
          const staveNote = createNote(VF, note, state.clefs[p], accidentalsList[p][i][j]);
          // 鳴っている音なら緑（いちばん優先）、選択中の音なら青、範囲選択の中の音なら明るい青にする
          if (playingKeys.has(`${p}-${i}-${j}`)) {
            staveNote.setStyle({ fillStyle: PLAYING_COLOR, strokeStyle: PLAYING_COLOR });
          } else if (selection && selection.part === p && selection.measure === i && selection.note === j) {
            staveNote.setStyle({ fillStyle: SELECTED_COLOR, strokeStyle: SELECTED_COLOR });
          } else if (isInRange(range, p, i, j)) {
            staveNote.setStyle({ fillStyle: RANGE_COLOR, strokeStyle: RANGE_COLOR });
          }
          // 何パート目・何小節目・何番目の音かも一緒に覚えておく（当たり判定に使う）
          allNotes[p].push({ staveNote: staveNote, data: note, line: l, part: p, measure: i, note: j });
          return staveNote;
        });

        // 連符を作る（声部に入れる前に作る。くわしくは render/tuplets.js）（ステップ10-2）
        const tuplets = createTuplets(VF, measure.notes, notes);
        tupletsList.push(tuplets);

        // 音符を1小節分まとめる「声部（Voice）」を作る
        const voice = new VF.Voice({ numBeats: state.time.beats, beatValue: state.time.beatType });
        voice.addTickables(notes);
        voices.push(voice);

        // 連桁（8分音符などをつなぐ横棒）を拍子に合わせて作る（連符の中は切らずにつなぐ）（ステップ10-2）
        const beams = createBeams(VF, measure.notes, notes, state.time);
        beamsList.push(beams);

        // 連符の数字を置く側と括弧を決める（連桁ができてから決める）（ステップ10-2）
        placeTuplets(VF, tuplets);
      });

      // --- 全パートの音符の横の位置をそろえて並べる ---
      const formatter = new VF.Formatter();
      voices.forEach((voice) => formatter.joinVoices([voice]));
      // 音符を並べる幅（小節の終わりに NOTE_END_PADDING のすき間を残す）
      const noteAreaWidth = staves[0].getNoteEndX() - staves[0].getNoteStartX() - NOTE_END_PADDING;
      formatter.format(voices, noteAreaWidth);

      // トレモロの斜線を、旗・連桁と重ならない所までずらす（符尾の向きが決まったあとに行う）（ステップ11-4）
      score.parts.forEach((part, p) => {
        const tickables = voices[p].getTickables();
        part.measures[i].notes.forEach((note, j) => shiftTremolo(VF, tickables[j], note));
      });

      // 音符と連桁と連符の数字を描く
      voices.forEach((voice, p) => voice.draw(context, staves[p]));
      beamsList.forEach((beams) => beams.forEach((beam) => beam.setContext(context).draw()));
      tupletsList.forEach((tuplets) => tuplets.forEach((entry) => entry.tuplet.setContext(context).draw()));

      // 途中のテンポ変更・a tempo・rit.・accel.（いちばん上に表示しているパートの上だけ）（ステップ11-6a・11-6b）
      // 下書きでも描く（下書きで測ったはみ出しに入るので、上の段・パートと重ならないように間があく）
      gradualLine = drawTempoMarks(context, staves[0], voices[0].getTickables(), score, i, l, gradualLine);

      // 拍の線（入のときだけ。下書きでは描かない）（ステップ12-7）
      // 音符の横の位置が決まったあとでないと描けないので、ここで描く（中で、音符の後ろに動かす）
      if (!isDraft && info.beatLines) {
        drawBeatLines(
          context,
          staves,
          voices,
          score.parts.map((part) => part.measures[i]),
          state.time,
        );
      }

      // 強弱・ブレス・カエスーラ・トリルの波線を描く（音符の横の位置が決まったあとでないと描けないので、ここで描く）
      // （ブレス・カエスーラはステップ11-1c、トリルの波線はステップ11-3a）
      score.parts.forEach((part, p) => {
        const tickables = voices[p].getTickables();
        part.measures[i].notes.forEach((note, j) => {
          if (note.rest) {
            trillLines[p] = null; // 休符でトリルの波線は切れる
            return;
          }
          if (note.dynamic) drawDynamic(VF, context, tickables[j], staves[p], note.dynamic);
          if (note.breath) drawBreath(VF, context, tickables[j], tickables[j + 1] ?? null, staves[p], note.breath);
          trillLines[p] = drawTrillLine(VF, context, tickables[j], tickables[j + 1] ?? null, staves[p], note, trillLines[p]);
        });
      });

      // --- 小節線を全パートつなげる（下書きでは描かない） ---
      if (!isDraft) {
        const topStave = staves[0];
        const bottomStave = staves[partCount - 1];
        let connectorType = VF.StaveConnector.type.SINGLE_RIGHT; // ふつうの小節線
        if (endBar === "final" || endBar === "repeat") {
          connectorType = VF.StaveConnector.type.BOLD_DOUBLE_RIGHT; // 曲の終わり・くり返しの終わり（ステップ11-7a）
        } else if (endBar === "double") {
          connectorType = VF.StaveConnector.type.THIN_DOUBLE; // 複縦線
        }
        new VF.StaveConnector(topStave, bottomStave).setType(connectorType).setContext(context).draw();
        // くり返しの始まり（段の途中のときだけ。段の頭では、音部記号のあとに各パートの五線で描かれる）（ステップ11-7a）
        if (measureInfo.repeatStart && !isLineStart) {
          new VF.StaveConnector(topStave, bottomStave).setType(VF.StaveConnector.type.BOLD_DOUBLE_LEFT).setContext(context).draw();
        }
      }

      if (isLineStart) lineStartStaves = staves;

      // 次の小節の位置へ進む
      x = x + measureWidth;
    });

    // この段の左右の端の位置を覚えておく（x はこの段の右端まで進んでいる）
    lineBounds.push({ startX: lineStartStaves[0].getNoteStartX(), endX: x });

    // --- この段の左端の線・括弧・パート名を描く（下書きでは描かない） ---
    if (!isDraft) {
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
    }
  });

  // ----- タイを描く（パートごと） -----
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

  // ----- スラーと松葉を描く -----
  drawSpanners(VF, context, allNotes, lineBounds);

  return allNotes;
}

// ----------------------------------------------------------
// 関数：drawTempoMarks
// 小節の頭の上に、テンポの指示を描く（ステップ11-6a。a tempo・rit.・accel. はステップ11-6b）
//   ・途中のテンポ変更 … 「Andante ♩ = 60」
//   ・a tempo          … 「a tempo」
//   ・rit.・accel.     … 「rit.」のあと、範囲の終わりの小節の終わりまで点線（段をまたぐときは、次の段の頭から続ける）
// 同じ小節にいくつかあるときは、この順に左から並べる
// 高さ：五線から少し上（音符が五線より上に出ているときは、その上）。点線は同じ段の中では同じ高さで続ける
//   stave       … いちばん上のパートの、その小節の五線
//   tickables   … その小節の音符（並べ終わったもの。いちばん高い所を調べる）
//   score       … 楽譜データ
//   i           … 何小節目か
//   l           … 何段目か
//   gradualLine … 前の小節から続いている点線（なければ null）
// 戻り値：次の小節へ続く点線（続かなければ null）
// ----------------------------------------------------------
function drawTempoMarks(context, stave, tickables, score, i, l, gradualLine) {
  const info = score.measures[i];
  const hasTempo = i > 0 && info.tempo !== undefined; // 途中のテンポ変更（1小節目は楽譜のいちばん上に描くので除く）
  const resets = hasTempo || !!info.aTempo; // テンポ変更・a tempo のあとは、rit.・accel. の点線を続けない
  if (resets) gradualLine = null;
  if (!hasTempo && !info.aTempo && !info.gradual && !gradualLine) return null; // この小節には何もない

  // 文字の下端の高さ：五線の一番上の線より TEMPO_CHANGE_RAISE だけ上
  // 音符（符尾・加線も入る）がそれより上に出ているときは、音符の上端よりさらに上
  let y = stave.getYForLine(0) - TEMPO_CHANGE_RAISE;
  tickables.forEach((tickable) => {
    const box = tickable.getBoundingBox();
    if (box) y = Math.min(y, box.getY() - TEMPO_CHANGE_GAP);
  });
  // 同じ段で続いている点線は、始まりと同じ高さのまま続ける
  if (gradualLine && gradualLine.line === l && !info.gradual) y = gradualLine.y;

  // 書き始める横の位置：小節の音符が始まる所（段の頭なら、音部記号・調号のあと）
  let x = stave.getNoteStartX() - 4;

  // ① 途中のテンポ変更
  if (hasTempo) x = drawTempo(context, tempoAt(score, i), x, y) + TEMPO_MARK_SPACE;

  // ② a tempo
  if (info.aTempo) x = drawTempoWords(context, "a tempo", x, y) + TEMPO_MARK_SPACE;

  // ③ rit.・accel. の始まり：文字を書いて、そのすぐ右から点線を始める
  let dashFrom;
  if (info.gradual) {
    dashFrom = drawTempoWords(context, GRADUAL_TEXTS[info.gradual] ?? info.gradual, x, y) + GRADUAL_DASH_GAP;
  } else if (gradualLine) {
    // 前の小節から続いている：同じ段なら前の続きから、新しい段なら段の頭から
    dashFrom = gradualLine.line === l ? gradualLine.x : x;
  } else {
    return null; // rit.・accel. の途中ではない
  }

  // ④ 点線を、この小節の終わりまで引く（範囲の終わりの小節では、小節線の少し手前まで）
  const measureEnd = stave.getX() + stave.getWidth();
  const dashTo = info.gradualEnd ? measureEnd - 8 : measureEnd;
  if (dashTo > dashFrom) {
    context.save();
    context.setLineWidth(1);
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(dashFrom, y - 4); // 文字のまん中あたりの高さ
    context.lineTo(dashTo, y - 4);
    context.stroke();
    context.restore();
  }

  // 範囲の終わりなら点線はここまで。そうでなければ、次の小節へ続ける
  if (info.gradualEnd) return null;
  return { line: l, y: y, x: measureEnd };
}

// ----------------------------------------------------------
// 関数：drawTempoWords
// a tempo・rit.・accel. の文字を、斜めの字で書く（ステップ11-6b）
//   x … 書き始める横の位置
//   y … 文字の下端（ベースライン）の位置
// 戻り値：書き終わった右端の横の位置
// ----------------------------------------------------------
function drawTempoWords(context, text, x, y) {
  context.save();
  context.setFont("Academico", 15, "normal", "italic");
  context.fillText(text, x, y);
  const width = context.measureText(text).width;
  context.restore();
  return x + width;
}

// ----------------------------------------------------------
// 関数：drawTempo
// テンポを「Allegro ♩ = 120」の形で描く（速度記号がなければ「♩ = 120」）
//   score … tempo と tempoText が入っているもの（楽譜データ、または tempoAt で調べたもの）（ステップ11-6a）
//   x … 書き始める横の位置
//   y … 文字の下端（ベースライン）の位置
// 戻り値：書き終わった右端の横の位置（ステップ11-6b。同じ小節に a tempo などを並べるのに使う）
// ----------------------------------------------------------
function drawTempo(context, score, x, y) {
  context.save();

  // 速度記号（太字）
  if (score.tempoText) {
    context.setFont("Academico", 15, "bold");
    context.fillText(score.tempoText, x, y);
    x = x + context.measureText(score.tempoText).width + 8;
  }

  // 4分音符の記号（楽譜用フォントの文字。U+ECA5 は「上向きの4分音符」）
  context.setFont("Bravura", 20);
  context.fillText("\uECA5", x, y);
  x = x + context.measureText("\uECA5").width + 10;

  // 「= 120」
  context.setFont("Academico", 15);
  context.fillText(`= ${score.tempo}`, x, y);
  x = x + context.measureText(`= ${score.tempo}`).width;

  context.restore();
  return x;
}
