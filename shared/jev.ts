/**
 * Cliente mínimo de Jev (TypeSafe AI) sobre fetch. Sin SDK.
 * Contrato: POST /v1/systemone { model, state, questions } → { answers, usage }.
 *
 * MOCK: con JEV_MOCK=1 (o --mock) no llama a la API; responde con reglas
 * simples para que la demo se pueda ensayar sin llave y sin red.
 */

export type ChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string | null> };
export type NoulQuestion = { type: "noul"; instructions: string; criteria?: { true: string; false: string } };
export type ScoreQuestion = { type: "score"; instructions: string; criteria: string[] };
export type Question = ChoiceQuestion | NoulQuestion | ScoreQuestion;

export type ChoiceAnswer = { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
export type NoulAnswer = { type: "noul"; noul: number };
export type ScoreAnswer = { type: "score"; score: number; confidence: number; legend: Record<string, string>; probabilities: Record<string, number> };
export type Answer = ChoiceAnswer | NoulAnswer | ScoreAnswer;

export type JevResult<Q extends Record<string, Question>> = {
  id?: string;
  model: string;
  answers: { [K in keyof Q]: Q[K] extends ChoiceQuestion ? ChoiceAnswer : Q[K] extends NoulQuestion ? NoulAnswer : ScoreAnswer };
  usage: { input_tokens: number; output_tokens: number };
  ms: number;
  mock?: boolean;
};

const BASE_URL = process.env.JEV_BASE_URL ?? "https://api.typesafe.ai";
const MODEL = process.env.JEV_MODEL ?? "jev-1.13.0";
export const MOCK = process.env.JEV_MOCK === "1" || process.argv.includes("--mock");

export const choice = (instructions: string, criteria: Record<string, string | null>): ChoiceQuestion => ({ type: "choice", instructions, criteria });
export const noul = (instructions: string, criteria?: { true: string; false: string }): NoulQuestion => ({ type: "noul", instructions, criteria });
export const score = (instructions: string, criteria: string[]): ScoreQuestion => ({ type: "score", instructions, criteria });

export async function askJev<Q extends Record<string, Question>>(state: unknown, questions: Q, user = "jev-dev-demo"): Promise<JevResult<Q>> {
  const t0 = performance.now();
  if (MOCK) {
    const r = mockAnswer(state, questions);
    await new Promise((res) => setTimeout(res, 120 + Math.random() * 180)); // latencia realista
    return { ...r, ms: Math.round(performance.now() - t0), mock: true } as JevResult<Q>;
  }
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("Falta TYPESAFE_API_KEY en .env (o usa --mock)");

  const res = await fetch(`${BASE_URL}/v1/systemone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, state, questions, user }),
  });
  if (!res.ok) throw new Error(`Jev ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as Omit<JevResult<Q>, "ms">;
  return { ...data, ms: Math.round(performance.now() - t0) };
}

/** Estimación de costo de una llamada a Jev (solo cobra input). */
export function jevCost(inputTokens: number, pricePerM = Number(process.env.JEV_PRICE_PER_M ?? 0.1)) {
  return (inputTokens / 1e6) * pricePerM;
}

// ─────────────────────────── MOCK ───────────────────────────
// Heurísticas por palabras clave. No pretenden ser buenas: solo hacen que la demo
// se mueva sin red. Con la llave real, Jev decide de verdad.
function mockAnswer(state: unknown, questions: Record<string, Question>) {
  const st = (state ?? {}) as Record<string, unknown>;
  // Solo título + descripción/diff: nunca campos como "reporter", que contaminan las palabras clave.
  const text = [st.title, st.description, st.diff_summary, (st.files as string[] | undefined)?.join(" ")].filter(Boolean).join(" ").toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));
  const vague = text.replace(/[^a-záéíóúñ ]/g, " ").split(/\s+/).filter(Boolean).length < 8;
  const answers: Record<string, Answer> = {};

  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "noul") {
      let p = 0.06 + Math.random() * 0.06;
      if (/humano|ambig|persona/.test(q.instructions) && (vague || has("no funciona", "esto es normal", "no sé cuándo", "y arreglar"))) p = 0.78 + Math.random() * 0.12;
      const filesM = (st.files as string[] | undefined) ?? [];
      const docsM = filesM.length > 0 && filesM.every((f) => /\.(md|mdx)$/i.test(f) || f.startsWith("www/") || f.startsWith("docs/") || f.startsWith(".changeset/"));
      if (!docsM && /dinero|cobro|reembols|financ|money/i.test(q.instructions) && has("payment", "refund", "reembols", "cobr", "checkout", "cupón", "store credit", "store-credit", "gift card", "gift-card", "settlement", "balance", "loyalty", "pago"))
        p = 0.7 + Math.random() * 0.2;
      answers[name] = { type: "noul", noul: round(p) };
      continue;
    }
    if (q.type === "score") {
      const n = q.criteria.length;
      const idx = Math.min(n - 1, Math.floor(text.length / 120));
      const probs = Object.fromEntries(q.criteria.map((_, i) => [String(i), i === idx ? 0.7 : 0.3 / (n - 1)]));
      answers[name] = { type: "score", score: idx + 0.3, confidence: 0.7, legend: Object.fromEntries(q.criteria.map((c, i) => [String(i), c])), probabilities: probs };
      continue;
    }
    // choice
    const opts = Object.keys(q.criteria);
    let pick = opts[0];
    let conf = 0.84 + Math.random() * 0.13;
    const want = (o: string) => opts.includes(o);

    if (want("bug")) {
      if (has("¿cómo", "¿puedo", "no me llega", "pregunta ", "no encuentra el botón")) pick = "soporte";
      else if (has("falla", "error", "no funciona", "duplicad", "se encima", "pixelead", "tarda", "expira", "retraso", "vacías", "no encuentra", "deja de", "se registra como", "se aplica dos", "sale con")) pick = "bug";
      else if (has("migrar", "refactor", "dependencias", "pruebas end", "retención", "logs de", "actualizar dep")) pick = "deuda_tecnica";
      else if (has("agregar", "dashboard", "modo oscuro", "página de", "botón de", "facturación", "métricas", "pago con", "soporte de", "permitir")) pick = "feature";
      else pick = "soporte";
    } else if (want("critica")) {
      if (has("cobra dos veces", "duplicad", "todos los usuarios", "en producción", "14 pedidos", "se aplica dos")) pick = "critica";
      else if (has("vulnerabilidad", "safari", "expira", "fiscal", "reembolso", "oxxo", "cfdi", "end-to-end", "no se renueva")) pick = "alta";
      else if (has("¿", "pixelead", "modo oscuro", "spam", "dominio", "cosmét")) pick = "baja";
      else pick = "media";
    } else if (want("pagos")) {
      if (has("pago", "checkout", "cobr", "reembols", "cupón", "factur", "oxxo", "amex", "tarjeta", "pedidos duplicados")) pick = "pagos";
      else if (has("carrusel", "botón", "imágenes", "modo oscuro", "página de rastreo", "whatsapp", "móvil", "menú", "pixelead")) pick = "frontend";
      else if (has("reporte de", "export", "métricas", "búsqueda", "excel", "csv", "dashboard", "abandono")) pick = "datos";
      else pick = "plataforma";
    } else if (want("trivial")) {
      const adds = Number(st.additions ?? 0), dels = Number(st.deletions ?? 0), files = (st.files as string[] | undefined) ?? [];
      const docsOnly = files.length > 0 && files.every((f) => /\.(md|mdx)$/i.test(f) || f.startsWith("www/") || f.startsWith("docs/") || f.startsWith(".changeset/"));
      const touchy = has("payment", "refund", "pago", "reembols", "migration", "auth/", "session", "token", "idempot", "concurren", "sqs", "ledger", "store credit", "store-credit", "gift card", "gift-card", "loyalty", "settlement");
      const bigChore = files.length > 30;
      if (docsOnly || (adds + dels <= 12 && !touchy) || has("typo", "readme", "copyright", ".gitignore", "prettier", "console.log", "fix links", "locale", "tagline")) pick = "trivial";
      else if (touchy || adds + dels > 300 || bigChore) pick = "alta";
      else pick = "media";
      if (has("bump") && !has("security", "ghsa", "patched")) pick = "trivial";
      if (has("bump") && has("security", "ghsa", "patched")) pick = "media";
    }
    if (vague && want("bug")) conf = 0.4 + Math.random() * 0.12;
    const rest = (1 - conf) / Math.max(1, opts.length - 1);
    const probabilities = Object.fromEntries(opts.map((o) => [o, o === pick ? conf : rest]));
    answers[name] = { type: "choice", choice: pick, confidence: round(conf), probabilities: mapVals(probabilities, round) };
  }
  const input_tokens = Math.round(JSON.stringify({ state, questions }).length / 3.6);
  return { id: "decision_mock", model: `${MODEL} (mock)`, answers, usage: { input_tokens, output_tokens: Object.keys(questions).length * 2 } };
}
const round = (n: number) => Math.round(n * 100) / 100;
const mapVals = <T, U>(o: Record<string, T>, f: (v: T) => U) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
