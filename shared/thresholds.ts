/**
 * La única función que decide qué hacer con las probabilidades de Jev.
 * Es código tuyo, no del modelo: aquí viven los umbrales que señalas en la demo.
 */
export type Action = "apply" | "apply_and_flag" | "escalate";

export const THRESHOLDS = {
  apply: Number(process.env.THRESHOLD_APPLY ?? 0.7),      // ≥ aplica directo
  flag: Number(process.env.THRESHOLD_FLAG ?? 0.5),        // ≥ aplica y etiqueta "revisar"
  needsHuman: Number(process.env.THRESHOLD_HUMAN ?? 0.5), // Jev dice que falta info
};

export function decide(confidence: number, needsHuman: number, t = THRESHOLDS): Action {
  if (needsHuman >= t.needsHuman) return "escalate";
  if (confidence >= t.apply) return "apply";
  if (confidence >= t.flag) return "apply_and_flag";
  return "escalate";
}

/** Para el router de LLM: ante la duda o si toca dinero, escala al modelo grande. */
export type Route = "rules" | "haiku" | "sonnet";
export const ROUTER = {
  minConfidence: Number(process.env.ROUTER_MIN_CONFIDENCE ?? 0.6),
  moneyThreshold: Number(process.env.ROUTER_MONEY_THRESHOLD ?? 0.5),
};

export function routeFor(complejidad: string, confidence: number, touchesMoney: number, r = ROUTER): { route: Route; reason: string } {
  if (touchesMoney >= r.moneyThreshold) return { route: "sonnet", reason: `toca dinero (${pct(touchesMoney)})` };
  if (confidence < r.minConfidence) return { route: "sonnet", reason: `confianza baja (${pct(confidence)})` };
  if (complejidad === "trivial") return { route: "rules", reason: "trivial → reglas sin LLM" };
  if (complejidad === "media") return { route: "haiku", reason: "media → modelo pequeño" };
  return { route: "sonnet", reason: "alta → modelo grande" };
}

export const pct = (n: number) => `${Math.round(n * 100)} %`;
