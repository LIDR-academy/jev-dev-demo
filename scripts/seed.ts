/**
 * Siembra los 30 tickets en Jira SIN clasificarlos (etiqueta "batch" para que el servidor los ignore).
 * Es la alternativa por API a importar el CSV. Deja el backlog desordenado que quieres mostrar.
 *   npm run seed
 *   npm run seed -- --data=data/tickets.json
 */
import { readFileSync } from "node:fs";
import { createIssue, projectKey, JIRA_MOCK } from "../jira-triage/jira.ts";
import { bold, dim, green, yellow } from "../shared/ui.ts";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const tickets: { id: string; title: string; description: string }[] = JSON.parse(readFileSync(arg("data") ?? "data/tickets.json", "utf8"));

console.log(bold(`Sembrando ${tickets.length} tickets en ${projectKey}`), JIRA_MOCK ? yellow("(MOCK)") : "");
// En orden y en serie: así las keys quedan en el mismo orden que tickets.json y batch --no-create los empareja bien.
for (const t of tickets) {
  const r = await createIssue(t.title, t.description, ["batch"]);
  console.log(green("✓"), r.key, dim(t.title.slice(0, 60)));
}
console.log(bold("Listo."), "Ahora el tablero está desordenado a propósito. En la demo: npm run batch -- --no-create");
