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
//   keyboardOctave … 鍵盤の一番左のドのオクターブ（そのパートを選んだとき、ここから3オクターブ分を出す）
export const INSTRUMENTS = {
  violin: { clef: "treble", keyboardOctave: 4 }, // バイオリン（ド4〜ド7）
  viola: { clef: "alto", keyboardOctave: 3 }, // ビオラ（ド3〜ド6）
  cello: { clef: "bass", keyboardOctave: 2 }, // チェロ（ド2〜ド5）
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

// ==========================================================
// ここから下は、入力・編集のときに使う関数
// 長さは「16分音符を 1」とした整数（ティック）で計算する
// （小数で計算すると、0.1 + 0.2 のような誤差が出ることがあるため）
// ==========================================================

// 音の長さ（付点なし）を、16分音符いくつ分かで表した表
const DURATION_TICKS = { whole: 16, half: 8, quarter: 4, eighth: 2, "16th": 1 };

// 長さの名前を、長い順に並べたもの（ボタンを並べる順番にも使う）
export const DURATION_ORDER = ["whole", "half", "quarter", "eighth", "16th"];

// ----------------------------------------------------------
// 関数：durationToTicks
// 音の長さ（名前＋付点の数）を、16分音符いくつ分かにする
// 例：('quarter', 0) → 4、('quarter', 1) → 6（付点4分音符）
// 16分音符に付点を付けると 1.5 になって整数にならないので、付点は付けられない扱いにする
// ----------------------------------------------------------
export function durationToTicks(duration, dots = 0) {
  const base = DURATION_TICKS[duration];
  if (dots === 1) return base + base / 2;
  return base;
}

// ----------------------------------------------------------
// 関数：noteTicks
// 音符・休符1つ分のデータの長さを、16分音符いくつ分かにする
// ----------------------------------------------------------
export function noteTicks(note) {
  return durationToTicks(note.duration, note.dots ?? 0);
}

// ----------------------------------------------------------
// 関数：timeAt
// i 小節目（0 から数える）の拍子を返す
// （拍子は変わる小節にしか書いていないので、前の小節にさかのぼって探す）
// ----------------------------------------------------------
export function timeAt(score, i) {
  for (let k = i; k >= 0; k--) {
    if (score.measures[k].time) return score.measures[k].time;
  }
  return { beats: 4, beatType: 4 }; // 見つからないときは4分の4拍子
}

// ----------------------------------------------------------
// 関数：keyAt
// i 小節目（0 から数える）の調号を返す（さかのぼって探す）
// ----------------------------------------------------------
export function keyAt(score, i) {
  for (let k = i; k >= 0; k--) {
    if (score.measures[k].key !== undefined) return score.measures[k].key;
  }
  return 0;
}

// ----------------------------------------------------------
// 関数：measureTicks
// 拍子から、1小節の長さ（16分音符いくつ分か）を計算する
// 例：4分の4拍子 → 16、4分の3拍子 → 12、8分の6拍子 → 12
// ----------------------------------------------------------
export function measureTicks(time) {
  return (time.beats * 16) / time.beatType;
}

// 1つの休符で書ける長さ（16分音符いくつ分か）と、その書き方の表
// 小節まるごと休みのときに使う
const SINGLE_REST = {
  16: { duration: "whole", dots: 0 },
  12: { duration: "half", dots: 1 },
  8: { duration: "half", dots: 0 },
  6: { duration: "quarter", dots: 1 },
  4: { duration: "quarter", dots: 0 },
  3: { duration: "eighth", dots: 1 },
  2: { duration: "eighth", dots: 0 },
  1: { duration: "16th", dots: 0 },
};

// ----------------------------------------------------------
// 関数：restsForSpan
// 小節の中の「start から length の長さ」を、休符で埋めるための休符の並びを作る
//   start   … 埋め始める位置（小節の頭から、16分音符いくつ分か）
//   length  … 埋める長さ（16分音符いくつ分か）
//   measure … 1小節の長さ（16分音符いくつ分か）
// 拍の区切りに合わせて、自然な形の休符にする
//   ・小節まるごと休みなら、1つの休符（4分の4拍子なら全休符、4分の3拍子なら付点2分休符）
//   ・それ以外は、長い休符から順に「その休符の長さで割り切れる位置」にだけ置く
//     例：4分の4拍子で2拍目から3拍分 → 4分休符（2拍目）＋2分休符（3拍目から）
// ----------------------------------------------------------
export function restsForSpan(start, length, measure) {
  // 小節まるごと休み
  if (start === 0 && length === measure && SINGLE_REST[measure]) {
    const rest = SINGLE_REST[measure];
    return [{ rest: true, duration: rest.duration, dots: rest.dots }];
  }

  const rests = [];
  let position = start;
  const end = start + length;
  while (position < end) {
    // 長い休符から順に、置けるものを探す
    for (const duration of DURATION_ORDER) {
      const ticks = DURATION_TICKS[duration];
      const fits = position + ticks <= end; // はみ出さない
      const aligned = position % ticks === 0; // その休符の長さで割り切れる位置
      if (fits && aligned) {
        rests.push({ rest: true, duration: duration, dots: 0 });
        position = position + ticks;
        break;
      }
    }
  }
  return rests;
}

// ----------------------------------------------------------
// 関数：createEmptyScore
// 空の弦楽四重奏の楽譜を作る（4小節・ハ長調・4分の4拍子・全部休符）
// ----------------------------------------------------------
export function createEmptyScore() {
  const time = { beats: 4, beatType: 4 };
  const measureCount = 4;
  const ticks = measureTicks(time);

  // パートの一覧（名前・短い名前・楽器）
  const partList = [
    { name: "Violin I", abbreviation: "Vln. I", instrument: "violin" },
    { name: "Violin II", abbreviation: "Vln. II", instrument: "violin" },
    { name: "Viola", abbreviation: "Vla.", instrument: "viola" },
    { name: "Cello", abbreviation: "Vc.", instrument: "cello" },
  ];

  return {
    title: "無題",
    composer: "",
    tempo: 80,
    // 1小節目に最初の拍子と調、あとは空
    measures: Array.from({ length: measureCount }, (_, i) => (i === 0 ? { time: time, key: 0 } : {})),
    parts: partList.map((info) => ({
      name: info.name,
      abbreviation: info.abbreviation,
      instrument: info.instrument,
      measures: Array.from({ length: measureCount }, (_, i) => {
        const measure = { notes: restsForSpan(0, ticks, ticks) };
        // 1小節目には楽器に合った音部記号を書いておく
        if (i === 0) measure.clef = INSTRUMENTS[info.instrument].clef;
        return measure;
      }),
    })),
  };
}
