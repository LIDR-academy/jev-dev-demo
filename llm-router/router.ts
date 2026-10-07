import { askJev, choice, noul } from "../shared/jev.ts";
import { routeFor, type Route } from "../shared/thresholds.ts";

export type PR = {
  id: string; number?: number; url?: string; title: string; author?: string; mergedAt?: string;
  files: string[]; changedFiles?: number; additions: number; deletions: number; body?: string; diffSummary: string;
  expected?: string;
};

export type RouteDecision = {
  route: Route; reason: string;
  complejidad: string; confidence: number; touchesMoney: number;
  probabilities: Record<string, number>;
  jevMs: number; jevTokens: number; mock?: boolean;
};

/** Una sola llamada a Jev por PR, dos preguntas. Milisegundos y centavos. */
export async function routePR(pr: PR): Promise<RouteDecision> {
  const r = await askJev(
    {
      title: pr.title,
      files: pr.files.slice(0, 25),
      changed_files: pr.changedFiles ?? pr.files.length,
      additions: pr.additions,
      deletions: pr.deletions,
      description: (pr.body ?? "").slice(0, 600),
      diff_summary: pr.diffSummary.slice(0, 3000),
    },
    {
      complejidad: choice("¿Qué tan complejo es revisar este cambio con criterio de un revisor senior?", {
        trivial: "Typos, docs, formato, renombrar, bumps de versión rutinarios, cambios sin lógica",
        media: "Refactor acotado, endpoint nuevo, lógica simple, pruebas, i18n con lógica",
        alta: "Pagos, reembolsos, créditos, auth/sesiones, migraciones, concurrencia, colas, seguridad, cambios que tocan muchos paquetes",
      }),
      touches_money: noul("¿El cambio toca cobros, pagos, reembolsos, créditos, gift cards o datos financieros?", {
        true: "Modifica flujos o registros de dinero",
        false: "No toca dinero",
      }),
    },
    "demo-router"
  );
  const c = r.answers.complejidad;
  const money = r.answers.touches_money.noul;
  const { route, reason } = routeFor(c.choice, c.confidence, money);
  return { route, reason, complejidad: c.choice, confidence: c.confidence, touchesMoney: money, probabilities: c.probabilities, jevMs: r.ms, jevTokens: r.usage.input_tokens, mock: r.mock };
}
