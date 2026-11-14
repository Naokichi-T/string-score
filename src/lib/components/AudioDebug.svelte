<!--
  AudioDebug.svelte
  【仮】音が突然鳴らなくなる原因を調べるための小さな表示（原因がわかったら消す）
  ・画面の左下に、音を鳴らす仕組みの今の状態を小さく出す（例：「再生：running」）
    running 以外のときは赤くする
  ・押すと、記録の一覧（新しいものが上）と［読み込み直す］ボタンを出す
    （ホーム画面に追加したアプリでは、ブラウザの再読み込みボタンがないため）
  ・記録の中身は audioDebug.js が集めている
-->
<script>
  import { onMount } from "svelte";
  import { audioStates, audioLog, subscribeAudioLog } from "#lib/audio/audioDebug.js";

  // 今の状態の一覧（[{ label, state }, ...]）
  let states = $state([]);
  // 記録の一覧（新しいものが前）
  let entries = $state([]);
  // 記録の一覧を開いているか
  let open = $state(false);

  // ----------------------------------------------------------
  // 関数：refresh
  // 状態と記録を読み直す
  // ----------------------------------------------------------
  function refresh() {
    states = audioStates();
    entries = [...audioLog()];
  }

  onMount(() => {
    refresh();
    // 記録が増えたら読み直す
    const unsubscribe = subscribeAudioLog(refresh);
    // 念のため、1秒ごとにも読み直す（状態の変化の知らせが来ない端末があっても、表示が古くならないように）
    const timer = setInterval(refresh, 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  });

  // どれか1つでも動いていない仕組みがあるか（あれば赤くする）
  let hasProblem = $derived(states.some((item) => item.state !== "running"));
</script>

<div class="audio-debug">
  {#if open}
    <!-- 記録の一覧 -->
    <div class="panel">
      <div class="head">
        <strong>音の記録（仮）</strong>
        <button onclick={() => location.reload()}>読み込み直す</button>
        <button onclick={() => (open = false)}>閉じる</button>
      </div>
      {#if entries.length === 0}
        <p class="empty">まだ記録はありません（音を鳴らすと記録が始まります）</p>
      {:else}
        <ul>
          {#each entries as entry, i (i)}
            <li><span class="time">{entry.time}</span> {entry.label}：{entry.text}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <!-- 今の状態（押すと記録の一覧を開く・閉じる） -->
  <button class="badge" class:problem={hasProblem} onclick={() => (open = !open)}>
    {#if states.length === 0}
      音：未使用
    {:else}
      {states.map((item) => `${item.label}：${item.state}`).join("／")}
    {/if}
  </button>
</div>

<style>
  /* 画面の左下に、ほかの部品の上に重ねて出す */
  .audio-debug {
    position: fixed;
    left: 4px;
    bottom: 4px;
    z-index: 9999;
    font-size: 11px;
    font-family: sans-serif;
  }
  /* 今の状態の小さな札（ふだんは目立たない灰色、動いていないときは赤） */
  .badge {
    padding: 2px 6px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.85);
    color: #64748b;
    font-size: 11px;
  }
  .badge.problem {
    border-color: #ef4444;
    background: #fee2e2;
    color: #b91c1c;
    font-weight: bold;
  }
  /* 記録の一覧の窓 */
  .panel {
    width: min(360px, calc(100vw - 16px));
    max-height: 50vh;
    overflow-y: auto;
    margin-bottom: 4px;
    padding: 6px 8px;
    border: 1px solid #94a3b8;
    border-radius: 6px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  .head {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
  }
  .head strong {
    flex: 1;
  }
  .head button {
    font-size: 11px;
    padding: 2px 6px;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    padding: 1px 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .time {
    color: #94a3b8;
  }
  .empty {
    margin: 0;
    color: #64748b;
  }
</style>
