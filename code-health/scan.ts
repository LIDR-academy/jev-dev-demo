/**
 * Demo 2 — Pre-vuelo: bugs que YA existen en el código que vas a tocar para una tarea.
 *
 *   npm run scan -- --ticket=T03            → archivos de data/tickets-files.json para ese ticket
 *   npm run scan -- --files=sample-app/payments/refund.ts,sample-app/payments/tax.ts
 *   npm run scan -- --ticket=T03 --explain  → las funciones marcadas van a Claude para explicación y propuesta de refactor
 *   npm run scan -- --ticket=T03 --mock
 *
 * Patrón: por cada función, Jev responde 6 preguntas tipadas en una sola llamada (milisegundos, centavos).
 * Solo lo que Jev marca con probabilidad alta va al LLM. Jev encuentra dónde buscar; Claude encuentra qué.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { askJev, choice, noul, score, jevCost, MOCK as JEV_MOCK } from "../shared/jev.ts";
import { splitFunctions, cheapSignals, similarTo, type Fn } from "./split.ts";
import { explainFinding, LLM_MOCK } from "./explain.ts";
import { table, bold, dim, green, yellow, red, cyan, gray, magenta, usd, num } from "../shared/ui.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const TICKET = arg("ticket");
const EXPLAIN = process.argv.includes("--explain");
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

const QUESTIONS = {
  responsabilidades: choice("¿Cuántas responsabilidades distintas tiene esta función? (principio de responsabilidad única)", {
    una: "Hace una cosa: validar, o calcular, o llamar a un servicio, o persistir, o notificar",
    varias: "Mezcla dos o más: por ejemplo calcula dinero Y manda correo Y escribe logs/métricas Y cambia estado",
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
    true: "Hace lo mismo que otra función listada pero con fórmula o redondeo distinto",
    false: "No hay función similar o la similitud es superficial",
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

// 2) Jev por función, en paralelo
const t0 = performance.now();
const findings: Finding[] = await Promise.all(
  all.map(async ({ file, fn }) => {
    const signals = cheapSignals(fn);
    const similar = similarTo(fn, all.map((a) => a.fn));
    const r = await askJev(
      { file, function: fn.name, lines: fn.lines, params: fn.params, signals, similar_to: similar.map((s) => ({ name: s.name, lines: s.lines, head: s.source.split("\n").slice(0, 6).join("\n") })), source: fn.source.slice(0, 6000) },
      QUESTIONS,
      "demo-prevuelo"
    );
    const a = r.answers;
    const flags: { key: string; p: number }[] = [];
    if (a.responsabilidades.choice === "varias" && a.responsabilidades.confidence >= THRESHOLD) flags.push({ key: "varias_responsabilidades", p: a.responsabilidades.confidence });
    for (const k of ["traga_errores", "muta_entrada", "numero_magico", "logica_duplicada"] as const) if (a[k].noul >= THRESHOLD) flags.push({ key: k, p: a[k].noul });
    return { file, fn, signals, answers: a, flags, severity: a.severidad.score, jevMs: r.ms, jevTokens: r.usage.input_tokens };
  })
);
const jevMs = Math.round(performance.now() - t0);

// 3) Tabla
findings.sort((x, y) => y.severity - x.severity || y.flags.length - x.flags.length);
const sevColor = (s: number) => (s >= 2.5 ? red : s >= 1.5 ? yellow : s >= 0.8 ? gray : green);
const rows = findings.map((f) => [
  cyan(f.file.replace("sample-app/", "")),
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
  for (const f of flagged) {
    const e = await explainFinding(f.file, f.fn, f.flags, ticketTitle);
    f.explanation = e; llmIn += e.input_tokens; llmOut += e.output_tokens;
    console.log(`${magenta("■")} ${bold(f.fn.name)} ${dim(`(${f.file})`)} ${gray(`${e.model} · ${e.input_tokens} in / ${e.output_tokens} out`)}`);
    console.log("  " + e.text.split("\n").join("\n  ") + "\n");
  }
  console.log(dim(`LLM: ${num(llmIn)} in / ${num(llmOut)} out tokens en ${flagged.length} llamadas; ${findings.length - flagged.length} funciones no costaron nada.`));
}

// 5) Contra lo sembrado (solo para el ensayo)
try {
  const seeded = JSON.parse(readFileSync("data/bugs-sembrados.json", "utf8"));
  const expected = seeded.bugs.filter((b: any) => files.includes(b.file));
  const hit = expected.filter((b: any) => findings.some((f) => f.file === b.file && f.fn.name === b.function && f.flags.some((x) => x.key === b.type || (b.type === "logica_sospechosa" && f.severity >= 1.5))));
  const falsePos = seeded.controles.filter((c: any) => findings.some((f) => f.file === c.file && f.fn.name === c.function && f.flags.length));
  console.log(dim(`\nContra bugs-sembrados.json: ${hit.length}/${expected.length} detectados · falsos positivos en controles: ${falsePos.length}`));
} catch {}

mkdirSync("results", { recursive: true });
writeFileSync("results/code-health.json", JSON.stringify({ at: new Date().toISOString(), ticket: TICKET, ticketTitle, files, mock: JEV_MOCK, jevMs, jevTokens: tokens, jevCost: jevCost(tokens), findings: findings.map((f) => ({ file: f.file, function: f.fn.name, lines: f.fn.lines, flags: f.flags, severity: f.severity, answers: f.answers, jevMs: f.jevMs, jevTokens: f.jevTokens, explanation: f.explanation })) }, null, 2));
console.log(dim("→ results/code-health.json"));
