// ==========================================================
// history.js
// 「元に戻す」「やり直し」のための履歴
//
// 履歴 = { undo: [...], redo: [...] }
//   undo … 元に戻すための箱（変える前の状態を積んでいく）
//   redo … やり直しのための箱（元に戻した状態を積んでいく）
// 箱に入れる1つ分 = { score: 楽譜データ, selection: 選択中の場所 }
//
// どの関数も、履歴を直接書き換えずに、新しい履歴を作って返す
// ==========================================================

// 覚えておく回数の上限（これより古いものは捨てる）
const LIMIT = 100;

// ----------------------------------------------------------
// 関数：createHistory
// 空の履歴を作る
// ----------------------------------------------------------
export function createHistory() {
  return { undo: [], redo: [] };
}

// ----------------------------------------------------------
// 関数：record
// 楽譜を変える前の状態を、元に戻す箱に入れる
// 新しく操作したので、やり直しの箱は空にする
//   entry … 変える前の状態 { score, selection }
// 戻り値：新しい履歴
// ----------------------------------------------------------
export function record(history, entry) {
  const undo = [...history.undo, entry];
  // 上限を超えたら、古いものから捨てる
  return { undo: undo.slice(-LIMIT), redo: [] };
}

// ----------------------------------------------------------
// 関数：undo
// 元に戻す
//   current … 今の状態 { score, selection }（やり直しの箱に入れる）
// 戻り値：{ history: 新しい履歴, entry: 戻る先の状態 }（戻れないときは null）
// ----------------------------------------------------------
export function undo(history, current) {
  if (history.undo.length === 0) return null;
  const entry = history.undo[history.undo.length - 1]; // 一番上を取り出す
  return {
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, current] },
    entry: entry,
  };
}

// ----------------------------------------------------------
// 関数：redo
// やり直す
//   current … 今の状態 { score, selection }（元に戻す箱に入れる）
// 戻り値：{ history: 新しい履歴, entry: 進む先の状態 }（やり直せないときは null）
// ----------------------------------------------------------
export function redo(history, current) {
  if (history.redo.length === 0) return null;
  const entry = history.redo[history.redo.length - 1];
  return {
    history: { undo: [...history.undo, current], redo: history.redo.slice(0, -1) },
    entry: entry,
  };
}
