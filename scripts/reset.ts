/**
 * Deja todo listo para repetir la demo: borra los issues del proyecto DEMO y la carpeta results/.
 *   npm run reset            → borra issues con etiqueta jev o batch (los de la demo), no todo el proyecto
 *   npm run reset -- --all   → borra TODOS los issues del proyecto DEMO
 *   npm run reset -- --mock  → solo results/
 */
import { rmSync } from "node:fs";
import { searchIssues, deleteIssue, projectKey, JIRA_MOCK } from "../jira-triage/jira.ts";
import { bold, dim, green, red } from "../shared/ui.ts";

rmSync("results", { recursive: true, force: true });
console.log(green("✓"), "results/ borrado");

if (JIRA_MOCK) { console.log(dim("jira MOCK: no se tocan issues")); process.exit(0); }
const all = process.argv.includes("--all");
const jql = all ? `project = ${projectKey}` : `project = ${projectKey} AND (labels = jev OR labels = batch OR labels = revisar)`;
const issues = await searchIssues(jql, 200);
console.log(bold(`${issues.length} issues a borrar`), dim(`(${jql})`));
let ok = 0;
await Promise.all(issues.map(async (i) => { try { await deleteIssue(i.key); ok++; } catch (e: any) { console.error(red("✗"), i.key, e.message); } }));
console.log(green("✓"), `${ok} issues borrados de ${projectKey}`);
