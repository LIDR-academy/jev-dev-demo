/**
 * Cliente mínimo de Jira Cloud (REST v3) sobre fetch.
 * Con JIRA_MOCK=1 (o --mock / --dry-run) no toca Jira: imprime lo que haría.
 */
import type { Classification } from "./classify.ts";

const BASE = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
const PROJECT = process.env.JIRA_PROJECT_KEY ?? "DEMO";
const TEAM_FIELD = process.env.JIRA_TEAM_FIELD_ID; // customfield_XXXXX de "Equipo"
export const JIRA_MOCK = process.env.JIRA_MOCK === "1" || process.argv.includes("--mock") || process.argv.includes("--dry-run");

// Mapeo de las opciones de Jev a los nombres que Jira espera. Ajusta a tu proyecto.
// Proyecto KAN (team-managed en español): Error, Historia, Tarea.
export const ISSUE_TYPE: Record<string, string> = { bug: "Error", feature: "Historia", deuda_tecnica: "Tarea", soporte: "Tarea" };
export const PRIORITY: Record<string, string> = { critica: "Highest", alta: "High", media: "Medium", baja: "Low" };
export const TEAM_LABEL: Record<string, string> = { pagos: "Pagos", plataforma: "Plataforma", frontend: "Frontend", datos: "Datos" };

function auth() {
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  if (!BASE || !email || !token) throw new Error("Faltan JIRA_BASE_URL, JIRA_EMAIL o JIRA_API_TOKEN en .env (o usa --mock)");
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

async function jira(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}/rest/api/3${path}`, {
    ...init,
    headers: { Authorization: auth(), Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Jira ${res.status} ${path}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Atlassian Document Format mínimo para un comentario de texto plano con saltos de línea. */
const adf = (text: string) => ({
  type: "doc", version: 1,
  content: [{ type: "paragraph", content: text.split("\n").flatMap((l, i) => (i ? [{ type: "hardBreak" }, { type: "text", text: l }] : [{ type: "text", text: l }])) }],
});

/** Jira manda la descripción en ADF; la aplanamos a texto. */
export function adfToText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const inner = (node.content ?? []).map(adfToText).join("");
  return node.type === "paragraph" ? inner + "\n" : inner;
}

/** Lee un issue existente (lo crea Claude Code con el MCP de Atlassian; aquí solo lo clasificamos). */
export async function getIssue(key: string) {
  const d = await jira(`/issue/${key}?fields=summary,description,reporter,labels`);
  return {
    key: d.key as string,
    title: (d.fields?.summary ?? "") as string,
    description: adfToText(d.fields?.description).trim(),
    reporter: (d.fields?.reporter?.displayName ?? "desconocido") as string,
    labels: (d.fields?.labels ?? []) as string[],
  };
}

export async function createIssue(summary: string, description: string, labels: string[] = []) {
  if (JIRA_MOCK) return { key: `${PROJECT}-${Math.floor(Math.random() * 900 + 100)}`, mock: true };
  return jira("/issue", {
    method: "POST",
    body: JSON.stringify({ fields: { project: { key: PROJECT }, summary, description: adf(description || "(sin descripción)"), issuetype: { name: ISSUE_TYPE.soporte }, labels } }),
  });
}

export async function applyClassification(key: string, c: Classification) {
  const fields: Record<string, unknown> = {};
  if (c.action !== "escalate") {
    fields.issuetype = { name: ISSUE_TYPE[c.tipo] ?? ISSUE_TYPE.soporte };
    fields.priority = { name: PRIORITY[c.prioridad] ?? "Medium" };
    if (TEAM_FIELD) fields[TEAM_FIELD] = { value: TEAM_LABEL[c.equipo] ?? c.equipo };
  }
  if (c.assignee) fields.assignee = { accountId: c.assignee };
  // "escalado" ≠ "revisar": así el filtro labels = escalado muestra solo los que necesitan a una persona.
  const labels = c.action === "escalate" ? ["escalado"] : c.labels;
  const update = { labels: labels.map((l) => ({ add: l })) };

  if (JIRA_MOCK) return { key, fields, labels, mock: true };
  // Cambiar issuetype puede requerir el endpoint de "move" en algunos proyectos; en team-managed funciona por PUT.
  await jira(`/issue/${key}`, { method: "PUT", body: JSON.stringify({ fields, update }) });
  return { key, fields, labels };
}

export async function addComment(key: string, text: string) {
  if (JIRA_MOCK) return { key, mock: true };
  return jira(`/issue/${key}/comment`, { method: "POST", body: JSON.stringify({ body: adf(text) }) });
}

export async function searchIssues(jql: string, maxResults = 100, fields = ["key"]): Promise<{ key: string; fields?: Record<string, any> }[]> {
  if (JIRA_MOCK) return [];
  const data = await jira(`/search/jql`, { method: "POST", body: JSON.stringify({ jql, maxResults, fields }) });
  return data.issues ?? [];
}

/** Mueve un issue a un estado por nombre (p. ej. "Done"/"Listo"). Busca la transición disponible que coincida. */
export async function transitionTo(key: string, statusPattern: RegExp = /^(done|listo|finalizad|terminad|cerrad|complet)/i) {
  if (JIRA_MOCK) return { key, to: "Listo", mock: true };
  const data = await jira(`/issue/${key}/transitions`);
  const t = (data.transitions ?? []).find((x: any) => statusPattern.test(x.to?.name ?? "") || statusPattern.test(x.name ?? ""));
  if (!t) throw new Error(`No hay transición a Done/Listo para ${key}. Disponibles: ${(data.transitions ?? []).map((x: any) => x.to?.name).join(", ")}`);
  await jira(`/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: t.id } }) });
  return { key, to: t.to?.name ?? t.name };
}

export async function deleteIssue(key: string) {
  if (JIRA_MOCK) return;
  await jira(`/issue/${key}?deleteSubtasks=true`, { method: "DELETE" });
}

export const projectKey = PROJECT;
