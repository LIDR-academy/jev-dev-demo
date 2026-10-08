/**
 * Lote: lee data/tickets.json, (opcional) crea los issues en Jira, los clasifica en paralelo con Jev
 * y aplica umbrales. Imprime tabla y totales.
 *
 * npm run batch                 → crea los 30 en Jira y los clasifica
 * npm run batch -- --no-create  → los tickets ya existen (los importaste por CSV); solo clasifica los que tengan etiqueta "batch"
 * npm run batch -- --mock       → sin Jev ni Jira
 * npm run batch -- --data=data/tickets.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifyTicket, buildComment, type Classification } from "./classify.ts";
import { createIssue, applyClassification, addComment, searchIssues, projectKey, JIRA_MOCK } from "./jira.ts";
import { jevCost, MOCK } from "../shared/jev.ts";
import { table, bold, dim, green, yellow, red, cyan, gray, usd, num, colorAction } from "../shared/ui.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DATA = arg("data") ?? "data/tickets.json";
const NO_CREATE = process.argv.includes("--no-create");

type Ticket = { id: string; title: string; description: string; reporter?: string; expected?: Record<string, string | null>; ambiguous?: boolean };
const tickets: Ticket[] = JSON.parse(readFileSync(DATA, "utf8"));

console.log(bold(`\nTriage de ${tickets.length} tickets`), dim(`(${DATA}) · jev ${MOCK ? yellow("MOCK") : green("real")} · jira ${JIRA_MOCK ? yellow("MOCK") : green("real")}\n`));

// 1) Obtener o crear issues
const t0 = performance.now();
let keyed: { key: string; t: Ticket }[];
if (NO_CREATE && !JIRA_MOCK) {
  const found = await searchIssues(`project = ${projectKey} AND labels = batch AND statusCategory != Done ORDER BY created ASC`, 200);
  // Emparejamos por orden de creación; si importaste el CSV en orden, coincide con tickets.json
  keyed = found.slice(0, tickets.length).map((f, i) => ({ key: f.key, t: tickets[i] }));
  console.log(dim(`${keyed.length} issues encontrados con etiqueta batch`));
} else {
  keyed = await Promise.all(tickets.map(async (t) => ({ key: (await createIssue(t.title, t.description, ["batch"])).key, t })));
  console.log(dim(`${keyed.length} issues creados en ${Math.round(performance.now() - t0)} ms`));
}

// 2) Clasificar todos en paralelo (Jev aguanta sin problema)
const t1 = performance.now();
const results = await Promise.all(
  keyed.map(async ({ key, t }) => {
    const c = await classifyTicket(t.title, t.description, t.reporter);
    await applyClassification(key, c);
    await addComment(key, buildComment(c));
    return { key, t, c };
  })
);
const jevMs = Math.round(performance.now() - t1);

// 3) Tabla
const pct = (n: number) => `${Math.round(n * 100)}`;
const rows = results.map(({ key, t, c }) => {
  const ok = !t.expected || t.ambiguous
    ? (t.ambiguous ? (c.action === "escalate" ? green("✓ escalado") : yellow("~ no escaló")) : "")
    : (t.expected.tipo === c.tipo && t.expected.equipo === c.equipo ? green("✓") : yellow("~ " + [t.expected.tipo !== c.tipo && `tipo:${t.expected.tipo}`, t.expected.equipo !== c.equipo && `eq:${t.expected.equipo}`].filter(Boolean).join(" ")));
  return [cyan(key), t.title.slice(0, 44), c.tipo, c.prioridad, c.equipo, `${pct(c.confidence.min)} %`, `${pct(c.needsHuman)} %`, colorAction(c.action), `${c.ms}`, ok];
});
console.log(table(["Key", "Ticket", "Tipo", "Prioridad", "Equipo", "Conf. mín", "Humano", "Acción", "ms", "vs esperado"], rows, { align: ["l", "l", "l", "l", "l", "r", "r", "l", "r", "l"] }));

// 4) Totales
const count = (a: Classification["action"]) => results.filter((r) => r.c.action === a).length;
const tokens = results.reduce((s, r) => s + r.c.inputTokens, 0);
const cost = jevCost(tokens);
const hits = results.filter((r) => r.t.expected && !r.t.ambiguous && r.t.expected.tipo === r.c.tipo && r.t.expected.equipo === r.c.equipo).length;
const graded = results.filter((r) => r.t.expected && !r.t.ambiguous).length;

console.log(`
${bold("Totales")}
  Tickets          ${bold(num(results.length))}
  Tiempo total     ${bold(num(jevMs))} ms   ${gray(`(~${Math.round(jevMs / results.length)} ms por ticket, en paralelo)`)}
  Tokens a Jev     ${num(tokens)}
  Costo estimado   ${bold(usd(cost))} USD   ${gray(`(${process.env.JEV_PRICE_PER_M ?? 0.1} USD / M tokens; solo input)`)}
  Acciones         ${green(count("apply") + " apply")} · ${yellow(count("apply_and_flag") + " apply_and_flag")} · ${red(count("escalate") + " escalate")}
  Tipo+equipo OK   ${hits}/${graded} ${gray("(contra el campo expected de tickets.json)")}
`);

mkdirSync("results", { recursive: true });
writeFileSync("results/triage.json", JSON.stringify({ at: new Date().toISOString(), mock: MOCK, jevMs, tokens, cost, results: results.map((r) => ({ key: r.key, id: r.t.id, title: r.t.title, ...r.c })) }, null, 2));
console.log(dim("→ results/triage.json"));
