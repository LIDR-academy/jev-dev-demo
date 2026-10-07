# jev-dev-demo

**Jev decide, el LLM razona.** Dos demos de 12 minutos sobre el mismo patrón:

> estado → pregunta tipada → Jev → probabilidad → **tu código decide** → acción

1. **Triage de Jira**: cada ticket nuevo queda clasificado, priorizado y asignado en < 1 s, con su % de confianza. Lo ambiguo se escala a una persona.
2. **Router de LLM**: Jev decide qué PR merece el modelo grande, cuál basta con uno pequeño y cuál ni siquiera necesita LLM. Mismo lote, 50–75 % menos costo.

Sin dependencias. **Node 22.18+** corre TypeScript directo, trae `fetch` y lee `.env` solo. Se clona y corre.

```bash
git clone <este-repo> && cd jev-dev-demo
cp .env.example .env            # llena las llaves (o ensaya sin ellas con --mock)
npm test                        # 10 pruebas de los umbrales
npm run batch -- --mock         # acto 1 sin Jev ni Jira
npm run review -- --mode=direct --mock && npm run review -- --mode=jev --mock && npm run compare   # acto 2 sin llaves
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
| `jira-triage/batch.ts` | Clasifica los 30 tickets de golpe, imprime tabla, totales y aciertos contra `expected`. |
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
| `data/prs-real.json` | **20 PRs reales de [medusajs/medusa](https://github.com/medusajs/medusa)** (e-commerce TS): 5 docs, 3 bumps, 2 chores grandes, 8 fixes, 2 features de pagos. Esta va a la demo. |
| `data/prs-fast-jev-compaction.json` | 12 PRs reales de [tamaratran/fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction), un plugin de Claude Code que usa Jev. Opción "meta"; pocas y de un solo autor. |
| `data/prs.json` | 20 PRs sintéticas de respaldo si falla la red. |
| `tests/` | Pruebas de umbrales (`node --test`). |

## Preparación (una tarde)

### 1. Llaves

| Variable | Dónde |
| --- | --- |
| `TYPESAFE_API_KEY` | Consola de TypeSafe AI → API keys. Carga unos dólares; la demo completa cuesta centavos. |
| `ANTHROPIC_API_KEY` | console.anthropic.com. El acto 2 en modo `direct` gasta ~$0.20 por corrida con Sonnet. |
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
- **`npm run seed`**: los crea por API con etiqueta `batch`, sin clasificar. Mismo resultado que el CSV, sin tocar la UI de Jira.
- **Claude en Chrome**, uno por uno. Solo si lo anterior falla.

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

Si quieres el acto 2 **en vivo** (abrir una PR y que el router la comente solo), haz un fork de Medusa a tu cuenta, agrega un webhook `pull_request` apuntando a `https://TU-TUNEL/webhook/github` y pon `GITHUB_TOKEN` en `.env`.

### 5. Ensayo

```bash
npm run reset
npm run server                                  # panel izquierdo; deja corriendo
# crea un ticket en Jira → debe aparecer la línea de log y el ticket cambia
npm run batch -- --no-create                    # los 30 importados por CSV
npm run review -- --mode=direct                 # 1–2 min; NO en vivo, precalcula
npm run review -- --mode=jev --concurrency=3    # ~40 s; este sí en vivo
npm run compare
npm run show-review -- PR-17099
```

Cronométralo dos veces, una con hotspot del celular. Graba ambos actos como respaldo.

## El día de la demo

| Min | Comando / acción | Qué se ve |
| --- | --- | --- |
| 0 | Jira con 30 tickets sin clasificar | "Esto ve un manager cada lunes" |
| 2 | VS Code: `shared/thresholds.ts` | Los umbrales son código tuyo, no del modelo |
| 4 | Crear issue "El checkout falla con tarjetas Amex en producción" | Log: `DEMO-31 → bug/critica/pagos (96/89/97 %) → apply` y el ticket cambia solo |
| 6 | Abrir el ticket | Comentario de Jev con las tres decisiones y su % |
| 8 | `npm run batch -- --no-create` | 30 líneas en ~3 s, tabla, costo < 1 centavo |
| 10 | Filtro `labels = revisar` | Los 3 ambiguos escalados |
| 12 | `cat results/direct.json` o la tabla ya corrida | Todo a Sonnet: tantos tokens, tanto costo |
| 14 | VS Code: `llm-router/router.ts` | Una pregunta, tres caminos |
| 16 | `npm run review -- --mode=jev` | Cada PR con ruta y confianza, en vivo |
| 19 | `npm run compare` | Tabla lado a lado. Silencio. Luego el número |
| 21 | `npm run show-review -- PR-17099` | La PR de pagos recibió la misma revisión en ambos modos |
| 24 | `npm run review -- --mode=jev --data=data/prs-fast-jev-compaction.json` | Cierre meta: un plugin de Claude Code que usa Jev para compactar contexto, revisado por un router que usa Jev |
| 26 | Patrón en una diapositiva | "Jev no escribe, Jev elige. Lo que elige lo ejecuta tu código." |

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

## Límites que conviene decir en voz alta

- Jev no explica ni razona: no sustituye la revisión de código ni el análisis de un bug. Elige entre opciones que tú definiste.
- Como cualquier modelo, es vulnerable a texto malicioso dentro del ticket o la PR. Por eso los umbrales y la revisión humana viven en tu código.
- El ahorro depende de la mezcla de PRs. Di el número que salga.
