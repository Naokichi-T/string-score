// ==========================================================
// model.js
// 楽譜データの「形」の説明と、表示・計算に使う表をまとめたファイル
// ==========================================================
//
// 【楽譜データの形】
// score = {
//   title: 'タイトル',
//   composer: '作曲者',
//   tempoText: 'Allegro',            // 速度記号（なければ空の文字）
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
//             { rest: true, duration: 'quarter', dots: 0 },
//             // 連符の中の音には tuplet を付ける（ステップ10-2）
//             // 例：8分音符の3連符 = 「8分音符2つ分の長さに、8分音符を3つ入れる」
//             { pitch: { step: 'D', alter: 0, octave: 4 }, duration: 'eighth', dots: 0, tie: false, tuplet: { actual: 3, normal: 2 } }
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
//   name           … パート名（同じ楽器が2つ以上あるときは、うしろに I・II… を付ける）
//   abbreviation   … 2段目からの短いパート名
//   label          … ボタンに出す日本語の名前
// （ステップ5-6：name・abbreviation・label を追加）
export const INSTRUMENTS = {
  // strings … 弦の名前（低い弦から順に）（「奏法」タブの弦の指定で使う）（ステップ11-2）
  violin: { clef: "treble", keyboardOctave: 4, name: "Violin", abbreviation: "Vln.", label: "バイオリン", strings: ["G", "D", "A", "E"] }, // バイオリン（ド4〜ド7）
  viola: { clef: "alto", keyboardOctave: 3, name: "Viola", abbreviation: "Vla.", label: "ビオラ", strings: ["C", "G", "D", "A"] }, // ビオラ（ド3〜ド6）
  cello: { clef: "bass", keyboardOctave: 2, name: "Cello", abbreviation: "Vc.", label: "チェロ", strings: ["C", "G", "D", "A"] }, // チェロ（ド2〜ド5）
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
// 長さは「ティック」という整数で計算する
// （小数で計算すると、0.1 + 0.2 のような誤差が出ることがあるため）
// ==========================================================

// ----------------------------------------------------------
// 16分音符1つを何ティックとするか（ステップ10-1）
// 27720 は、2〜12 のどの数で割っても割り切れる一番小さい数
// こうしておくと、2〜12連符の1つ分の長さも整数になる
//   例：8分音符の3連符の1つ分 = 8分音符2つ分 ÷ 3 = 27720 × 2 × 2 ÷ 3 = 36960
// （前は 16分音符 = 1 だった。楽譜データには長さの名前しか保存していないので、
//   この数を変えても、保存した楽譜には影響しない）
// ----------------------------------------------------------
export const TICKS_PER_16TH = 27720;

// 音の長さ（付点なし）を、ティックで表した表
const DURATION_TICKS = {
  whole: 16 * TICKS_PER_16TH, // 全音符 = 16分音符16個分
  half: 8 * TICKS_PER_16TH, // 2分音符 = 16分音符8個分
  quarter: 4 * TICKS_PER_16TH, // 4分音符 = 16分音符4個分
  eighth: 2 * TICKS_PER_16TH, // 8分音符 = 16分音符2個分
  "16th": 1 * TICKS_PER_16TH, // 16分音符
};

// 長さの名前を、長い順に並べたもの（ボタンを並べる順番にも使う）
export const DURATION_ORDER = ["whole", "half", "quarter", "eighth", "16th"];

// ----------------------------------------------------------
// 関数：durationToTicks
// 音の長さ（名前＋付点の数）を、ティックにする
// 例：('quarter', 0) → 4分音符のティック、('quarter', 1) → その 1.5倍（付点4分音符）
// 16分音符に付点は付けられない扱いにする（付点16分音符は 32分音符が必要になるため）
// ----------------------------------------------------------
export function durationToTicks(duration, dots = 0) {
  const base = DURATION_TICKS[duration];
  if (dots === 1) return base + base / 2;
  return base;
}

// ----------------------------------------------------------
// 関数：noteTicks
// 音符・休符1つ分のデータの長さを、ティックにする
// 連符の中の音は「normal 個分の長さに actual 個入れる」ので、normal ÷ actual 倍にする（ステップ10-2）
//   例：8分音符の3連符の1つ分 → 8分音符 × 2 ÷ 3
// ----------------------------------------------------------
export function noteTicks(note) {
  const ticks = durationToTicks(note.duration, note.dots ?? 0);
  if (note.tuplet) return (ticks * note.tuplet.normal) / note.tuplet.actual;
  return ticks;
}

// ==========================================================
// ここから下は、連符の関数（ステップ10-2）
// 【連符のデータの決まり】
//   ・連符の中の音（休符も）には、全部に tuplet: { actual, normal } を付ける
//       actual … 連符の数字（3連符なら 3）
//       normal … 何個分の長さに入れるか（3連符なら 2）
//   ・1つの連符の中の音は、全部同じ長さ（付点なし）
//   ・連符の音は小節の中で順に並び、actual 個ずつで1つの連符になる
// ==========================================================

// ----------------------------------------------------------
// 関数：tupletNormal
// 連符の数字から「何個分の長さに入れるか」を決める（ふつうの決まり）
//   2連符 → 3個分（8分の6拍子などで使う）
//   4連符 → 3個分（8分の6拍子などで使う）
//   それ以外 → 連符の数字より小さい、一番大きい 2・4・8 のどれか
//     例：3連符 → 2、5〜7連符 → 4、9〜12連符 → 8
// ----------------------------------------------------------
export function tupletNormal(actual) {
  if (actual === 2 || actual === 4) return 3;
  let normal = 2;
  while (normal * 2 < actual) {
    normal = normal * 2;
  }
  return normal;
}

// ----------------------------------------------------------
// 関数：tupletGroups
// 小節の音の並びから、連符のまとまりを探す
//   notes … 小節の音の並び
// 戻り値：[{ start: 最初の音の番号, end: 最後の音の番号, actual, normal, duration: 1つ分の長さの名前 }, ...]
// tuplet の付いた音が続く所を、actual 個ずつに区切る
// （数字や長さが変わったら、そこから新しい連符にする）
// ----------------------------------------------------------
export function tupletGroups(notes) {
  const groups = [];
  let current = null; // 今まとめている連符
  notes.forEach((note, j) => {
    // 連符でない音：まとめるのをやめる
    if (!note.tuplet) {
      current = null;
      return;
    }
    // 今の連符の続きにできるか（同じ数字・同じ長さで、まだ actual 個そろっていない）
    const canContinue = current && current.actual === note.tuplet.actual && current.normal === note.tuplet.normal && current.duration === note.duration && j - current.start < current.actual;
    if (canContinue) {
      current.end = j;
    } else {
      // 新しい連符を始める
      current = { start: j, end: j, actual: note.tuplet.actual, normal: note.tuplet.normal, duration: note.duration };
      groups.push(current);
    }
  });
  return groups;
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
// 関数：tempoAt
// i 小節目（0 から数える）のテンポを返す（ステップ11-6a）
// テンポが変わる小節には measures[i].tempo（と、あれば tempoText）が書いてある
// 1小節目のテンポは、楽譜全体の score.tempo・score.tempoText（「楽譜の設定」タブで変えるもの）
// 戻り値：{ tempo: ♩＝○○ の数字, tempoText: 速度記号（なければ空の文字） }
// ----------------------------------------------------------
export function tempoAt(score, i) {
  for (let k = i; k >= 1; k--) {
    const info = score.measures[k];
    if (info.tempo !== undefined) return { tempo: info.tempo, tempoText: info.tempoText ?? "" };
  }
  return { tempo: score.tempo, tempoText: score.tempoText ?? "" };
}

// ----------------------------------------------------------
// 関数：rehearsalLabel
// i 小節目の練習番号の文字を返す（ステップ11-7d）
// 練習番号（measures[i].rehearsal）の付いた小節を前から数えて、A, B, C… … Z, AA, BB… と付ける
// （文字はデータに持たず、そのつど数えるので、途中に足したり消したりすると後ろが付け直される）
//   例：3小節目と9小節目に付いていたら、3小節目は "A"、9小節目は "B"
// 戻り値：文字（その小節に練習番号がなければ null）
// ----------------------------------------------------------
export function rehearsalLabel(measures, i) {
  if (!measures[i].rehearsal) return null;
  // この小節までに、練習番号がいくつあるか（この小節も入れる）
  let count = 0;
  for (let k = 0; k <= i; k++) {
    if (measures[k].rehearsal) count = count + 1;
  }
  const n = count - 1; // 0 から数えた番号
  const letter = String.fromCharCode(65 + (n % 26)); // 65 は "A"
  return letter.repeat(Math.floor(n / 26) + 1); // 27個目からは AA, BB…
}

// D.C.・D.S. の種類と、楽譜に書く文字（ステップ11-7c）
// 小節の情報の jump に、この左側の名前（"dc" など）を入れる
export const JUMP_TEXTS = {
  dc: "D.C.", // 曲の頭へ戻る
  dcFine: "D.C. al Fine", // 曲の頭へ戻って、Fine で終わる
  dcCoda: "D.C. al Coda", // 曲の頭へ戻って、To Coda からコーダ（𝄌）へ飛ぶ
  ds: "D.S.", // 𝄋（Segno）へ戻る
  dsFine: "D.S. al Fine", // 𝄋 へ戻って、Fine で終わる
  dsCoda: "D.S. al Coda", // 𝄋 へ戻って、To Coda からコーダ（𝄌）へ飛ぶ
};

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
// 拍子から、1小節の長さ（ティック）を計算する
// 例：4分の4拍子 → 16分音符16個分、4分の3拍子 → 12個分、8分の6拍子 → 12個分
// ----------------------------------------------------------
export function measureTicks(time) {
  return (time.beats * 16 * TICKS_PER_16TH) / time.beatType;
}

// ----------------------------------------------------------
// 関数：restsForSpan
// 小節の中の「start から length の長さ」を、休符で埋めるための休符の並びを作る
//   start  … 埋め始める位置（小節の頭から何ティックか）
//   length … 埋める長さ（ティック）
//   time   … その小節の拍子 { beats, beatType }
// Flat と同じように「1拍ずつの休符」で埋める
//   ・1拍の長さ = 拍子の下の数字の音符1つ分（4分の4拍子なら4分音符、8分の6拍子なら8分音符）
//   ・1拍より長い休符は使わない（空の4分の4拍子の小節 → 4分休符が4つ）
//   ・拍の途中から始まるときは、その休符の長さで割り切れる位置にだけ置く
//     例：4分の4拍子で、3拍目のうら（8分音符1つ分あと）から → 8分休符 → 4分休符…
// ----------------------------------------------------------
export function restsForSpan(start, length, time) {
  const beat = (16 * TICKS_PER_16TH) / time.beatType; // 1拍の長さ（ティック）

  const rests = [];
  let position = start;
  const end = start + length;
  while (position < end) {
    // 長い休符から順に、置けるものを探す
    for (const duration of DURATION_ORDER) {
      const ticks = DURATION_TICKS[duration];
      const withinBeat = ticks <= beat; // 1拍より長くない
      const fits = position + ticks <= end; // はみ出さない
      const aligned = position % ticks === 0; // その休符の長さで割り切れる位置
      if (withinBeat && fits && aligned) {
        rests.push({ rest: true, duration: duration, dots: 0 });
        position = position + ticks;
        break;
      }
    }
  }
  return rests;
}

// ----------------------------------------------------------
// 関数：createPartId
// パートの名札（id）を新しく作る（ステップ12-3）
// パートの名前や並び順が変わっても、同じパートだとわかるようにするため
// （パートごとの音量の設定を、この id で覚える）
// 例："p8k2xq7mz"（"p" ＋ ランダムな英数字8文字）
// ----------------------------------------------------------
export function createPartId() {
  return "p" + Math.random().toString(36).slice(2, 10);
}

// ----------------------------------------------------------
// 関数：ensurePartIds
// id の付いていないパートがあれば、id を付けた新しい楽譜データを返す（ステップ12-3）
// （ステップ12-3 より前に作った楽譜には id がないため。開いたときに使う）
// 戻り値：全部のパートに id があれば、渡された楽譜データそのまま
//         なければ、id を付けた新しい楽譜データ
// ----------------------------------------------------------
export function ensurePartIds(score) {
  if (score.parts.every((part) => part.id)) return score;
  return {
    ...score,
    parts: score.parts.map((part) => (part.id ? part : { ...part, id: createPartId() })),
  };
}

// パートの番号に使うローマ数字（11個目からは、ふつうの数字にする）
// （ステップ7-3：edit.js から移した）
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// ----------------------------------------------------------
// 関数：renameParts
// パート名を、楽器と並び順から付け直す（渡されたパートの配列を直接書き換える）
//   同じ楽器が1つだけ   → 番号なし（"Violin"・"Vln."）
//   同じ楽器が2つ以上   → 上から順に I・II…（"Violin I"・"Vln. I"）
// （コピーした楽譜データの中でだけ使う）
// （ステップ7-3：新しい楽譜を作るときにも使うので、edit.js から移した）
// ----------------------------------------------------------
export function renameParts(parts) {
  // 楽器ごとの数を数える
  const totals = {};
  parts.forEach((part) => {
    totals[part.instrument] = (totals[part.instrument] ?? 0) + 1;
  });

  // 上から順に名前を付ける
  const counters = {}; // 楽器ごとに、ここまでにいくつ出てきたか
  parts.forEach((part) => {
    const info = INSTRUMENTS[part.instrument];
    counters[part.instrument] = (counters[part.instrument] ?? 0) + 1;
    if (totals[part.instrument] === 1) {
      part.name = info.name;
      part.abbreviation = info.abbreviation;
    } else {
      const n = counters[part.instrument];
      const number = ROMAN[n - 1] ?? String(n);
      part.name = `${info.name} ${number}`;
      part.abbreviation = `${info.abbreviation} ${number}`;
    }
  });
}

// ----------------------------------------------------------
// 関数：createEmptyScore
// 空の楽譜を作る（4小節・ハ長調・4分の4拍子・全部休符）
//   instruments … 上から順の楽器の配列（例：["violin", "violin", "viola", "cello"]）
//                 省略したときは弦楽四重奏
// パート名は楽器の並びから自動で付ける（renameParts）
// （ステップ7-3：楽器を選べるようにした）
// ----------------------------------------------------------
export function createEmptyScore(instruments = ["violin", "violin", "viola", "cello"]) {
  const time = { beats: 4, beatType: 4 };
  const measureCount = 4;
  const ticks = measureTicks(time);

  // パートを作る（名前はあとで renameParts で付ける）
  const parts = instruments.map((instrument) => ({
    id: createPartId(), // パートの名札（ステップ12-3）
    name: "",
    abbreviation: "",
    instrument: instrument,
    measures: Array.from({ length: measureCount }, (_, i) => {
      const measure = { notes: restsForSpan(0, ticks, time) };
      // 1小節目には楽器に合った音部記号を書いておく
      if (i === 0) measure.clef = INSTRUMENTS[instrument].clef;
      return measure;
    }),
  }));
  renameParts(parts);

  return {
    title: "無題",
    composer: "",
    tempoText: "", // 速度記号（"Allegro" など。空ならなし）
    tempo: 80,
    // 1小節目に最初の拍子と調、あとは空
    measures: Array.from({ length: measureCount }, (_, i) => (i === 0 ? { time: time, key: 0 } : {})),
    parts: parts,
  };
}
