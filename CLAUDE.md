# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build all packages (via lerna) then publish
npm run publish

# Build a single package
cd packages/<name> && npx tsc

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npm test -- packages/validator/__tests__/validator.test.ts

# Lint / format
npm run lint
npm run lint:fix
npm run format

# Conventional commit helper (commitizen)
npm run commit

# Pre-publish gate: lint-staged + lint:fix + lerna build
npm run prepare:commit
```

> Tests must always be run from the root. Individual packages intentionally throw an error if you run `npm test` inside them.

---

## Architecture Overview

Weaverkit is a **Lerna monorepo** of scoped `@weaverkit/*` packages providing Express-centric utilities for TypeScript/Node.js apps (Node >= 20, CommonJS output, TypeScript 4.9.5 strict mode, decorators enabled).

### Package dependency graph

```
@weaverkit/adapters.base (abstract)
  ├── @weaverkit/adapters.mongoose
  ├── @weaverkit/adapters.redis
  └── @weaverkit/adapters.sequelize

@weaverkit/express
  └── peerDeps: @weaverkit/data, @weaverkit/errors

@weaverkit/logger
  └── @weaverkit/utils

# Standalone (no internal deps):
@weaverkit/errors
@weaverkit/data
@weaverkit/utils
@weaverkit/validator
```

---

## Package Deep-Dives

### `@weaverkit/errors`

Error hierarchy rooted at abstract `AppError extends Error`.

**Concrete classes and HTTP codes:**

| Class | Code | httpCode |
| --- | --- | --- |
| `BadRequestError` / `InvalidArgumentError` / `InvalidActionError` | `BAD_REQUEST_ERROR` etc. | 400 |
| `UnauthorizedError` | `UNAUTHORIZED_ERROR` | 401 |
| `ForbiddenError` | `FORBIDDEN_ERROR` | 403 |
| `NotFoundError` | `NOT_FOUND_ERROR` | 404 |
| `ConflictError` | `CONFLICT_ERROR` | 409 |
| `UnprocessibleEntityError` | `UNPROCESSIBLE_ENTITY_ERROR` | 422 |
| `ValidationError` (extends above) | `INPUT_VALIDATION_ERROR` | 422 |
| `FailedDependencyError` | `FAILED_DEPENDENCY_ERROR` | 424 |
| `TooManyRequestsError` | `TOO_MANY_REQUESTS_ERROR` | 429 |
| `ServerError` | `SERVER_ERROR` | 500 |
| `NotImplementedError` | `NOT_IMPLEMENTED_ERROR` | 501 |
| `ServiceUnavailableError` | `SERVICE_UNAVAILABLE_ERROR` | 503 |
| `HttpError` | dynamic | custom code passed to constructor |

All errors are **chainable**: `.setCode()`, `.setInfo()`, `.setContext(ctx, append?)`, `.setInner(err)`, `.setHttpHeaders(headers, append?)`, `.setLoggable(bool)`, `.setReportable(bool)`.

`.format(withUnsafe = false)` returns `{ code, message, info }` by default; `format(true)` adds all properties. `ValidationError` also exposes `.fields` in safe props. Subclasses can override `safeProps()`.

`ErrorHandler extends EventEmitter` — wraps plain `Error` → `ServerError`, emits `'handle'` and `'format'` events, optionally envelopes the response (`{ [envelopeKey]: error }`).

---

### `@weaverkit/data`

Response-type wrappers, all extending `Sendable` (abstract base with `.setHttpCode()`, `.setHttpHeaders()`, internal `EventEmitter`).

| Class | Purpose |
| --- | --- |
| `Artifact<T>` | JSON payload — `export()` returns `{ message, data }` |
| `Content` | Inline EJS template rendering via `ejs.render()` |
| `BaseView` / `ViewFactory()` | File-based EJS with optional layout wrapping |
| `Redirection` | HTTP redirect — `send()` returns `{ httpCode, location }` |
| `Renderer` | Abstract renderer base (`render()` → `string`) |

`ViewFactory(options)` is a factory that returns a dynamic `View` class with hardcoded `path`, `extension`, and `layoutDir` — use this instead of subclassing `BaseView`.

`BaseView.normalize(view, folder, ext)` handles trailing-slash (→ `index.ext`), leading-slash stripping, and missing extension.

---

### `@weaverkit/validator`

Standalone schema validation using a **fluent builder** pattern.

**Core API:**

```typescript
import { node, oneOf, validate } from "@weaverkit/validator";

const errors = await validate(obj, [
  node("email").exists().isEmail().withMessage("Bad email"),
  node("age").exists().isInt({ min: 18 }),
  node("addr").child("zip").isString().endChild(),
  oneOf([node("phone").exists(), node("mobile").exists()]).withMessage("Need a number"),
]);
```

- All `validator.js` methods starting with `is` / `to` are auto-attached to `ValidationNode` as chainable validators / sanitizers.
- `.not()` negates the **next** validator.
- `.optional()` / `.exists()` control required-ness.
- Field path `"*"` matches all keys in the object.
- `validate(obj, nodes, { onlyFirst: true })` — stops at first error per field (default `true`).
- Nested paths use dot notation; array elements use `field.*.property`.
- Error shape: `{ parameter: string, message: string }`.

---

### `@weaverkit/express`

Central integration point. Two layers: **app initialization** and a **decorator system**.

#### App Initialization

```typescript
const app = new WeaverExpressApp({
  routes: { "/api": apiRouter },        // RouteCollection
  errorHandler: new ErrorHandler(),
  cors: true,                           // or CorsOptions
  helmet: true,                         // or HelmetOptions
  bodyParser: {
    json: true,                         // default true
    urlencoded: { extended: true },     // default { extended: true }
    text: false, raw: false,            // both default false
  },
  use404Middleware: true,
  useErrorMiddleware: true,
});
app.init();                             // or app.init({ applyErrorMiddlewares: false })
app.app.listen(3000);
```

`applyErrorMiddlewares()` is idempotent. When `useErrorMiddleware: false`, call it manually after all other middleware. 404 middleware **must** be registered before the error handler middleware (this is handled automatically).

**Lifecycle events** (emitted on the app EventEmitter): `preinit`, `init`, `routes:willbind`, `routes:didbind`.

#### Decorator System

Controllers are built with decorators and loaded via `RouteLoader().fromDecoratedControllers([...])`.

```typescript
@Controller("/users", { children: [OtherController] })
class UserController {
  @Get("/:id")
  @UseBefore(authMiddleware)
  async getUser(@Param("id") id: string, @Req() req: Request) {
    return new Artifact({ id });
  }

  @Post("/")
  @UseValidator([CreateUserDTO])
  async create(@Body() body: any) { ... }
}
```

**Parameter decorators:** `@Body(key?)`, `@Param(key?)`, `@Query(key?)`, `@Headers(key?)`, `@Req()`, `@Res()`, `@Next()`.
Using `@Res()` or `@Next()` sets `RESPONSE_HANDLED` — no auto-send occurs.

**Validation decorators:**

```typescript
@ValidationObject("body")
class CreateUserDTO {
  @Constraint({ isEmail: {} })
  email: string;

  @NestedConstraint(AddressDTO)
  address: AddressDTO;
}
```

`@OneOf(chains, message?)` on a class marks at least one chain group must pass.
`@UseValidator([DTO])` on a method runs express-validator before the handler.

**Helpers:**

- `ValidateRequest(req, options?)` — throws `ValidationError` on invalid input; returns matched data.
- `SendResponse(res, result)` — handles `Sendable` instances (applies headers, emits events, redirects).
- `ValidatedRequestHandler(action)` — wraps a function as Express middleware with full validation + response lifecycle.
- `RunMiddlewareIf(condition, middleware)` — conditionally run middleware per request.
- `RouteLoader().fromDefinition(definition)` — build a Router from a plain `RouterDefinition` object.
- `MountCollection(app, collection)` — mount a `RouteCollection` onto an Express app.

---

### `@weaverkit/adapters.base`

Abstract `BaseStorageAdapter<T, C>` using the **Template Method** pattern.

```typescript
class MyAdapter extends BaseStorageAdapter<Connection, MyConfig> {
  defaultConfig(): Partial<MyConfig> { return {}; }
  createConnection(options: MyConfig): Connection { ... }
}

const adapter = new MyAdapter();
adapter.initialize({ ...options }, true); // true = set as class-level default
adapter.connection;                       // getter for the connection

MyAdapter.ensure(adapter?);  // returns connection; falls back to defaultConnection; throws if neither
adapter.clone({ ...overrides });          // new instance with merged config
```

---

### `@weaverkit/adapters.mongoose`

```typescript
const adapter = new MongooseStorageAdapter();
adapter.initialize({ uri: "mongodb://localhost/db" }, true);
// adapter.connection is a mongoose Connection
```

`DEFAULT_SCHEMA_OPTIONS = { timestamps: true }` — exported constant for use in model definitions.

---

### `@weaverkit/adapters.redis`

Three exported utilities:

**`RedisStorageAdapter`** — standard adapter; config takes `RedisOptions & { url?, prefix? }`.

**`RedisHash<T>`** — `Map`-based wrapper around a Redis hash key.

- `RedisHash.find(options)` — async, returns populated `RedisHash` instance.
- `RedisHash.save(key, data, options)` — async, serializes Map or object.
- `RedisHash.get(options)` / `RedisHash.clear(options)` — field/key operations.
- `instance.save(options)`, `instance.toObject()`.
- Serialization: strings/numbers stored raw, arrays/objects as JSON. `unserialize()` tries JSON.parse then falls back to string.

**`KeyVal`** — simple key/value operations.

- `KeyVal.get(options)` — async, returns unserialized value.
- `KeyVal.set(options)` — returns `boolean` (not the value); supports TTL `["EX"|"PX"|"EXAT"|"PXAT", n]` or `"KEEPTTL"` and conditions `"NX"` / `"XX"`.
- `KeyVal.delete(options)`.

`makeKey(key, prefix = "")` — exported utility; smart colon handling (no double colons).

---

### `@weaverkit/adapters.sequelize`

```typescript
const adapter = new SequelizeStorageAdapter();
adapter.initialize({ dialect: "postgres", ... }, true);
// adapter.connection is a Sequelize instance
```

Peer deps: `sequelize`, `sequelize-typescript`, `reflect-metadata`.

---

### `@weaverkit/logger`

Winston logger with **continuation-local storage** (CLS via `cls-hooked`) for request-scoped context.

```typescript
import { Logger, LogStream, Context, createContextId, addFileLogging } from "@weaverkit/logger";

// Attach a context to the current async scope
createContextId((err, contextId) => {
  Context.create((err, ctx) => {
    Context.set("userId", "u_123");
    Logger.info("User action");   // includes ContextId + $context in log output
  });
});

// Enable file rotation logging
addFileLogging("/var/log/myapp");   // writes to /var/log/myapp/%DATE%.log

// Morgan-compatible stream
app.use(morgan("combined", { stream: LogStream }));
```

Custom formats applied: `UppercaseLevel`, `LogContextId` (injects `ContextId` and `$context` fields). File transport strips colorize.

---

### `@weaverkit/utils`

Small utility library — no internal dependencies.

```typescript
import { getUniqueReference, getShortId, getNumberReference, getRandom, noop } from "@weaverkit/utils";

getUniqueReference()    // UUID v4
getShortId()            // shortid
getNumberReference()    // Date.now() as number
getRandom(5)            // random 5-digit integer (10000–89999)
noop(...)               // no-op
```

---

## Key Cross-Cutting Patterns

**Error middleware order is critical:** 404 middleware must be registered before the error handler. `WeaverExpressApp` handles this automatically; if you call `applyErrorMiddlewares()` manually, both must be called in order.

**`Sendable` return values in decorated controllers:** `WeaverExpressApp` auto-detects `Sendable` instances returned from route handlers and calls `.send()`, applies HTTP headers, and emits lifecycle events. Returning a plain object sends it as JSON at status 200.

**`@Res()` / `@Next()` suppress auto-response:** When either is injected into a controller method, the framework sets `RESPONSE_HANDLED` and does not call `SendResponse` automatically.

**Validation flow:** `@UseValidator` runs express-validator chains → `ValidateRequest(req)` inside the handler extracts the result or throws `ValidationError` (422) which the error middleware then formats.

**CLS context is async-boundary-safe:** `cls-hooked` propagates the namespace across `await` calls, so `Context.get()` and `Context.set()` work inside async route handlers as long as `createContextId` was called upstream (e.g., in a request middleware).

---

## TypeScript Config

Root `tsconfig.json`: strict mode, `experimentalDecorators`, `emitDecoratorMetadata`, inline source maps, `.d.ts` output, `noUnusedLocals`, `noUnusedParameters`, target ES2019 CommonJS. Individual packages extend the root with minimal overrides.
