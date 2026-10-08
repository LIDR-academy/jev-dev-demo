/** Claude explica solo las funciones que Jev marcó. Usa el transporte de shared/claude.ts. */
import { cheapSignals, type Fn } from "./split.ts";
export { LLM_MOCK } from "../llm-router/llm.ts";
import { callClaude } from "../shared/claude.ts";

const MODEL = process.env.MODEL_LARGE ?? "claude-sonnet-5-5";
const MOCK = process.env.ANTHROPIC_MOCK === "1" || process.argv.includes("--mock");

const LABELS: Record<string, string> = {
  varias_responsabilidades: "varias responsabilidades (rompe SRP)",
  traga_errores: "captura errores y devuelve éxito",
  muta_entrada: "muta un parámetro de entrada",
  numero_magico: "números mágicos de negocio",
  logica_duplicada: "lógica duplicada con variaciones",
};

export async function explainFinding(file: string, fn: Fn, flags: { key: string; p: number }[], task: string) {
  const prompt = `Eres un revisor senior. Un modelo de decisiones marcó esta función con: ${flags.map((f) => `${LABELS[f.key] ?? f.key} (${Math.round(f.p * 100)} %)`).join("; ")}.
Un desarrollador va a tocar este archivo para la tarea: "${task || "mantenimiento"}".
En español y en máximo 150 palabras: 1) confirma o descarta cada señal con la línea concreta; 2) di qué bug puede causar al hacer la tarea; 3) propón el refactor mínimo (nombres de funciones nuevas si aplica). Sin preámbulos.

Archivo: ${file}
\`\`\`ts
${fn.source}
\`\`\``;

  const t0 = performance.now();
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 900));
    return { model: `${MODEL} (mock)`, text: `[MOCK] ${fn.name}: ${flags.map((f) => LABELS[f.key] ?? f.key).join(", ")}. Propuesta: extraer en funciones pequeñas, nombrar constantes, devolver copias y propagar errores.`, input_tokens: Math.round(prompt.length / 3.6), output_tokens: 160, ms: Math.round(performance.now() - t0) };
  }
  const out = await callClaude(MODEL, prompt, 500);
  return { ...out, ms: Math.round(performance.now() - t0) };
}

// ─────────────── El "antes": Claude revisa TODAS las funciones (npm run scan -- --mode=direct) ───────────────
//
// Sin Jev no hay filtro: para saber dónde están los problemas hay que mandarle cada función al LLM. Le pedimos las
// mismas cinco señales que a Jev, con las mismas claves, para poder contar cuántas marca y compararlas.

export const FLAG_KEYS = Object.keys(LABELS);

export const directReviewPrompt = (file: string, fn: Fn, task: string) => `Eres un revisor senior. Un desarrollador va a tocar este archivo para la tarea: "${task || "mantenimiento"}".
Revisa esta función buscando: ${FLAG_KEYS.map((k) => `${k} (${LABELS[k]})`).join("; ")}.
La primera línea de tu respuesta debe ser exactamente "MARCAS: " seguida de las claves que apliquen separadas por coma, o "MARCAS: ninguna".
Después, solo si marcaste algo, en español y en máximo 150 palabras: 1) confirma cada señal con la línea concreta; 2) di qué bug puede causar al hacer la tarea; 3) propón el refactor mínimo. Sin preámbulos.

Archivo: ${file}
\`\`\`ts
${fn.source}
\`\`\``;

/** Lee la línea "MARCAS: a, b" de la respuesta. Ignora claves inventadas; sin esa línea, cuenta como ninguna. */
export function parseMarcas(text: string): string[] {
  const line = text.match(/MARCAS:\s*(.*)/i)?.[1] ?? "";
  return line.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter((k) => FLAG_KEYS.includes(k));
}

export async function reviewFunctionDirect(file: string, fn: Fn, task: string) {
  const prompt = directReviewPrompt(file, fn, task);
  const t0 = performance.now();
  if (MOCK) {
    // Mock: marca traga_errores si split.ts ve un catch sospechoso; el resto, limpias. Tokens estimados (~3.6 caracteres por token).
    const flags = cheapSignals(fn).catch_swallow_hint ? ["traga_errores"] : [];
    const text = `MARCAS: ${flags.join(", ") || "ninguna"}${flags.length ? `\n[MOCK] ${fn.name}: ${LABELS[flags[0]]}.` : ""}`;
    return { model: `${MODEL} (mock)`, text, flags, input_tokens: Math.round(prompt.length / 3.6), output_tokens: flags.length ? 160 : 8, ms: Math.round(performance.now() - t0) };
  }
  const out = await callClaude(MODEL, prompt, 500);
  return { ...out, flags: parseMarcas(out.text), ms: Math.round(performance.now() - t0) };
}
