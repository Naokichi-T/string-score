<script>
  // ==========================================================
  // TechniqueTools.svelte
  // 「奏法」タブの中身（音符1つに付ける奏法の文字のボタン）（ステップ11-2）
  // ボタンを押すと文字が付き、もう一度押すと外れる
  // 同じ組の文字は1つの音に1つだけ（別のものを押すと入れ替わる）
  // 選んでいる音にすでに付いている文字のボタンは青くなる
  // （奏法の一覧と組は ../score/symbols.js の TECHNIQUES・TECHNIQUE_GROUPS にある）
  // ==========================================================
  import { TECHNIQUES, TECHNIQUE_GROUPS } from "#lib/score/symbols.js";
  import { INSTRUMENTS } from "#lib/score/model.js";

  // 親から受け取るもの
  //   note       … 選んでいる音符のデータ（音符を選んでいないときは null）
  //   instrument … 選んでいるパートの楽器の名前（'violin' など。何も選んでいないときは null）
  //   onsymbol   … ボタンが押されたときに呼ぶ関数（「記号」タブと同じ。例：onsymbol('technique', 'sul pont.')）
  let { note = null, instrument = null, onsymbol = () => {} } = $props();

  // 音符を選んでいないときは、ボタンを全部押せないようにする
  let disabled = $derived(!note);

  // 選んでいるパートの楽器にある弦（例：バイオリンなら ["G", "D", "A", "E"]）
  let strings = $derived(instrument ? INSTRUMENTS[instrument].strings : []);

  // ----------------------------------------------------------
  // 関数：techniquesOf
  // ある組に入っている奏法を、symbols.js に書いた順番で返す
  //   groupId … 組の名前（'pluck' など）
  // 戻り値：[[奏法の名前, 奏法の情報], ...]
  // ----------------------------------------------------------
  function techniquesOf(groupId) {
    return Object.entries(TECHNIQUES).filter(([, info]) => info.group === groupId);
  }

  // ----------------------------------------------------------
  // 関数：canUse
  // その奏法のボタンを押せるかを決める
  //   ・音符を選んでいなければ押せない
  //   ・弦の指定は、選んでいるパートの楽器にある弦だけ押せる（ビオラ・チェロに E 線はない、など）
  //   info … 奏法の情報（TECHNIQUES の1つ分）
  // ----------------------------------------------------------
  function canUse(info) {
    if (disabled) return false;
    if (info.string && !strings.includes(info.string)) return false;
    return true;
  }
</script>

<div class="technique-tools">
  {#each TECHNIQUE_GROUPS as group (group.id)}
    <!-- 組ごとにボタンをまとめる（マウスを乗せると組の名前が出る） -->
    <div class="group" title={group.label}>
      {#each techniquesOf(group.id) as [name, info] (name)}
        <button class="tool" class:on={(note?.techniques ?? []).includes(name)} disabled={!canUse(info)} onclick={() => onsymbol("technique", name)} title={info.label} aria-label={info.label}>
          <i>{info.text}</i>
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .technique-tools {
    display: flex;
    flex-wrap: wrap; /* 画面が狭いときは折り返す */
    align-items: center;
    gap: 12px;
  }
  .group {
    display: flex;
    gap: 3px;
  }
  .tool {
    height: 40px;
    padding: 0 10px; /* 文字の長さに合わせた幅にする */
    font-size: 15px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    white-space: nowrap; /* 「sul pont.」などを2行に折り返さない */
  }
  .tool.on {
    background: #2563eb; /* 付いている文字は青 */
    color: #fff;
    border-color: #2563eb;
  }
  .tool:disabled {
    opacity: 0.35; /* 押せないものはうすく */
    cursor: not-allowed;
  }
</style>
