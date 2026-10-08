# Guía: montar la demo con Claude Code, paso a paso

Diez sesiones cortas. Abre Claude Code **dentro de la carpeta `jev-dev-demo`** y pega cada prompt tal cual, uno por sesión (o una sesión larga, en orden). Cada paso dice qué debe salir para dar el siguiente.

Antes de empezar, ten a la mano:

- Cuenta de GitHub con `gh` instalado y autenticado (`gh auth status`).
- API key de TypeSafe AI (Jev), con crédito.
- API key de Anthropic.
- Sitio de Jira Cloud donde seas admin, con un proyecto **DEMO** creado (team-managed, software). Email + API token de Atlassian.
- `ngrok` o `cloudflared` instalado.
- Node 22.18 o superior (`node --version`).

Regla para todos los prompts: Claude Code **no debe imprimir llaves en pantalla ni meterlas en commits**. Si te las pide, pégalas tú en `.env`.

---

## Paso 0 — Contexto

```markdown
Estás en la carpeta jev-dev-demo. Lee README.md y GUIA-CLAUDE-CODE.md completos antes de hacer nada.
Es una demo de 30 minutos que ya funciona en modo mock. No reescribas el código ni cambies la estructura: vamos a configurarlo, conectarlo a servicios reales, publicarlo en GitHub y ensayarlo.
Reglas: nunca imprimas el contenido de .env ni ninguna llave; nunca hagas commit de .env ni de results/; antes de cada cambio en un archivo .ts dime qué vas a cambiar y por qué.
Confirma que entendiste el patrón "estado → pregunta tipada → Jev → probabilidad → tu código decide → acción" y corre `node --version`, `npm test`, `npm run batch -- --mock`, `npm run scan -- --ticket=T03 --explain --mock` y `npm run costs`. Reporta si algo falla.
```

**Debe salir:** 10 tests en verde, la tabla de 30 tickets con 3 escalados, el pre-vuelo sobre Medusa (58 funciones, pocas marcadas) y la tabla de costes.

---

## Paso 1 — Repo en GitHub

```markdown
Inicializa git en esta carpeta si no existe, verifica que .gitignore excluye .env, results/ y node_modules/, y haz el primer commit con mensaje "Demo Jev: triage de Jira + router de LLM".
Crea el repositorio público en mi cuenta de GitHub con `gh repo create jev-dev-demo --public --source=. --push --description "Jev decide, el LLM razona: triage de Jira y router de LLM para ahorrar tokens"`.
Confirma con `gh repo view --web` que está publicado y que .env NO aparece en el árbol del repo.
```

**Debe salir:** URL del repo y confirmación de que `.env` no está subido. Si prefieres repo privado, cambia `--public` por `--private`.

---

## Paso 2 — Llaves y verificación de Jev real

```markdown
Copia .env.example a .env y pídeme que pegue yo mismo TYPESAFE_API_KEY y ANTHROPIC_API_KEY (no las escribas tú ni las muestres).
Cuando te confirme que están, verifica Jev con una llamada real: usa shared/jev.ts con el ticket "El checkout falla con tarjetas Amex en producción" y las preguntas de jira-triage/classify.ts, e imprime solo las respuestas (choice, confidence, noul) y usage, sin la llave.
Si la API responde con error 404 o de esquema, consulta la documentación oficial de TypeSafe AI (endpoint, nombres de campos de request y response) y ajusta SOLO shared/jev.ts para que coincida, explicándome la diferencia antes de cambiarla. No toques el modo mock.
Después corre `npm run batch` SIN --mock pero con JIRA_MOCK=1 para clasificar los 30 tickets con Jev real sin tocar Jira. Dime cuántos aciertos salen contra "expected" y cuántos escalan.
```

**Debe salir:** respuesta real de Jev con probabilidades, y la tabla de 30 con Jev real. Si los aciertos son bajos (< 20/27), pídele a Claude Code que afine las descripciones de los `criteria` en `classify.ts`, no los umbrales.

---

## Paso 3 — Jira: conexión, campo Equipo y permisos

```markdown
Pídeme que pegue en .env JIRA_BASE_URL, JIRA_EMAIL y JIRA_API_TOKEN. Luego verifica la conexión con GET /rest/api/3/myself y GET /rest/api/3/project/DEMO usando fetch desde un script temporal en scripts/ (bórralo al final).
Lista los tipos de issue y prioridades disponibles en DEMO y compáralos con los mapeos ISSUE_TYPE y PRIORITY de jira-triage/jira.ts. Si los nombres difieren (por ejemplo "Historia" en vez de "Story", o "Más alta" en vez de "Highest"), ajusta el mapeo en jira.ts.
Busca con GET /rest/api/3/field un campo llamado "Equipo". Si existe, escribe su id en JIRA_TEAM_FIELD_ID en .env. Si no existe, intenta crearlo con POST /rest/api/3/field como lista desplegable (select) con opciones Pagos, Plataforma, Frontend, Datos, y agregarlo a la pantalla del proyecto. Si no se puede por API en este tipo de proyecto, dame las instrucciones exactas para crearlo en la UI y espera a que te confirme.
Finalmente crea un issue de prueba, aplícale una clasificación de ejemplo con applyClassification, agrégale un comentario y bórralo. Reporta cualquier error 400 con el campo que lo causa.
```

**Debe salir:** "conexión OK", mapeos verificados, `JIRA_TEAM_FIELD_ID` en `.env`, y el issue de prueba creado y borrado sin errores.

---

## Paso 4 — Triage en vivo desde Claude Code (MCP)

```markdown
Autentica el MCP de Atlassian con /mcp → atlassian. Luego escribe: /triage Pagué con mi tarjeta de débito y me llegaron dos cargos por el mismo pedido.
Confirma que Claude creó el issue con el MCP, que `npm run triage -- <KEY>` lo clasificó con Jev y que en Jira tiene tipo, prioridad, etiqueta jev y el comentario de Jev.
```

**Debe salir:** `KAN-xx → bug/critica/pagos → apply` en menos de un segundo de Jev. Sin túnel ni webhook. El paso 4b es la alternativa con webhook, opcional.

## Paso 4b — Túnel y webhook de Jira (opcional)

```markdown
Arranca el servidor con `npm run server` en segundo plano y verifica GET http://localhost:3000/health.
Abre un túnel público al puerto 3000 (ngrok http 3000 o cloudflared tunnel --url http://localhost:3000) y dame la URL pública.
Registra el webhook en Jira apuntando a <URL>/webhook/jira para el evento "jira:issue_created" con filtro JQL "project = DEMO". Intenta primero por API (POST /rest/webhooks/1.0/webhook); si requiere permisos que no tengo, dame los pasos exactos para la UI (Configuración → Sistema → Webhooks) y espera mi confirmación.
Luego crea un issue en DEMO por API con título "Prueba webhook: login falla en Safari" y descripción de dos líneas, espera 3 segundos y muéstrame el log del servidor. Debe aparecer una línea con la clasificación. Abre el issue y confirma que tiene tipo, prioridad, etiqueta jev y el comentario de Jev. Bórralo al terminar.
```

**Debe salir:** la línea de log `DEMO-xx → bug/alta/plataforma (...) → apply` y el ticket cambiado en Jira. Apunta la URL del túnel: cambia cada vez que lo reinicias (con ngrok gratuito) y hay que actualizar el webhook.

---

## Paso 5 — Sembrar el backlog

```markdown
Corre `npm run reset` para limpiar y luego `npm run seed -- --done=8` para crear los 30 tickets de data/tickets.json en DEMO con la etiqueta batch, sin clasificar, y mover los últimos 8 a Listo. Si la transición a Listo falla, muéstrame los nombres de estado que devuelve Jira y ajusta el patrón de transitionTo en jira-triage/jira.ts.
Verifica en Jira (por API) que hay 30 issues con etiqueta batch, 8 en Listo, y que ninguno tiene la etiqueta jev ni comentario de Jev: el servidor debe haberlos ignorado por la etiqueta batch. Si alguno se clasificó, dime cuál y por qué.
Después corre `npm run batch -- --no-create` y confirma que los 22 pendientes quedan clasificados (los 8 en Listo no se tocan), que los 3 ambiguos (T28, T29, T30) quedaron con acción escalate, y guarda la salida de consola en results/ensayo-acto1.txt.
```

**Debe salir:** 30 sembrados (8 en Listo), luego 22 clasificados en segundos con 3 escalados. Esa es la demo 1 completa, real.

---

## Paso 5b — Demo 2 con Jev real: pre-vuelo sobre Medusa

```markdown
Verifica que existe el clon de Medusa en ../medusa-fork (o en MEDUSA_PATH). Si no, clónalo con `gh repo clone LIDR-academy/medusa ../medusa-fork -- --depth 1`.
Corre `npm run scan -- --ticket=T03` SIN mock (Jev real, sin LLM) y dime cuántas funciones marcó y cuáles.
Si marca más de 5 o las marcas son ruido (orquestación normal marcada como "varias responsabilidades"), no toques el escáner ni los umbrales: ajusta las descripciones de los criteria en code-health/scan.ts y vuelve a correr. Después compara contra results-backup/code-health-T03-medusa.json: `roundToCurrencyPrecision` debe seguir marcada.
Luego corre `npm run scan -- --ticket=T03 --explain` (Claude real) y muéstrame las explicaciones. Verifica en el código de Medusa cualquier bug que Claude afirme antes de llevarlo a escena.
Guarda la salida en results-backup/ y prueba el skill: `/pre-vuelo T03`.
```

**Debe salir:** pocas marcas (en el ensayo, 1 o 2 de 58: `roundToCurrencyPrecision` siempre, `refundPayment` en el límite del umbral), Claude confirmándolas con la línea concreta, y el bug de JPY de `roundToCurrencyPrecision` reproducible con el `node -e` del README. Si Jev real marca distinto en otra versión de Medusa, lo que manda es Jev real: afina los `criteria`.

## Paso 5c — Costes

```markdown
Corre `npm run costs` y luego el skill `/costos`. Confirma que aparecen la demo 1 (triage) y la demo 2 (pre-vuelo) con sus tokens y USD reales, y que el total de la demo hasta ahora es menor a $0.10 USD. Si los precios de prices.json no están actualizados, hazlo ahora desde las páginas oficiales y cita las URLs en _nota.
```

---

## Paso 6 — Precios y demo 3 con PRs reales de Medusa

```markdown
Actualiza llm-router/prices.json con los precios vigentes por millón de tokens de claude-sonnet-4-5, claude-haiku-4-5 (página de precios de Anthropic) y de Jev (página de precios de TypeSafe AI). Cita las URLs en el campo _nota.
Verifica que data/prs-real.json tiene 20 PRs de medusajs/medusa. Si quieres refrescarlas, corre `npm run import-prs -- --repo=medusajs/medusa --count=20 --max-docs=5 --out=data/prs-real.json` (usa gh).
Corre `npm run review -- --mode=direct` (sin mock, tarda 1–2 min y gasta unos centavos) y luego `npm run review -- --mode=jev --concurrency=3`. Corre `npm run compare` y `npm run show-review -- PR-17099`. (Esto es con el JSON; en el paso 7 lo repetimos contra las PRs abiertas del fork.)
Dime: el porcentaje de ahorro, cuántas PRs fueron a rules/haiku/sonnet, y si alguna PR fue escalada por touches_money. Copia results/ a results-backup/ (esa carpeta sí se puede commitear) por si el día de la demo falla la red.
```

**Debe salir:** tabla de comparación con ahorro real, probablemente entre 45 y 75 %. Si sale menor, está bien: es el número real de esa mezcla. Si algún PR trivial se va a Sonnet, pídele a Claude Code que afine los `criteria` de `router.ts`.

---

## Paso 7 — Fork de Medusa con las 20 PRs ABIERTAS (recomendado)

Aquí es donde las PRs dejan de vivir en un JSON y pasan a vivir en GitHub. El script recrea las 20 PRs reales como PRs abiertas en tu fork, cada una con su commit original.

```markdown
Haz un fork de medusajs/medusa a mi cuenta con `gh repo fork medusajs/medusa --clone=false` y dime el nombre completo (usuario/medusa).
Corre primero en seco: `node scripts/open-prs.mjs --fork=<usuario>/medusa --dry-run`. Clona el fork con historia (depth 400) en ../medusa-fork, crea la rama demo-base y prepara 20 ramas demo/pr-N con cherry-pick del commit original; para las que choquen usa su propio padre como base. Muéstrame el resumen: cuántas por cherry-pick y cuántas con base propia.
Si todo está bien, corre sin --dry-run. Hace push de las ramas y abre las 20 PRs en el fork con la etiqueta jev-demo. Dame el enlace a la lista de PRs abiertas.
Luego genera el JSON de esas PRs abiertas: `npm run import-prs -- --repo=<usuario>/medusa --state=open --count=20 --out=data/prs-fork.json` y confirma que las 20 traen url del fork, archivos y diff.
```

**Debe salir:** 20 PRs abiertas en `https://github.com/<usuario>/medusa/pulls?q=is:open+label:jev-demo` y `data/prs-fork.json` apuntando a ellas. Si Claude Code reporta que algún commit no está en el clon, pídele que sincronice el fork con upstream (`gh repo sync <usuario>/medusa`) y repita.

## Paso 7b — Que el router comente en las PRs

```markdown
Pídeme que pegue GITHUB_TOKEN en .env (token con permiso de escritura en pull requests del fork).
Corre `npm run review -- --mode=direct --data=data/prs-fork.json` (precalcula, no es en vivo) y luego `npm run review -- --mode=jev --data=data/prs-fork.json --comment --concurrency=3`. Con --comment, cada PR del fork recibe un comentario con complejidad, confianza, dinero, ruta y la revisión plegada.
Abre dos PRs en el navegador, una trivial y una de pagos (#17099 "Support multiple payment accounts"), y confirma que el comentario está. Corre `npm run compare` y `npm run show-review -- PR-<número del fork de 17099>`.
```

**Debe salir:** los comentarios del router visibles en las PRs del fork. En la demo, minuto 16: corres `review --mode=jev --comment` con la lista de PRs abierta en el navegador y los comentarios van apareciendo mientras la terminal imprime las rutas.

Para dejar el fork limpio después: `node scripts/open-prs.mjs --fork=<usuario>/medusa --cleanup` cierra las PRs y borra las ramas.

## Paso 7c — Webhook de GitHub para abrir una PR en vivo (opcional)

```markdown
Crea un webhook en el fork con gh api POST /repos/<usuario>/medusa/hooks (content_type json, evento pull_request, URL <túnel>/webhook/github).
Para probarlo sin clonar completo: con la API de contenidos de GitHub crea la rama demo/live desde demo-base, modifica README.md agregando una línea, y abre una PR hacia demo-base del fork (NUNCA hacia medusajs/medusa). Espera 5 segundos y muéstrame el log del servidor y el comentario que dejó en la PR. Ciérrala al terminar.
```

**Debe salir:** una PR nueva que el router clasifica y comenta sola al abrirse, igual que Jira en la demo 1.

## Paso 8 — Cierre con fast-jev-compaction

```markdown
Corre `npm run review -- --mode=jev --data=data/prs-fast-jev-compaction.json --concurrency=3` y muéstrame la salida. Son las 12 PRs reales del plugin de Claude Code que usa Jev para compactar contexto; es el cierre "meta" de la demo.
Agrega al README, en la sección "El día de la demo", una nota de dos líneas para el minuto 24 con la frase: "Incluso un plugin que usa Jev para decidir qué contexto conservar puede ser revisado por un router que usa Jev para decidir qué modelo lo revisa. Mismo patrón."
```

---

## Paso 9 — Ensayo cronometrado

```markdown
Vamos a ensayar la demo completa. Corre `npm run reset` y `npm run seed`. Arranca el servidor y el túnel, y confirma que el webhook de Jira sigue apuntando a la URL actual del túnel (si cambió, actualízalo).
Luego dame los comandos uno por uno siguiendo la tabla "El día de la demo" del README, y espera a que te diga "siguiente" entre cada uno. Cronometra cuánto tarda cada paso y al final dame una tabla minuto a minuto con los tiempos reales y qué pasos excedieron lo planeado.
Al terminar, corre `npm run reset` otra vez y deja el proyecto limpio.
```

**Debe salir:** la demo completa de principio a fin con tiempos reales. Hazlo dos veces: una con tu red normal, otra con el hotspot del celular.

---

## Paso 10 — Publicar la versión final

```markdown
Revisa que .env no está en git, que results/ está ignorado y que results-backup/ sí está incluido. Actualiza el README si cambió algo en los pasos anteriores (mapeos de Jira, precios, nombre del fork).
Haz commit con mensaje "Demo lista: ensayo completo con Jev, Jira y Medusa" y push.
Dame el enlace del repo y un párrafo de 3 líneas para pegar en Slack con el enlace y la frase "clónenlo y cámbienle las preguntas".
```

---

## Si algo falla

| Síntoma | Qué pedirle a Claude Code |
| --- | --- |
| Jev responde 401 | "Verifica que TYPESAFE_API_KEY está en .env sin comillas ni espacios y que la cuenta tiene crédito. No la imprimas." |
| Jev responde 400 con un campo | "Compara el body que mandamos en shared/jev.ts con la documentación oficial de TypeSafe y ajusta solo los nombres de campo." |
| Jira 400 al cambiar issuetype | "Cambia ISSUE_TYPE en jira.ts a los nombres exactos que devuelve GET /rest/api/3/project/DEMO, o deja el tipo sin cambiar y pon el tipo solo en el comentario." |
| El webhook no llega | "Confirma que el túnel sigue vivo, que la URL del webhook en Jira coincide, y manda un POST manual a /webhook/jira con un payload de ejemplo para separar el problema de Jira del problema del servidor." |
| El pre-vuelo marca ruido o deja de marcar `roundToCurrencyPrecision` | "Muéstrame las respuestas de Jev para esa función en results/code-health.json y ajusta solo la descripción del criterio que falló en code-health/scan.ts. No cambies SCAN_THRESHOLD salvo que el ruido sea general." |
| El ahorro sale bajo | "Está bien, es el número real. Muéstrame la tabla de rutas: si hay PRs triviales en sonnet, afina los criteria de router.ts; si no, lo dejamos así." |
| Se acaba el tiempo en la demo | Salta a `npm run compare` con `results-backup/` y muestra la tabla final. |
