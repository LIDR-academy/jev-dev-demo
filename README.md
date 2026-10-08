# jev-dev-demo

**Jev decide, el LLM razona.** Tres actos sobre el mismo patrón:

> estado → pregunta tipada → Jev → probabilidad → **tu código decide** → acción

1. **Triage de Jira** (10 min): cada ticket nuevo queda clasificado, priorizado y asignado en < 1 s, con su % de confianza. Lo ambiguo se escala a una persona.
2. **Pre-vuelo** (8 min): antes de tocar el código para un ticket, Jev escanea las funciones involucradas y marca bugs que ya existen (varias responsabilidades, errores tragados, mutación de parámetros, números mágicos, lógica duplicada). Solo lo marcado lo explica Claude. *Jev encuentra dónde buscar; Claude encuentra qué.*
3. **Router de LLM** (8 min): Jev decide qué PR merece el modelo grande, cuál basta con uno pequeño y cuál ni siquiera necesita LLM. Mismo lote, 50–75 % menos costo.

Sin dependencias. **Node 22.18+** corre TypeScript directo, trae `fetch` y lee `.env` solo. Se clona y corre.

```bash
git clone <este-repo> && cd jev-dev-demo
cp .env.example .env            # llena las llaves (o ensaya sin ellas con --mock)
npm test                        # 10 pruebas de los umbrales
npm run batch -- --mock                                  # acto 1 sin Jev ni Jira
npm run scan -- --ticket=T03 --explain --mock            # acto 2 sin llaves
npm run review -- --mode=direct --mock && npm run review -- --mode=jev --mock && npm run compare   # acto 3 sin llaves
npm run costs                                            # coste de cada ejecución
```

## Qué hay aquí

| Ruta | Qué es |
| --- | --- |
| `shared/jev.ts` | Cliente de Jev sobre `fetch` (`POST /v1/systemone`). Helpers `choice`, `noul`, `score`. Modo mock con heurísticas para ensayar. |
| `shared/thresholds.ts` | **La función que señalas en pantalla.** `decide()` convierte probabilidades en `apply` / `apply_and_flag` / `escalate`. `routeFor()` convierte complejidad + dinero en `rules` / `haiku` / `sonnet`. |
| `shared/ui.ts` | Colores y tablas de consola legibles desde lejos. |
| `jira-triage/classify.ts` | Las 4 preguntas tipadas del acto 1 y el comentario que Jev deja en el ticket. |
| `jira-triage/jira.ts` | Cliente de Jira Cloud REST v3. Mapeo de opciones de Jev a tipos/prioridades de Jira. |
| `jira-triage/server.ts` | Servidor de webhooks (`node:http`): `/webhook/jira`, `/webhook/github`, `/health`. |
| `jira-triage/triage.ts` | Clasifica issues que ya existen (`npm run triage -- KAN-128`). Lo usa el skill `/triage` después de crear el issue con el MCP de Atlassian. |
| `jira-triage/batch.ts` | Clasifica los 30 tickets de golpe, imprime tabla, totales y aciertos contra `expected`. |
| `sample-app/` | Módulo de pagos de la tienda de los tickets (TypeScript). Trae **7 bugs sembrados** documentados en `data/bugs-sembrados.json` y 3 funciones limpias de control. Es el código que "vas a tocar" en el acto 2. |
| `data/tickets-files.json` | Qué archivos de `sample-app/` toca cada ticket (T01, T03, T11, T16). |
| `code-health/scan.ts` | **Acto 2.** Parte los archivos en funciones, calcula señales baratas, pregunta a Jev 6 cosas por función y manda solo lo marcado a Claude (`--explain`). |
| `code-health/split.ts` | Particionador de funciones sin AST + señales (líneas, awaits, efectos, catch sospechoso, literales, parámetros mutados). |
| `code-health/explain.ts` | Claude explica una función marcada y propone el refactor mínimo. |
| `scripts/costs.ts` | **Costes por ejecución**: tokens y USD de Jev y LLM en cada acto, total de la demo. |
| `.claude/skills/pre-vuelo/` | Skill de Claude Code `/pre-vuelo T03`: corre el escaneo y lo presenta con recomendación de orden. |
| `.claude/skills/costos/` | Skill `/costos`: explica el coste de cada ejecución en lenguaje natural. |
| `llm-router/router.ts` | Una llamada a Jev por PR: `complejidad` + `touches_money`. |
| `llm-router/llm.ts` | Revisión con Claude (Messages API vía `fetch`) o con reglas locales (0 tokens). Lee `usage` real. |
| `llm-router/review.ts` | CLI `--mode=direct` / `--mode=jev`. Guarda `results/<mode>.json`. |
| `llm-router/compare.ts` | Tabla lado a lado: tokens, costo, ahorro, rutas, proyección a 500 PRs/mes. |
| `llm-router/show-review.ts` | La misma PR revisada en ambos modos. |
| `llm-router/import-prs.mjs` | Trae PRs reales de cualquier repo (API de GitHub o `git log` local; squash o merge commits). |
| `llm-router/prices.json` | USD por millón de tokens. **Actualiza la víspera.** |
| `scripts/seed.ts` | Crea los 30 tickets en Jira sin clasificar (etiqueta `batch`). |
| `scripts/reset.ts` | Borra los issues de la demo y `results/` para repetirla. |
| `data/tickets.json` | 30 tickets de una tienda en línea mexicana; 27 claros + 3 ambiguos (T28–T30), con `expected`. |
| `data/tickets-jira-import.csv` | Los mismos 30 para importar a Jira de golpe. |
| `data/prs-real.json` | **20 PRs reales de [medusajs/medusa](https://github.com/medusajs/medusa)** (e-commerce TS): 5 docs, 3 bumps, 2 chores grandes, 8 fixes, 2 features de pagos. Con `sha` y `parentSha` para recrearlas. |
| `data/prs-fork.json` | (lo generas tú) Las mismas 20, **abiertas en tu fork** con `scripts/open-prs.mjs`. Esta es la que va a la demo: las PRs viven en GitHub y el router comenta en ellas. |
| `scripts/open-prs.mjs` | Recrea las PRs reales como PRs abiertas en tu fork (cherry-pick de cada commit original). `--dry-run` y `--cleanup`. |
| `shared/github.ts` | Comentario del router en la PR (`review --comment`). |
| `data/prs-fast-jev-compaction.json` | 12 PRs reales de [tamaratran/fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction), un plugin de Claude Code que usa Jev. Opción "meta"; pocas y de un solo autor. |
| `data/prs.json` | 20 PRs sintéticas de respaldo si falla la red. |
| `tests/` | Pruebas de umbrales (`node --test`). |

## Preparación (una tarde)

### 1. Llaves

| Variable | Dónde |
| --- | --- |
| `TYPESAFE_API_KEY` | Consola de TypeSafe AI → API keys. Carga unos dólares; la demo completa cuesta centavos. |
| `ANTHROPIC_API_KEY` | console.anthropic.com. El acto 2 en modo `direct` gasta ~$0.20 por ejecución con Sonnet. |
| `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | id.atlassian.com → Seguridad → API tokens. |
| `JIRA_TEAM_FIELD_ID` | Id del campo custom "Equipo" (ver abajo). Si no lo creas, déjalo vacío y el equipo solo aparece en el comentario. |
| `LEAD_*` | `accountId` de Jira de cada lead (opcional). Sin ellos no se asigna, solo se clasifica. |
| `GITHUB_TOKEN` | Solo si quieres el webhook de GitHub comentando en PRs de tu fork. |

### 2. Jira

1. Proyecto **DEMO** (team-managed, tipo software). Tipos de issue: Bug, Story, Task. Prioridades por defecto (Highest/High/Medium/Low).
2. Campo custom **Equipo**, lista desplegable: Pagos, Plataforma, Frontend, Datos. Copia su id (`customfield_10xxx`) a `.env`. Lo encuentras en la URL al editar el campo o con `GET /rest/api/3/field`.
3. Webhook: Configuración → Sistema → Webhooks → URL `https://TU-TUNEL/webhook/jira`, evento **Issue created**, JQL `project = DEMO`.
4. Túnel: `ngrok http 3000` o `cloudflared tunnel --url http://localhost:3000`. Pega la URL en el webhook.

### 3. Sembrar los 30 tickets

Tres caminos; el primero es el bueno:

- **Importar `data/tickets-jira-import.csv`** (2 min): Configuración → Sistema → Importación de sistema externo → CSV. Mapea Summary, Description, Issue Type, Labels. Entran como Task sin prioridad: el backlog desordenado que quieres mostrar. La etiqueta `batch` hace que el servidor los ignore al entrar, así no se clasifican antes de tiempo.
- **`npm run batch`** los crea por API y los clasifica al momento. Es para la demo, no para sembrar.
- **`npm run seed -- --done=8`**: los crea por API con etiqueta `batch`, sin clasificar, y mueve los últimos 8 a **Listo** con un comentario de "sprint anterior". El tablero parece un proyecto con historia, no un lote recién importado. `batch --no-create` ignora los que ya están en Listo.
- **Claude en Chrome**, uno por uno. Solo si lo anterior falla.

### 3b. Acto 2: los bugs del código que vas a tocar

El código vive en `sample-app/` dentro de este repo: un módulo de pagos de la misma tienda de los tickets, legible en pantalla y fácil de replantear en Claude Code. Tiene 7 bugs sembrados (`data/bugs-sembrados.json`) y 3 funciones limpias de control. Frente a la audiencia se llaman solo "bugs"; que los sembramos se dice en el cierre.

| Bug | Dónde | Qué es | Ticket al que pega |
| --- | --- | --- | --- |
| B1 | `refund.ts` · `processRefund` | Una función, siete trabajos (valida, calcula, cobra, actualiza, notifica, audita, mide). Rompe SRP. | T03 |
| B2 | `refund.ts` · `processRefund` | Muta `order` (el parámetro) aunque el reembolso falle a medias. | T03 |
| B3 | `refund.ts` · `processRefund` | Al 90 % del total marca el pedido como reembolsado completo. | T03 (es el ticket) |
| B4 | `gateway.ts` · `chargeGateway` | El `catch` devuelve `ok: true` con un id inventado cuando la red falla. | T01, T16 |
| B5 | `tax.ts` · `calculateTax` | `0.16` y `1.16` sin nombre, en cuatro sitios. | T03, T11 |
| B6 | `totals.ts` · `splitTotal` | Desglosa IVA distinto que `removeTax`: centavos que no cuadran. | T03 |
| B7 | `totals.ts` · `applyCoupon` | Registra y descuenta el cupón aunque ya estuviera aplicado. | T11 (es el ticket) |

```bash
npm run scan -- --ticket=T03            # Jev marca; tabla por función
npm run scan -- --ticket=T03 --explain  # además Claude explica solo lo marcado
```

Por cada función Jev responde en una sola llamada: ¿una o varias responsabilidades? ¿traga errores? ¿muta la entrada? ¿números mágicos? ¿lógica duplicada (viendo las funciones parecidas)? y una severidad de 0 a 3. Las preguntas y sus `criteria` están en `code-health/scan.ts`; si Jev clasifica mal, se afinan ahí.

Para cambiar los bugs o agregar otros: edita `sample-app/`, actualiza `data/bugs-sembrados.json` (el escaneo se autoevalúa contra él) y `data/tickets-files.json`. Un prompt para Claude Code basta: "siembra en sample-app un bug de tipo X en la función Y y regístralo en bugs-sembrados.json".

### 4. PRs reales

`data/prs-real.json` ya viene listo. Para refrescarlo o usar el repo de tu equipo:

```bash
# A) API de GitHub (gh auth login). Repo público o privado al que tengas acceso.
npm run import-prs -- --repo=medusajs/medusa --count=20 --max-docs=5 --out=data/prs-real.json

# B) git local, sin API. Soporta squash-merge "(#123)" y merge commits "Merge pull request #123".
git clone --depth 150 --single-branch --branch develop https://github.com/medusajs/medusa ../medusa
npm run import-prs -- --source=git --path=../medusa --count=20 --max-docs=5 --out=data/prs-real.json

# C) Tu repo. La demo más fuerte si presentas a tu propio equipo. Revisa el JSON: puede traer datos internos.
npm run import-prs -- --repo=TU-ORG/TU-REPO --count=20 --max-docs=4
```

### 4b. Dónde viven las PRs: en tu fork, abiertas

El JSON es una foto. Para que las PRs existan de verdad en GitHub durante la demo:

```bash
gh repo fork medusajs/medusa --clone=false
node scripts/open-prs.mjs --fork=TU-USUARIO/medusa --dry-run     # prepara en local, no envía nada
node scripts/open-prs.mjs --fork=TU-USUARIO/medusa               # push + 20 PRs abiertas con etiqueta jev-demo
npm run import-prs -- --repo=TU-USUARIO/medusa --state=open --count=20 --out=data/prs-fork.json
npm run review -- --mode=jev --data=data/prs-fork.json --comment  # el router comenta en cada PR (GITHUB_TOKEN)
node scripts/open-prs.mjs --fork=TU-USUARIO/medusa --cleanup     # al terminar: cierra PRs y borra ramas
```

Cada PR recreada apunta a `demo-base` (el padre del commit más antiguo) y contiene exactamente el commit original; las que no aplican limpias usan su propio padre como base. Ninguna apunta al repo de Medusa, solo a tu fork.

Si además quieres **abrir una PR en vivo** y que el router la comente al instante, agrega un webhook `pull_request` en el fork apuntando a `https://TU-TUNEL/webhook/github`.

### 5. Ensayo

```bash
npm run reset
# en Claude Code: /triage <queja de cliente> → crea el issue con el MCP y Jev lo clasifica
npm run batch -- --no-create                    # los 30 importados por CSV
npm run review -- --mode=direct                 # 1–2 min; NO en vivo, precalcula
npm run review -- --mode=jev --concurrency=3    # ~40 s; este sí en vivo
npm run compare
npm run show-review -- PR-17099
```

Cronométralo dos veces, una con hotspot del celular. Graba ambos actos como respaldo.

## El día de la demo (30 min: 10 + 8 + 8 + 4)

| Min | Comando / acción | Qué se ve |
| --- | --- | --- |
| 0 | Jira con 30 tickets: 8 en Listo, 22 sin clasificar | "Esto ve un manager cada lunes" |
| 2 | VS Code: `shared/thresholds.ts` | Los umbrales son código tuyo, no del modelo |
| 3 | En Claude Code: `/triage Pagué con débito y me llegaron dos cargos por el mismo pedido` | Claude crea el issue con el MCP y Jev lo clasifica: `KAN-128 → bug/critica/pagos (89/99/100 %) → apply` |
| 5 | Abrir el ticket | Comentario de Jev con las tres decisiones y su % |
| 6 | `npm run batch -- --no-create` | 22 líneas en ~3 s, tabla, costo < 1 centavo |
| 8 | Filtro `labels = revisar` | Los 3 ambiguos escalados |
| **10** | **Acto 2.** Abres el ticket T03 "Reembolso parcial se registra como total" y `sample-app/payments/refund.ts` | "Antes de tocar esto, ¿qué bugs ya hay aquí?" |
| 11 | `npm run scan -- --ticket=T03` | 15 funciones en 300 ms: 7 marcadas, 8 limpias, con % y severidad |
| 13 | `npm run scan -- --ticket=T03 --explain` (o `/pre-vuelo T03` en Claude Code) | Claude explica solo las 7: la de 61 líneas con 7 trabajos, el `catch` que devuelve éxito, el 90 % que marca como reembolsado | 
| 16 | Señalas `sendRefundEmail` y `updateOrderStatus` | "Estas no gastaron un token. Jev dijo que estaban limpias." |
| 17 | `npm run costs` | Acto 1 y acto 2 en centavos; Jev vs LLM |
| **18** | **Acto 3.** Lista de PRs abiertas del fork en el navegador + resumen de `direct` ya calculado | 20 PRs reales esperando revisión. Todo a Sonnet: tantos tokens, tanto costo |
| 19 | VS Code: `llm-router/router.ts` | Una pregunta, tres caminos |
| 20 | `npm run review -- --mode=jev --data=data/prs-fork.json --comment` | Terminal: cada PR con ruta y confianza. Navegador: los comentarios aparecen en las PRs |
| 23 | `npm run compare` | Tabla lado a lado. Silencio. Luego el número |
| 25 | `npm run show-review -- PR-<fork de 17099>` | La PR de pagos recibió la misma revisión en ambos modos |
| **26** | **Cierre.** `npm run review -- --mode=jev --data=data/prs-fast-jev-compaction.json` | Un plugin de Claude Code que usa Jev, revisado por un router que usa Jev. Mismo patrón |
| 28 | Patrón en una diapositiva + "los bugs del acto 2 los sembramos nosotros; el escáner no lo sabía" | "Jev no escribe, Jev elige. Lo que elige lo ejecuta tu código." |
| 29 | `npm run costs` final | Lo que costó toda la demo |

## Modos mock

Cualquier comando acepta `--mock`: Jev responde con heurísticas, Claude con texto simulado y tokens estimados, Jira no se toca. Sirve para ensayar el guion y la consola sin gastar ni depender de la red. Los números que salen en mock **no** son los de la demo; con llaves reales, Jev y Claude deciden de verdad y los tokens vienen del `usage` de cada API.

También por variable: `JEV_MOCK=1`, `ANTHROPIC_MOCK=1`, `JIRA_MOCK=1`.

## Umbrales (ajustables en `.env`)

| Variable | Default | Efecto |
| --- | --- | --- |
| `THRESHOLD_APPLY` | 0.70 | Confianza mínima para aplicar directo |
| `THRESHOLD_FLAG` | 0.50 | Entre esto y `APPLY`: aplica y etiqueta `revisar` |
| `THRESHOLD_HUMAN` | 0.50 | Si `needs_human` ≥ esto, no toca el ticket y lo asigna a triage |
| `ROUTER_MIN_CONFIDENCE` | 0.60 | Debajo, la PR va al modelo grande aunque parezca trivial |
| `ROUTER_MONEY_THRESHOLD` | 0.50 | Si `touches_money` ≥ esto, va al modelo grande siempre |
| `SCAN_THRESHOLD` | 0.60 | Pre-vuelo: desde qué probabilidad una señal de Jev cuenta como marca |

## Límites que conviene decir en voz alta

- Jev no explica ni razona: no sustituye la revisión de código ni el análisis de un bug. Elige entre opciones que tú definiste. En el acto 2, Jev dice **dónde** mirar; Claude dice **qué** está mal.
- Como cualquier modelo, es vulnerable a texto malicioso dentro del ticket o la PR. Por eso los umbrales y la revisión humana viven en tu código.
- El ahorro depende de la mezcla de PRs. Di el número que salga.
