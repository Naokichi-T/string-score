// ==========================================================
// model.js
// 楽譜データの「形」の説明と、表示・計算に使う表をまとめたファイル
// ==========================================================
//
// 【楽譜データの形】
// score = {
//   title: 'タイトル',
//   composer: '作曲者',
//   tempo: 80,                       // ♩＝80
//   measures: [                      // 楽譜全体の小節の情報（全パート共通）
//     { time: { beats: 4, beatType: 4 }, key: 0 }, // 拍子・調が変わる小節だけ書く
//     {}                                           // 変更なしの小節は空
//   ],
//   parts: [                         // パート（楽器）ごとの情報
//     {
//       name: 'Violin',              // パート名
//       instrument: 'violin',        // 楽器
//       measures: [                  // このパートの小節（楽譜全体の小節と同じ数）
//         {
//           clef: 'treble',          // 音部記号が変わる小節だけ書く
//           notes: [                 // 音符・休符の並び
//             { pitch: { step: 'C', alter: 0, octave: 4 }, duration: 'quarter', dots: 0, tie: false },
//             { rest: true, duration: 'quarter', dots: 0 }
//           ]
//         }
//       ]
//     }
//   ]
// }
//
// 音の高さ（step・alter・octave）と長さの名前（quarter など）は
// MusicXML と同じ書き方にしている
// ==========================================================

// ----------------------------------------------------------
// 音の長さの表
//   キー（quarter など）… データで使う名前（MusicXML と同じ）
//   vf                  … VexFlow で使う書き方
//   quarters            … 4分音符を 1 としたときの長さ
// ----------------------------------------------------------
export const DURATIONS = {
  whole: { vf: "w", quarters: 4 }, // 全音符
  half: { vf: "h", quarters: 2 }, // 2分音符
  quarter: { vf: "q", quarters: 1 }, // 4分音符
  eighth: { vf: "8", quarters: 0.5 }, // 8分音符
  "16th": { vf: "16", quarters: 0.25 }, // 16分音符
};

// ----------------------------------------------------------
// 音部記号の表
//   vf      … VexFlow で使う名前
//   restKey … 休符を置く高さ（五線のまん中の線＝第3線にあたる音）
// ----------------------------------------------------------
export const CLEFS = {
  treble: { vf: "treble", restKey: "b/4" }, // ト音記号
  alto: { vf: "alto", restKey: "c/4" }, // アルト記号（ハ音記号・第3線）
  tenor: { vf: "tenor", restKey: "a/3" }, // テノール記号（ハ音記号・第4線）
  bass: { vf: "bass", restKey: "d/3" }, // ヘ音記号
};

// ----------------------------------------------------------
// 楽器ごとの最初の音部記号
// ----------------------------------------------------------
export const INSTRUMENTS = {
  violin: { clef: "treble" }, // バイオリン
  viola: { clef: "alto" }, // ビオラ
  cello: { clef: "bass" }, // チェロ
};

// ----------------------------------------------------------
// 関数：durationToQuarters
// 音の長さ（名前＋付点の数）を「4分音符いくつ分か」に変換する
// 例：('quarter', 1) → 1.5（付点4分音符）
// ----------------------------------------------------------
export function durationToQuarters(duration, dots = 0) {
  // 付点なしの長さ
  const base = DURATIONS[duration].quarters;
  // 付点1つごとに、直前に足した長さの半分を足していく
  let total = base;
  let add = base;
  for (let i = 0; i < dots; i++) {
    add = add / 2;
    total = total + add;
  }
  return total;
}

// ----------------------------------------------------------
// 関数：pitchToVexKey
// データの音の高さを VexFlow の書き方に変換する
// 例：{ step: 'C', alter: 0, octave: 4 } → 'c/4'
//     { step: 'F', alter: 1, octave: 4 } → 'f#/4'
// （♯♭の記号を表示するかどうかは、ステップ2-2で別に決める）
// ----------------------------------------------------------
export function pitchToVexKey(pitch) {
  // alter の数字を記号に変換する表
  const alterText = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" };
  const step = pitch.step.toLowerCase();
  const acc = alterText[String(pitch.alter ?? 0)];
  return `${step}${acc}/${pitch.octave}`;
}
