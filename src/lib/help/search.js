// ==========================================================
// search.js
// Q&A のページ（/help）の検索に使う関数（ステップ17-5）
//
// 【探し方】
//   ・ひらがなとカタカナは同じものとして扱う（「ぴっつ」でも「ピッツ」でも見つかる）
//   ・大文字と小文字、全角と半角の英数字も同じものとして扱う（「ＭＩＤＩ」「midi」「MIDI」）
//   ・スペースで区切った言葉は、全部が入っているものだけを出す（「タイ　消す」→ 両方の言葉が入っている質問）
//
// 【色を付ける場所の決め方】
//   文字をそろえた形（normalize）で探して、見つかった場所を元の文字の場所に戻す
//   そのため、そろえるのは1文字ずつ行い、「そろえた文字が元の何文字目か」を覚えておく
// ==========================================================

// ----------------------------------------------------------
// 関数：normalizeChar
// 1文字を、探すためのそろえた形にする
//   ・全角の英数字 → 半角（NFKC という決まった直し方）
//   ・大文字 → 小文字
//   ・ひらがな → カタカナ（ぁ〜ゖ を、文字の番号を 0x60 進めてカタカナにする）
//   char … 1文字
// 戻り値：そろえた文字（たいてい1文字。NFKC で2文字以上になる文字もある）
// ----------------------------------------------------------
export function normalizeChar(char) {
  let text = char.normalize("NFKC").toLowerCase();
  text = text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  return text;
}

// ----------------------------------------------------------
// 関数：normalizeText
// 文字の並びを、探すためのそろえた形にする（1文字ずつ normalizeChar を使う）
//   text … 文字の並び
// 戻り値：{ text: そろえた文字の並び, origins: そろえた文字それぞれが、元の何文字目から来たか（配列） }
// ----------------------------------------------------------
export function normalizeText(text) {
  let normalized = "";
  const origins = [];
  // Array.from で、絵文字などの2つ分の文字も1文字として数える
  const chars = Array.from(text);
  let position = 0; // 元の文字の並びの中の場所（JavaScript の数え方）
  chars.forEach((char) => {
    const piece = normalizeChar(char);
    for (let k = 0; k < piece.length; k++) origins.push(position);
    normalized = normalized + piece;
    position = position + char.length;
  });
  origins.push(position); // 最後の文字の「うしろ」の場所（範囲の終わりに使う）
  return { text: normalized, origins: origins };
}

// ----------------------------------------------------------
// 関数：splitWords
// 検索の欄に打った文字を、スペース（全角も）で区切った言葉の並びにする
//   query … 検索の欄の文字
// 戻り値：そろえた形の言葉の配列（空の言葉は入れない）
// ----------------------------------------------------------
export function splitWords(query) {
  return query
    .split(/[\s　]+/)
    .map((word) => normalizeText(word).text)
    .filter((word) => word !== "");
}

// ----------------------------------------------------------
// 関数：matchesAll
// 質問と答えの文字に、言葉が全部入っているか調べる
//   item  … 質問 { q, a }
//   words … splitWords で作った言葉の並び
// 戻り値：全部入っていれば true（言葉がなければ true）
// ----------------------------------------------------------
export function matchesAll(item, words) {
  const all = normalizeText([item.q, ...item.a].join("\n")).text;
  return words.every((word) => all.includes(word));
}

// ----------------------------------------------------------
// 関数：highlightParts
// 文字の並びを、「色を付ける所」と「付けない所」に分ける（画面で <mark> を付けるため）
//   text  … 元の文字の並び（質問や答えの1段落）
//   words … splitWords で作った言葉の並び
// 戻り値：[{ text: 文字, hit: 色を付けるなら true }, ...]（つなげると元の文字の並びになる）
// ----------------------------------------------------------
export function highlightParts(text, words) {
  if (words.length === 0) return [{ text: text, hit: false }];
  const { text: normalized, origins } = normalizeText(text);

  // 元の文字の並びの中で、色を付ける文字に印を付ける
  const marks = new Array(text.length).fill(false);
  words.forEach((word) => {
    let from = normalized.indexOf(word);
    while (from >= 0) {
      const start = origins[from]; // 見つかった所の始まり（元の文字の場所）
      const end = origins[from + word.length]; // 見つかった所の終わりのすぐうしろ
      for (let k = start; k < end; k++) marks[k] = true;
      from = normalized.indexOf(word, from + 1);
    }
  });

  // 印の付いた所・付いていない所ごとにまとめる
  const parts = [];
  for (let k = 0; k < text.length; k++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[k]) {
      last.text = last.text + text[k];
    } else {
      parts.push({ text: text[k], hit: marks[k] });
    }
  }
  return parts;
}
