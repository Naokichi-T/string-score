<script>
  // ==========================================================
  // ScoreView.svelte
  // 楽譜データを受け取って、五線譜を表示する部品
  // ・画面の幅が変わったら、改行の位置を決め直して描き直す
  // ・楽譜データや選択中の場所が変わったら描き直す
  // ・音符がクリックされたら、親に知らせる（onselect）
  // （ステップ6-2：再生中に鳴っている音符を緑にする。その段が画面の外なら、見えるところまでスクロールする）
  // ==========================================================
  import { onMount } from "svelte";
  import { renderScore } from "#lib/score/render.js";

  // 親から受け取るもの
  //   score        … 楽譜データ
  //   selection    … 選択中の場所（選んでいなければ null）
  //   range        … 範囲選択（範囲を選んでいなければ null）
  //   playingNotes … 再生中に鳴っている音符の場所の一覧 [{ part, measure, note }, ...]
  //   playing      … 再生中か（止めたら、自動スクロールの「前の段」を忘れるのに使う）
  //   onselect     … 音符がクリックされたときに呼ぶ関数
  //                  （選ばれた場所か null と、Shift キーを押していたか true / false を渡す）
  let { score, selection = null, range = null, playingNotes = [], playing = false, onselect = () => {} } = $props();

  // 外側の枠の div（幅を測るのに使う）
  let wrapper;

  // 五線譜を描く先の div（bind:this で中身が入る）
  let container;

  // 読み込んだ VexFlow（読み込みが終わるまでは null）
  let VF = $state(null);

  // 最後に描いたときの、音符ごとの当たり判定の四角
  let hitBoxes = [];

  // 描き直しの予約（何度も続けて頼まれても、まとめて1回だけ描く）
  let frame = 0;

  // クリックした場所から、この距離（ピクセル）までは「当たり」にする
  const HIT_MARGIN = 4;

  // 自動スクロールで、最後に見えるようにした段の上端の位置（段が変わったときだけスクロールするため）
  let lastScrollLineTop = null;

  // 自動スクロールで段を上に寄せたとき、上に残す余白（ピクセル）
  const SCROLL_MARGIN = 8;

  // ----------------------------------------------------------
  // 関数：draw
  // 今の枠の幅に合わせて、五線譜を描く
  // 描いたあと、再生中なら鳴っている段が見えるようにスクロールする
  // ----------------------------------------------------------
  function draw() {
    // VexFlow の読み込みが終わっていなければ何もしない
    if (!VF) return;
    // 枠の内側の幅（左右の padding 8px ずつを引く）
    const width = wrapper.clientWidth - 16;
    // renderScore は段の位置なども返すが、ここで使うのは当たり判定の四角だけ（ステップ9）
    hitBoxes = renderScore(VF, container, score, width, selection, range, playingNotes).hitBoxes;
    followPlaying();
  }

  // ----------------------------------------------------------
  // 関数：findScrollParent
  // 五線譜をスクロールしている外側の要素（overflow が auto か scroll の要素）を探す
  // 見つからなければ null
  // ----------------------------------------------------------
  function findScrollParent(element) {
    let node = element.parentElement;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return node;
      node = node.parentElement;
    }
    return null;
  }

  // ----------------------------------------------------------
  // 関数：followPlaying
  // 鳴っている音符がある段が画面から出そうなら、その段が上のほうに来るようにスクロールする
  // ・段が変わったときだけ調べる（同じ段の間は、マウスでスクロールしても引き戻さない）
  // ・段が全部見えているときは動かさない
  // ----------------------------------------------------------
  function followPlaying() {
    if (playingNotes.length === 0) return;

    // 鳴っている音符の中で、一番上のパートの音符の当たり判定の四角を探す（段の位置がわかる）
    const first = playingNotes[0];
    const box = hitBoxes.find((b) => b.part === first.part && b.measure === first.measure && b.note === first.note);
    if (!box) return;

    // 前と同じ段なら何もしない
    if (box.lineTop === lastScrollLineTop) return;
    lastScrollLineTop = box.lineTop;

    const scroller = findScrollParent(wrapper);
    if (!scroller) return;

    // 画面の上での位置に直す（五線譜の左上が、画面のどこにあるか ＋ 段の位置）
    const containerTop = container.getBoundingClientRect().top;
    const scrollerRect = scroller.getBoundingClientRect();
    const lineTop = containerTop + box.lineTop;
    const lineBottom = containerTop + box.lineBottom;

    // 段が全部見えていればそのまま
    if (lineTop >= scrollerRect.top && lineBottom <= scrollerRect.bottom) return;

    // 段の上端が、見えている所の上のほうに来るようにスクロールする
    scroller.scrollBy({ top: lineTop - scrollerRect.top - SCROLL_MARGIN, behavior: "smooth" });
  }

  // ----------------------------------------------------------
  // 関数：requestDraw
  // 次の画面の更新のタイミングで描くように予約する
  // ----------------------------------------------------------
  function requestDraw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }

  // ----------------------------------------------------------
  // 関数：handleClick
  // 五線譜がクリックされたとき、どの音符の上かを調べて親に知らせる
  // ----------------------------------------------------------
  function handleClick(event) {
    // クリックした位置を、五線譜の左上を (0, 0) とした位置に直す
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 当たり判定の四角の中に入っている音符を探す
    const hit = hitBoxes.find((box) => x >= box.x - HIT_MARGIN && x <= box.x + box.w + HIT_MARGIN && y >= box.y - HIT_MARGIN && y <= box.y + box.h + HIT_MARGIN);

    if (hit) {
      // Shift キーを押しながらのクリックかどうかも一緒に知らせる（範囲選択に使う）
      onselect({ part: hit.part, measure: hit.measure, note: hit.note }, event.shiftKey);
    } else {
      onselect(null, false); // 何もない所をクリックしたら選択を外す
    }
  }

  // ----------------------------------------------------------
  // 楽譜データ・選択中の場所・範囲・鳴っている音符・VexFlow の準備が変わったら描き直す
  // （ここで読んだ値が変わると、この中身がもう一度実行される）
  // ----------------------------------------------------------
  $effect(() => {
    score;
    selection;
    range;
    playingNotes;
    VF;
    requestDraw();
  });

  // ----------------------------------------------------------
  // 再生が止まったら、自動スクロールの「前の段」を忘れる
  // （次に再生したとき、同じ段からでも、見えていなければスクロールするため）
  // ----------------------------------------------------------
  $effect(() => {
    if (!playing) lastScrollLineTop = null;
  });

  // ----------------------------------------------------------
  // 画面が表示されたら実行される処理
  // VexFlow はブラウザの中でしか動かないので、ここで読み込む
  // ----------------------------------------------------------
  onMount(() => {
    // 枠の幅が変わったら描き直す
    const observer = new ResizeObserver(requestDraw);
    observer.observe(wrapper);

    // VexFlow を読み込んで、フォントの準備ができたら VF に入れる（→ 上の $effect で描かれる）
    (async () => {
      // VexFlow を読み込む（読み込むと楽譜用のフォントも読み込みが始まる）
      const loaded = (await import("vexflow")).default;
      // 楽譜用のフォント（Bravura）の読み込みが終わるのを待つ
      await document.fonts.ready;
      VF = loaded;
    })();

    // この部品が画面から消えるときの後片付け
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });
</script>

<!-- 五線譜が入る枠 -->
<div class="score-view" bind:this={wrapper}>
  <!-- クリックで音符を選ぶ（キーボードでの操作は編集ページでまとめて受け取る） -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div bind:this={container} onclick={handleClick}></div>
</div>

<style>
  .score-view {
    overflow-x: auto; /* 最低限の幅より狭い画面では横スクロール */
    background: #fff; /* 紙のような白い背景 */
    border: 1px solid #ddd; /* うすい枠線 */
    padding: 8px;
  }
</style>
