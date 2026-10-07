/**
 * Muestra la revisión de una PR en ambos modos, lado a lado. Para el minuto 21: "la PR compleja recibió la misma revisión".
 *   npm run show-review -- PR-17099
 */
import { readFileSync, existsSync } from "node:fs";
import { bold, dim, magenta, green, gray } from "../shared/ui.ts";

const id = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!id) { console.error("Uso: npm run show-review -- PR-17099"); process.exit(1); }

for (const mode of ["direct", "jev"]) {
  const f = `results/${mode}.json`;
  if (!existsSync(f)) { console.error(`Falta ${f}`); continue; }
  const r = JSON.parse(readFileSync(f, "utf8")).results.find((x: any) => x.pr.id === id);
  if (!r) { console.error(`${id} no está en ${f}`); continue; }
  const head = mode === "direct" ? magenta(`■ ${mode}`) : green(`■ ${mode}`);
  console.log(`\n${head}  ${bold(r.pr.title)}  ${gray(r.pr.url ?? "")}`);
  if (r.decision) console.log(dim(`  Jev: ${r.decision.complejidad} (${Math.round(r.decision.confidence * 100)} %) · dinero ${Math.round(r.decision.touchesMoney * 100)} % · ${r.decision.reason}`));
  console.log(dim(`  Modelo: ${r.review.model} · ${r.review.input_tokens} in / ${r.review.output_tokens} out · ${r.review.ms} ms`));
  console.log("  " + r.review.text.split("\n").join("\n  "));
}
console.log();
