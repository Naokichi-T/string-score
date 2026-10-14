<script>
  // ==========================================================
  // TopBar.svelte
  // 編集ページの一番上のバー
  // （ステップ4-3：元に戻す・やり直しのボタンが動くようになった。ほかのボタンは後のステップで）
  // ==========================================================

  // 親から受け取るもの
  //   tempo   … テンポ（♩＝○○ の数字）
  //   canUndo … 元に戻せるか（false ならボタンを押せない）
  //   canRedo … やり直せるか
  //   onundo  … 元に戻すボタンが押されたときに呼ぶ関数
  //   onredo  … やり直しボタンが押されたときに呼ぶ関数
  let { tempo, canUndo = false, canRedo = false, onundo = () => {}, onredo = () => {} } = $props();
</script>

<header class="top-bar">
  <!-- アプリの名前（押すとトップページに戻る） -->
  <a class="app-name" href="/">string-score</a>

  <!-- 元に戻す・やり直し -->
  <div class="group">
    <button disabled={!canUndo} onclick={() => onundo()} title="元に戻す（Ctrl＋Z / ⌘＋Z）">↶ 元に戻す</button>
    <button disabled={!canRedo} onclick={() => onredo()} title="やり直し（Ctrl＋Shift＋Z / ⌘＋Shift＋Z）"> ↷ やり直し </button>
  </div>

  <!-- 再生（ステップ6で動くようにする） -->
  <div class="group">
    <button disabled title="再生">▶ 再生</button>
    <span class="tempo">♩ = {tempo}</span>
  </div>

  <!-- 右に寄せるための空き -->
  <div class="spacer"></div>

  <!-- 保存・書き出し（ステップ7・8で動くようにする） -->
  <div class="group">
    <button disabled>保存</button>
    <button disabled>MusicXML 書き出し</button>
  </div>
</header>

<style>
  .top-bar {
    display: flex; /* 横に並べる */
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    background: #f3f4f6; /* うすいグレー */
    border-bottom: 1px solid #ddd;
  }
  .app-name {
    font-weight: bold;
    color: #111;
    text-decoration: none;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .spacer {
    flex: 1; /* 残りの幅を全部使って、右側のボタンを右端に寄せる */
  }
  .tempo {
    font-size: 14px;
    color: #333;
  }
  button {
    padding: 4px 10px;
    font-size: 14px;
  }
</style>
