// ==========================================================
// mp3.js
// 音のデータ（AudioBuffer）を MP3 のファイルにする（MP3 書き出しの手順3）
// ・MP3 に変える計算は、ライブラリ @breezystack/lamejs（lamejs を今も直し続けている版）に任せる
// ・長い曲を一度に変えると画面が固まるので、少しずつ変えて、そのたびに画面へ順番をゆずる
//   （そのときに、どこまで進んだか（0〜1）を知らせる・やめるように頼まれていないかを調べる）
// ==========================================================

// MP3 の音質（1秒あたりのデータの量。kbps）
// 192kbps：練習用には十分で、3分の曲で約4MB
const MP3_KBPS = 192;

// 1回に変えるサンプルの数（MP3 の1つの区切りは 1152 サンプルなので、その倍数にする）
const CHUNK_SAMPLES = 1152 * 20;

// 何回変えるごとに、画面へ順番をゆずるか（ゆずるたびに進み具合を知らせる）
// （1回 = 約0.5秒分の音。20回 = 約10秒分の音を変えるごとに、画面を動かす）
const CHUNKS_PER_YIELD = 20;

// ----------------------------------------------------------
// 関数：floatToInt16
// 音のデータ（−1〜1 の小数）を、MP3 に渡す形（−32768〜32767 の整数）に直す
//   samples … 1つのチャンネルの音のデータ（Float32Array）
// 1 を超える所（音が割れる所）は、1 で止める
// 戻り値：Int16Array
// ----------------------------------------------------------
function floatToInt16(samples) {
  const result = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // −1〜1 の外に出た所は、端で止める
    const value = Math.max(-1, Math.min(1, samples[i]));
    // マイナスは 32768 倍、プラスは 32767 倍（整数の範囲に合わせる）
    result[i] = value < 0 ? value * 32768 : value * 32767;
  }
  return result;
}

// ----------------------------------------------------------
// 関数：waitForScreen
// 少しだけ画面に順番をゆずる（進み具合の表示を描き直してもらうため）
// 戻り値：ゆずり終わったら完了する Promise
// ----------------------------------------------------------
function waitForScreen() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ----------------------------------------------------------
// 関数：audioBufferToMp3
// 音のデータを MP3 のファイル（Blob）にする
//   buffer      … 音のデータ（AudioBuffer。sound.js の renderEvents で作ったもの）
//   onprogress  … 進み具合を知らせる関数（0〜1 の数を渡す）
//   isCancelled … やめるように頼まれたかを返す関数（true ならやめる）
// 流れ：
//   1. ライブラリを読み込む（ブラウザの中でしか使わないので、ここで読み込む）
//   2. 左右のチャンネルを、整数の形に直す（1チャンネルだけのときは、左右に同じものを使う）
//   3. CHUNK_SAMPLES ずつ MP3 に変える（CHUNKS_PER_YIELD 回ごとに、画面へ順番をゆずる）
//   4. 最後に残りを出し切って（flush）、全部をつなげて1つのファイルにする
// 戻り値：MP3 のファイル（Blob）を返す Promise。途中でやめたときは null を返す
// ----------------------------------------------------------
// 下の /** … */ は、VSCode に引数の形を教えるための書き方（JSDoc）
// （書かないと、onprogress の「何もしない関数（() => {}）」を見て「引数を受け取らない関数」と思われ、
//   onprogress(0.5) のように数を渡す所が「0 個の引数が必要ですが、1 個指定されました」のエラーになるため）
/**
 * @param {AudioBuffer} buffer 音のデータ
 * @param {(progress: number) => void} [onprogress] 進み具合（0〜1）を知らせる関数
 * @param {() => boolean} [isCancelled] やめるように頼まれたかを返す関数
 * @returns {Promise<Blob | null>} MP3 のファイル（やめたときは null）
 */
export async function audioBufferToMp3(buffer, onprogress = () => {}, isCancelled = () => false) {
  // 1. ライブラリを読み込む
  const { Mp3Encoder } = await import("@breezystack/lamejs");

  // 2. 左右のチャンネルを整数の形に直す
  const left = floatToInt16(buffer.getChannelData(0));
  const right = buffer.numberOfChannels > 1 ? floatToInt16(buffer.getChannelData(1)) : left;

  // MP3 に変える係（チャンネルの数・1秒あたりのこまかさ・音質を渡す）
  const encoder = new Mp3Encoder(2, buffer.sampleRate, MP3_KBPS);

  // 3. 少しずつ変える（できたかけらを parts にためていく）
  const parts = [];
  let count = 0; // 変えた回数（画面へ順番をゆずるタイミングを数える）
  for (let start = 0; start < left.length; start += CHUNK_SAMPLES) {
    const end = start + CHUNK_SAMPLES;
    const piece = encoder.encodeBuffer(left.subarray(start, end), right.subarray(start, end));
    if (piece.length > 0) parts.push(piece);

    count += 1;
    if (count % CHUNKS_PER_YIELD === 0) {
      onprogress(end / left.length); // どこまで進んだか（0〜1）
      await waitForScreen();
      if (isCancelled()) return null; // やめるように頼まれたら、作りかけを捨てる
    }
  }

  // 4. 残りを出し切って、1つのファイルにする
  const last = encoder.flush();
  if (last.length > 0) parts.push(last);
  onprogress(1);
  // （/** @type … */ は VSCode 向けの書き方（JSDoc）。「この一覧はファイルの材料（BlobPart）として渡せる」と教える。
  //   書かないと、ライブラリが返すかけらの型が細かく合わずに、エラーとして出るため。動きは変わらない）
  return new Blob(/** @type {BlobPart[]} */ (parts), { type: "audio/mpeg" });
}

// ----------------------------------------------------------
// 関数：mp3FileName
// 楽譜のタイトルから、MP3 のファイル名を作る（MusicXML の musicXMLFileName と同じ決め方）
// ファイル名に使えない文字（\ / : * ? " < > |）は「_」に置きかえ、タイトルがなければ「無題」にする
// 例："メヌエット ト長調" → "メヌエット ト長調.mp3"
// ----------------------------------------------------------
export function mp3FileName(title) {
  const safe = String(title ?? "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
  return (safe || "無題") + ".mp3";
}
