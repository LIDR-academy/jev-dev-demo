# jev-dev-demo

**Jev decide, el LLM razona.** Tres demos sobre el mismo patrón:

> estado → pregunta tipada → Jev → probabilidad → **tu código decide** → acción

1. **Triage de Jira** (10 min): cada ticket nuevo queda clasificado, priorizado y asignado en < 1 s, con su % de confianza. Lo ambiguo se escala a una persona.
2. **Pre-vuelo** (8 min): antes de tocar el código para un ticket, Jev escanea las funciones involucradas y marca bugs que ya existen (varias responsabilidades, errores tragados, mutación de parámetros, números mágicos, lógica duplicada). Solo lo marcado lo explica Claude. *Jev encuentra dónde buscar; Claude encuentra qué.*
3. **Router de LLM** (8 min): Jev decide qué PR merece el modelo grande, cuál basta con uno pequeño y cuál ni siquiera necesita LLM. Mismo lote, 50–75 % menos costo.

Sin dependencias. **Node 22.18+** corre TypeScript directo, trae `fetch` y lee `.env` solo. Se clona y corre.

```bash
git clone <este-repo> && cd jev-dev-demo
cp .env.example .env            # llena las llaves (o ensaya sin ellas con --mock)
npm test                        # 14 pruebas: umbrales y lectura de respuestas del LLM
npm run batch -- --mock                                  # demo 1 sin Jev ni Jira
npm run scan -- --ticket=T03 --explain --mock            # demo 2 sin llaves (necesita ../medusa-fork)
npm run review -- --mode=direct --mock && npm run review -- --mode=jev --mock && npm run compare   # demo 3 sin llaves
npm run costs                                            # coste de cada ejecución
```

## Qué hay aquí

| Ruta | Qué es |
| --- | --- |
| `shared/jev.ts` | Cliente de Jev sobre `fetch` (`POST /v1/systemone`). Helpers `choice`, `noul`, `score`. Modo mock con heurísticas para ensayar. |
| `shared/thresholds.ts` | **La función que señalas en pantalla.** `decide()` convierte probabilidades en `apply` / `apply_and_flag` / `escalate`. `routeFor()` convierte complejidad + dinero en `rules` / `haiku` / `sonnet`. |
| `shared/ui.ts` | Colores y tablas de consola legibles desde lejos. |
| `jira-triage/classify.ts` | Las 4 preguntas tipadas de la demo 1 y el comentario que Jev deja en el ticket. |
| `jira-triage/jira.ts` | Cliente de Jira Cloud REST v3. Mapeo de opciones de Jev a tipos/prioridades de Jira. |
| `jira-triage/server.ts` | Servidor de webhooks (`node:http`): `/webhook/jira`, `/webhook/github`, `/health`. |
| `jira-triage/triage.ts` | Clasifica issues que ya existen (`npm run triage -- KAN-128`). Lo usa el skill `/triage` después de crear el issue con el MCP de Atlassian. |
| `jira-triage/batch.ts` | Clasifica los 30 tickets de golpe, imprime tabla, totales y aciertos contra `expected`. Con `--mode=direct`, el "antes": Sonnet clasifica los mismos issues de Jira (solo lectura). |
| `../medusa-fork` | Clon de `LIDR-academy/medusa` (ruta en `MEDUSA_PATH`). Es el código que "vas a tocar" en la demo 2. |
| `data/tickets-files.json` | Qué archivos toca cada ticket. `T03` → Medusa. |
| `code-health/scan.ts` | **Demo 2.** Parte los archivos en funciones, calcula señales baratas, pregunta a Jev 6 cosas por función y manda solo lo marcado a Claude (`--explain`). |
| `code-health/split.ts` | Particionador de funciones sin AST + señales (líneas, awaits, efectos, catch sospechoso, literales, parámetros mutados). |
| `code-health/explain.ts` | Claude explica una función marcada y propone el refactor mínimo. Con `scan --mode=direct`, el "antes": Claude revisa todas las funciones. |
| `shared/prices.ts` | Precios de `llm-router/prices.json`, costo por llamada y concurrencia acotada para los modos `direct`. |
| `scripts/costs.ts` | **Costes por ejecución**: tokens y USD de Jev y LLM en cada demo, total de la demo. |
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
| `ANTHROPIC_API_KEY` | console.anthropic.com. La demo 3 en modo `direct` gasta ~$0.20 por ejecución con Sonnet. |
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

### 3b. Demo 2: los bugs del código que vas a tocar

El código es **Medusa real**: el ticket T03 ("Reembolso parcial se registra como total") toca el servicio de pagos y el proveedor de Stripe del fork `LIDR-academy/medusa`. Son 58 funciones y métodos en dos archivos de producción, sin bugs sembrados.

```bash
gh repo clone LIDR-academy/medusa ../medusa-fork -- --depth 1   # una vez; o define MEDUSA_PATH en .env
npm run scan -- --ticket=T03            # Jev marca; tabla por función
npm run scan -- --ticket=T03 --explain  # además Claude explica solo lo marcado (o /pre-vuelo T03)
```

En el ensayo (commit `d436d2fb` de `develop`) Jev marcó 1 o 2 de 58, siempre por errores tragados, y Claude las confirmó. `roundToCurrencyPrecision` sale marcada siempre (~81 %); `refundPayment` queda en el límite del umbral (~60 %) y a veces entra:

| Función | Archivo | Qué encontró |
| --- | --- | --- |
| `roundToCurrencyPrecision` | `payment/src/services/payment-module.ts` | El `catch {}` vacío esconde un `TypeError`: con monedas sin decimales (JPY) `split(".")[1]` no existe y el monto se queda **sin redondear**. Se usa al calcular capturas. Bug latente real. |
| `refundPayment` | `payment-stripe/src/core/stripe-base.ts` | Se traga en silencio el error "ya reembolsado" y devuelve éxito: intencional, pero sin registro ni aviso. |

Para enseñar el bug de JPY en vivo, la misma lógica en una línea:

```bash
node -e 'for (const c of ["USD","JPY"]) { try { console.log(c, Intl.NumberFormat(undefined,{style:"currency",currency:c}).format(0.1111111).split(".")[1].length, "decimales") } catch (e) { console.log(c, "→", e.constructor.name, "(el catch de Medusa lo esconde)") } }'
```

Por cada función Jev responde en una sola llamada: ¿una o varias responsabilidades? ¿traga errores? ¿muta la entrada? ¿números mágicos? ¿lógica duplicada (viendo las funciones parecidas)? y una severidad de 0 a 3. Las preguntas y sus `criteria` están en `code-health/scan.ts`; si Jev clasifica mal, se afinan ahí, no en los umbrales.

**Ensayo sin llaves.** `npm run scan -- --ticket=T03 --explain --mock` corre el pre-vuelo sobre Medusa sin red (Jev y Claude simulados). Las marcas del mock son heurísticas y no coinciden con las de Jev real. Si cambias los `criteria`, corre sin `--mock` y compara contra `results-backup/code-health-T03-medusa.json`: deben seguir saliendo `roundToCurrencyPrecision` y, en el límite, `refundPayment`.

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
npm run reset                                   # conserva los "antes" precalculados (--baselines también los borra)
# una vez, antes de la sesión: los tres "antes" (todo al LLM, sin Jev)
npm run batch -- --mode=direct                  # ~20 s · lee los 22 issues de KAN, no escribe en Jira
npm run scan -- --ticket=T03 --mode=direct      # ~45 s · Claude revisa las 58 funciones de Medusa
npm run review -- --mode=direct --data=data/prs-fork.json   # ~40 s · las 20 PRs del fork a Sonnet
# en Claude Code: /triage <queja de cliente> → crea el issue con el MCP y Jev lo clasifica
npm run batch -- --no-create                    # los 30 importados por CSV
npm run review -- --mode=jev --concurrency=3    # ~40 s; este sí en vivo
npm run compare
npm run show-review -- PR-17099
```

Cronométralo dos veces, una con hotspot del celular. Graba las tres demos como respaldo.

## Antes y después

Cada demo tiene su "antes": lo que se hace hoy con IA, mandarlo todo a Sonnet. Corre sobre los mismos datos reales (los issues de KAN, el código de Medusa, las PRs del fork) y con las mismas opciones que se le dan a Jev, para que la comparación sea justa. Se precalcula una vez (`--mode=direct`) y `npm run costs` pone cada antes junto a su después. Números del ensayo del 7 de octubre:

| Demo | Antes: todo a Sonnet | Después: Jev decide | Qué decir |
| --- | --- | --- | --- |
| 1 · Triage (22 issues) | 22 llamadas · $0.078 · 20 s · 19/19 | 22 llamadas a Jev · $0.0009 · 1.4 s · 19/19 | Misma precisión, ~87× más barato y ~14× más rápido. Y Sonnet no da probabilidades: o aplica o escala; no existe "aplicar y marcar para revisión". |
| 2 · Pre-vuelo (58 funciones) | 58 llamadas · $0.235 · 42 s · 15 marcadas | Jev 58 + Claude 2 · $0.022 · ~12 s · 2 marcadas | Las 2 de Jev están entre las 15 de Claude. Claude pagó por leer las 43 limpias para saber que lo eran. |
| 3 · Router (20 PRs) | 20 a Sonnet · $0.166 · 38 s | rules 10 · haiku 2 · sonnet 8 · $0.077 | −53 %, y la PR de pagos recibe la misma revisión. |

El código del antes está junto al del después, para enseñarlo en pantalla:

- **Demo 1:** `classifyTicketDirect` en `jira-triage/classify.ts` arma el prompt con los mismos `criteria` que `TICKET_QUESTIONS` y pide JSON. `parseDirectTicket` lo valida: si el LLM inventa una opción, es error (Jev siempre elige una de las dadas).
- **Demo 2:** `reviewFunctionDirect` en `code-health/explain.ts` pide las mismas cinco señales con las mismas claves (`MARCAS: traga_errores, …`) para poder contarlas.
- **Demo 3:** `npm run review -- --mode=direct` manda cada PR a Sonnet con el mismo prompt que usa la ruta sonnet del router.

## El día de la demo (30 min: 10 + 8 + 8 + 4)

| Min | Comando / acción | Qué se ve |
| --- | --- | --- |
| 0 | Jira con 30 tickets: 8 en Listo, 22 sin clasificar | "Esto ve un manager cada lunes" |
| 2 | VS Code: `shared/thresholds.ts` | Los umbrales son código tuyo, no del modelo |
| 3 | En Claude Code: `/triage Pagué con débito y me llegaron dos cargos por el mismo pedido` | Claude crea el issue con el MCP y Jev lo clasifica: `KAN-128 → bug/critica/pagos (89/99/100 %) → apply` |
| 5 | Abrir el ticket | Comentario de Jev con las tres decisiones y su % |
| 6 | `npm run batch -- --no-create` | 22 líneas en ~3 s, tabla, costo < 1 centavo |
| 8 | Filtro `labels = escalado` | Los 3 ambiguos, escalados a una persona (los marcados para revisar llevan `revisar`) |
| **10** | **Demo 2.** Abres el ticket T03 "Reembolso parcial se registra como total" y, en VS Code, `payment-module.ts` de Medusa (1,468 líneas) | "Esto es Medusa real. Antes de tocarlo, ¿dónde están los problemas?" |
| 11 | `npm run scan -- --ticket=T03` | 58 funciones en ~2 s: 1 o 2 marcadas, el resto limpias, con % y severidad |
| 13 | `npm run scan -- --ticket=T03 --explain` (o `/pre-vuelo T03` en Claude Code). Reutiliza las respuestas de Jev del minuto 11: mismos números, ~7 s | Claude explica solo las marcadas: el `catch` vacío de `roundToCurrencyPrecision` (y, si entra, el "ya reembolsado" que Stripe se traga) |
| 15 | El `node -e` de JPY (sección 3b) | `JPY → TypeError`: el bug latente que el `catch` esconde, en vivo |
| 16 | Señalas las 57 limpias | "Estas no gastaron un token. Jev dijo que estaban limpias." |
| 17 | `npm run costs -- --demo=1,2` | Demo 1 y demo 2, cada una con su fila direct (todo a Sonnet) y su fila jev: ~87× y ~10× más barato (sin mostrar aún la demo 3) |
| **18** | **Demo 3.** Lista de PRs abiertas del fork en el navegador + resumen de `direct` ya calculado | 20 PRs reales esperando revisión. Todo a Sonnet: tantos tokens, tanto costo |
| 19 | VS Code: `llm-router/router.ts` | Una pregunta, tres caminos |
| 20 | `npm run review -- --mode=jev --data=data/prs-fork.json --comment` | Terminal: cada PR con ruta y confianza. Navegador: los comentarios aparecen en las PRs |
| 23 | `npm run compare` | Tabla lado a lado. Silencio. Luego el número |
| 25 | `npm run show-review -- PR-<fork de 17099>` | La PR de pagos recibió la misma revisión en ambos modos |
| **26** | **Cierre.** `npm run review -- --mode=jev --data=data/prs-fast-jev-compaction.json --out=results/cierre.json --concurrency=6` (~30 s; no pisa `results/jev.json`) | Un plugin de Claude Code que usa Jev, revisado por un router que usa Jev. Mismo patrón |
| 28 | Patrón en una diapositiva + "en la demo 2 nadie sabía que ese bug estaba en Medusa; Jev señaló una función de 58 y ahí estaba" | "Jev no escribe, Jev elige. Lo que elige lo ejecuta tu código." |
| 29 | `npm run costs` final (o `/costos`) | Lo que costó toda la demo, con el cierre al final |

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

- Jev no explica ni razona: no sustituye la revisión de código ni el análisis de un bug. Elige entre opciones que tú definiste. En la demo 2, Jev dice **dónde** mirar; Claude dice **qué** está mal.
- Como cualquier modelo, es vulnerable a texto malicioso dentro del ticket o la PR. Por eso los umbrales y la revisión humana viven en tu código.
- El ahorro depende de la mezcla de PRs. Di el número que salga.
