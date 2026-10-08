---
name: pre-vuelo
description: Antes de tocar código para un ticket, escanea con Jev las funciones de los archivos involucrados y detecta bugs ya existentes (varias responsabilidades, errores tragados, mutación de parámetros, números mágicos, lógica duplicada); solo lo marcado se explica con Claude. Usar cuando digan "pre-vuelo", "revisa el código antes de la tarea", "qué bugs hay en lo que voy a tocar" o "/pre-vuelo T03".
---

# Pre-vuelo: bugs que ya existen en el código que vas a tocar

Patrón: Jev decide qué funciones merecen atención (milisegundos, centavos); Claude explica solo esas.

## Pasos

1. Identifica el ticket (`T03`, `DEMO-31`…) o los archivos. Si es un ticket de `data/tickets.json`, usa `data/tickets-files.json` (`T03` apunta a Medusa en `MEDUSA_PATH`, por defecto `../medusa-fork`); si no está mapeado, busca en el repo los archivos relacionados con el título del ticket y propón la lista antes de escanear.
2. Corre `npm run scan -- --ticket=<id> --explain` (o `--files=a.ts,b.ts`). Si no hay llaves en `.env`, agrega `--mock` y dilo.
3. Lee `results/code-health.json`. Presenta:
   - Una tabla corta: función, archivo, lo que marcó Jev con su %, severidad.
   - Para cada función marcada, la explicación de Claude resumida en 2 líneas y el refactor mínimo propuesto.
   - Cuántas funciones quedaron limpias y no costaron tokens de LLM.
4. Termina con una recomendación de orden: qué arreglar antes de empezar la tarea, qué puede esperar, y si alguna señal parece falso positivo, dilo.
5. Si piden aplicar un refactor, hazlo en una rama nueva y muestra el diff antes de commitear.

## Umbrales

`SCAN_THRESHOLD` (default 0.6) en `.env` decide desde qué probabilidad una señal cuenta como marca. Súbelo si hay ruido, bájalo si se escapan bugs. Las preguntas tipadas viven en `code-health/scan.ts`; ajusta las descripciones de los `criteria`, no el código del escáner, si Jev clasifica mal.
