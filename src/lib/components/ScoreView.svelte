<script>
  // ==========================================================
  // ScoreView.svelte
  // 楽譜データを受け取って、五線譜を表示する部品
  // ・画面の幅が変わったら、改行の位置を決め直して描き直す
  // ・楽譜データや選択中の場所が変わったら描き直す
  // ・音符がクリックされたら、親に知らせる（onselect）
  // （ステップ6-2：再生中に鳴っている音符を緑にする。その段が画面の外なら、見えるところまでスクロールする）
  // （ステップ12-6a：表示するパートだけを描けるようにした。visibleParts で選ぶ）
  // （ステップ14-2：重音の玉をクリックしたら、その玉（クリックした高さにいちばん近い玉）を選ぶ）
  //   ・表示するパートだけの「見せる用の楽譜」を作って描く（楽譜データそのものは変えない）
  //   ・この部品の外とやりとりするパートの番号は、いつも本当の番号（全パートの中での番号）
  //   ・中で描くときだけ、見せる用の番号（表示するパートの中での番号）に直す
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
  //   visibleParts … 表示するパートの本当の番号の配列（例：[0, 2]。null なら全部表示）（ステップ12-6a）
  //   beatLines    … true なら拍の線を描く（ステップ12-7）
  //   focus … 見えるようにしておきたい音の場所（範囲を広げているときは動かしている端、そうでなければ選んでいる音）（ステップ13-4）
  let { score, selection = null, range = null, playingNotes = [], playing = false, onselect = () => {}, visibleParts = null, beatLines = false, focus = null } = $props();

  // 表示するパートの本当の番号の配列（null のときは全部）（ステップ12-6a）
  let shownParts = $derived(visibleParts ?? score.parts.map((_, p) => p));

  // 表示するパートだけの、見せる用の楽譜データ（ステップ12-6a）
  // （$derived なので、score か表示するパートが変わったときだけ作り直す。
  //   毎回作ると、render.js の「前回と同じ楽譜なら測り直さない」しくみが効かなくなるため）
  let viewScore = $derived(shownParts.length === score.parts.length ? score : { ...score, parts: shownParts.map((p) => score.parts[p]) });

  // ----------------------------------------------------------
  // 関数：toViewPart
  // 本当のパートの番号を、見せる用の番号に直す（隠しているパートなら -1）（ステップ12-6a）
  // ----------------------------------------------------------
  function toViewPart(part) {
    return shownParts.indexOf(part);
  }

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

  // 指でタップしたときの「当たり」の距離（指は細かい所を押しにくいので広くする）（ステップ12-8a）
  const TOUCH_HIT_MARGIN = 12;

  // 最後に押したのが、マウス（"mouse"）・指（"touch"）・ペン（"pen"）のどれか（ステップ12-8a）
  let lastPointerType = "mouse";

  // 自動スクロールで、最後に見えるようにした段の上端の位置（段が変わったときだけスクロールするため）
  let lastScrollLineTop = null;

  // 自動スクロールで段を上に寄せたとき、上に残す余白（ピクセル）
  const SCROLL_MARGIN = 8;

  // 最後に「見えるようにした」音の場所（"パート-小節-番号" の文字）（ステップ13-4）
  // 場所が変わったときだけスクロールする（同じ場所のまま描き直したときに、マウスでのスクロールを引き戻さないため）
  let lastFocusKey = null;

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
    // 選択中・範囲・鳴っている音符を、見せる用のパートの番号に直す（隠しているパートのものは外す）（ステップ12-6a）
    const viewSelection = selection && toViewPart(selection.part) >= 0 ? { ...selection, part: toViewPart(selection.part) } : null;
    const viewRange = range && toViewPart(range.part) >= 0 ? { ...range, part: toViewPart(range.part) } : null;
    const viewPlaying = playingNotes.filter((n) => toViewPart(n.part) >= 0).map((n) => ({ ...n, part: toViewPart(n.part) }));
    // renderScore は段の位置なども返すが、ここで使うのは当たり判定の四角だけ（ステップ9）
    const boxes = renderScore(VF, container, viewScore, width, viewSelection, viewRange, viewPlaying, beatLines).hitBoxes; // beatLines：拍の線（ステップ12-7）
    // 当たり判定のパートの番号は、本当の番号に戻しておく（クリック・自動スクロールで使うため）（ステップ12-6a）
    hitBoxes = boxes.map((box) => ({ ...box, part: shownParts[box.part] }));
    followPlaying();
    followFocus(); // 矢印キーで選ぶ音・範囲の端が動いたら、その段が見えるようにする（ステップ13-4）
  }

  // ----------------------------------------------------------
  // 関数：followFocus
  // 見えるようにしておきたい音（focus）の段が画面から出ていたら、その段が見えるところまでスクロールする（ステップ13-4）
  // ・focus の場所が変わったときだけ調べる（同じ場所のまま描き直したときは動かさない）
  // ・再生中は、鳴っている音を追いかける（followPlaying）ので、ここでは動かさない
  // ・段が下に出ていれば段の下端が見える所まで、上に出ていれば段の上端が見える所までスクロールする
  //   （矢印キーで1つずつ進むとき、画面が大きく飛ばないように、最小限だけ動かす）
  // ----------------------------------------------------------
  function followFocus() {
    if (!focus || playing) {
      lastFocusKey = null;
      return;
    }
    const key = `${focus.part}-${focus.measure}-${focus.note}`;
    if (key === lastFocusKey) return;
    lastFocusKey = key;

    // focus の音の当たり判定の四角を探す（段の上端・下端がわかる）。隠しているパートの音なら何もしない
    const box = hitBoxes.find((b) => b.part === focus.part && b.measure === focus.measure && b.note === focus.note);
    if (!box) return;

    const scroller = findScrollParent(wrapper);
    if (!scroller) return;

    // 画面の上での位置に直す
    const containerTop = container.getBoundingClientRect().top;
    const scrollerRect = scroller.getBoundingClientRect();
    const lineTop = containerTop + box.lineTop;
    const lineBottom = containerTop + box.lineBottom;

    if (lineBottom > scrollerRect.bottom) {
      // 下に出ている：段の下端が見える所まで下へスクロールする（段が見える所より高いときは、上端に合わせる）
      const down = Math.min(lineBottom - scrollerRect.bottom + SCROLL_MARGIN, lineTop - scrollerRect.top - SCROLL_MARGIN);
      scroller.scrollBy({ top: down, behavior: "smooth" });
    } else if (lineTop < scrollerRect.top) {
      // 上に出ている：段の上端が見える所まで上へスクロールする
      scroller.scrollBy({ top: lineTop - scrollerRect.top - SCROLL_MARGIN, behavior: "smooth" });
    }
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

    // 当たりにする距離（指のときは広く）（ステップ12-8a）
    const margin = lastPointerType === "touch" ? TOUCH_HIT_MARGIN : HIT_MARGIN;

    // 当たり判定の四角（＋余白）の中に入っている音符を探す
    // 余白を広くすると、となりの音符の四角と重なることがあるので、
    // 入っているものの中で、四角の真ん中がいちばん近い音符を選ぶ（ステップ12-8a）
    let hit = null;
    let best = Infinity;
    hitBoxes.forEach((box) => {
      const inside = x >= box.x - margin && x <= box.x + box.w + margin && y >= box.y - margin && y <= box.y + box.h + margin;
      if (!inside) return;
      const dx = x - (box.x + box.w / 2);
      const dy = y - (box.y + box.h / 2);
      const distance = dx * dx + dy * dy; // 真ん中までの距離（の2乗。くらべるだけなので、ルートはいらない）
      if (distance < best) {
        best = distance;
        hit = box;
      }
    });

    if (hit) {
      const place = { part: hit.part, measure: hit.measure, note: hit.note };
      // 重音なら、クリックした高さにいちばん近い玉を選ぶ（head は低い順の番号）（ステップ14-2）
      if (hit.headYs && hit.headYs.length > 1) {
        let head = 0;
        hit.headYs.forEach((headY, k) => {
          if (Math.abs(headY - y) < Math.abs(hit.headYs[head] - y)) head = k;
        });
        place.head = head;
      }
      // Shift キーを押しながらのクリックかどうかも一緒に知らせる（範囲選択に使う）
      onselect(place, event.shiftKey);
    } else {
      onselect(null, false); // 何もない所をクリックしたら選択を外す
    }
  }

  // ----------------------------------------------------------
  // 楽譜データ・選択中の場所・範囲・鳴っている音符・VexFlow の準備が変わったら描き直す
  // （ここで読んだ値が変わると、この中身がもう一度実行される）
  // ----------------------------------------------------------
  $effect(() => {
    viewScore; // 楽譜データ・表示するパート（ステップ12-6a：score から変えた）
    beatLines; // 拍の線の入・切（ステップ12-7）
    selection;
    range;
    focus; // 見えるようにしておきたい音（ステップ13-4）
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
  <!-- onpointerdown：マウスか指かを覚えておく（指のときは当たりを広くする）（ステップ12-8a） -->
  <div bind:this={container} onclick={handleClick} onpointerdown={(event) => (lastPointerType = event.pointerType)}></div>
</div>

<style>
  .score-view {
    overflow-x: auto; /* 最低限の幅より狭い画面では横スクロール */
    background: #fff; /* 紙のような白い背景 */
    border: 1px solid #ddd; /* うすい枠線 */
    padding: 8px;
  }
</style>
