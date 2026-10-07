/**
 * Revisión de código con Claude vía Messages API (fetch, sin SDK) o con reglas locales (sin LLM).
 * Con ANTHROPIC_MOCK=1 (o --mock) devuelve una revisión de mentira con tokens estimados realistas.
 */
import type { PR } from "./router.ts";
import type { Route } from "../shared/thresholds.ts";

export type Review = { model: string; text: string; input_tokens: number; output_tokens: number; ms: number; mock?: boolean };

const MODEL_SMALL = process.env.MODEL_SMALL ?? "claude-haiku-4-5";
const MODEL_LARGE = process.env.MODEL_LARGE ?? "claude-sonnet-4-5";
export const LLM_MOCK = process.env.ANTHROPIC_MOCK === "1" || process.argv.includes("--mock");

export const modelFor = (route: Route) => (route === "haiku" ? MODEL_SMALL : route === "sonnet" ? MODEL_LARGE : "rules");

const PROMPT = (pr: PR) => `Eres un revisor de código senior. Revisa esta pull request y responde en español, en máximo 180 palabras:
1) Riesgo principal (o "ninguno relevante").
2) Hasta 3 observaciones concretas con archivo.
3) Veredicto: aprobar / aprobar con cambios / pedir cambios.

Título: ${pr.title}
Archivos (${pr.changedFiles ?? pr.files.length}): ${pr.files.join(", ")}
+${pr.additions} / -${pr.deletions}
Descripción: ${(pr.body ?? "").slice(0, 800) || "(sin descripción)"}

Diff (recortado):
${pr.diffSummary}`;

export async function reviewPR(pr: PR, route: Route): Promise<Review> {
  const t0 = performance.now();
  if (route === "rules") return { ...rulesReview(pr), ms: Math.round(performance.now() - t0) };

  const model = modelFor(route);
  if (LLM_MOCK) {
    // Tokens estimados: ~1 token cada 3.6 caracteres de prompt; salida ~250 (haiku) / ~450 (sonnet)
    const input_tokens = Math.round(PROMPT(pr).length / 3.6) + 40;
    const output_tokens = route === "haiku" ? 180 + Math.round(Math.random() * 80) : 380 + Math.round(Math.random() * 120);
    await new Promise((r) => setTimeout(r, route === "haiku" ? 600 : 1400));
    return { model: `${model} (mock)`, text: `[MOCK ${model}] Revisión simulada de "${pr.title}". Riesgo: ${route === "sonnet" ? "medio-alto, revisar manejo de errores y pruebas" : "bajo"}. Veredicto: aprobar con cambios.`, input_tokens, output_tokens, ms: Math.round(performance.now() - t0), mock: true };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en .env (o usa --mock)");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: "user", content: PROMPT(pr) }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return {
    model: data.model ?? model,
    text: (data.content ?? []).map((b: any) => b.text ?? "").join(""),
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
    ms: Math.round(performance.now() - t0),
  };
}

/** Ruta "rules": checklist local. Cero tokens. */
export function rulesReview(pr: PR): Omit<Review, "ms"> {
  const checks = [
    [`Tiene descripción`, Boolean(pr.body && pr.body.length > 20)],
    [`Tamaño pequeño (≤ 100 líneas)`, pr.additions + pr.deletions <= 100],
    [`No toca archivos sensibles`, !pr.files.some((f) => /payment|refund|auth|session|migration|\.env|secret/i.test(f))],
    [`Sin console.log en el diff`, !/\+.*console\.log/.test(pr.diffSummary)],
    [`Sin TODO/FIXME nuevos`, !/\+.*(TODO|FIXME)/.test(pr.diffSummary)],
  ] as const;
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  const text = [
    `Checklist automático (sin LLM):`,
    ...checks.map(([n, ok]) => `  ${ok ? "✓" : "✗"} ${n}`),
    failed.length ? `Veredicto: aprobar con cambios (${failed.length} punto(s)).` : `Veredicto: aprobar.`,
  ].join("\n");
  return { model: "rules", text, input_tokens: 0, output_tokens: 0 };
}
