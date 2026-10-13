// ==========================================================
// sampleScore.js
// 表示の確認用のお試しの楽譜データ
// （入力ができるようになったら使わなくなる）
// ==========================================================

// ----------------------------------------------------------
// 関数：n
// 音符1つ分のデータを短く書くための関数
// 例：n('C', 4, 'quarter')       → ド4の4分音符
//     n('F', 4, 'quarter', 0, 1) → ファ♯4の4分音符
// ----------------------------------------------------------
function n(step, octave, duration, dots = 0, alter = 0) {
  return { pitch: { step, alter, octave }, duration, dots, tie: false };
}

// ----------------------------------------------------------
// 関数：tied
// 音符を「次の音とタイでつなぐ」ようにする関数
// 例：tied(n('D', 5, 'quarter')) → 次の音とタイでつながるレ5
// ----------------------------------------------------------
function tied(note) {
  return { ...note, tie: true };
}

// ----------------------------------------------------------
// 関数：r
// 休符1つ分のデータを短く書くための関数
// 例：r('quarter') → 4分休符
// ----------------------------------------------------------
function r(duration, dots = 0) {
  return { rest: true, duration, dots };
}

// お試しの楽譜（弦楽四重奏・6小節）
// ・1〜2小節目：ニ長調（♯2つ）・4分の4拍子
// ・3小節目から：4分の3拍子
// ・4小節目から：ヘ長調（♭1つ）
// ・5小節目から：ビオラはト音記号、チェロはテノール記号
export const sampleScore = {
  title: "お試しの楽譜",
  composer: "",
  tempo: 80,
  // 楽譜全体の小節の情報（全パート共通）
  measures: [
    { time: { beats: 4, beatType: 4 }, key: 2 }, // 1小節目：4分の4拍子・ニ長調
    {}, // 2小節目
    { time: { beats: 3, beatType: 4 } }, // 3小節目：ここから4分の3拍子
    { key: -1 }, // 4小節目：ここからヘ長調
    {}, // 5小節目
    {}, // 6小節目
  ],
  parts: [
    {
      name: "Violin I",
      instrument: "violin",
      measures: [
        { clef: "treble", notes: [n("F", 5, "quarter", 0, 1), n("E", 5, "quarter"), n("D", 5, "half")] },
        {
          notes: [n("C", 5, "eighth", 0, 1), n("D", 5, "eighth"), n("E", 5, "eighth"), n("F", 5, "eighth", 0, 1), n("G", 5, "half")],
        },
        { notes: [n("A", 5, "quarter", 1), n("G", 5, "eighth"), n("F", 5, "quarter", 0, 1)] },
        { notes: [n("F", 5, "quarter"), n("E", 5, "quarter"), n("D", 5, "quarter")] },
        // シ4（♮が付く：ヘ長調ではシは♭なので）
        { notes: [n("C", 5, "half"), n("B", 4, "quarter")] },
        { notes: [n("A", 4, "half", 1)] },
      ],
    },
    {
      name: "Violin II",
      instrument: "violin",
      measures: [
        { clef: "treble", notes: [n("D", 5, "whole")] },
        { notes: [n("A", 4, "half"), n("B", 4, "quarter"), n("C", 5, "quarter", 0, 1)] },
        { notes: [n("D", 5, "half", 1)] },
        { notes: [n("A", 4, "half"), n("B", 4, "quarter", 0, -1)] },
        { notes: [n("A", 4, "half", 1)] },
        { notes: [n("F", 4, "half", 1)] },
      ],
    },
    {
      name: "Viola",
      instrument: "viola",
      measures: [
        { clef: "alto", notes: [n("A", 3, "half"), n("F", 4, "half", 0, 1)] },
        // ラ3を次の小節へタイでつなぐ
        { notes: [n("E", 4, "half"), tied(n("A", 3, "half"))] },
        { notes: [n("A", 3, "quarter"), n("B", 3, "quarter"), n("C", 4, "quarter", 0, 1)] },
        { notes: [n("C", 4, "half", 1)] },
        // ここからト音記号
        { clef: "treble", notes: [n("A", 4, "quarter"), n("G", 4, "quarter"), n("F", 4, "quarter")] },
        { notes: [n("F", 4, "half", 1)] },
      ],
    },
    {
      name: "Cello",
      instrument: "cello",
      measures: [
        { clef: "bass", notes: [n("D", 3, "whole")] },
        { notes: [n("A", 2, "half"), n("A", 3, "half")] },
        { notes: [n("D", 3, "half"), r("quarter")] },
        { notes: [n("F", 2, "half", 1)] },
        // ここからテノール記号
        { clef: "tenor", notes: [n("E", 4, "quarter"), n("D", 4, "quarter"), n("C", 4, "quarter")] },
        { notes: [n("F", 3, "half", 1)] },
      ],
    },
  ],
};
