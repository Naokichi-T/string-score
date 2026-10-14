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
// 関数：sym
// 音符に記号を付ける関数
// 例：sym(n('D', 5, 'quarter'), { bowing: 'down', fingering: 3 })
//     → ダウンボウと指番号3が付いたレ5
// ----------------------------------------------------------
function sym(note, symbols) {
  return { ...note, ...symbols };
}

// ----------------------------------------------------------
// 関数：r
// 休符1つ分のデータを短く書くための関数
// 例：r('quarter') → 4分休符
// ----------------------------------------------------------
function r(duration, dots = 0) {
  return { rest: true, duration, dots };
}

// お試しの楽譜（弦楽四重奏・16小節）
// ・1〜2小節目：ニ長調（♯2つ）・4分の4拍子
// ・3小節目から：4分の3拍子
// ・4小節目から：ヘ長調（♭1つ）
// ・5小節目から：ビオラはト音記号、チェロはテノール記号
// ・9小節目から：ビオラはアルト記号、チェロはヘ音記号に戻る
// ・7〜16小節目：Violin II はずっとタイでつながる（どこで改行しても段をまたぐタイができる）
// ・1〜3小節目と最後の小節：記号の表示の確認用に、いろいろな記号を付けている
// ・スラーと松葉の確認用：Violin I の3・7〜8・10・14〜16小節目、Viola の3小節目、Cello の1〜2小節目
export const sampleScore = {
  title: "お試しの楽譜",
  composer: "string-score",
  tempo: 80,
  // 楽譜全体の小節の情報（全パート共通）
  measures: [
    { time: { beats: 4, beatType: 4 }, key: 2 }, // 1小節目：4分の4拍子・ニ長調
    {}, // 2小節目
    { time: { beats: 3, beatType: 4 } }, // 3小節目：ここから4分の3拍子
    { key: -1 }, // 4小節目：ここからヘ長調
    {}, // 5小節目
    {}, // 6小節目
    {}, // 7小節目
    {}, // 8小節目
    {}, // 9小節目
    {}, // 10小節目
    {}, // 11小節目
    {}, // 12小節目
    {}, // 13小節目
    {}, // 14小節目
    {}, // 15小節目
    {}, // 16小節目
  ],
  parts: [
    {
      name: "Violin I",
      abbreviation: "Vln. I",
      instrument: "violin",
      measures: [
        // 1小節目：強弱 mf・ダウンボウ・指番号2 → アップボウ・スタッカート → テヌート・アクセント
        {
          clef: "treble",
          notes: [
            sym(n("F", 5, "quarter", 0, 1), { dynamic: "mf", bowing: "down", fingering: 2 }),
            sym(n("E", 5, "quarter"), { bowing: "up", articulations: ["staccato"] }),
            sym(n("D", 5, "half"), { articulations: ["tenuto", "accent"] }),
          ],
        },
        {
          // 2小節目：8分音符にスタッカート、2分音符に強弱 f
          notes: [
            sym(n("C", 5, "eighth", 0, 1), { articulations: ["staccato"] }),
            sym(n("D", 5, "eighth"), { articulations: ["staccato"] }),
            sym(n("E", 5, "eighth"), { articulations: ["staccato"] }),
            sym(n("F", 5, "eighth", 0, 1), { articulations: ["staccato"] }),
            sym(n("G", 5, "half"), { dynamic: "f" }),
          ],
        },
        // 3小節目：3つの音を1本のスラーでつなぐ（符尾が下向きなので上に弧）
        {
          notes: [sym(n("A", 5, "quarter", 1), { slur: "start" }), n("G", 5, "eighth"), sym(n("F", 5, "quarter", 0, 1), { slur: "stop" })],
        },
        { notes: [n("F", 5, "quarter"), n("E", 5, "quarter"), n("D", 5, "quarter")] },
        // シ4（♮が付く：ヘ長調ではシは♭なので）
        { notes: [n("C", 5, "half"), n("B", 4, "quarter")] },
        { notes: [n("A", 4, "half", 1)] },
        // 7〜8小節目：小節（画面の幅によっては段）をまたぐスラー
        { notes: [sym(n("A", 4, "quarter"), { slur: "start" }), n("C", 5, "quarter"), n("F", 5, "quarter")] },
        {
          notes: [n("G", 5, "eighth"), n("F", 5, "eighth"), n("E", 5, "eighth"), n("D", 5, "eighth"), n("C", 5, "eighth"), sym(n("B", 4, "eighth", 0, -1), { slur: "stop" })],
        },
        { notes: [n("A", 4, "half"), r("quarter")] },
        // 10小節目：小節の中のデクレッシェンド（＞）
        {
          notes: [sym(n("C", 5, "quarter"), { wedge: "diminuendo" }), n("D", 5, "quarter"), sym(n("E", 5, "quarter"), { wedge: "stop" })],
        },
        {
          notes: [n("F", 5, "16th"), n("G", 5, "16th"), n("A", 5, "16th"), n("G", 5, "16th"), n("F", 5, "half")],
        },
        { notes: [n("E", 5, "quarter"), n("D", 5, "quarter"), n("C", 5, "quarter", 0, 1)] },
        { notes: [n("D", 5, "half", 1)] },
        // 14〜16小節目：最後の pp に向かうデクレッシェンド（画面の幅によっては段をまたぐ）
        {
          notes: [sym(n("A", 4, "quarter"), { wedge: "diminuendo" }), n("B", 4, "quarter", 0, -1), n("C", 5, "quarter")],
        },
        { notes: [n("D", 5, "quarter", 1), n("E", 5, "eighth"), n("C", 5, "quarter")] },
        // 最後の小節：フェルマータ・強弱 pp（デクレッシェンドはこの手前で終わる）
        { notes: [sym(n("F", 5, "half", 1), { fermata: true, dynamic: "pp", wedge: "stop" })] },
      ],
    },
    {
      name: "Violin II",
      abbreviation: "Vln. II",
      instrument: "violin",
      measures: [
        { clef: "treble", notes: [n("D", 5, "whole")] },
        // 2小節目：pizz.（ピチカート）、強弱 p
        {
          notes: [sym(n("A", 4, "half"), { technique: "pizz.", dynamic: "p" }), n("B", 4, "quarter"), n("C", 5, "quarter", 0, 1)],
        },
        // 3小節目：arco（弓で弾くのに戻る）、ダウンボウ・指番号0
        { notes: [sym(n("D", 5, "half", 1), { technique: "arco", bowing: "down", fingering: 0 })] },
        { notes: [n("A", 4, "half"), n("B", 4, "quarter", 0, -1)] },
        { notes: [n("A", 4, "half", 1)] },
        { notes: [n("F", 4, "half", 1)] },
        // 7〜16小節目：ずっと同じ音をタイでつなぐ（最後の小節以外）
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [tied(n("C", 5, "half", 1))] },
        { notes: [n("C", 5, "half", 1)] },
      ],
    },
    {
      name: "Viola",
      abbreviation: "Vla.",
      instrument: "viola",
      measures: [
        { clef: "alto", notes: [n("A", 3, "half"), n("F", 4, "half", 0, 1)] },
        // ラ3を次の小節へタイでつなぐ
        { notes: [n("E", 4, "half"), tied(n("A", 3, "half"))] },
        // 3小節目：スラー（符尾が上向きなので下に弧）
        {
          notes: [sym(n("A", 3, "quarter"), { slur: "start" }), n("B", 3, "quarter"), sym(n("C", 4, "quarter", 0, 1), { slur: "stop" })],
        },
        { notes: [n("C", 4, "half", 1)] },
        // ここからト音記号
        { clef: "treble", notes: [n("A", 4, "quarter"), n("G", 4, "quarter"), n("F", 4, "quarter")] },
        { notes: [n("F", 4, "half", 1)] },
        { notes: [n("F", 4, "quarter"), n("A", 4, "quarter"), n("C", 5, "quarter")] },
        { notes: [n("B", 4, "half", 0, -1), n("A", 4, "quarter")] },
        // ここからアルト記号に戻る
        { clef: "alto", notes: [n("F", 4, "half", 1)] },
        { notes: [n("E", 4, "quarter"), n("F", 4, "quarter"), n("G", 4, "quarter")] },
        { notes: [n("A", 4, "half", 1)] },
        { notes: [n("G", 4, "half"), n("E", 4, "quarter")] },
        { notes: [n("F", 4, "half", 1)] },
        { notes: [n("F", 4, "quarter"), n("G", 4, "quarter"), n("A", 4, "quarter")] },
        { notes: [n("B", 4, "half", 0, -1), n("G", 4, "quarter")] },
        { notes: [n("A", 4, "half", 1)] },
      ],
    },
    {
      name: "Cello",
      abbreviation: "Vc.",
      instrument: "cello",
      measures: [
        // 1小節目：強弱 sf、ここからクレッシェンド（＜）。sf の右から始まる
        { clef: "bass", notes: [sym(n("D", 3, "whole"), { dynamic: "sf", wedge: "crescendo" })] },
        // 2小節目：五線より低い音の強弱 fp（音符にぶつからないよう下にずれる）、アクセント
        // クレッシェンドは fp の手前で終わる
        {
          notes: [sym(n("A", 2, "half"), { dynamic: "fp", articulations: ["accent"], wedge: "stop" }), n("A", 3, "half")],
        },
        { notes: [n("D", 3, "half"), r("quarter")] },
        { notes: [n("F", 2, "half", 1)] },
        // ここからテノール記号
        { clef: "tenor", notes: [n("E", 4, "quarter"), n("D", 4, "quarter"), n("C", 4, "quarter")] },
        { notes: [n("F", 3, "half", 1)] },
        { notes: [n("F", 3, "half"), n("A", 3, "quarter")] },
        { notes: [n("C", 4, "half", 1)] },
        // ここからヘ音記号に戻る
        { clef: "bass", notes: [n("F", 2, "half", 1)] },
        { notes: [n("C", 3, "half", 1)] },
        { notes: [n("F", 3, "half"), n("E", 3, "quarter")] },
        { notes: [n("A", 2, "half", 1)] },
        { notes: [n("D", 3, "half", 1)] },
        { notes: [n("F", 3, "half", 1)] },
        { notes: [n("C", 3, "half", 1)] },
        { notes: [n("F", 2, "half", 1)] },
      ],
    },
  ],
};
