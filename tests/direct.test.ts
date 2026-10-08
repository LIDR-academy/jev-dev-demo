import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDirectTicket } from "../jira-triage/classify.ts";
import { parseMarcas } from "../code-health/explain.ts";

test("parseDirectTicket: lee el JSON aunque venga dentro de un bloque ```json", () =>
  assert.deepEqual(parseDirectTicket('```json\n{"tipo":"bug","prioridad":"critica","equipo":"pagos","needs_human":false}\n```'), { tipo: "bug", prioridad: "critica", equipo: "pagos", needsHuman: false }));
test("parseDirectTicket: una opción que no existe es error, no se adivina", () =>
  assert.throws(() => parseDirectTicket('{"tipo":"incidente","prioridad":"alta","equipo":"pagos","needs_human":false}'), /tipo inválido/));
test("parseMarcas: solo cuenta claves conocidas", () => assert.deepEqual(parseMarcas("MARCAS: traga_errores, inventada, numero_magico\n..."), ["traga_errores", "numero_magico"]));
test("parseMarcas: 'ninguna' o sin línea MARCAS → sin marcas", () => { assert.deepEqual(parseMarcas("MARCAS: ninguna"), []); assert.deepEqual(parseMarcas("La función está bien."), []); });
