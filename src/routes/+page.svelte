<script>
  // ==========================================================
  // トップページ
  // （ステップ2の間は、お試しの楽譜を表示するだけ）
  // ==========================================================
  import ScoreView from "#lib/components/ScoreView.svelte";
  import { sampleScore } from "#lib/score/sampleScore.js";
</script>

<h1>string-score</h1>

<!-- お試しの楽譜を表示する -->
<ScoreView score={sampleScore} />
