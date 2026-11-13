import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import type { Server } from "node:http";
import type { Server as SocketServer } from "socket.io";

async function openApi(): Promise<{
  httpServer: Server;
  io: SocketServer;
  baseUrl: string;
}> {
  const api = await import("./api.js").catch(() => undefined);
  assert.ok(api, "API server module should exist");
  assert.equal(typeof api.createApiServer, "function", "API server factory should be exported");

  const { httpServer, io } = api.createApiServer();
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  return { httpServer, io, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeApi(httpServer: Server, io: SocketServer): Promise<void> {
  httpServer.closeAllConnections();
  await new Promise<void>(resolve => io.close(() => resolve()));
}

test("health returns API status without requiring Atlas", async () => {
  const api = await openApi();
  try {
    const response = await fetch(`${api.baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {status: "ok"});
  } finally {
    await closeApi(api.httpServer, api.io);
  }
});

test("configuration reports registration disabled without requiring Atlas", async () => {
  const api = await openApi();
  try {
    const response = await fetch(`${api.baseUrl}/v1/config`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {registrationEnabled: false});
  } finally {
    await closeApi(api.httpServer, api.io);
  }
});

test("registration stays unavailable without connecting to Atlas", async () => {
  const api = await openApi();
  try {
    const response = await fetch(`${api.baseUrl}/v1/auth/register`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({email: "owner@example.com", password: "a-strong-test-password"}),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {message: "Registration is not available."});
  } finally {
    await closeApi(api.httpServer, api.io);
  }
});
