// ==========================================================
// tempoWords.js
// テンポの変化を表す言葉の表と、文字から意味を当てる関数（自由な文字のテンポの指示）
//   楽譜の上に書く文字（rall.・allargando など）が、
//   「だんだん遅く」「だんだん速く」「元の速さに戻す」のどれなのかを、言葉の表で当てる
//   ・楽譜作成アプリ：［文字…］で文字を入れたときに、再生での扱いを自動で選んでおくのに使う
//                    MusicXML を読み込むときに、文字の指示がテンポの変化かどうかを見分けるのにも使う
//   ・音程チェックアプリ：このファイルをコピーして、テンポが遅くなる所のリズムの判定を甘くするのに使う予定
// 表にない言葉は「わからない」（null）として扱う。足りない言葉が見つかったら、表に足していく
// ==========================================================

// 言葉 → 意味 の表（1つの単語ごと。「.」を取って小文字にした形で書く）
//   "rit"   … だんだん遅く（遅くする）
//   "accel" … だんだん速く（速くする）
// 略した形（rall・allarg など）も、そのまま書いておく
const WORD_KINDS = {
  // だんだん遅く
  rit: "rit",
  ritard: "rit",
  ritardando: "rit",
  riten: "rit",
  ritenuto: "rit",
  rall: "rit",
  rallent: "rit",
  rallentando: "rit",
  allarg: "rit",
  allargando: "rit",
  slent: "rit",
  slentando: "rit",
  calando: "rit", // だんだん弱く、遅く
  morendo: "rit", // 消えるように（だんだん弱く、遅く）
  smorz: "rit",
  smorzando: "rit", // 消えるように（だんだん弱く、遅く）
  // だんだん速く
  accel: "accel",
  accelerando: "accel",
  string: "accel",
  stringendo: "accel",
};

// 言葉のまとまり → 意味 の表（2つ以上の単語でできているもの。「.」を取って小文字にした形で書く）
//   "aTempo" … 元の速さに戻す（a tempo）
const PHRASE_KINDS = {
  "a tempo": "aTempo",
  "tempo i": "aTempo",
  "tempo primo": "aTempo",
};

// ----------------------------------------------------------
// 関数：normalizeTempoWords
// 文字を、表と比べやすい形にする：小文字にして「.」を取り、続いた空白を1つにまとめる
// 例："Poco  Rall." → "poco rall"
//   text … 楽譜に書く文字
// 戻り値：比べやすくした文字
// ----------------------------------------------------------
export function normalizeTempoWords(text) {
  return String(text ?? "")
    .toLowerCase()
    .replaceAll(".", " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------
// 関数：tempoWordKind
// 文字が、テンポの変化を表す言葉かどうかを、表で当てる
//   ・まず、文字の全体が「a tempo」などのまとまりかを見る
//   ・つぎに、文字の中の単語を1つずつ見て、表にある単語があればその意味にする
//     （「poco a poco rit.」「molto rall.」のように、前に飾りの言葉が付いていても当たる）
// 例："rall." → "rit"、"allargando" → "rit"、"accel." → "accel"、"A tempo" → "aTempo"、"dolce" → null
//   text … 楽譜に書く文字
// 戻り値："rit"（遅くする）・"accel"（速くする）・"aTempo"（元の速さに戻す）・null（わからない）
// ----------------------------------------------------------
export function tempoWordKind(text) {
  const normalized = normalizeTempoWords(text);
  if (normalized === "") return null;

  // 文字の全体が、まとまりの表にあるか
  if (PHRASE_KINDS[normalized]) return PHRASE_KINDS[normalized];

  // 単語を1つずつ見る（最初に当たったものを使う）
  for (const word of normalized.split(" ")) {
    if (WORD_KINDS[word]) return WORD_KINDS[word];
  }
  return null;
}
