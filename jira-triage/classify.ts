import { askJev, choice, noul } from "../shared/jev.ts";
import { decide, type Action } from "../shared/thresholds.ts";
import { callClaude } from "../shared/claude.ts";
import { LLM_MOCK } from "../llm-router/llm.ts";

export const TEAM_LEADS: Record<string, string | undefined> = {
  pagos: process.env.LEAD_PAGOS,
  plataforma: process.env.LEAD_PLATAFORMA,
  frontend: process.env.LEAD_FRONTEND,
  datos: process.env.LEAD_DATOS,
};

/** Las cuatro preguntas tipadas de la demo 1. Opciones cerradas; Jev elige una y da probabilidad. */
export const TICKET_QUESTIONS = {
  tipo: choice("¿Qué tipo de issue es?", {
    bug: "Algo que antes funcionaba y ahora falla",
    feature: "Funcionalidad nueva solicitada",
    deuda_tecnica: "Refactor, limpieza, dependencias, pruebas automatizadas, cumplimiento o mejora interna sin cambio visible para el cliente",
    soporte: "Pregunta o duda de uso, sin cambio de código",
  }),
  // En inglés y con ejemplos concretos: con criterios vagos Jev real daba "alta" a casi todo con poca confianza.
  prioridad: choice("What priority does this ticket deserve? Judge the business impact today, not how alarming the wording sounds.", {
    critica: "Money or orders are wrong or blocked right now in production: payments fail for a whole card brand, customers are charged twice, discounts or orders are duplicated. Must be fixed today.",
    alta: "Important but not losing money right now: a key flow broken for one segment (e.g. login on one browser, sessions expiring), security vulnerabilities, legal or tax obligations, or work that protects or unlocks revenue (new payment methods, test coverage of checkout).",
    media: "Annoying but with a workaround or limited reach: slow reports, layout glitches on one device, search or export edge cases, delayed notifications, internal refactors, search that misses some results, new dashboards, or new customer-facing pages and buttons that are useful but not urgent.",
    baja: "Cosmetic, a how-to question, or a nice-to-have with little impact: dark mode, slightly blurry images on some screens, questions about how to use the product.",
  }),
  equipo: choice("¿Qué equipo debe atenderlo?", {
    pagos: "Checkout, pasarelas, tarjetas, cupones, facturación, reembolsos",
    plataforma: "Infra, autenticación, sesiones, APIs internas, colas, notificaciones, rendimiento",
    frontend: "UI web o móvil, estilos, imágenes, navegación, páginas o botones nuevos que ve el cliente",
    datos: "Reportes, métricas, búsqueda, exportaciones, pipelines",
  }),
  needs_human: noul("¿El ticket es demasiado ambiguo o contradictorio para clasificarlo sin una persona?", {
    true: "Falta información clave, está vacío o pide dos cosas distintas",
    false: "Tiene suficiente detalle para decidir",
  }),
};

export type Classification = {
  tipo: string; prioridad: string; equipo: string;
  confidence: { tipo: number; prioridad: number; equipo: number; min: number };
  needsHuman: number;
  action: Action;
  assignee?: string;
  labels: string[];
  ms: number;
  inputTokens: number;
  mock?: boolean;
};

export async function classifyTicket(title: string, description: string, reporter = "desconocido"): Promise<Classification> {
  const r = await askJev({ title, description, reporter }, TICKET_QUESTIONS, "demo-jira");
  const { tipo, prioridad, equipo, needs_human } = r.answers;
  const min = Math.min(tipo.confidence, prioridad.confidence, equipo.confidence);
  const action = decide(min, needs_human.noul);
  const labels = ["jev", ...(action !== "apply" ? ["revisar"] : [])];
  const assignee = action === "escalate" ? process.env.LEAD_TRIAGE : TEAM_LEADS[equipo.choice];
  return {
    tipo: tipo.choice, prioridad: prioridad.choice, equipo: equipo.choice,
    confidence: { tipo: tipo.confidence, prioridad: prioridad.confidence, equipo: equipo.confidence, min },
    needsHuman: needs_human.noul, action, assignee, labels, ms: r.ms, inputTokens: r.usage.input_tokens, mock: r.mock,
  };
}

/** El comentario que Jev deja en el ticket. Es lo que abres en el minuto 6–8. */
export function buildComment(c: Classification, model = process.env.JEV_MODEL ?? "jev-1.13.0") {
  const p = (n: number) => `${Math.round(n * 100)} %`;
  const actionText = { apply: "aplicado directo", apply_and_flag: "aplicado y marcado para revisión", escalate: "sin cambios; asignado a triage humano" }[c.action];
  return [
    `🤖 Triage automático (${model}${c.mock ? " · MOCK" : ""}, ${c.ms} ms, ${c.inputTokens} tokens)`,
    `• Tipo: ${c.tipo} (${p(c.confidence.tipo)})`,
    `• Prioridad: ${c.prioridad} (${p(c.confidence.prioridad)})`,
    `• Equipo: ${c.equipo} (${p(c.confidence.equipo)})`,
    `• ¿Necesita revisión humana? ${p(c.needsHuman)}`,
    `Acción: ${actionText}.`,
  ].join("\n");
}

// ─────────────── El "antes": el mismo triage con un LLM (npm run batch -- --mode=direct) ───────────────
//
// Así se hace hoy con IA: un prompt a Sonnet que pide la clasificación en JSON. Para que la comparación sea justa,
// el prompt lleva exactamente las mismas opciones y descripciones que las preguntas a Jev (TICKET_QUESTIONS).
// La diferencia que importa en la demo: el LLM devuelve una respuesta, no una probabilidad. No hay confianza que
// comparar con un umbral, así que tu código solo puede aplicar o escalar si el propio LLM dice que necesita humano.

const DIRECT_MODEL = process.env.MODEL_LARGE ?? "claude-sonnet-5-5";

export type DirectClassification = {
  tipo: string; prioridad: string; equipo: string; needsHuman: boolean;
  action: Action;
  model: string; input_tokens: number; output_tokens: number; ms: number;
  error?: string; mock?: boolean;
};

/** Las opciones de una pregunta de Jev como líneas de texto para el prompt: "- bug: Algo que antes funcionaba…". */
const options = (q: { criteria?: Record<string, string | null> }) => Object.entries(q.criteria ?? {}).map(([k, v]) => `  - ${k}: ${v}`).join("\n");

export const directTicketPrompt = (title: string, description: string, reporter: string) => `Clasifica este ticket de soporte de una tienda en línea. Responde SOLO con un objeto JSON, sin texto antes ni después:
{"tipo": "...", "prioridad": "...", "equipo": "...", "needs_human": true|false}

tipo — ${TICKET_QUESTIONS.tipo.instructions}
${options(TICKET_QUESTIONS.tipo)}
prioridad — ${TICKET_QUESTIONS.prioridad.instructions}
${options(TICKET_QUESTIONS.prioridad)}
equipo — ${TICKET_QUESTIONS.equipo.instructions}
${options(TICKET_QUESTIONS.equipo)}
needs_human — ${TICKET_QUESTIONS.needs_human.instructions}
${options(TICKET_QUESTIONS.needs_human)}

Ticket:
Título: ${title}
Descripción: ${description}
Reportado por: ${reporter}`;

/**
 * Lee la respuesta del LLM. Tolera texto alrededor o un bloque ```json; si falta un campo o trae una opción que no
 * existe, lo devuelve como error: un LLM no garantiza el formato, Jev sí (siempre elige una de las opciones).
 */
export function parseDirectTicket(text: string): Pick<DirectClassification, "tipo" | "prioridad" | "equipo" | "needsHuman"> {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("la respuesta no trae JSON");
  const d = JSON.parse(json);
  for (const k of ["tipo", "prioridad", "equipo"] as const) {
    const valid = Object.keys(TICKET_QUESTIONS[k].criteria);
    if (!valid.includes(d[k])) throw new Error(`${k} inválido: ${JSON.stringify(d[k])}`);
  }
  return { tipo: d.tipo, prioridad: d.prioridad, equipo: d.equipo, needsHuman: d.needs_human === true || d.needs_human === "true" };
}

export async function classifyTicketDirect(title: string, description: string, reporter = "desconocido"): Promise<DirectClassification> {
  const prompt = directTicketPrompt(title, description, reporter);
  const t0 = performance.now();
  if (LLM_MOCK) {
    // En mock tomamos las etiquetas de las heurísticas de Jev mock y estimamos tokens (~3.6 caracteres por token).
    const c = await classifyTicket(title, description, reporter);
    return { tipo: c.tipo, prioridad: c.prioridad, equipo: c.equipo, needsHuman: c.needsHuman >= 0.5, action: c.needsHuman >= 0.5 ? "escalate" : "apply", model: `${DIRECT_MODEL} (mock)`, input_tokens: Math.round(prompt.length / 3.6), output_tokens: 40, ms: Math.round(performance.now() - t0), mock: true };
  }
  const out = await callClaude(DIRECT_MODEL, prompt, 200);
  const base = { model: out.model, input_tokens: out.input_tokens, output_tokens: out.output_tokens, ms: Math.round(performance.now() - t0) };
  try {
    const c = parseDirectTicket(out.text);
    // Sin probabilidades no hay "aplicar y marcar para revisión": o confías en la respuesta o la escalas.
    return { ...c, action: c.needsHuman ? "escalate" : "apply", ...base };
  } catch (e: any) {
    return { tipo: "?", prioridad: "?", equipo: "?", needsHuman: true, action: "escalate", error: e.message, ...base };
  }
}
