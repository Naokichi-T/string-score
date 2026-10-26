// ==========================================================
// library.js
// 楽譜をブラウザの中（localStorage）に保存・読み込み・削除する
// （ステップ7-1）
//
// 【保存の形】
//   "string-score:list"          … 一覧用の小さな表
//       [{ id, title, parts, createdAt, updatedAt }, ...]
//       （parts は短いパート名の配列。例：["Vln. I", "Vln. II", "Vla.", "Vc."]）（ステップ7-2）
//       （createdAt・updatedAt は日時を数字にしたもの。Date.now() の値）
//   "string-score:score:（id）"   … 楽譜データそのもの（1曲に1つ）
//   "string-score:mixer:（id）"   … 楽譜ごとの、パートの音量の設定（ステップ12-3。くわしくは mixer.js）
//   "string-score:view:（id）"    … 楽譜ごとの、隠すパートの名札（id）の配列（ステップ12-6a）
//   "string-score:fit:（id）"     … 楽譜ごとの、「X枚に収める」の枚数（X枚に収める b）
//       { pdf: 2, perform: 3 }（pdf：PDF 出力、perform：演奏モード。指定なしは null か、項目がない）
//   "string-score:settings"      … アプリ全体の設定（楽譜とは別）（ステップ7-4）
//       { soundType: "instrument" }（音の種類。"instrument"：楽器の音、"synth"：電子音）
//   "string-score:clipboard"     … コピーした音の配列（タブをまたいでコピー・貼り付けするため）（ステップ13-1）
//
// 一覧の表と楽譜を分けておくと、トップページは小さな表を読むだけで済む
//
// localStorage は「文字」しか入れられないので、
// 入れるときは JSON.stringify で文字に、出すときは JSON.parse で元に戻す
// ==========================================================

import { upgradeWedgeNotes } from "./model.js"; // コピーした音の、古い形の松葉を直す（ステップ16-1）

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
// 戻り値：[{ id, title, parts, createdAt, updatedAt }, ...]
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
    // 編成（短いパート名の配列）。一覧に出すため（ステップ7-2）
    const parts = score.parts.map((part) => part.abbreviation);
    const list = readList();
    const index = list.findIndex((item) => item.id === id);
    if (index >= 0) {
      // もうある：タイトル・編成・更新日時を変える（作った日時はそのまま）
      list[index] = { ...list[index], title: score.title, parts: parts, updatedAt: now };
    } else {
      // まだない：新しく足す
      list.push({ id: id, title: score.title, parts: parts, createdAt: now, updatedAt: now });
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
    localStorage.removeItem(mixerKey(id)); // 音量の設定もいっしょに消す（ステップ12-3）
    localStorage.removeItem(viewKey(id)); // 隠すパートの設定もいっしょに消す（ステップ12-6a）
    localStorage.removeItem(fitKey(id)); // 「X枚に収める」の設定もいっしょに消す（X枚に収める b）
    const list = readList().filter((item) => item.id !== id);
    writeList(list);
    return true;
  } catch (error) {
    console.error("楽譜を削除できませんでした", error);
    return false;
  }
}

// ==========================================================
// ここから下は、楽譜ごとの音量の設定（ステップ12-3）
// ==========================================================

// ----------------------------------------------------------
// 関数：mixerKey
// 音量の設定を入れる場所の名前を作る
// 例："abc123" → "string-score:mixer:abc123"
// ----------------------------------------------------------
function mixerKey(id) {
  return "string-score:mixer:" + id;
}

// ----------------------------------------------------------
// 関数：loadMixer
// 楽譜の音量の設定を読み込む
//   id … 楽譜の id
// 戻り値：音量の設定（まだ保存していない・読めないときは空の {}）
// ----------------------------------------------------------
export function loadMixer(id) {
  try {
    const text = localStorage.getItem(mixerKey(id));
    if (!text) return {};
    const mixer = JSON.parse(text);
    // ふつうのオブジェクトでなければ（壊れていたら）空にする
    return mixer && typeof mixer === "object" ? mixer : {};
  } catch (error) {
    console.error("音量の設定を読み込めませんでした", error);
    return {};
  }
}

// ----------------------------------------------------------
// 関数：saveMixer
// 楽譜の音量の設定を保存する（楽譜の更新日時は変えない）
//   id    … 楽譜の id
//   mixer … 音量の設定
// ----------------------------------------------------------
export function saveMixer(id, mixer) {
  try {
    localStorage.setItem(mixerKey(id), JSON.stringify(mixer));
  } catch (error) {
    // 保存できなくても、アプリはそのまま使える（次に開いたときに元に戻るだけ）
    console.error("音量の設定を保存できませんでした", error);
  }
}

// ==========================================================
// ここから下は、楽譜ごとの「隠すパート」の設定（ステップ12-6a）
// ==========================================================

// ----------------------------------------------------------
// 関数：viewKey
// 隠すパートの設定を入れる場所の名前を作る
// 例："abc123" → "string-score:view:abc123"
// ----------------------------------------------------------
function viewKey(id) {
  return "string-score:view:" + id;
}

// ----------------------------------------------------------
// 関数：loadHiddenParts
// 楽譜の、隠すパートの名札（id）の配列を読み込む
//   id … 楽譜の id
// 戻り値：隠すパートの名札の配列（まだ保存していない・読めないときは空の []）
// ----------------------------------------------------------
export function loadHiddenParts(id) {
  try {
    const text = localStorage.getItem(viewKey(id));
    if (!text) return [];
    const hidden = JSON.parse(text);
    // 配列でなければ（壊れていたら）空にする
    return Array.isArray(hidden) ? hidden : [];
  } catch (error) {
    console.error("隠すパートの設定を読み込めませんでした", error);
    return [];
  }
}

// ----------------------------------------------------------
// 関数：saveHiddenParts
// 楽譜の、隠すパートの名札（id）の配列を保存する（楽譜の更新日時は変えない）
//   id     … 楽譜の id
//   hidden … 隠すパートの名札の配列
// ----------------------------------------------------------
export function saveHiddenParts(id, hidden) {
  try {
    localStorage.setItem(viewKey(id), JSON.stringify(hidden));
  } catch (error) {
    // 保存できなくても、アプリはそのまま使える（次に開いたときに元に戻るだけ）
    console.error("隠すパートの設定を保存できませんでした", error);
  }
}

// ==========================================================
// ここから下は、楽譜ごとの「X枚に収める」の設定（X枚に収める b）
// PDF 出力と演奏モードで、それぞれ何枚に収めるかを覚える
// （楽譜データとは別に保存するので、変えても「元に戻す」の対象にならず、楽譜の更新日時も変わらない）
// ==========================================================

// ----------------------------------------------------------
// 関数：fitKey
// 「X枚に収める」の設定を入れる場所の名前を作る
// 例："abc123" → "string-score:fit:abc123"
// ----------------------------------------------------------
function fitKey(id) {
  return "string-score:fit:" + id;
}

// ----------------------------------------------------------
// 関数：loadFitPages
// 楽譜の「X枚に収める」の設定を読み込む
//   id … 楽譜の id
// 戻り値：{ pdf: 枚数, perform: 枚数 }（まだ保存していない・読めないときは空の {}。指定なしは null か、項目がない）
// ----------------------------------------------------------
export function loadFitPages(id) {
  try {
    const text = localStorage.getItem(fitKey(id));
    if (!text) return {};
    const fit = JSON.parse(text);
    // ふつうのオブジェクトでなければ（壊れていたら）空にする
    return fit && typeof fit === "object" ? fit : {};
  } catch (error) {
    console.error("「X枚に収める」の設定を読み込めませんでした", error);
    return {};
  }
}

// ----------------------------------------------------------
// 関数：saveFitPages
// 楽譜の「X枚に収める」の設定を保存する（楽譜の更新日時は変えない）
//   id  … 楽譜の id
//   fit … { pdf: 枚数, perform: 枚数 }
// ----------------------------------------------------------
export function saveFitPages(id, fit) {
  try {
    localStorage.setItem(fitKey(id), JSON.stringify(fit));
  } catch (error) {
    // 保存できなくても、アプリはそのまま使える（次に開いたときに元に戻るだけ）
    console.error("「X枚に収める」の設定を保存できませんでした", error);
  }
}

// ==========================================================
// ここから下は、アプリ全体の設定（ステップ7-4）
// ==========================================================

// 設定を入れる場所の名前
const SETTINGS_KEY = "string-score:settings";

// ----------------------------------------------------------
// 関数：loadSettings
// アプリ全体の設定を読み込む
// 戻り値：設定 { soundType, ... }（まだ保存していない・読めないときは空の {}）
// ----------------------------------------------------------
export function loadSettings() {
  try {
    const text = localStorage.getItem(SETTINGS_KEY);
    if (!text) return {};
    const settings = JSON.parse(text);
    // ふつうのオブジェクトでなければ（壊れていたら）空にする
    return settings && typeof settings === "object" ? settings : {};
  } catch (error) {
    console.error("設定を読み込めませんでした", error);
    return {};
  }
}

// ----------------------------------------------------------
// 関数：saveSetting
// アプリ全体の設定を1つだけ書き換えて保存する（ほかの設定はそのまま残す）
//   name  … 設定の名前（例："soundType"）
//   value … 値（例："synth"）
// ----------------------------------------------------------
export function saveSetting(name, value) {
  try {
    const settings = loadSettings();
    settings[name] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    // 設定を保存できなくても、アプリはそのまま使える（次に開いたときに元に戻るだけ）
    console.error("設定を保存できませんでした", error);
  }
}

// ==========================================================
// ここから下は、コピーした音（ステップ13-1）
// 別のタブ・別の楽譜にも貼り付けられるように、ブラウザの中に保存する
// （ブラウザを閉じても、次にコピーするまで残る）
// ==========================================================

// コピーした音を入れる場所の名前（+page.svelte で、ほかのタブで変わったかを調べるのにも使う）
export const CLIPBOARD_KEY = "string-score:clipboard";

// ----------------------------------------------------------
// 関数：loadClipboard
// コピーした音を読み込む
// 戻り値：音の配列（まだコピーしていない・読めないときは null）
// ----------------------------------------------------------
export function loadClipboard() {
  try {
    const text = localStorage.getItem(CLIPBOARD_KEY);
    if (!text) return null;
    const notes = JSON.parse(text);
    // 音が1つ以上入った配列でなければ（壊れていたら）、コピーしていないことにする
    if (!Array.isArray(notes) || notes.length === 0) return null;
    // 古い形の松葉の終わり（wedge: "stop"）は、新しい形（wedgeEnd）に直す（ステップ16-1）
    return upgradeWedgeNotes(notes);
  } catch (error) {
    console.error("コピーした音を読み込めませんでした", error);
    return null;
  }
}

// ----------------------------------------------------------
// 関数：saveClipboard
// コピーした音を保存する
//   notes … 音の配列（copyNotes で作ったもの）
// ----------------------------------------------------------
export function saveClipboard(notes) {
  try {
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(notes));
  } catch (error) {
    // 保存できなくても、このタブの中ではコピー・貼り付けできる（ほかのタブに渡らないだけ）
    console.error("コピーした音を保存できませんでした", error);
  }
}
