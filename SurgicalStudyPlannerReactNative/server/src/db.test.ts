import assert from "node:assert/strict";
import { test } from "node:test";
import * as database from "./db.js";

test("memoized initializer shares concurrent calls", async () => {
  assert.equal(typeof database.createMemoizedInitializer, "function");
  let calls = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const initialize = database.createMemoizedInitializer(async () => {
    calls += 1;
    await pending;
  });

  const first = initialize();
  const second = initialize();
  assert.equal(calls, 1);
  release();
  await Promise.all([first, second]);
  await initialize();
  assert.equal(calls, 1);
});

test("memoized initializer retries after a failed initialization", async () => {
  assert.equal(typeof database.createMemoizedInitializer, "function");
  let calls = 0;
  const initialize = database.createMemoizedInitializer(async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary connection failure");
  });

  await assert.rejects(initialize(), /temporary connection failure/);
  await initialize();
  assert.equal(calls, 2);
});
