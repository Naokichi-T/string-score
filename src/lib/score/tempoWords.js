// ==========================================================
// tempoWords.js
// テンポの変化を表す言葉の表と、文字から意味を当てる関数（自由な文字のテンポの指示）
//   楽譜の上に書く文字（rall.・allargando など）が、
//   「だんだん遅く」「だんだん速く」「元の速さに戻す」のどれなのかを、言葉の表で当てる
//   ・楽譜作成アプリ：［文字…］で文字を入れたときに、再生での扱いを自動で選んでおくのに使う
//                    MusicXML を読み込むときに、文字の指示がテンポの変化かどうかを見分けるのにも使う
//                    書き出すときに付ける id の始まり（GRADUAL_ID_PREFIX）も、ここに置く
//   ・音程チェックアプリ：このファイルをコピーして、テンポが遅くなる所のリズムの判定を甘くするのに使う予定
// 表にない言葉は「わからない」（null）として扱う。足りない言葉が見つかったら、表に足していく
// （テンポの言葉を増やした手直し a：言葉の表を大きく増やし、意味の種類も増やした）
//   ・意味の種類（tempoWordKind が返すもの）
//       "rit"        … だんだん遅く（rit.・rall.・cédez など）
//       "accel"      … だんだん速く（accel.・stringendo・pressez など）
//       "aTempo"     … 元の速さに戻す（a tempo・au mouvement など）
//       "tempoPrimo" … 曲の頭の速さに戻す（Tempo primo・Tempo I など）（新しい種類）
//                      （前は a tempo と同じ "aTempo" にしていた）
//       "faster"     … 急に速く（Più mosso・più allegro・plus vite など）（新しい種類）
//       "slower"     … 急に遅く（Meno mosso・Più lento・Largamente など）（新しい種類）
//       "none"       … 速さは変えず、文字だけ残す（l'istesso tempo・rubato など）（新しく表に入れた）
//                      （表にあると、MusicXML を読み込んだときに、捨てずに文字として残せる）
//   ・イタリア語に加えて、よく出るフランス語・ドイツ語の言葉も入れた
//   ・比べるときに、アクセント記号（più の ù など）を外し、ß を ss にする（piu・più のどちらでも当たる）
//   ・2つ以上の単語でできた言葉（più mosso など）は、文字の中のどこにあっても当たる
//     （「poco meno mosso」「un poco più mosso」のように、前に飾りの言葉が付いていても当たる）
//   ・「poco a poco più mosso」のように「少しずつ」が付いた急に変わる言葉は、だんだん変わる言葉にする
//   ・急に変わる言葉の変える量は suddenTempoRate で決める（poco なら少し、molto なら大きく）
// ==========================================================

// 楽譜作成アプリが MusicXML に書き出す rit.・accel.・自由な文字の <direction> に付ける id の始まり
// あとに、再生での扱い（rit・accel・none）と小節の番号を付ける（例：string-score-gradual-none-7）
// 読み込むときにこの id があれば、言葉の表で当てずに、id に書いた扱いをそのまま使う
// （言葉の表にない文字や、自分で選んだ扱い（allargando を「速くする」など）も、そのまま読み直せるようにするため）
export const GRADUAL_ID_PREFIX = "string-score-gradual-";

// ----------------------------------------------------------
// 急に変わる言葉の、変える量（テンポの言葉を増やした手直し a）
// それまでの速さに、この倍率をかける（1.15 なら 15％速く、0.85 なら 15％遅く）
// ----------------------------------------------------------
// ふつう（più mosso・meno mosso など）
export const SUDDEN_FASTER_RATE = 1.15;
export const SUDDEN_SLOWER_RATE = 0.85;
// 「少し」が付いたとき（poco più mosso・poco meno mosso・etwas langsamer など）
export const SUDDEN_FASTER_RATE_SMALL = 1.07;
export const SUDDEN_SLOWER_RATE_SMALL = 0.93;
// 「とても」が付いたとき（molto più mosso・molto meno mosso など）
export const SUDDEN_FASTER_RATE_LARGE = 1.3;
export const SUDDEN_SLOWER_RATE_LARGE = 0.75;

// 言葉 → 意味 の表（1つの単語ごと。比べやすい形（normalizeTempoWords）で書く：小文字・「.」なし・アクセント記号なし）
// 略した形（rall・allarg など）も、そのまま書いておく
const WORD_KINDS = {
  // ---------- だんだん遅く ----------
  rit: "rit",
  ritard: "rit",
  ritardando: "rit",
  riten: "rit", // ritenuto は辞書によっては「急に遅く」だが、今の楽譜の鳴り方を変えないため「だんだん遅く」のまま
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
  // （テンポの言葉を増やした手直し a：ここから足した）
  lentando: "rit", // だんだん遅く
  tardando: "rit", // だんだん遅く
  trattenuto: "rit", // 引き止めるように
  tratt: "rit",
  allentando: "rit", // ゆるめて
  slargando: "rit", // 幅を広げて（allargando と同じ）
  largando: "rit",
  stentando: "rit", // 重く引きずるように
  stent: "rit",
  perdendosi: "rit", // 消えていくように（だんだん弱く、遅く）
  mancando: "rit", // 消えていくように
  estinguendo: "rit", // 消え入るように
  // フランス語
  cedez: "rit", // cédez（ゆずって＝少し遅く）
  ralentir: "rit", // 遅くする
  ralentissez: "rit",
  ralentissant: "rit", // en ralentissant
  ralenti: "rit",
  elargissez: "rit", // élargissez（幅を広げて）
  elargissant: "rit", // en élargissant
  retenez: "rit", // 引き止めて
  // ドイツ語
  zuruckhaltend: "rit", // zurückhaltend（ためらうように遅く）
  zurueckhaltend: "rit",
  zuruckhalten: "rit",
  zurueckhalten: "rit",
  nachlassend: "rit", // ゆるめて
  verlangsamen: "rit",

  // ---------- だんだん速く ----------
  accel: "accel",
  accelerando: "accel",
  string: "accel",
  stringendo: "accel",
  // （テンポの言葉を増やした手直し a：ここから足した）
  anim: "accel",
  animando: "accel", // 活気づいて
  affrett: "accel",
  affrettando: "accel", // 急いで
  incalzando: "accel", // せき立てるように
  precip: "accel",
  precipitando: "accel", // 突き進むように
  // フランス語
  pressez: "accel", // 急いで
  pressant: "accel", // en pressant
  serrez: "accel", // 詰めて
  serrant: "accel", // en serrant
  animez: "accel", // 活気づけて
  animant: "accel", // en animant
  // ドイツ語
  drangend: "accel", // drängend（せき立てるように）
  draengend: "accel",
  eilend: "accel", // 急いで

  // ---------- 急に速く（新しい種類） ----------
  stretto: "faster", // 詰めて（速いテンポで）
  // ドイツ語
  schneller: "faster", // より速く
  rascher: "faster",
  bewegter: "faster", // より動きをもって

  // ---------- 急に遅く（新しい種類） ----------
  largamente: "slower", // 幅広く
  // フランス語
  retenu: "slower", // 引き止められて
  // ドイツ語
  langsamer: "slower", // より遅く
  breiter: "slower", // より幅広く

  // ---------- 曲の頭の速さに戻す（新しい種類） ----------
  // ドイツ語
  hauptzeitmass: "tempoPrimo", // Hauptzeitmaß（主な速さ）

  // ---------- 速さは変えず、文字だけ残す（新しく表に入れた） ----------
  rubato: "none", // 速さを自由に揺らして
};

// 言葉のまとまり → 意味 の表（2つ以上の単語でできているもの。比べやすい形で書く）
// 文字の中のどこにあっても当たる（前後に飾りの言葉が付いていてもよい）
const PHRASE_KINDS = {
  // ---------- 元の速さに戻す ----------
  "a tempo": "aTempo",
  "in tempo": "aTempo",
  "au mouvement": "aTempo", // フランス語
  "im tempo": "aTempo", // ドイツ語（wieder im Tempo も当たる）

  // ---------- 曲の頭の速さに戻す（新しい種類） ----------
  // （テンポの言葉を増やした手直し a：前は a tempo と同じ扱いだった）
  "tempo primo": "tempoPrimo",
  "tempo i": "tempoPrimo", // Tempo I・Tempo I°（° は比べるときに外す）
  "tempo 1": "tempoPrimo",
  "tempo imo": "tempoPrimo",
  "tempo 1mo": "tempoPrimo",
  "primo tempo": "tempoPrimo",
  "come prima": "tempoPrimo", // 前のように（tempo come prima も当たる）
  "1er mouvement": "tempoPrimo", // フランス語
  "1er mouv": "tempoPrimo",
  "1er mvt": "tempoPrimo",
  "premier mouvement": "tempoPrimo",
  "mouvement initial": "tempoPrimo",
  "erstes zeitmass": "tempoPrimo", // ドイツ語（Erstes Zeitmaß）
  "erstes tempo": "tempoPrimo",
  "wie anfangs": "tempoPrimo",
  "wie zu anfang": "tempoPrimo",

  // ---------- 急に速く（新しい種類） ----------
  "piu mosso": "faster",
  "piu allegro": "faster",
  "piu vivo": "faster",
  "piu vivace": "faster",
  "piu presto": "faster",
  "piu animato": "faster",
  "piu moto": "faster",
  "piu stretto": "faster",
  "meno lento": "faster", // 遅さを減らして＝速く
  "meno adagio": "faster",
  "doppio movimento": "faster", // 2倍の速さ（変える量は suddenTempoRate で 2倍にする）
  "plus vite": "faster", // フランス語
  "plus anime": "faster", // plus animé
  "plus allant": "faster",
  "moins lent": "faster",
  "schneller werden": "accel", // ドイツ語（「だんだん」なので、だんだん速く）

  // ---------- 急に遅く（新しい種類） ----------
  "meno mosso": "slower",
  "meno allegro": "slower",
  "meno vivo": "slower",
  "meno vivace": "slower",
  "meno presto": "slower",
  "meno moto": "slower",
  "piu lento": "slower",
  "piu largo": "slower",
  "piu adagio": "slower",
  "piu tranquillo": "slower",
  "piu calmo": "slower",
  "piu sostenuto": "slower",
  "doppio piu lento": "slower", // 半分の速さ（変える量は suddenTempoRate で 0.5倍にする）
  "moins vite": "slower", // フランス語
  "plus lent": "slower",
  "plus calme": "slower",
  "plus large": "slower",
  "langsamer werden": "rit", // ドイツ語（「だんだん」なので、だんだん遅く）
  "breiter werden": "rit",

  // ---------- 速さは変えず、文字だけ残す（新しく表に入れた） ----------
  "l istesso tempo": "none", // 同じ速さで（拍子が変わっても、拍の速さはそのまま）
  "listesso tempo": "none",
  "lo stesso tempo": "none",
  "tempo giusto": "none", // 正確な速さで
  "tempo rubato": "none",
  "ad lib": "none", // 自由に
  "ad libitum": "none",
  "a piacere": "none", // 好きなように
  "senza misura": "none", // 拍にとらわれずに
  "senza tempo": "none",
  "colla parte": "none", // 主な声部に合わせて
  "colla voce": "none",
};

// 「少しずつ」を表す言葉のまとまり（急に変わる言葉に付いていたら、だんだん変わる言葉にする）
const GRADUALLY_PHRASES = ["poco a poco", "peu a peu", "nach und nach", "little by little"];

// 「少し」を表す単語（急に変わる言葉の、変える量を小さくする）
const SMALL_WORDS = ["poco", "pochissimo", "peu", "etwas", "slightly", "little"];

// 「とても」を表す単語（急に変わる言葉の、変える量を大きくする）
const LARGE_WORDS = ["molto", "assai", "ancora", "beaucoup", "sehr", "viel", "much"];

// まとまりの表の言葉を、単語の並びにして、長い順に並べたもの
// （長いものから先に調べる：「doppio piu lento」を「piu lento」より先に当てるため）
const PHRASE_LIST = Object.keys(PHRASE_KINDS)
  .map((phrase) => ({ words: phrase.split(" "), kind: PHRASE_KINDS[phrase] }))
  .sort((a, b) => b.words.length - a.words.length);

// ----------------------------------------------------------
// 関数：normalizeTempoWords
// 文字を、表と比べやすい形にする
//   ・小文字にする
//   ・アクセント記号を外す（più → piu、cédez → cedez、zurückhaltend → zuruckhaltend）
//   ・ß を ss にする（Zeitmaß → zeitmass）
//   ・「.」「,」「°」「º」「'」「’」「(」「)」などの記号を空白にして、続いた空白を1つにまとめる
// 例："Poco  Rall." → "poco rall"、"Più mosso" → "piu mosso"、"Tempo I°" → "tempo i"、"L'istesso tempo" → "l istesso tempo"
//   text … 楽譜に書く文字
// 戻り値：比べやすくした文字
// （テンポの言葉を増やした手直し a：アクセント記号・ß・いろいろな記号も、比べやすい形にするようにした）
// ----------------------------------------------------------
export function normalizeTempoWords(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD") // 文字と、上に付くアクセント記号を分ける（ù → u ＋ ̀）
    .replace(/[̀-ͯ]/g, "") // 分けたアクセント記号を取る
    .replaceAll("ß", "ss")
    .replace(/[.,;:°º'’"“”()\[\]!?\-–—]/g, " ") // 記号は空白にする
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------
// 関数：findPhrase
// 単語の並びの中に、まとまり（words）がそのまま続いて入っているかを調べる
//   tokens … 文字を単語に分けたもの（例：["poco", "meno", "mosso"]）
//   words  … 探すまとまり（例：["meno", "mosso"]）
// 戻り値：見つかった所の最初の単語の番号（見つからなければ −1）
// ----------------------------------------------------------
function findPhrase(tokens, words) {
  for (let start = 0; start + words.length <= tokens.length; start++) {
    if (words.every((word, k) => tokens[start + k] === word)) return start;
  }
  return -1;
}

// ----------------------------------------------------------
// 関数：hasGraduallyPhrase
// 比べやすくした文字に、「少しずつ」を表す言葉（poco a poco など）が入っているか
//   tokens … 文字を単語に分けたもの
// ----------------------------------------------------------
function hasGraduallyPhrase(tokens) {
  return GRADUALLY_PHRASES.some((phrase) => findPhrase(tokens, phrase.split(" ")) >= 0);
}

// ----------------------------------------------------------
// 関数：tempoWordKind
// 文字が、テンポの変化を表す言葉かどうかを、表で当てる
//   1. まとまりの表（più mosso・a tempo など）の言葉が、文字の中のどこかにあるかを見る
//      （いちばん前にあるものを使う。同じ所から始まるものがいくつかあれば、長いほうを使う）
//   2. なければ、文字の中の単語を1つずつ見て、単語の表にある単語があればその意味にする
//      （「poco a poco rit.」「molto rall.」のように、前に飾りの言葉が付いていても当たる）
//   3. 当たったのが「急に速く・急に遅く」で、「poco a poco」などの「少しずつ」が付いていたら、
//      「だんだん速く・だんだん遅く」にする（例：poco a poco più mosso → だんだん速く）
// 例："rall." → "rit"、"accel." → "accel"、"A tempo" → "aTempo"、"Tempo I" → "tempoPrimo"、
//     "Più mosso" → "faster"、"poco meno mosso" → "slower"、"Largamente" → "slower"、"rubato" → "none"、"dolce" → null
//   text … 楽譜に書く文字
// 戻り値："rit"・"accel"・"aTempo"・"tempoPrimo"・"faster"・"slower"・"none"・null（わからない）
// ----------------------------------------------------------
export function tempoWordKind(text) {
  const normalized = normalizeTempoWords(text);
  if (normalized === "") return null;
  const tokens = normalized.split(" ");

  // 1. まとまりの表：いちばん前にあるもの（同じ所なら長いもの。PHRASE_LIST は長い順なので、先に見つけたほうを残す）
  let kind = null;
  let foundAt = Infinity;
  for (const phrase of PHRASE_LIST) {
    const at = findPhrase(tokens, phrase.words);
    if (at >= 0 && at < foundAt) {
      kind = phrase.kind;
      foundAt = at;
    }
  }

  // 2. 単語の表（まとまりが見つからなかったときだけ。最初に当たったものを使う）
  if (kind === null) {
    for (const word of tokens) {
      if (WORD_KINDS[word]) {
        kind = WORD_KINDS[word];
        break;
      }
    }
  }

  // 3. 「少しずつ」が付いた急に変わる言葉は、だんだん変わる言葉にする
  if ((kind === "faster" || kind === "slower") && hasGraduallyPhrase(tokens)) {
    return kind === "faster" ? "accel" : "rit";
  }
  return kind;
}

// ----------------------------------------------------------
// 関数：suddenTempoRate
// 急に変わる言葉（"faster"・"slower"）で、それまでの速さに何倍をかけるかを決める（テンポの言葉を増やした手直し a）
//   kind … 再生での扱い（"faster"・"slower"。それ以外なら 1 を返す）
//   text … 楽譜に書いた文字（poco・molto などを見て、変える量を決める。なくてもよい）
// 決め方：
//   ・doppio movimento … 2倍、doppio più lento … 0.5倍
//   ・「少し」の言葉（poco・etwas など）が付いていたら、小さく変える（1.07倍・0.93倍）
//   ・「とても」の言葉（molto・assai など）が付いていたら、大きく変える（1.3倍・0.75倍）
//   ・どちらもなければ、ふつう（1.15倍・0.85倍）
//   （文字が表にない言葉でも、自分で「急に速く・急に遅く」を選んだときは、ふつうの量にする）
// 例："Più mosso" → 1.15、"poco meno mosso" → 0.93、"molto più lento" → 0.75
// 戻り値：倍率
// ----------------------------------------------------------
export function suddenTempoRate(kind, text = "") {
  if (kind !== "faster" && kind !== "slower") return 1;
  const tokens = normalizeTempoWords(text).split(" ");

  // 2倍・半分の速さ
  if (findPhrase(tokens, ["doppio", "piu", "lento"]) >= 0) return 0.5;
  if (findPhrase(tokens, ["doppio", "movimento"]) >= 0) return 2;

  const faster = kind === "faster";
  if (tokens.some((word) => SMALL_WORDS.includes(word))) return faster ? SUDDEN_FASTER_RATE_SMALL : SUDDEN_SLOWER_RATE_SMALL;
  if (tokens.some((word) => LARGE_WORDS.includes(word))) return faster ? SUDDEN_FASTER_RATE_LARGE : SUDDEN_SLOWER_RATE_LARGE;
  return faster ? SUDDEN_FASTER_RATE : SUDDEN_SLOWER_RATE;
}
