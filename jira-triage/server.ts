/**
 * Servidor de webhooks. Sin Express: node:http.
 *   POST /webhook/jira    ← Jira "Issue created"  → Jev → actualiza el ticket
 *   POST /webhook/github  ← GitHub "pull_request" → Jev → ruta + comentario en la PR (demo 3 en vivo, opcional)
 *   GET  /health
 *
 * npm run server            (real)
 * npm run server -- --mock  (sin Jev ni Jira: imprime lo que haría)
 */
import { createServer } from "node:http";
import { classifyTicket, buildComment } from "./classify.ts";
import { applyClassification, addComment, adfToText, JIRA_MOCK } from "./jira.ts";
import { MOCK as JEV_MOCK } from "../shared/jev.ts";
import { bold, dim, green, yellow, red, cyan, gray, colorAction } from "../shared/ui.ts";
import { routePR } from "../llm-router/router.ts";

const PORT = Number(process.env.PORT ?? 3000);
const SKIP_LABEL = process.env.SKIP_LABEL ?? "batch"; // tickets sembrados por lote no se clasifican al entrar

const readBody = (req: import("node:http").IncomingMessage) =>
  new Promise<string>((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); });

async function handleJira(payload: any) {
  const issue = payload.issue;
  if (!issue) return { skipped: "sin issue" };
  const key: string = issue.key;
  const labels: string[] = issue.fields?.labels ?? [];
  if (labels.includes(SKIP_LABEL)) return { skipped: `etiqueta ${SKIP_LABEL}` };

  const title: string = issue.fields?.summary ?? "";
  const description = adfToText(issue.fields?.description).trim();
  const reporter: string = issue.fields?.reporter?.displayName ?? "desconocido";

  const t0 = performance.now();
  const c = await classifyTicket(title, description, reporter);
  await applyClassification(key, c);
  await addComment(key, buildComment(c));
  const total = Math.round(performance.now() - t0);

  const pct = (n: number) => `${Math.round(n * 100)}`;
  console.log(
    `${cyan(key)} → ${bold(c.tipo)}/${bold(c.prioridad)}/${bold(c.equipo)} ` +
    `(${pct(c.confidence.tipo)}/${pct(c.confidence.prioridad)}/${pct(c.confidence.equipo)} %) ` +
    `humano ${pct(c.needsHuman)} % → ${colorAction(c.action)} ${gray(`jev ${c.ms}ms · total ${total}ms`)}` +
    `  ${dim(title.slice(0, 60))}`
  );
  return { key, ...c, totalMs: total };
}

async function handleGitHub(payload: any) {
  const pr = payload.pull_request;
  if (!pr || !["opened", "synchronize", "reopened"].includes(payload.action)) return { skipped: `acción ${payload.action}` };
  const repo = payload.repository?.full_name;
  // Archivos: la API de PR files (necesita GITHUB_TOKEN); si falla, seguimos con lo que trae el payload.
  let files: string[] = [];
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr.number}/files?per_page=100`, {
      headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
    });
    if (r.ok) files = ((await r.json()) as any[]).map((f) => f.filename);
  } catch {}
  const decision = await routePR({
    id: `PR-${pr.number}`, number: pr.number, url: pr.html_url, title: pr.title,
    files, changedFiles: pr.changed_files, additions: pr.additions, deletions: pr.deletions,
    body: (pr.body ?? "").slice(0, 800), diffSummary: "",
  });
  console.log(`${cyan(`${repo}#${pr.number}`)} → ${bold(decision.complejidad)} (${Math.round(decision.confidence * 100)} %) dinero ${Math.round(decision.touchesMoney * 100)} % → ${bold(decision.route)} ${gray(decision.reason)}  ${dim(pr.title.slice(0, 60))}`);

  if (process.env.GITHUB_TOKEN && !JEV_MOCK) {
    const body = `🤖 **Router (Jev)**: complejidad **${decision.complejidad}** (${Math.round(decision.confidence * 100)} %), toca dinero ${Math.round(decision.touchesMoney * 100)} % → ruta **${decision.route}** — ${decision.reason}`;
    await fetch(`https://api.github.com/repos/${repo}/issues/${pr.number}/comments`, {
      method: "POST", headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ body }),
    });
  }
  return decision;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, jevMock: JEV_MOCK, jiraMock: JIRA_MOCK }));
    }
    if (req.method === "POST" && (req.url === "/webhook/jira" || req.url === "/webhook/github")) {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const result = req.url === "/webhook/jira" ? await handleJira(payload) : await handleGitHub(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(result));
    }
    res.writeHead(404); res.end("not found");
  } catch (e: any) {
    console.error(red("✗"), e.message);
    res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(bold(`listening on :${PORT}`));
  console.log(`  jev  ${JEV_MOCK ? yellow("MOCK") : green(process.env.JEV_MODEL ?? "jev-1.13.0")}   jira ${JIRA_MOCK ? yellow("MOCK") : green(process.env.JIRA_BASE_URL ?? "?")}`);
  console.log(dim(`  POST /webhook/jira · POST /webhook/github · GET /health · tickets con etiqueta "${SKIP_LABEL}" se ignoran`));
});
