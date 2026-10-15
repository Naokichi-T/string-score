// ==========================================================
// mixer.js
// パートごとの音量の設定（ステップ12-3）
//
// 【データの形】
//   mixer = {
//     "pk2qyyj3f": { volume: 80, mute: false, solo: false },  ← キーはパートの名札（id）
//     ...
//   }
//   volume … 音量（0〜100。100 がいつもの大きさ）
//   mute   … true なら、そのパートを鳴らさない
//   solo   … true なら、ソロのパートだけを鳴らす（どれか1つでも true なら）
// 書いていないパートは、いつもの設定（DEFAULT_MIXER）として扱う
//
// 楽譜データとは別に、楽譜ごとにブラウザに保存する（library.js の saveMixer）
// （楽譜の中に入れると「元に戻す」で音量まで戻ってしまうため）
// ==========================================================

// いつもの設定（音量100・ミュートなし・ソロなし）
export const DEFAULT_MIXER = { volume: 100, mute: false, solo: false };

// ----------------------------------------------------------
// 関数：mixerOf
// パート1つ分の設定を返す（書いていない項目は、いつもの設定で埋める）
//   mixer  … 音量の設定（全パート分）
//   partId … パートの名札（id）
// 例：mixerOf({}, "pk2qyyj3f") → { volume: 100, mute: false, solo: false }
// ----------------------------------------------------------
export function mixerOf(mixer, partId) {
  return { ...DEFAULT_MIXER, ...(mixer[partId] ?? {}) };
}

// ----------------------------------------------------------
// 関数：isAudible
// そのパートを鳴らすかどうかを返す（ステップ12-3b）
//   mixer  … 音量の設定（全パート分）
//   parts  … パートの一覧（楽譜データの parts。ソロのパートがあるかを調べるのに使う）
//   partId … 調べるパートの名札（id）
// 鳴らさないのは次のとき
//   ・ミュートになっている
//   ・どれかのパートがソロで、このパートはソロではない
// ----------------------------------------------------------
export function isAudible(mixer, parts, partId) {
  const setting = mixerOf(mixer, partId);
  if (setting.mute) return false;
  const anySolo = parts.some((part) => mixerOf(mixer, part.id).solo);
  if (anySolo && !setting.solo) return false;
  return true;
}
