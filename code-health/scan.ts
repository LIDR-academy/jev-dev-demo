/**
 * Demo 2 — Pre-vuelo: bugs que YA existen en el código que vas a tocar para una tarea.
 *
 *   npm run scan -- --ticket=T03            → archivos de data/tickets-files.json para ese ticket
 *   npm run scan -- --files=a.ts,b.ts
 *   npm run scan -- --ticket=T03 --explain  → las funciones marcadas van a Claude para explicación y propuesta de refactor
 *   npm run scan -- --ticket=T03 --mock
 *   npm run scan -- --ticket=T03 --mode=direct  → el "antes": Claude revisa las 58 funciones, sin Jev (se precalcula)
 *
 * Patrón: por cada función, Jev responde 6 preguntas tipadas en una sola llamada (milisegundos, centavos).
 * Solo lo que Jev marca con probabilidad alta va al LLM. Jev encuentra dónde buscar; Claude encuentra qué.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { askJev, choice, noul, score, jevCost, MOCK as JEV_MOCK } from "../shared/jev.ts";
import { splitFunctions, cheapSignals, similarTo, type Fn } from "./split.ts";
import { explainFinding, reviewFunctionDirect, LLM_MOCK } from "./explain.ts";
import { llmCost, mapLimit } from "../shared/prices.ts";
import { table, bold, dim, green, yellow, red, cyan, gray, magenta, usd, num } from "../shared/ui.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const TICKET = arg("ticket");
const EXPLAIN = process.argv.includes("--explain");
const MODE = (arg("mode") ?? "jev") as "jev" | "direct";
const THRESHOLD = Number(process.env.SCAN_THRESHOLD ?? 0.6);

let files: string[];
let ticketTitle = "";
if (TICKET) {
  const map = JSON.parse(readFileSync("data/tickets-files.json", "utf8"));
  files = map[TICKET];
  if (!files) { console.error(red(`No hay archivos mapeados para ${TICKET} en data/tickets-files.json`)); process.exit(1); }
  const t = JSON.parse(readFileSync("data/tickets.json", "utf8")).find((x: any) => x.id === TICKET);
  ticketTitle = t?.title ?? "";
} else if (arg("files")) {
  files = arg("files")!.split(",").map((s) => s.trim());
} else { console.error("Uso: --ticket=T03 | --files=a.ts,b.ts"); process.exit(1); }

// "medusa:ruta" → clon local de LIDR-academy/medusa
const MEDUSA = (process.env.MEDUSA_PATH ?? "../medusa-fork").replace(/\/$/, "");
files = files.map((f) => (f.startsWith("medusa:") ? `${MEDUSA}/${f.slice("medusa:".length)}` : f));
const missing = files.filter((f) => !existsSync(f));
if (missing.length) {
  console.error(red(`No encuentro: ${missing.join(", ")}`));
  if (missing.some((f) => f.startsWith(MEDUSA))) console.error(`Clona Medusa: gh repo clone LIDR-academy/medusa ${MEDUSA} -- --depth 1  (o define MEDUSA_PATH en .env)`);
  process.exit(1);
}
/** Ruta corta para la tabla: sin el prefijo de Medusa. */
const short = (f: string) => f.replace(`${MEDUSA}/packages/`, "");

const QUESTIONS = {
  // En inglés y con ejemplos: con el criterio vago, Jev real marcaba como "varias" cualquier orquestación (validar → llamar → mapear).
  responsabilidades: choice("How many unrelated responsibilities does this function have? (single responsibility principle) Judge reasons to change, not number of steps.", {
    una: "One job, even with several steps: validating input, calling one service or repository, and mapping or returning the result is ONE responsibility (orchestration). Thin wrappers, delegations to a provider and transactional wrappers also count as one.",
    varias: "Mixes concerns that change for different reasons in the same body: e.g. computes money AND sends an email AND writes audit logs or metrics AND changes order status, or business rules mixed with formatting of notifications.",
  }),
  traga_errores: noul("¿Captura un error y lo oculta devolviendo éxito o un valor inventado, en vez de propagarlo o reportarlo?", {
    true: "Hay un catch que devuelve ok/true, un id falso o un valor por defecto como si nada hubiera pasado",
    false: "Los errores se propagan, se devuelven como error o se registran de forma explícita",
  }),
  muta_entrada: noul("¿Modifica directamente un objeto o arreglo que recibió como parámetro?", {
    true: "Asigna propiedades o hace push sobre un parámetro; quien llamó ve el cambio",
    false: "Trabaja sobre copias o devuelve valores nuevos",
  }),
  numero_magico: noul("¿Usa números literales con significado de negocio sin nombre (tasas, umbrales, porcentajes)?", {
    true: "Aparecen literales como 0.16, 1.16, 0.9 que representan impuestos, umbrales o reglas de negocio",
    false: "Los números están nombrados como constantes o son triviales (0, 1, 100 para redondear)",
  }),
  logica_duplicada: noul("Considerando las funciones similares listadas en similar_to, ¿duplica lógica que ya existe en otra función, con variaciones sutiles?", {
    true: "Reimplementa el mismo cálculo o regla de negocio que otra función listada, pero con fórmula, redondeo o condición distinta",
    false: "No hay función similar, o la similitud es estructural: un método público que delega en su versión privada (create/create_), varios métodos que llaman al mismo proveedor con distinto método, o CRUD con la misma forma",
  }),
  severidad: score("Si un desarrollador toca esta función para la tarea, ¿qué tan probable es que los problemas detectados causen un bug en producción?", [
    "Ninguno: la función está limpia",
    "Bajo: deuda de estilo, no afecta el comportamiento",
    "Medio: puede producir resultados incorrectos en casos borde",
    "Alto: produce cobros, estados o montos incorrectos en casos normales",
  ]),
};

type Finding = { file: string; fn: Fn; signals: ReturnType<typeof cheapSignals>; answers: any; flags: { key: string; p: number }[]; severity: number; jevMs: number; jevTokens: number; explanation?: { model: string; text: string; input_tokens: number; output_tokens: number } };

console.log(bold(`\nPre-vuelo${TICKET ? ` para ${TICKET}` : ""}`), ticketTitle ? dim(`"${ticketTitle}"`) : "", dim(`· ${files.length} archivos · jev ${JEV_MOCK ? yellow("MOCK") : green("real")}${EXPLAIN ? ` · llm ${LLM_MOCK ? yellow("MOCK") : green("real")}` : ""}\n`));

// 1) Partir en funciones
const all: { file: string; fn: Fn }[] = [];
for (const f of files) for (const fn of splitFunctions(readFileSync(f, "utf8"))) all.push({ file: f, fn });
console.log(dim(`${all.length} funciones en ${files.length} archivos`));

if (MODE === "direct") { await runDirect(); process.exit(0); }

// 2) Jev por función, en paralelo
// Caché de respuestas de Jev por función (results/.scan-cache.json): así `--explain` reutiliza lo que Jev dijo en el
// escaneo anterior y los números coinciden en pantalla. npm run reset la borra; --fresh la ignora.
const CACHE_FILE = "results/.scan-cache.json";
const cache: Record<string, any> = !JEV_MOCK && !process.argv.includes("--fresh") && existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {};
let reused = 0;
async function askJevCached(state: any) {
  const key = createHash("sha1").update(JSON.stringify([state, QUESTIONS, process.env.JEV_MODEL ?? ""])).digest("hex");
  if (cache[key]) { reused++; return cache[key]; }
  const r = await askJev(state, QUESTIONS, "demo-prevuelo");
  if (!JEV_MOCK) cache[key] = { answers: r.answers, ms: r.ms, usage: r.usage };
  return r;
}

const t0 = performance.now();
const findings: Finding[] = await Promise.all(
  all.map(async ({ file, fn }) => {
    const signals = cheapSignals(fn);
    const similar = similarTo(fn, all.map((a) => a.fn));
    const r = await askJevCached(
      { file, function: fn.name, lines: fn.lines, params: fn.params, signals, similar_to: similar.map((s) => ({ name: s.name, lines: s.lines, head: s.source.split("\n").slice(0, 6).join("\n") })), source: fn.source.slice(0, 6000) }
    );
    const a = r.answers;
    const flags: { key: string; p: number }[] = [];
    if (a.responsabilidades.choice === "varias" && a.responsabilidades.confidence >= THRESHOLD) flags.push({ key: "varias_responsabilidades", p: a.responsabilidades.confidence });
    for (const k of ["traga_errores", "muta_entrada", "numero_magico", "logica_duplicada"] as const) if (a[k].noul >= THRESHOLD) flags.push({ key: k, p: a[k].noul });
    return { file, fn, signals, answers: a, flags, severity: a.severidad.score, jevMs: r.ms, jevTokens: r.usage.input_tokens };
  })
);
// Si todo salió de la caché, el tiempo que cuenta es el del escaneo original (la llamada más lenta, en paralelo).
const jevMs = reused === findings.length ? Math.max(...findings.map((f) => f.jevMs)) : Math.round(performance.now() - t0);
if (!JEV_MOCK) { mkdirSync("results", { recursive: true }); writeFileSync(CACHE_FILE, JSON.stringify(cache)); }
if (reused) console.log(dim(`(${reused} respuestas de Jev reutilizadas del escaneo anterior; --fresh para volver a preguntar)`));

// 3) Tabla
findings.sort((x, y) => y.severity - x.severity || y.flags.length - x.flags.length);
const sevColor = (s: number) => (s >= 2.5 ? red : s >= 1.5 ? yellow : s >= 0.8 ? gray : green);
const rows = findings.map((f) => [
  cyan(short(f.file)),
  bold(f.fn.name),
  String(f.fn.lines),
  f.flags.length ? f.flags.map((x) => `${x.key} ${Math.round(x.p * 100)}%`).join(", ") : green("limpia"),
  sevColor(f.severity)(f.severity.toFixed(1)),
  `${f.jevMs}`,
]);
console.log(table(["Archivo", "Función", "Líneas", "Lo que marcó Jev", "Sev.", "ms"], rows, { align: ["l", "l", "r", "l", "r", "r"] }));

const flagged = findings.filter((f) => f.flags.length);
const tokens = findings.reduce((s, f) => s + f.jevTokens, 0);
console.log(`
${bold("Jev")}  ${findings.length} funciones · ${num(jevMs)} ms total · ${num(tokens)} tokens · ${usd(jevCost(tokens))}
      ${red(flagged.length + " marcadas")} · ${green(findings.length - flagged.length + " limpias")} → solo las marcadas van al LLM
`);

// 4) Claude explica solo lo marcado
if (EXPLAIN && flagged.length) {
  console.log(bold(`Claude explica ${flagged.length} funciones marcadas`), dim("(las limpias no gastan tokens)\n"));
  let llmIn = 0, llmOut = 0;
  // En paralelo: la espera es la de la explicación más lenta, no la suma.
  const explanations = await Promise.all(flagged.map((f) => explainFinding(f.file, f.fn, f.flags, ticketTitle)));
  for (const [i, f] of flagged.entries()) {
    const e = explanations[i];
    f.explanation = e; llmIn += e.input_tokens; llmOut += e.output_tokens;
    console.log(`${magenta("■")} ${bold(f.fn.name)} ${dim(`(${short(f.file)})`)} ${gray(`${e.model} · ${e.input_tokens} in / ${e.output_tokens} out`)}`);
    console.log("  " + e.text.split("\n").join("\n  ") + "\n");
  }
  console.log(dim(`LLM: ${num(llmIn)} in / ${num(llmOut)} out tokens en ${flagged.length} llamadas; ${findings.length - flagged.length} funciones no costaron nada.`));
}

mkdirSync("results", { recursive: true });
writeFileSync("results/code-health.json", JSON.stringify({ at: new Date().toISOString(), ticket: TICKET, ticketTitle, files, mock: JEV_MOCK, jevMs, jevTokens: tokens, jevCost: jevCost(tokens), findings: findings.map((f) => ({ file: f.file, function: f.fn.name, lines: f.fn.lines, flags: f.flags, severity: f.severity, answers: f.answers, jevMs: f.jevMs, jevTokens: f.jevTokens, explanation: f.explanation })) }, null, 2));
console.log(dim("→ results/code-health.json"));

/**
 * El "antes" de la demo 2: sin Jev no sabes qué funciones mirar, así que Claude revisa todas. Cada función es una
 * llamada a Sonnet con el código completo. Se corre una vez antes de la sesión y queda en
 * results/code-health-direct.json; `npm run costs` la pone junto a la corrida con Jev.
 */
async function runDirect() {
  console.log(bold(`Modo ${magenta("direct")}: Claude revisa las ${all.length} funciones`), dim(`· sin Jev · llm ${LLM_MOCK ? yellow("MOCK") : green("real")}\n`));
  const t0 = performance.now();
  // Concurrencia acotada: con CLAUDE_ENGINE=cli cada función abre un proceso `claude -p`.
  const reviews = await mapLimit(all, Number(arg("concurrency") ?? 6), async ({ file, fn }) => ({ file, fn, r: await reviewFunctionDirect(file, fn, ticketTitle) }));
  const totalMs = Math.round(performance.now() - t0);

  const flagged = reviews.filter((x) => x.r.flags.length);
  console.log(table(["Archivo", "Función", "Líneas", "Lo que marcó Claude", "Tokens in/out", "ms"],
    flagged.map((x) => [cyan(short(x.file)), bold(x.fn.name), String(x.fn.lines), x.r.flags.join(", "), `${x.r.input_tokens}/${x.r.output_tokens}`, `${x.r.ms}`]),
    { align: ["l", "l", "r", "l", "r", "r"] }));

  const inTok = reviews.reduce((s, x) => s + x.r.input_tokens, 0), outTok = reviews.reduce((s, x) => s + x.r.output_tokens, 0);
  const cost = reviews.reduce((s, x) => s + llmCost(x.r.model, x.r.input_tokens, x.r.output_tokens), 0);
  console.log(`
${bold("Claude")}  ${reviews.length} funciones · ${reviews.length} llamadas · ${(totalMs / 1000).toFixed(1)} s · ${num(inTok)} in / ${num(outTok)} out · ${bold(usd(cost))}
        ${red(flagged.length + " marcadas")} · ${green(reviews.length - flagged.length + " limpias")} → las limpias también costaron: hubo que leerlas para saberlo
`);

  mkdirSync("results", { recursive: true });
  writeFileSync("results/code-health-direct.json", JSON.stringify({ at: new Date().toISOString(), mode: "direct", ticket: TICKET, ticketTitle, files, mock: LLM_MOCK, totalMs, tokens: { input: inTok, output: outTok }, cost,
    findings: reviews.map((x) => ({ file: x.file, function: x.fn.name, lines: x.fn.lines, flags: x.r.flags, review: { model: x.r.model, text: x.r.text, input_tokens: x.r.input_tokens, output_tokens: x.r.output_tokens, ms: x.r.ms } })) }, null, 2));
  console.log(dim("→ results/code-health-direct.json"));
}
