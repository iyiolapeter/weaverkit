# `@weaverkit/rpc`

> Redis-backed RPC client and server using a SYN/ACK handshake so payloads only flow when a worker is alive.

## Installation

```bash
npm install @weaverkit/rpc \
  @weaverkit/adapters.redis @weaverkit/errors @weaverkit/logger ioredis
```

The four `@weaverkit/*` packages and `ioredis` are peer dependencies — your application provides them so error classes serialize/deserialize against a single shared module.

---

## Protocol overview

Each call is a three-phase exchange over Redis:

1. **SYN** — client `RPUSH`es a small SYN (correlation id + action + reply channel) onto `rpc:syn:{service}`. No payload yet.
2. **ACK** — a server worker `BLPOP`s the SYN and `PUBLISH`es an ACK on the client's reply channel.
3. **Payload** — only on receiving the ACK does the client `RPUSH` the payload to `rpc:req:{correlationId}` (keyed with a 60 s TTL). The server `BLPOP`s the payload, runs the handler, and `PUBLISH`es the result (or intermediate events, or an error) back.

This avoids the classic Redis-RPC failure mode where a payload is enqueued for a dead service and silently rots.

All messages are encoded with [msgpackr](https://github.com/kriszyp/msgpackr).

---

## `RpcServer`

```typescript
import { RpcServer } from "@weaverkit/rpc";
import { RedisStorageAdapter } from "@weaverkit/adapters.redis";

const redis = new RedisStorageAdapter();
redis.initialize({ host: "localhost", port: 6379 }, true);

const server = new RpcServer({
  redis,
  service: "webhook",
  concurrency: 4,    // optional, default 1 — number of parallel handlers
  ackTimeout: 2000,  // optional, ms — SYNs older than this are discarded as stale
});

server.register("create-subscription", async (ctx) => {
  ctx.emit("validating");
  const result = await doWork(ctx.payload);
  ctx.emit("created", { id: result.id });
  return result;
});

await server.start();
// ...
await server.stop(); // waits for in-flight handlers to drain
```

### Handler context

```typescript
interface RpcHandlerContext<T> {
  action: string;
  payload: T;
  correlationId: string;
  emit(name: string, data?: any): void; // fire intermediate progress events
}
```

Handlers may throw any `AppError` from `@weaverkit/errors` — it is serialized and re-thrown on the client as the same subclass (so `instanceof BadRequestError` works across the wire). Non-`AppError` throws are wrapped in `ServerError`.

---

## `RpcClient`

```typescript
import { RpcClient } from "@weaverkit/rpc";

const client = new RpcClient({
  redis,
  ackTimeout: 2000,   // optional, ms — error if no ACK received
  replyTimeout: 30000,// optional, ms — error if no result after ACK (resets on each event)
});
await client.connect();

// Simple call
const result = await client.call("webhook", "create-subscription", { url: "https://..." });

// Call with intermediate events
const call = client.call<{ id: string }>("webhook", "create-subscription", { url: "..." });
call.on("event", (name, data) => console.log("progress:", name, data));
const result = await call;

await client.disconnect();
```

### `call()` options

Per-call overrides for the client defaults:

```typescript
await client.call("webhook", "slow-action", payload, {
  ackTimeout: 5000,
  replyTimeout: 120000,
});
```

---

## Errors

| Condition | Error thrown on client |
| --- | --- |
| Server doesn't ACK within `ackTimeout` | `ServiceUnavailableError` |
| No reply (result/event) within `replyTimeout` | `ServiceUnavailableError` |
| Handler throws an `AppError` | Same subclass, with `code`, `info`, `fields`, etc. preserved |
| Handler throws a plain `Error` | `ServerError` (message preserved) |
| Action is not registered on the service | `NotFoundError` |
| `client.disconnect()` while calls are pending | `ServiceUnavailableError` |

---

## Options reference

### `RpcServerOptions`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `redis` | `RedisStorageAdapter` | — | A `@weaverkit/adapters.redis` adapter |
| `service` | `string` | — | The service name SYNs are routed by |
| `concurrency` | `number` | `1` | Number of parallel listener loops (real handler parallelism) |
| `ackTimeout` | `number` | `2000` | SYNs older than this are discarded as stale on receipt |

### `RpcClientOptions`

| Field | Type | Default |
| --- | --- | --- |
| `redis` | `RedisStorageAdapter` | — |
| `ackTimeout` | `number` | `2000` |
| `replyTimeout` | `number` | `30000` |

---

## Notes

- The server clones the adapter once per listener plus once for the publisher, so a server with `concurrency: N` opens `N + 1` ioredis connections. The client opens 2 (subscriber + commander).
- `replyTimeout` is an *idle* timeout — it resets on each intermediate event, then on `result`/`error`.
- Handlers run with **at-least-once** semantics. If a client retries after an ACK timeout, the server may run the action twice. Make idempotent handlers when retries are possible.
- Stale SYNs accumulated during server downtime are drained (non-blocking) at startup before the listener loop begins.
