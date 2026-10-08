import { askJev, choice, noul } from "../shared/jev.ts";
import { decide, type Action } from "../shared/thresholds.ts";

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
