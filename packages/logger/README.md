# `@weaverkit/logger`

> Winston-based logger with per-request context tracking via continuation-local storage (CLS).

## Installation

```bash
npm install @weaverkit/logger
```

## Basic usage

```typescript
import { Logger } from "@weaverkit/logger";

Logger.info("Server started");
Logger.warn("Deprecated config key used");
Logger.error("Unhandled error", { err });
Logger.debug("Query executed", { sql, duration });
```

The preconfigured console transport outputs colorised, timestamped, uppercased-level log lines at `debug` level and above.

---

## Request context tracking

The logger uses `cls-hooked` (Continuation-Local Storage) to automatically attach a `ContextId` and optional key-value context to every log line emitted during a request — without passing anything through function arguments.

### Step 1 — create a context ID (per request middleware)

```typescript
import { createContextId } from "@weaverkit/logger";

app.use((req, res, next) => {
  createContextId((err, contextId) => {
    if (err || !contextId) return next(err);
    // All logs within this async scope will include ContextId: contextId
    next();
  });
});
```

### Step 2 — attach context values (optional)

```typescript
import { Context } from "@weaverkit/logger";

app.use((req, res, next) => {
  createContextId((err, contextId) => {
    if (err || !contextId) return next(err);
    Context.create((_err, ctx) => {
      if (ctx) {
        Context.set("userId", req.user?.id ?? "anonymous");
        Context.set("requestId", req.headers["x-request-id"] as string);
      }
      next();
    });
  });
});
```

Every subsequent `Logger.*` call within the same async chain will include:

```text
info: Request received {"ContextId":"<uuid>","$context":{"userId":"u_42","requestId":"abc"}}
```

### Context API

| Function / method | Description |
| --- | --- |
| `createContextId(cb)` | Starts a CLS namespace run, sets `ContextId` to a UUID v4, calls `cb(null, contextId)` |
| `Context.create(cb)` | Creates a `Map` in the namespace, calls `cb(null, map)` |
| `Context.get()` | Returns the current context `Map`, or `undefined` |
| `Context.set(key, value)` | Sets a value in the current context `Map`; returns `false` if no context exists |
| `getLogNamespace()` | Returns the raw `cls-hooked` namespace (`"log"`) |

---

## Morgan / HTTP access log stream

```typescript
import morgan from "morgan";
import { LogStream } from "@weaverkit/logger";

app.use(morgan("combined", { stream: LogStream }));
```

`LogStream.write(message)` delegates to `Logger.info()`.

---

## File rotation logging

```typescript
import { addFileLogging } from "@weaverkit/logger";

addFileLogging("/var/log/myapp");
// Writes daily rotated files: /var/log/myapp/2024-02-22.log
```

File logs use the same format as console logs but without colorisation. Call this once after your app starts. Multiple calls are additive.

---

## Custom Winston formats

Two reusable Winston formats are exported:

| Format | What it does |
| --- | --- |
| `UppercaseLevel` | Transforms `info.level` to uppercase |
| `LogContextId` | Injects `ContextId` and `$context` fields from the CLS namespace |

These are already applied to the default console and file transports. You can use them when constructing your own Winston transport:

```typescript
import { UppercaseLevel, LogContextId } from "@weaverkit/logger";
import { format } from "winston";

const myFormat = format.combine(
  format.timestamp(),
  UppercaseLevel(),
  LogContextId(),
  format.json(),
);
```
