<script>
  // ==========================================================
  // TabletGuide.svelte
  // タブレットでの使い方をまとめた窓（ステップ18-6）
  // ・タブレットで編集ページを初めて開いたときに出す（［×］で閉じたら、次からは出さない）
  // ・上のバーの［？］から、いつでも開ける
  // 窓の外をタップ・［×］・Esc キーで閉じる
  // ==========================================================

  // 親から受け取るもの
  //   onclose … 閉じるときに呼ぶ関数
  let { onclose = () => {} } = $props();

  // 窓に書く使い方（上から順に出す）
  //   title … 見出し
  //   text  … 説明
  const ITEMS = [
    { title: "ボタンの説明", text: "ボタンを長押しすると、そのボタンの説明が出ます（長押しでは、押したことになりません）。" },
    { title: "範囲を選ぶ", text: "「音符」タブの［範囲］を入にしてから、範囲の最後の音をタップします。" },
    { title: "前後の音へ移る", text: "選択中の青い帯の右にある［◀ 前の音］［次の音 ▶］を使います。" },
    { title: "重音の中の1つの音", text: "その玉をタップすると、その音だけを選べます。" },
    { title: "楽譜を広く見る", text: "タブの右端の［▲］と、鍵盤の右の［▼］で畳めます。" },
  ];

  // ----------------------------------------------------------
  // 関数：handleKeydown
  // Esc キーで閉じる（キーボードをつないだタブレットのため）
  // ----------------------------------------------------------
  function handleKeydown(event) {
    if (event.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- 窓のうしろの、うすく暗くする幕（押すと閉じる） -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => onclose()}>
  <!-- 窓の中を押したときは閉じないように、クリックが幕まで伝わるのを止める（stopPropagation） -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="dialog" onclick={(event) => event.stopPropagation()}>
    <div class="header">
      <h2>タブレットでの使い方</h2>
      <!-- 閉じるボタン（title を付けないのは、長押しの説明が出て閉じられなくならないようにするため） -->
      <button class="close" onclick={() => onclose()} aria-label="閉じる">×</button>
    </div>

    <ul>
      {#each ITEMS as item (item.title)}
        <li><b>{item.title}</b>：{item.text}</li>
      {/each}
    </ul>

    <!-- もう一度見る方法 -->
    <p class="again">この説明は、上のバーの［？］から、いつでも見られます。</p>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; /* 画面に貼り付ける（スクロールしても動かない） */
    inset: 0; /* 上下左右いっぱいに広げる */
    background: rgba(0, 0, 0, 0.4); /* うすい黒（うしろの楽譜が透けて見える） */
    display: flex; /* 窓を画面のまん中に置く */
    align-items: center;
    justify-content: center;
    z-index: 100; /* 楽譜や鍵盤より上に出す */
  }
  .dialog {
    background: white;
    border-radius: 8px;
    padding: 20px 24px;
    width: 520px;
    max-width: calc(100vw - 32px); /* 画面が狭いときは、左右に 16px ずつ空ける */
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2); /* 窓の影 */
  }
  .header {
    display: flex; /* 見出しと［×］を横に並べる */
    align-items: center;
    justify-content: space-between; /* 見出しは左、［×］は右 */
    margin-bottom: 8px;
  }
  h2 {
    margin: 0;
    font-size: 18px;
  }
  .close {
    width: 44px; /* 指で押しやすい大きさ */
    height: 44px;
    padding: 0;
    font-size: 22px;
    line-height: 1;
    border: none;
    background: none;
    cursor: pointer;
    color: #6b7280;
  }
  ul {
    margin: 0;
    padding-left: 20px;
    font-size: 15px;
    line-height: 1.8;
    color: #333;
  }
  li + li {
    margin-top: 6px; /* 項目の間を少し空ける */
  }
  .again {
    margin: 16px 0 0;
    font-size: 13px;
    color: #6b7280; /* うすいグレーの文字 */
  }
</style>
