# `@weaverkit/errors`

> Structured, chainable HTTP error classes and a central error handler for Node.js applications.

## Installation

```bash
npm install @weaverkit/errors
```

## Error Classes

All errors extend the abstract `AppError` base class and carry an HTTP status code and a machine-readable string code.

| Class | `httpCode` | `code` | Default message |
| --- | --- | --- | --- |
| `BadRequestError` | 400 | `BAD_REQUEST_ERROR` | "Bad Request." |
| `InvalidArgumentError` | 400 | `INVALID_ARGUMENT_ERROR` | "Bad Request." |
| `InvalidActionError` | 400 | `INVALID_ACTION_ERROR` | "Requested action is invalid." |
| `UnauthorizedError` | 401 | `UNAUTHORIZED_ERROR` | "Unauthorized." |
| `ForbiddenError` | 403 | `FORBIDDEN_ERROR` | "Forbidden." |
| `NotFoundError` | 404 | `NOT_FOUND_ERROR` | "Not found." |
| `ConflictError` | 409 | `CONFLICT_ERROR` | "Conflict." |
| `UnprocessibleEntityError` | 422 | `UNPROCESSIBLE_ENTITY_ERROR` | "Unprocessible Entity." |
| `ValidationError` | 422 | `INPUT_VALIDATION_ERROR` | "One or more fields…" |
| `FailedDependencyError` | 424 | `FAILED_DEPENDENCY_ERROR` | "Failed Dependency." |
| `TooManyRequestsError` | 429 | `TOO_MANY_REQUESTS_ERROR` | "Too many requests." |
| `ServerError` | 500 | `SERVER_ERROR` | "Server Error." |
| `NotImplementedError` | 501 | `NOT_IMPLEMENTED_ERROR` | "Not Implemented." |
| `ServiceUnavailableError` | 503 | `SERVICE_UNAVAILABLE_ERROR` | "Service Unavailable." |
| `HttpError` | custom | `HTTP_ERROR` | — |

`ValidationError` extends `UnprocessibleEntityError` and adds a `.fields` property.
`HttpError` accepts a custom status code as its first constructor argument.
`ServiceUnavailableError` adds `.setServiceName(name)` for identifying the downstream service.

## Chainable API

Every `AppError` instance supports fluent builder methods — all return `this`:

```typescript
import { NotFoundError, ValidationError, HttpError } from "@weaverkit/errors";

throw new NotFoundError("User not found")
  .setInfo({ userId: 42 })
  .setContext({ requestId: "abc-123" })
  .setHttpHeaders({ "Retry-After": "60" })
  .setLoggable(true)
  .setReportable(false);

throw new ValidationError()
  .setFields([{ parameter: "email", message: "Must be a valid email" }]);

throw new HttpError(418, "I'm a teapot");
```

| Method | Description |
| --- | --- |
| `.setCode(code)` | Override the string/number error code |
| `.setInfo(info)` | Attach arbitrary extra data (included in safe `format()` output) |
| `.setContext(ctx, append?)` | Attach internal context (not in safe output by default) |
| `.setInner(error)` | Wrap an underlying cause `Error` |
| `.setHttpHeaders(headers, append?)` | Set HTTP response headers to apply when the error is sent |
| `.setLoggable(bool)` | Control whether the error should be logged |
| `.setReportable(bool)` | Control whether the error should be reported (e.g. to an error tracker) |

## Formatting

`.format(withUnsafe?)` serialises the error for API responses.

```typescript
const err = new NotFoundError("Item not found").setInfo({ id: 1 });

err.format();       // { code: "NOT_FOUND_ERROR", message: "Item not found", info: { id: 1 } }
err.format(true);   // returns the full AppError instance
```

`ValidationError` also includes `fields` in its safe output:

```typescript
new ValidationError()
  .setFields([{ parameter: "email", message: "Invalid" }])
  .format();
// { code: "INPUT_VALIDATION_ERROR", message: "...", info: undefined, fields: [...] }
```

Subclasses can override the protected `safeProps()` method to control which properties appear in safe format output.

## ErrorHandler

`ErrorHandler` extends `EventEmitter` and acts as a central error-processing point. It is typically passed to `WeaverExpressApp` but can be used standalone.

```typescript
import { ErrorHandler, UnauthorizedError } from "@weaverkit/errors";

const handler = new ErrorHandler({
  format: {
    envelope: true,       // default true — wraps output in { [envelopeKey]: ... }
    envelopeKey: "error"  // default "error"
  }
});

// Subscribe to errors for logging
handler.on("handle", (error) => {
  console.error(`[${error.code}] ${error.message}`);
});

try {
  throw new UnauthorizedError().setContext({ userId: 1 });
} catch (err) {
  const wrapped = handler.handle(err);          // returns AppError (wraps plain Error → ServerError)
  const body    = handler.format(err);          // { error: { code, message, info } }
  res.status(wrapped.httpCode).json(body);
}
```

| Method | Description |
| --- | --- |
| `.wrap(error)` | Returns error as-is if already `AppError`; otherwise wraps in `ServerError` |
| `.handle(error)` | Calls `wrap()`, emits `'handle'` event, returns the wrapped `AppError` |
| `.format(error, withUnsafe?)` | Calls `wrap()`, formats, emits `'format'` event, returns envelope or raw object |

### Events

| Event | Payload | When |
| --- | --- | --- |
| `'handle'` | `AppError` | After `handle()` is called |
| `'format'` | `{ format, error }`, `withUnsafe` | After `format()` is called |

## Class-level defaults

`LOGGABLE_DEFAULT` and `REPORTABLE_DEFAULT` are static properties on `AppError` (both `true` by default). Override them per subclass:

```typescript
class SilentError extends ServerError {
  static LOGGABLE_DEFAULT = false;
  static REPORTABLE_DEFAULT = false;
}
```
