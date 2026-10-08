/** Claude explica solo las funciones que Jev marcó. Reusa el transporte de llm-router/llm.ts. */
import type { Fn } from "./split.ts";
export { LLM_MOCK } from "../llm-router/llm.ts";

const MODEL = process.env.MODEL_LARGE ?? "claude-sonnet-4-5";
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY (o usa --mock)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return { model: data.model ?? MODEL, text: (data.content ?? []).map((b: any) => b.text ?? "").join(""), input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0, ms: Math.round(performance.now() - t0) };
}
