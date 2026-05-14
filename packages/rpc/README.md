# `@weaverkit/rpc`

> Redis-backed RPC client and server using a SYN/ACK handshake so payloads only flow when a worker is alive.

## Installation

```bash
npm install @weaverkit/rpc \
  @weaverkit/adapters.redis @weaverkit/errors ioredis
```

The `@weaverkit/*` packages and `ioredis` are peer dependencies — your application provides them so error classes serialize/deserialize against a single shared module.

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
  logger: (level, msg, meta) => myLogger[level](msg, meta), // optional, defaults to console
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

Handlers may throw any `AppError` from `@weaverkit/errors` — it is serialized and re-thrown on the client as the same subclass (so `instanceof BadRequestError` works across the wire). Non-`AppError` throws (driver errors, `TypeError`, etc.) are **logged server-side and replaced with a generic `ServerError("Internal server error")` before crossing the wire** — the raw message is not leaked to the caller. Wrap your error in an `AppError` subclass if you want the caller to see a specific message.

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
| `logger` | `(level, message, meta?) => void` | `console` | Plug in winston/pino/etc. `level` is `"error" \| "warn" \| "info" \| "debug"` |

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

---

## Security model

### Trust boundary

The Redis instance is a **trusted bus**. Anyone able to `RPUSH` onto `rpc:syn:{service}` is treated as a legitimate caller — there is no authentication beyond Redis ACLs themselves. Run `@weaverkit/rpc` only on Redis instances that share the same trust boundary as your services (single VPC, single auth realm). Do not expose the Redis port across trust boundaries.

If you need to expose RPC across a less-trusted boundary, terminate it at a service that authenticates and authorizes callers, then re-issue RPC calls on the internal bus.

### Handler exceptions

Handlers are run server-side, but errors travel back to the caller. The library applies two rules:

1. **`AppError` subclasses pass through** with `code`, `info`, `fields`, etc. preserved. The caller sees the same error class and message.
2. **Anything else is replaced** with `ServerError("Internal server error")` before crossing the wire. The original exception is logged via the injected `logger` with the `correlationId` for correlation.

Driver errors, `TypeError`s, `ENOENT` paths, etc. would otherwise leak schema/path/internal details. To propagate a specific message to the caller, wrap the failure explicitly:

```ts
throw new BadRequestError("Invalid webhook URL").setInfo({ field: "url" });
```

### Channel validation

The server enforces that the caller's `replyTo` matches `^rpc:reply:[A-Za-z0-9_-]{1,64}$` before publishing any reply. Malformed SYNs are dropped and logged. This is a defence-in-depth guard against malformed clients and against the `replyTo` field being abused as an arbitrary-channel-publish primitive.

### Identifier entropy

`clientId` and `correlationId` are `nanoid()` values (~126 bits each). They are unguessable for practical purposes — hijacking a victim's in-flight call by guessing both IDs is not realistic. Do not log them at info level over an untrusted channel without thinking about why.
