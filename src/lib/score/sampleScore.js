// ==========================================================
// sampleScore.js
// 表示の確認用のお試しの楽譜データ
// （入力ができるようになったら使わなくなる）
// ==========================================================

// ----------------------------------------------------------
// 関数：n
// 音符1つ分のデータを短く書くための関数
// 例：n('C', 4, 'quarter') → ド4の4分音符
// ----------------------------------------------------------
function n(step, octave, duration, dots = 0, alter = 0) {
  return { pitch: { step, alter, octave }, duration, dots, tie: false };
}

// ----------------------------------------------------------
// 関数：r
// 休符1つ分のデータを短く書くための関数
// 例：r('quarter') → 4分休符
// ----------------------------------------------------------
function r(duration, dots = 0) {
  return { rest: true, duration, dots };
}

// お試しの楽譜（バイオリン1パート・4小節・ハ長調・4分の4拍子）
export const sampleScore = {
  title: "お試しの楽譜",
  composer: "",
  tempo: 80,
  // 楽譜全体の小節の情報（1小節目に最初の拍子と調）
  measures: [{ time: { beats: 4, beatType: 4 }, key: 0 }, {}, {}, {}],
  parts: [
    {
      name: "Violin",
      instrument: "violin",
      measures: [
        // 1小節目：4分音符・4分音符・2分音符
        {
          clef: "treble",
          notes: [n("C", 4, "quarter"), n("D", 4, "quarter"), n("E", 4, "half")],
        },
        // 2小節目：8分音符4つ（連桁）・付点4分音符・8分音符
        {
          notes: [n("F", 4, "eighth"), n("G", 4, "eighth"), n("A", 4, "eighth"), n("B", 4, "eighth"), n("C", 5, "quarter", 1), n("B", 4, "eighth")],
        },
        // 3小節目：16分音符4つ（連桁）・4分休符・2分音符
        {
          notes: [n("C", 5, "16th"), n("B", 4, "16th"), n("A", 4, "16th"), n("G", 4, "16th"), r("quarter"), n("G", 4, "half")],
        },
        // 4小節目：付点2分音符・4分休符
        {
          notes: [n("E", 4, "half", 1), r("quarter")],
        },
      ],
    },
  ],
};
