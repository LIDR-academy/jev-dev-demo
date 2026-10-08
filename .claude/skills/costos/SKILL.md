---
name: costos
description: Saca el coste de cada ejecución de la demo de Jev (triage, pre-vuelo, revisión de PRs) en tokens y USD, y lo explica en una línea por demo. Usar cuando pidan "costos", "cuánto costó", "tokens por ejecución" o "/costos".
---

# Costes por ejecución

1. Corre `npm run costs -- --json` desde la raíz del repo y lee el JSON (no lo muestres completo).
2. Para cada fila de `rows`, escribe una línea en español: nombre de la ejecución, unidades (tickets, funciones o PRs), llamadas y USD de Jev, llamadas y USD de LLM, total y tiempo. Marca "(mock)" si `mock` es true.
3. Cierra con el total de la demo y una comparación: cuánto costó Jev frente al LLM, y si existe `Demo 3 (direct)` y `Demo 3 (jev)`, el porcentaje de ahorro.
4. Si no hay `results/`, dilo y sugiere qué comando correr (`npm run batch`, `npm run scan -- --ticket=T03 --explain`, `npm run review -- --mode=direct|jev`).
5. Si piden los precios, léelos de `llm-router/prices.json` y recuerda que se actualizan la víspera.

No inventes cifras: todo sale del JSON. Si una ejecución es mock, aclara que los tokens son estimados.
