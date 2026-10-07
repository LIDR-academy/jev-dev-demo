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
export const ISSUE_TYPE: Record<string, string> = { bug: "Bug", feature: "Story", deuda_tecnica: "Task", soporte: "Task" };
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

export async function createIssue(summary: string, description: string, labels: string[] = []) {
  if (JIRA_MOCK) return { key: `${PROJECT}-${Math.floor(Math.random() * 900 + 100)}`, mock: true };
  return jira("/issue", {
    method: "POST",
    body: JSON.stringify({ fields: { project: { key: PROJECT }, summary, description: adf(description || "(sin descripción)"), issuetype: { name: "Task" }, labels } }),
  });
}

export async function applyClassification(key: string, c: Classification) {
  const fields: Record<string, unknown> = {};
  if (c.action !== "escalate") {
    fields.issuetype = { name: ISSUE_TYPE[c.tipo] ?? "Task" };
    fields.priority = { name: PRIORITY[c.prioridad] ?? "Medium" };
    if (TEAM_FIELD) fields[TEAM_FIELD] = { value: TEAM_LABEL[c.equipo] ?? c.equipo };
  }
  if (c.assignee) fields.assignee = { accountId: c.assignee };
  const labels = c.action === "escalate" ? ["revisar"] : c.labels;
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

export async function searchIssues(jql: string, maxResults = 100): Promise<{ key: string }[]> {
  if (JIRA_MOCK) return [];
  const data = await jira(`/search/jql`, { method: "POST", body: JSON.stringify({ jql, maxResults, fields: ["key"] }) });
  return data.issues ?? [];
}

export async function deleteIssue(key: string) {
  if (JIRA_MOCK) return;
  await jira(`/issue/${key}?deleteSubtasks=true`, { method: "DELETE" });
}

export const projectKey = PROJECT;
