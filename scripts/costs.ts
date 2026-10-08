/**
 * Costes por ejecución: lee results/*.json y resume tokens, USD y tiempo de cada una.
 *   npm run costs
 *   npm run costs -- --json      → salida JSON (para el skill /costos y para pegar en Slack)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { table, bold, dim, gray, usd, num } from "../shared/ui.ts";

const prices: Record<string, { input_per_m: number; output_per_m: number }> = JSON.parse(readFileSync("llm-router/prices.json", "utf8"));
const JEV = process.env.JEV_MODEL ?? "jev-1.13.0";
const SMALL = process.env.MODEL_SMALL ?? "claude-haiku-4-5";
const LARGE = process.env.MODEL_LARGE ?? "claude-sonnet-5-5";
const price = (m: string) => prices[m] ?? prices[m.replace(" (mock)", "")] ?? { input_per_m: 0, output_per_m: 0 };
const cost = (m: string, i: number, o: number) => (i / 1e6) * price(m).input_per_m + (o / 1e6) * price(m).output_per_m;

type Row = { ejecucion: string; at: string; unidades: number; jevCalls: number; jevTokens: number; jevUsd: number; llmCalls: number; llmIn: number; llmOut: number; llmUsd: number; totalUsd: number; ms: number; mock: boolean };
const rows: Row[] = [];

if (!existsSync("results")) { console.error("No hay results/. Corre alguna ejecución primero."); process.exit(1); }
for (const f of readdirSync("results").filter((x) => x.endsWith(".json")).sort()) {
  const d = JSON.parse(readFileSync(`results/${f}`, "utf8"));
  if (f === "triage.json") {
    const jt = d.tokens ?? d.results.reduce((s: number, r: any) => s + (r.inputTokens ?? 0), 0);
    rows.push({ ejecucion: "Demo 1 · triage de Jira", at: d.at, unidades: d.results.length, jevCalls: d.results.length, jevTokens: jt, jevUsd: (jt / 1e6) * price(JEV).input_per_m, llmCalls: 0, llmIn: 0, llmOut: 0, llmUsd: 0, totalUsd: (jt / 1e6) * price(JEV).input_per_m, ms: d.jevMs, mock: d.mock });
  } else if (f === "triage-vivo.json") {
    const jt = d.results.reduce((s: number, r: any) => s + (r.inputTokens ?? 0), 0);
    rows.push({ ejecucion: "Demo 1 · triage en vivo (MCP)", at: d.at, unidades: d.results.length, jevCalls: d.results.length, jevTokens: jt, jevUsd: (jt / 1e6) * price(JEV).input_per_m, llmCalls: 0, llmIn: 0, llmOut: 0, llmUsd: 0, totalUsd: (jt / 1e6) * price(JEV).input_per_m, ms: d.jevMs, mock: d.mock });
  } else if (f === "code-health.json") {
    const ex = d.findings.filter((x: any) => x.explanation);
    const llmIn = ex.reduce((s: number, x: any) => s + x.explanation.input_tokens, 0), llmOut = ex.reduce((s: number, x: any) => s + x.explanation.output_tokens, 0);
    const llmUsd = cost(LARGE, llmIn, llmOut);
    rows.push({ ejecucion: `Demo 2 · pre-vuelo ${d.ticket ?? ""}`, at: d.at, unidades: d.findings.length, jevCalls: d.findings.length, jevTokens: d.jevTokens, jevUsd: d.jevCost, llmCalls: ex.length, llmIn, llmOut, llmUsd, totalUsd: d.jevCost + llmUsd, ms: d.jevMs, mock: d.mock });
  } else if (f === "direct.json" || f === "jev.json") {
    let llmIn = 0, llmOut = 0, llmUsd = 0, llmCalls = 0, jevTokens = 0;
    for (const r of d.results) {
      const m = r.route === "haiku" ? SMALL : r.route === "sonnet" ? LARGE : "rules";
      if (m !== "rules") { llmCalls++; llmIn += r.review.input_tokens; llmOut += r.review.output_tokens; llmUsd += cost(m, r.review.input_tokens, r.review.output_tokens); }
      jevTokens += r.decision?.jevTokens ?? 0;
    }
    const jevUsd = (jevTokens / 1e6) * price(JEV).input_per_m;
    rows.push({ ejecucion: `Demo 3 · revisión de PRs (${d.mode})`, at: d.at, unidades: d.results.length, jevCalls: d.mode === "jev" ? d.results.length : 0, jevTokens, jevUsd, llmCalls, llmIn, llmOut, llmUsd, totalUsd: jevUsd + llmUsd, ms: d.totalMs, mock: d.mock });
  }
}

rows.sort((a, b) => a.ejecucion.localeCompare(b.ejecucion));
if (process.argv.includes("--json")) { console.log(JSON.stringify({ prices: { [JEV]: price(JEV), [SMALL]: price(SMALL), [LARGE]: price(LARGE) }, rows }, null, 2)); process.exit(0); }

console.log(bold("\nCostes por ejecución"), dim("(USD; precios de llm-router/prices.json)\n"));
console.log(table(
  ["Ejecución", "Unidades", "Jev llamadas", "Jev tokens", "Jev USD", "LLM llamadas", "LLM in/out", "LLM USD", "Total USD", "Tiempo"],
  rows.map((r) => [r.ejecucion + (r.mock ? dim(" (mock)") : ""), r.unidades, r.jevCalls, num(r.jevTokens), usd(r.jevUsd), r.llmCalls, `${num(r.llmIn)}/${num(r.llmOut)}`, usd(r.llmUsd), bold(usd(r.totalUsd)), `${(r.ms / 1000).toFixed(1)} s`]),
  { align: ["l", "r", "r", "r", "r", "r", "r", "r", "r", "r"] }
));
const total = rows.reduce((s, r) => s + r.totalUsd, 0);
console.log(`\n${bold("Total de la demo")}  ${usd(total)}   ${gray(`Jev ${usd(rows.reduce((s, r) => s + r.jevUsd, 0))} · LLM ${usd(rows.reduce((s, r) => s + r.llmUsd, 0))}`)}\n`);
