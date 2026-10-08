/**
 * Lote: lee data/tickets.json, (opcional) crea los issues en Jira, los clasifica en paralelo con Jev
 * y aplica umbrales. Imprime tabla y totales.
 *
 * npm run batch                 → crea los 30 en Jira y los clasifica
 * npm run batch -- --no-create  → los tickets ya existen (los importaste por CSV); solo clasifica los que tengan etiqueta "batch"
 * npm run batch -- --mock       → sin Jev ni Jira
 * npm run batch -- --mode=direct → el "antes": Sonnet clasifica los 22 issues reales de KAN, sin Jev; lee Jira pero no escribe (se precalcula)
 * npm run batch -- --data=data/tickets.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { classifyTicket, classifyTicketDirect, buildComment, type Classification } from "./classify.ts";
import { createIssue, applyClassification, addComment, searchIssues, adfToText, projectKey, JIRA_MOCK } from "./jira.ts";
import { jevCost, MOCK } from "../shared/jev.ts";
import { LLM_MOCK } from "../llm-router/llm.ts";
import { llmCost, mapLimit } from "../shared/prices.ts";
import { table, bold, dim, green, yellow, red, cyan, gray, magenta, usd, num, colorAction } from "../shared/ui.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DATA = arg("data") ?? "data/tickets.json";
const NO_CREATE = process.argv.includes("--no-create");
const MODE = (arg("mode") ?? "jev") as "jev" | "direct";

type Ticket = { id: string; title: string; description: string; reporter?: string; expected?: Record<string, string | null>; ambiguous?: boolean };
const tickets: Ticket[] = JSON.parse(readFileSync(DATA, "utf8"));

/** Los issues de KAN con etiqueta batch que no están en Finalizada: los 22 que se clasifican en la demo. */
async function pendingIssues() {
  const found = await searchIssues(`project = ${projectKey} AND labels = batch AND statusCategory != Done ORDER BY created ASC`, 200, ["summary", "description"]);
  // Emparejamos por título, no por orden: los tickets movidos a Listo (seed --done) descuadrarían el orden.
  // De tickets.json solo se toman el reporter y el expected (para la columna "vs esperado").
  const norm = (s: string) => s.trim().toLowerCase();
  return found.flatMap((f) => {
    const t = tickets.find((x) => norm(x.title) === norm(f.fields?.summary ?? ""));
    return t ? [{ key: f.key, t, jira: { title: f.fields?.summary as string, description: adfToText(f.fields?.description).trim() } }] : [];
  });
}

if (MODE === "direct") { await runDirect(); process.exit(0); }

console.log(bold(`\nTriage de ${tickets.length} tickets`), dim(`(${DATA}) · jev ${MOCK ? yellow("MOCK") : green("real")} · jira ${JIRA_MOCK ? yellow("MOCK") : green("real")}\n`));

// 1) Obtener o crear issues
const t0 = performance.now();
let keyed: { key: string; t: Ticket }[];
if (NO_CREATE && !JIRA_MOCK) {
  keyed = await pendingIssues();
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
  Costo estimado   ${bold(usd(cost))} USD   ${gray(`(${process.env.JEV_PRICE_PER_M ?? 0.042} USD / M tokens; solo input)`)}
  Acciones         ${green(count("apply") + " apply")} · ${yellow(count("apply_and_flag") + " apply_and_flag")} · ${red(count("escalate") + " escalate")}
  Tipo+equipo OK   ${hits}/${graded} ${gray("(contra el campo expected de tickets.json)")}
`);

mkdirSync("results", { recursive: true });
writeFileSync("results/triage.json", JSON.stringify({ at: new Date().toISOString(), mock: MOCK, jevMs, tokens, cost, results: results.map((r) => ({ key: r.key, id: r.t.id, title: r.t.title, ...r.c })) }, null, 2));
console.log(dim("→ results/triage.json"));

/**
 * El "antes" de la demo 1: lo que costaría este triage si cada ticket lo clasificara Sonnet con un prompt.
 * No toca Jira: es una corrida de referencia que se hace una vez antes de la sesión y queda en
 * results/triage-direct.json para que `npm run costs` la ponga junto a la de Jev.
 */
async function runDirect() {
  // Los mismos 22 issues reales que clasifica `batch --no-create`, con el título y la descripción tal como están en Jira.
  // Solo lectura: el antes no escribe nada en Jira. Con Jira en mock, se usan los 22 equivalentes de tickets.json
  // (seed --done=8 manda a Finalizada los últimos 8 no ambiguos).
  const done = new Set(tickets.filter((t) => !t.ambiguous).slice(-8).map((t) => t.id));
  const pending = JIRA_MOCK
    ? tickets.filter((t) => !done.has(t.id)).map((t) => ({ key: t.id, t, jira: { title: t.title, description: t.description } }))
    : await pendingIssues();
  console.log(bold(`\nTriage de ${pending.length} issues · modo ${magenta("direct")}`), dim(`· ${JIRA_MOCK ? yellow("jira MOCK") : `jira real (${projectKey}, solo lectura)`} · todo a Sonnet, sin Jev · llm ${LLM_MOCK ? yellow("MOCK") : green("real")}\n`));
  if (!pending.length) { console.error(red(`No hay issues con etiqueta batch sin terminar en ${projectKey}. Corre npm run seed -- --done=8.`)); process.exit(1); }

  const t0 = performance.now();
  // Concurrencia acotada: con CLAUDE_ENGINE=cli cada ticket abre un proceso `claude -p`.
  const results = await mapLimit(pending, Number(arg("concurrency") ?? 4), async ({ key, t, jira }) => ({ key, t, c: await classifyTicketDirect(jira.title, jira.description, t.reporter) }));
  const totalMs = Math.round(performance.now() - t0);

  const rows = results.map(({ key, t, c }) => {
    const ok = c.error ? red("✗ " + c.error.slice(0, 30))
      : t.ambiguous ? (c.action === "escalate" ? green("✓ escalado") : yellow("~ no escaló"))
      : t.expected && t.expected.tipo === c.tipo && t.expected.equipo === c.equipo ? green("✓") : yellow("~");
    return [cyan(key), t.title.slice(0, 44), c.tipo, c.prioridad, c.equipo, c.needsHuman ? "sí" : "no", colorAction(c.action), `${c.input_tokens}/${c.output_tokens}`, `${c.ms}`, ok];
  });
  // Sin columna de confianza: el LLM no da probabilidades. Es lo primero que se nota al ponerla junto a la de Jev.
  console.log(table(["Key", "Ticket", "Tipo", "Prioridad", "Equipo", "Humano", "Acción", "Tokens in/out", "ms", "vs esperado"], rows, { align: ["l", "l", "l", "l", "l", "l", "l", "r", "r", "l"] }));

  const inTok = results.reduce((s, r) => s + r.c.input_tokens, 0), outTok = results.reduce((s, r) => s + r.c.output_tokens, 0);
  const cost = results.reduce((s, r) => s + llmCost(r.c.model, r.c.input_tokens, r.c.output_tokens), 0);
  const graded = results.filter((r) => r.t.expected && !r.t.ambiguous);
  const hits = graded.filter((r) => r.t.expected!.tipo === r.c.tipo && r.t.expected!.equipo === r.c.equipo).length;
  const count = (a: string) => results.filter((r) => r.c.action === a).length;
  console.log(`
${bold("Totales")}  direct
  Tickets          ${bold(num(results.length))}
  Tiempo total     ${bold(num(totalMs))} ms
  Tokens LLM       ${num(inTok)} in / ${num(outTok)} out
  Costo estimado   ${bold(usd(cost))} USD
  Acciones         ${green(count("apply") + " apply")} · ${red(count("escalate") + " escalate")} ${gray("(sin probabilidades no hay apply_and_flag)")}
  Tipo+equipo OK   ${hits}/${graded.length} ${gray("(contra el campo expected de tickets.json)")}
`);

  mkdirSync("results", { recursive: true });
  writeFileSync("results/triage-direct.json", JSON.stringify({ at: new Date().toISOString(), mode: "direct", mock: LLM_MOCK, totalMs, tokens: { input: inTok, output: outTok }, cost, results: results.map((r) => ({ key: r.key, id: r.t.id, title: r.t.title, ...r.c })) }, null, 2));
  console.log(dim("→ results/triage-direct.json"));
}
