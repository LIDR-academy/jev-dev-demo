import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, routeFor } from "../shared/thresholds.ts";

test("decide: confianza alta aplica directo", () => assert.equal(decide(0.9, 0.1), "apply"));
test("decide: confianza media aplica y marca", () => assert.equal(decide(0.6, 0.1), "apply_and_flag"));
test("decide: confianza baja escala", () => assert.equal(decide(0.4, 0.1), "escalate"));
test("decide: Jev pide humano → escala aunque la confianza sea alta", () => assert.equal(decide(0.95, 0.8), "escalate"));
test("decide: umbrales exactos", () => { assert.equal(decide(0.7, 0), "apply"); assert.equal(decide(0.5, 0), "apply_and_flag"); assert.equal(decide(0.499, 0), "escalate"); });

test("routeFor: trivial → rules", () => assert.equal(routeFor("trivial", 0.9, 0.05).route, "rules"));
test("routeFor: media → haiku", () => assert.equal(routeFor("media", 0.9, 0.05).route, "haiku"));
test("routeFor: alta → sonnet", () => assert.equal(routeFor("alta", 0.9, 0.05).route, "sonnet"));
test("routeFor: confianza baja escala a sonnet", () => assert.equal(routeFor("trivial", 0.5, 0.05).route, "sonnet"));
test("routeFor: toca dinero escala a sonnet aunque sea media", () => assert.equal(routeFor("media", 0.95, 0.7).route, "sonnet"));
