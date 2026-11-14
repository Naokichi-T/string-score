// ==========================================================
// audioDebug.js
// 【仮】音が突然鳴らなくなる原因を調べるための記録（原因がわかったら消す）
//
// 【何を記録するか】
//   ・音を鳴らす仕組み（AudioContext）を作った・閉じた
//   ・仕組みの状態が変わった（running：動いている／suspended：一時停止／interrupted：中断（iPad だけ）／closed：閉じた）
//   ・音を鳴らそうとしたときに、仕組みが動いていなかった（そのときの状態）
//   ・再開（resume）を頼んだ・うまくいった・失敗した
//   ・画面が隠れた・表示された（アプリの切り替え・画面ロックなど）
//
// 【使い方】
//   ・AudioContext を作ったら watchAudioContext(仕組み, "再生") のように呼ぶ
//   ・ほかに残したいことがあれば logAudio("再生", "文") で残す
//   ・画面には AudioDebug.svelte が、今の状態と記録の一覧を出す
//
// 記録は新しいものから AUDIO_LOG_MAX 件だけ残す（アプリを閉じると消える）
// ==========================================================

// 残しておく記録の数
const AUDIO_LOG_MAX = 40;

// 記録の一覧（新しいものが前）：[{ time: "18:51:03", label: "再生", text: "running → interrupted" }, ...]
let entries = [];

// 見張っている仕組みの一覧（名前 → AudioContext）。今の状態を画面に出すため
const contexts = new Map();

// 記録が増えたときに知らせる相手（画面の部品）の一覧
const listeners = new Set();

// ----------------------------------------------------------
// 関数：nowText
// 今の時刻を「時:分:秒」の文字にする（例："18:51:03"）
// ----------------------------------------------------------
function nowText() {
  const now = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
}

// ----------------------------------------------------------
// 関数：notify
// 記録が増えた・状態が変わったことを、画面の部品に知らせる
// ----------------------------------------------------------
function notify() {
  listeners.forEach((listener) => listener());
}

// ----------------------------------------------------------
// 関数：logAudio
// 記録を1つ残す
//   label … どの仕組みのことか（"再生"・"マイク"・"画面" など）
//   text  … 残す文
// ----------------------------------------------------------
export function logAudio(label, text) {
  entries = [{ time: nowText(), label: label, text: text }, ...entries].slice(0, AUDIO_LOG_MAX);
  // 開発中にパソコンで見るときのために、コンソールにも出す
  console.log(`[音の記録] ${label}：${text}`);
  notify();
}

// ----------------------------------------------------------
// 関数：watchAudioContext
// 音を鳴らす仕組み（AudioContext）を見張り始める
// 状態が変わるたびに「前の状態 → 新しい状態」を記録する
//   context … 見張る AudioContext
//   label   … 画面に出す名前（"再生"・"マイク" など）
// ----------------------------------------------------------
export function watchAudioContext(context, label) {
  contexts.set(label, context);
  let last = context.state;
  logAudio(label, `作った（状態：${last}）`);
  context.addEventListener("statechange", () => {
    // 同じ名前で新しい仕組みに入れ替わったあとの、古い仕組みの知らせは記録しない
    if (contexts.get(label) !== context) return;
    // 作った直後など、状態が変わっていない知らせは記録しない
    if (context.state === last) return;
    logAudio(label, `${last} → ${context.state}`);
    last = context.state;
  });
}

// ----------------------------------------------------------
// 関数：logResume
// 再開（resume）を頼んだことと、その結果を記録する
//   context … 再開を頼んだ AudioContext
//   label   … 名前
//   promise … context.resume() が返した Promise
// ----------------------------------------------------------
export function logResume(context, label, promise) {
  logAudio(label, `再開を頼んだ（状態：${context.state}）`);
  promise.then(() => logAudio(label, `再開の結果：成功（状態：${context.state}）`)).catch((error) => logAudio(label, `再開の結果：失敗（${error?.name ?? error}）`));
}

// ----------------------------------------------------------
// 関数：logPlayWhileStopped
// 音を鳴らそうとしたときに、仕組みが動いていなければ記録する（動いていれば何もしない）
//   context … 鳴らすのに使う AudioContext
//   label   … 名前
// ----------------------------------------------------------
export function logPlayWhileStopped(context, label) {
  if (context.state !== "running") logAudio(label, `鳴らそうとしたが、動いていない（状態：${context.state}）`);
}

// ----------------------------------------------------------
// 関数：audioStates
// 見張っている仕組みの、今の状態の一覧を返す（画面に出す用）
// 閉じた仕組み（マイクを止めたあとの "マイク" など）は、もう使っていないので出さない
// 戻り値：[{ label: "再生", state: "running" }, ...]
// ----------------------------------------------------------
export function audioStates() {
  return [...contexts.entries()].filter(([, context]) => context.state !== "closed").map(([label, context]) => ({ label: label, state: context.state }));
}

// ----------------------------------------------------------
// 関数：audioLog
// 記録の一覧を返す（新しいものが前）
// ----------------------------------------------------------
export function audioLog() {
  return entries;
}

// ----------------------------------------------------------
// 関数：subscribeAudioLog
// 記録が増えた・状態が変わったときに呼んでほしい関数を登録する
//   listener … 呼んでほしい関数
// 戻り値：登録をやめる関数
// ----------------------------------------------------------
export function subscribeAudioLog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ----------------------------------------------------------
// 画面が隠れた・表示されたことも記録する（アプリの切り替え・画面ロックのあとに止まるかを見るため）
// （ブラウザの中で動いているときだけ。サーバーで動くときは document がない）
// ----------------------------------------------------------
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    logAudio("画面", document.visibilityState === "visible" ? "表示された" : "隠れた");
    notify();
  });
}
