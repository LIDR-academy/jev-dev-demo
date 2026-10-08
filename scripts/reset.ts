/**
 * Deja todo listo para repetir la demo: borra los issues del proyecto DEMO y vacía results/.
 *   npm run reset                → borra issues con etiqueta jev o batch (los de la demo), no todo el proyecto
 *   npm run reset -- --all       → borra TODOS los issues del proyecto DEMO
 *   npm run reset -- --mock      → solo results/
 *   npm run reset -- --baselines → además borra las corridas "direct" (el antes de cada demo)
 */
import { rmSync, readdirSync, existsSync } from "node:fs";
import { searchIssues, deleteIssue, projectKey, JIRA_MOCK } from "../jira-triage/jira.ts";
import { bold, dim, green, red } from "../shared/ui.ts";

// Las corridas "direct" (todo al LLM, sin Jev) son el "antes" de cada demo: se precalculan una vez, tardan minutos y
// cuestan dinero, y no cambian entre ensayos. Por eso se conservan salvo que pidas --baselines.
const BASELINES = ["direct.json", "triage-direct.json", "code-health-direct.json"];
const keep = process.argv.includes("--baselines") ? [] : BASELINES;
if (existsSync("results")) for (const f of readdirSync("results")) if (!keep.includes(f)) rmSync(`results/${f}`, { recursive: true, force: true });
const kept = keep.filter((f) => existsSync(`results/${f}`));
console.log(green("✓"), "results/ vaciado", kept.length ? dim(`(se conservan: ${kept.join(", ")})`) : "");

if (JIRA_MOCK) { console.log(dim("jira MOCK: no se tocan issues")); process.exit(0); }
const all = process.argv.includes("--all");
const jql = all ? `project = ${projectKey}` : `project = ${projectKey} AND (labels = jev OR labels = batch OR labels = revisar OR labels = escalado)`;
const issues = await searchIssues(jql, 200);
console.log(bold(`${issues.length} issues a borrar`), dim(`(${jql})`));
let ok = 0;
await Promise.all(issues.map(async (i) => { try { await deleteIssue(i.key); ok++; } catch (e: any) { console.error(red("✗"), i.key, e.message); } }));
console.log(green("✓"), `${ok} issues borrados de ${projectKey}`);
