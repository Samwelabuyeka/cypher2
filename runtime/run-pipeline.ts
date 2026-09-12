import { runFullPipeline } from "./src/pipeline";

(async () => {
  const result = await runFullPipeline("BTC");
  console.log(JSON.stringify(result, null, 2));
})().catch(e => {
  console.error("Pipeline failed:", e.message);
  process.exit(1);
});
