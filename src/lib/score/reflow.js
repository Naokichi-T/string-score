// ==========================================================
// reflow.js
// 拍子を変えたときに、入りきらない音を後ろの小節へ流し直す（ステップ18-4）
//
// 【流れ】
//   ① 拍子を変える範囲（from 〜 last 小節目）の音を、パートごとに「時間の並び」にする
//      （範囲の最後に続く休符は取りのぞく。全休符はふつうの休符として扱う）
//   ② 新しい拍子の小節に、頭から順に入れ直す
//      ・小節線をまたぐ音符は、書ける長さに分けてタイでつなぐ（記号は最初の音符に残す）
//      ・休符は、新しい拍子の「1拍ずつの休符」で埋め直す
//      ・連符は分けられないので、小節線をまたぐことになるときは、流し直さずに知らせる
//   ③ 足りない小節は、範囲の最後に足す（全パートで同じ数）。最後の小節の残りは休符で埋める
//      （小節の数は、元より少なくはしない）
//   ④ 小節に付いている記号（練習番号・テンポの変化・くり返し・かっこ・D.C. など）と音部記号は、
//      元の小節の「頭」または「終わり」にあった音が入った、新しい小節へ移す
//   ⑤ 範囲の後ろの小節は、中身も拍子もそのまま
//   ※ アウフタクト（短い1小節目）は流し直さない（長さはそのままで、拍の数だけ新しい拍子で数え直す）
//
// edit.js と同じく、渡された楽譜データは書き換えずに、新しい楽譜データを作って返す
// ==========================================================

// （途中の短い小節：isShortEnd のかわりに、どの小節でも使える isContinuation・isShortMeasure・measureName を使うようにした）
import { noteTicks, timeAt, measureTicks, measureLength, hasPickup, restsForSpan, tupletGroups, isMeasureRest, isContinuation, isShortMeasure, measureName } from "./model.js";
import { cloneScore, cleanSpanners, timeRangeEnd } from "./edit.js";
import { splitTicks, plainNote } from "./clipboard.js";

// ----------------------------------------------------------
// 小節に付いている記号の、置き場所の種類
//   HEAD_MARKS … 小節の「頭」に付くもの（元の小節の頭にあった音が入った小節へ移す）
//   END_MARKS  … 小節の「終わり」に付くもの（元の小節の終わりにあった音が入った小節へ移す）
// time（拍子）と pickup（アウフタクト）は、ここでは移さない（流し直しの中で決め直す）
// ----------------------------------------------------------
const HEAD_MARKS = ["key", "tempo", "tempoText", "gradual", "gradualText", "gradualDashes", "aTempo", "repeatStart", "ending", "segno", "coda", "rehearsal"];
const END_MARKS = ["barline", "repeatEnd", "endingEnd", "gradualEnd", "jump", "toCoda", "fine"];

// ----------------------------------------------------------
// 関数：sameTimeSignature
// 2つの拍子が同じか調べる（コモンタイム・カットタイムの印も同じときだけ「同じ」）
// （edit.js の sameTime と同じ考え方）
// ----------------------------------------------------------
function sameTimeSignature(a, b) {
  return a.beats === b.beats && a.beatType === b.beatType && (a.symbol ?? null) === (b.symbol ?? null);
}

// ----------------------------------------------------------
// 関数：partEvents
// 1つのパートの、範囲の小節の音を「時間の並び」にする
//   part   … パートのデータ
//   starts … 範囲の小節ごとの始まり（範囲の頭から何ティック目か）の配列（最後に範囲の長さも付く）
//   first  … 範囲の最初の小節の番号
// 戻り値：{ events: [{ start, length, note }, ...], groups: [{ start, end }, ...] }
//   events … 音ごとの、範囲の頭からの始まりと長さ（範囲の最後に続く休符は入れない）
//   groups … 連符ごとの、範囲の頭からの始まりと終わり（小節線をまたがないか調べるため）
// ----------------------------------------------------------
function partEvents(part, starts, first) {
  const events = [];
  const groups = [];
  for (let k = 0; k < starts.length - 1; k++) {
    const notes = part.measures[first + k].notes;
    let position = starts[k];
    const noteStarts = [];
    notes.forEach((note) => {
      const length = noteTicks(note);
      noteStarts.push(position);
      // 全休符（小節まるごとの休符）は、ふつうの休符として流す（あとで1拍ずつの休符にする）
      const data = isMeasureRest(notes) ? { rest: true, duration: note.duration, dots: note.dots } : note;
      events.push({ start: position, length: length, note: data });
      position = position + length;
    });
    // 連符のまとまり
    tupletGroups(notes).forEach((group) => {
      groups.push({ start: noteStarts[group.start], end: noteStarts[group.end] + noteTicks(notes[group.end]) });
    });
  }
  // 範囲の最後に続く休符は取りのぞく（連符の中の休符は残す）
  while (events.length > 0 && events[events.length - 1].note.rest && !events[events.length - 1].note.tuplet) {
    events.pop();
  }
  return { events: events, groups: groups };
}

// ----------------------------------------------------------
// 関数：layoutPart
// 時間の並びを、新しい拍子の小節に入れ直す
//   events   … partEvents で作った時間の並び
//   count    … 作る小節の数
//   length   … 新しい拍子の1小節の長さ（ティック）
//   time     … 新しい拍子
// 戻り値：小節ごとの音の並びの配列 [[音, 音, ...], ...]
// ----------------------------------------------------------
function layoutPart(events, count, length, time) {
  // 分けた音符の、それぞれの部分（タイ・スラーなどを直すため）
  events.forEach((event) => {
    event.pieces = [];
  });
  const contentEnd = events.length > 0 ? events[events.length - 1].start + events[events.length - 1].length : 0;

  const measures = [];
  for (let m = 0; m < count; m++) {
    const measureStart = m * length;
    const measureEnd = measureStart + length;
    const notes = [];

    events.forEach((event) => {
      // この小節にかかる部分
      const from = Math.max(event.start, measureStart);
      const to = Math.min(event.start + event.length, measureEnd);
      if (from >= to) return; // この小節にはかからない

      if (event.note.tuplet) {
        // 連符の音：分けずにそのまま置く（小節線をまたがないことは、先に調べてある）
        notes.push(JSON.parse(JSON.stringify(event.note)));
      } else if (event.note.rest) {
        // 休符：その部分を、新しい拍子の1拍ずつの休符で埋める
        notes.push(...restsForSpan(from - measureStart, to - from, time));
      } else {
        // 音符：書ける長さに分けて並べる（記号は最初の部分にだけ残す）
        splitTicks(to - from).forEach((value) => {
          const isFirst = event.pieces.length === 0;
          const piece = isFirst ? { ...JSON.parse(JSON.stringify(event.note)), duration: value.duration, dots: value.dots } : plainNote(event.note, value);
          event.pieces.push(piece);
          notes.push(piece);
        });
      }
    });

    // 中身が終わったあとの残りを、休符で埋める
    const used = Math.min(Math.max(contentEnd - measureStart, 0), length);
    if (used < length) notes.push(...restsForSpan(used, length - used, time));

    measures.push(notes);
  }

  // 分けた音符をタイでつなぎ、スラー・松葉の終わりとグリッサンドを最後の部分に移す
  // （clipboard.js の貼り付けと同じ決まり）
  events.forEach((event) => {
    if (event.pieces.length < 2) return;
    const first = event.pieces[0];
    const last = event.pieces[event.pieces.length - 1];
    event.pieces.forEach((piece, i) => {
      if (i < event.pieces.length - 1) piece.tie = true; // 次の部分とタイでつなぐ
    });
    last.tie = event.note.tie ?? false; // 最後は、元の音のタイのまま
    if (first.slur === "stop") {
      delete first.slur;
      last.slur = "stop";
    }
    if (first.wedgeEnd) {
      delete first.wedgeEnd;
      last.wedgeEnd = true;
    }
    if (first.glissando) {
      delete first.glissando;
      last.glissando = true;
    }
  });

  return measures;
}

// ----------------------------------------------------------
// 関数：reflowTime
// from 小節目から to 小節目までの拍子を変えて、入りきらない音を後ろの小節へ流し直す（全パートいっしょに）
//   time … 新しい拍子 { beats, beatType }（C・¢ のときは symbol も付く）
//   to   … null のときは「次に拍子が変わる小節の手前まで（なければ最後まで）」（changeTime と同じ）
// （changeTime で「入りきらない音がある」と分かったあとに使う）
// 戻り値：{ score: 新しい楽譜データ, added: 増えた小節の数, error: 知らせる文 }
//   流し直せないとき（連符が小節線をまたぐ・範囲に短い最後の小節が入っている（ステップ20））は { score: 元の楽譜データ, added: 0, error: 知らせる文 }
//   （途中の短い小節：範囲に続きの小節・前の部分の小節が入っているときも流し直せない。アウフタクトは今までどおり残して流し直す）
// ----------------------------------------------------------
export function reflowTime(score, from, to, time) {
  const last = timeRangeEnd(score, from, to);
  const length = measureTicks(time); // 新しい拍子の1小節の長さ

  // アウフタクトは流し直さないので、範囲がアウフタクトから始まるときは、その次の小節から流し直す
  const keepPickup = from === 0 && hasPickup(score);
  const first = keepPickup ? 1 : from; // 流し直す最初の小節
  if (first > last) return { score: score, added: 0, error: "" }; // 流し直す小節がない

  // 短い小節（短い最後の小節・続きの小節・前の部分の小節）は流し直さない（ステップ20）
  // 範囲に入っているときは、流し直さずに知らせる
  // （途中の短い小節：最後の小節だけでなく、範囲の中のどの短い小節も調べるようにした）
  for (let k = first; k <= last; k++) {
    if (isContinuation(score, k) || isShortMeasure(score, k)) {
      return { score: score, added: 0, error: `${measureName(score, k)}が短い小節なので、流し直せません（先に「小節」タブで、その小節の長さを「拍子どおり」にしてください）` };
    }
  }

  // ① 範囲の小節ごとの始まり（範囲の頭から何ティック目か）
  const starts = [0];
  for (let k = first; k <= last; k++) {
    starts.push(starts[starts.length - 1] + measureLength(score, k));
  }
  const oldCount = last - first + 1; // 元の小節の数

  // ② パートごとの時間の並びと、必要な小節の数
  const perPart = score.parts.map((part) => partEvents(part, starts, first));
  let needed = 1;
  perPart.forEach(({ events }) => {
    if (events.length === 0) return;
    const end = events[events.length - 1].start + events[events.length - 1].length;
    needed = Math.max(needed, Math.ceil(end / length));
  });
  const newCount = Math.max(needed, oldCount); // 元より少なくはしない

  // ③ 連符が新しい小節線をまたがないか調べる
  for (let p = 0; p < score.parts.length; p++) {
    for (const group of perPart[p].groups) {
      const crosses = Math.floor(group.start / length) !== Math.floor((group.end - 1) / length);
      if (crosses) {
        return { score: score, added: 0, error: `${score.parts[p].name} の連符が小節線をまたぐことになるので、流し直せません` };
      }
    }
  }

  const newScore = cloneScore(score);

  // ④ 元の小節の頭・終わりが、新しい何小節目に入るか
  //    頭 … 元の小節の始まりの音が入る小節
  //    終わり … 元の小節の最後の音が入る小節（元の最後の小節の終わりは、新しい最後の小節）
  const headIndex = (k) => Math.min(Math.floor(starts[k] / length), newCount - 1);
  const endIndex = (k) => (k === oldCount - 1 ? newCount - 1 : Math.min(Math.floor((starts[k + 1] - 1) / length), newCount - 1));

  // ⑤ 楽譜全体の小節の情報を作り直す
  const timeAfter = timeAt(score, last); // 範囲のすぐ後ろの小節の拍子（変える前の拍子）
  /** @type {Record<string, any>[]} */
  const infos = Array.from({ length: newCount }, () => ({}));
  for (let k = 0; k < oldCount; k++) {
    const old = score.measures[first + k];
    HEAD_MARKS.forEach((name) => {
      if (old[name] !== undefined) infos[headIndex(k)][name] = JSON.parse(JSON.stringify(old[name]));
    });
    END_MARKS.forEach((name) => {
      if (old[name] !== undefined) infos[endIndex(k)][name] = JSON.parse(JSON.stringify(old[name]));
    });
  }
  newScore.measures.splice(first, oldCount, ...infos);

  // ⑥ パートごとに、小節を作り直す
  newScore.parts.forEach((part, p) => {
    const laid = layoutPart(perPart[p].events, newCount, length, time);
    // 中身の最後の音のうしろが休符になったら、その音のタイは外す（休符とはつなげないため）
    // （範囲の最後の小節の最後の音が音符なら、後ろの小節へのタイはそのまま残す）
    const lastNotes = laid[laid.length - 1];
    const lastSound = findLastSound(laid);
    if (lastNotes[lastNotes.length - 1].rest && lastSound && lastSound.tie) lastSound.tie = false;
    // パートの小節の形（あとで clef も入れるので、「clef も入る形」だと VSCode に教えておく。
    // 書かないと、最初に入れた { notes } だけの形だと思われて、clef を入れる所がエラーになる）
    /** @type {{ notes: any[], clef?: string }[]} */
    const measures = laid.map((notes) => ({ notes: notes }));
    // 音部記号は、元の小節の頭にあった音が入った小節へ移す
    for (let k = 0; k < oldCount; k++) {
      const clef = part.measures[first + k].clef;
      if (clef) measures[headIndex(k)].clef = clef;
    }
    part.measures.splice(first, oldCount, ...measures);
  });

  // ⑦ アウフタクトの小節：長さはそのままで、拍の数を新しい拍子で数え直し、休符を新しい拍子で埋め直す
  if (keepPickup) {
    const pickupLength = measureLength(score, 0);
    newScore.measures[0].pickup = pickupLength / (length / time.beats);
    newScore.parts.forEach((part) => {
      const notes = part.measures[0].notes;
      let count = notes.length;
      while (count > 0 && notes[count - 1].rest && !notes[count - 1].tuplet) count = count - 1;
      const contents = notes.slice(0, count);
      const used = contents.reduce((sum, note) => sum + noteTicks(note), 0);
      part.measures[0].notes = [...contents, ...restsForSpan(used, pickupLength - used, time)];
    });
  }

  // ⑧ 拍子を書く（changeTime と同じ決まり）
  newScore.measures[from].time = { beats: time.beats, beatType: time.beatType };
  if (time.symbol) newScore.measures[from].time.symbol = time.symbol;
  const newLast = first + newCount - 1; // 流し直したあとの、範囲の最後の小節
  // 範囲のすぐ後ろの小節には、元の拍子を書いておく（後ろの小節まで変わらないように）
  const total = newScore.measures.length;
  if (newLast + 1 < total && !newScore.measures[newLast + 1].time) {
    newScore.measures[newLast + 1].time = timeAfter;
  }
  // 前の小節と同じ拍子になった所は、拍子を書かない（1小節目は必ず残す）
  for (let m = Math.max(from, 1); m <= Math.min(newLast + 1, total - 1); m++) {
    const info = newScore.measures[m];
    if (info.time && sameTimeSignature(info.time, timeAt(newScore, m - 1))) {
      delete info.time;
    }
  }

  // ⑨ 相手のいなくなったスラー・松葉を外す
  newScore.parts.forEach((part) => cleanSpanners(part));

  return { score: newScore, added: newCount - oldCount, error: "" };
}

// ----------------------------------------------------------
// 関数：findLastSound
// 小節の並びの中で、いちばん後ろにある「休符ではない音」を返す（なければ null）
// ----------------------------------------------------------
function findLastSound(measures) {
  for (let m = measures.length - 1; m >= 0; m--) {
    const notes = measures[m];
    for (let j = notes.length - 1; j >= 0; j--) {
      if (!notes[j].rest) return notes[j];
    }
  }
  return null;
}
