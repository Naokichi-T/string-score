// ==========================================================
// library.js
// 楽譜をブラウザの中（localStorage）に保存・読み込み・削除する
// （ステップ7-1）
//
// 【保存の形】
//   "string-score:list"          … 一覧用の小さな表
//       [{ id, title, createdAt, updatedAt }, ...]
//       （createdAt・updatedAt は日時を数字にしたもの。Date.now() の値）
//   "string-score:score:（id）"   … 楽譜データそのもの（1曲に1つ）
//
// 一覧の表と楽譜を分けておくと、トップページは小さな表を読むだけで済む
//
// localStorage は「文字」しか入れられないので、
// 入れるときは JSON.stringify で文字に、出すときは JSON.parse で元に戻す
// ==========================================================

// 一覧の表を入れる場所の名前
const LIST_KEY = "string-score:list";

// 楽譜を入れる場所の名前の頭の部分（うしろに id を付ける）
const SCORE_KEY_PREFIX = "string-score:score:";

// ----------------------------------------------------------
// 関数：scoreKey
// 楽譜を入れる場所の名前を作る
// 例："abc123" → "string-score:score:abc123"
// ----------------------------------------------------------
function scoreKey(id) {
  return SCORE_KEY_PREFIX + id;
}

// ----------------------------------------------------------
// 関数：readList
// 一覧の表を読み込む（まだ何も保存していない・読めないときは空の配列）
// ----------------------------------------------------------
function readList() {
  try {
    const text = localStorage.getItem(LIST_KEY);
    if (!text) return [];
    const list = JSON.parse(text);
    // 配列でなければ（壊れていたら）空にする
    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.error("楽譜の一覧を読み込めませんでした", error);
    return [];
  }
}

// ----------------------------------------------------------
// 関数：writeList
// 一覧の表を保存する
// （失敗したときはエラーを投げるので、呼ぶ側で try / catch する）
// ----------------------------------------------------------
function writeList(list) {
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
}

// ----------------------------------------------------------
// 関数：createId
// 新しい楽譜の id を作る（今の時刻＋でたらめな文字で、ほかと重ならないようにする）
// 例："mgr3k2x8a1b2c3"
// ----------------------------------------------------------
function createId() {
  const time = Date.now().toString(36); // 今の時刻を 0〜9・a〜z の文字に
  const random = Math.random().toString(36).slice(2, 8); // でたらめな6文字
  return time + random;
}

// ----------------------------------------------------------
// 関数：listScores
// 保存した楽譜の一覧を返す
// 戻り値：[{ id, title, createdAt, updatedAt }, ...]
// ----------------------------------------------------------
export function listScores() {
  return readList();
}

// ----------------------------------------------------------
// 関数：loadScore
// 楽譜を1つ読み込む
//   id … 楽譜の id
// 戻り値：楽譜データ（見つからない・読めないときは null）
// ----------------------------------------------------------
export function loadScore(id) {
  try {
    const text = localStorage.getItem(scoreKey(id));
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    console.error("楽譜を読み込めませんでした", error);
    return null;
  }
}

// ----------------------------------------------------------
// 関数：saveScore
// 楽譜を保存して、一覧の表のタイトルと更新日時も書き換える
// （一覧の表にまだない id なら、表に足す）
//   id    … 楽譜の id
//   score … 楽譜データ（画面と連動していない、ふつうのデータを渡す）
// 戻り値：保存できたら true、できなかったら false
// ----------------------------------------------------------
export function saveScore(id, score) {
  try {
    // 楽譜そのものを保存する
    localStorage.setItem(scoreKey(id), JSON.stringify(score));

    // 一覧の表を書き換える
    const now = Date.now();
    const list = readList();
    const index = list.findIndex((item) => item.id === id);
    if (index >= 0) {
      // もうある：タイトルと更新日時だけ変える（作った日時はそのまま）
      list[index] = { ...list[index], title: score.title, updatedAt: now };
    } else {
      // まだない：新しく足す
      list.push({ id: id, title: score.title, createdAt: now, updatedAt: now });
    }
    writeList(list);
    return true;
  } catch (error) {
    // 保存できる量を超えたときなどに、ここに来る
    console.error("楽譜を保存できませんでした", error);
    return false;
  }
}

// ----------------------------------------------------------
// 関数：createScore
// 新しい id を作って、楽譜を保存する
//   score … 楽譜データ
// 戻り値：新しい id（保存できなかったときは null）
// ----------------------------------------------------------
export function createScore(score) {
  const id = createId();
  const ok = saveScore(id, score);
  return ok ? id : null;
}

// ----------------------------------------------------------
// 関数：deleteScore
// 楽譜を削除して、一覧の表からも消す（ステップ7-2 で使う）
//   id … 楽譜の id
// 戻り値：削除できたら true、できなかったら false
// ----------------------------------------------------------
export function deleteScore(id) {
  try {
    localStorage.removeItem(scoreKey(id));
    const list = readList().filter((item) => item.id !== id);
    writeList(list);
    return true;
  } catch (error) {
    console.error("楽譜を削除できませんでした", error);
    return false;
  }
}
