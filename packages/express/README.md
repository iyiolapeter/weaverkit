# `@weaverkit/express`

> Non-obstructive Express helpers: app bootstrapping, a TypeScript decorator-based controller system, schema validation, and response handling utilities.

## Installation

```bash
npm install @weaverkit/express @weaverkit/errors @weaverkit/data express express-validator
npm install --save-dev @types/express
```

Enable TypeScript decorators in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

---

## Table of contents

1. [App bootstrapping](#1-app-bootstrapping)
2. [RouteCollection](#2-routecollection)
3. [Decorator-based controllers](#3-decorator-based-controllers)
   - [@Controller](#controller)
   - [HTTP verb decorators](#http-verb-decorators)
   - [Parameter decorators](#parameter-decorators)
   - [Middleware decorators](#middleware-decorators)
   - [Controller inheritance](#controller-inheritance)
   - [Nested controllers](#nested-controllers)
   - [Dependency injection](#dependency-injection)
   - [Loading controllers](#loading-controllers)
4. [Response handling](#4-response-handling)
5. [Validation](#5-validation)
   - [@ValidationObject and @Constraint](#validationobject-and-constraint)
   - [@NestedConstraint](#nestedconstraint)
   - [@OneOf](#oneof)
   - [@UseValidator](#usevalidator)
   - [Conditional validation with $if](#conditional-validation-with-if)
   - [Global validation options](#global-validation-options)
   - [Imperative validation](#imperative-validation)
6. [RouteLoader](#6-routeloader)
7. [Standalone helpers](#7-standalone-helpers)
8. [Type reference](#8-type-reference)

---

## 1. App bootstrapping

`WeaverExpressApp` creates an Express application, applies standard middleware, mounts your routes, and wires up error handling — all from a single config object.

```typescript
import { WeaverExpressApp, RouteCollection } from "@weaverkit/express";
import { ErrorHandler } from "@weaverkit/errors";

const errorHandler = new ErrorHandler({ format: { envelope: true } });
errorHandler.on("handle", (error) => console.error(`[${error.code}]`, error.message));

const routes: RouteCollection = {
  "/users": userRouter,
  "/posts": postRouter,
};

const app = new WeaverExpressApp({
  routes,
  errorHandler,

  // Security / transport middleware (all default true)
  cors: true,               // or: cors.CorsOptions
  helmet: true,             // or: helmet options object

  // Body parsers
  bodyParser: {
    json: true,             // default true — express.json()
    urlencoded: { extended: true }, // default { extended: true }
    text: false,            // default false
    raw: false,             // default false
  },

  // Error handling
  use404Middleware: true,   // default true — auto-404 for unmatched routes
  useErrorMiddleware: true, // default true — centralised error response
});

app.init();
app.app.listen(3000, () => console.log("Listening on :3000"));
```

Setting a middleware option to `false` skips it entirely. Passing an options object (instead of `true`) passes those options directly to the underlying library.

### Deferring error middleware

Sometimes you need to add more middleware (e.g. a request logger) **after** routes but **before** the error handler. Use `applyErrorMiddlewares: false` and call `applyErrorMiddlewares()` manually when ready:

```typescript
const app = new WeaverExpressApp({
  routes,
  errorHandler,
  useErrorMiddleware: false,
});

app.init({ applyErrorMiddlewares: false });

// Register extra middleware after routes
app.app.use(morgan("combined", { stream: LogStream }));

// Now apply 404 + error handler — safe to call multiple times (idempotent)
app.applyErrorMiddlewares();

app.app.listen(3000);
```

> **Order matters:** `applyPageNotFoundMiddleware` is always registered before `applyErrorHandlerMiddleware`. Never register routes after calling `applyErrorMiddlewares()`.

### Lifecycle events

`WeaverExpressApp extends EventEmitter`. Listen with `app.on(event, handler)`.

| Event | Payload | Fires |
| --- | --- | --- |
| `"preinit"` | `express.Application` | Before any middleware is applied |
| `"init"` | `express.Application` | After routes are bound, before error middleware |
| `"routes:willbind"` | `express.Application` | Immediately before `MountCollection` runs |
| `"routes:didbind"` | `express.Application` | Immediately after `MountCollection` runs |

```typescript
app.on("preinit", (expressApp) => {
  expressApp.set("trust proxy", 1); // set before any middleware
});

app.on("routes:didbind", (expressApp) => {
  console.log("All routes mounted");
});
```

### Custom error rendering

`renderError` intercepts the error response before the default `res.status(httpCode).json(format)` is sent. Return `true` to signal that you handled the response yourself, or `false` / falsy to fall through to the default:

```typescript
new WeaverExpressApp({
  routes,
  errorHandler,
  renderError: async (error, format, req, res) => {
    if (req.accepts("html")) {
      res.status(error.httpCode).render("error", { error: format });
      return true; // response sent — skip default JSON handler
    }
    return false; // let the default JSON handler run
  },
});
```

The `error` argument is the `AppError` instance. `format` is the already-serialised output of `errorHandler.format(error)`.

---

## 2. RouteCollection

`RouteCollection` is the map of mount paths to handlers passed to `WeaverExpressApp`:

```typescript
type RouteCollection = Record<string, Router | BaseExpressApp | RouterPathAlias>;
```

Each value may be:

| Value type | Behaviour |
| --- | --- |
| `express.Router` | Mounted directly via `app.use(path, router)` |
| `BaseExpressApp` | Its `.app` property is mounted |
| `string` (path alias) | Redirected to another path in the collection (not yet commonly used) |

```typescript
const routes: RouteCollection = {
  "/api/v1/users": userRouter,        // Router
  "/api/v1/posts": postApp,           // WeaverExpressApp or BaseExpressApp
};
```

---

## 3. Decorator-based controllers

### `@Controller`

Marks a class as a route controller and sets the base path for all its methods.

```typescript
import { Controller, Get, Post, Put, Patch, Delete } from "@weaverkit/express";

@Controller("/users")
class UserController {
  @Get("/")
  list() { ... }

  @Get("/:id")
  getOne() { ... }

  @Post("/")
  create() { ... }

  @Put("/:id")
  replace() { ... }

  @Patch("/:id")
  update() { ... }

  @Delete("/:id")
  remove() { ... }
}
```

Options:

```typescript
@Controller("/users", {
  routerOptions: { strict: true, caseSensitive: true }, // passed to express.Router()
  children: [AddressController],                         // nested child controllers
})
class UserController { ... }
```

### HTTP verb decorators

All decorators accept an Express path string (including params like `/:id`) or any `PathParams` value accepted by Express:

```typescript
@Get("/")          // GET  /
@Post("/")         // POST /
@Put("/:id")       // PUT  /:id
@Patch("/:id")     // PATCH /:id
@Delete("/:id")    // DELETE /:id
@Head("/")         // HEAD /
@Trace("/")        // TRACE /
```

### Parameter decorators

Parameter decorators inject values from the request into the method's arguments by position. When `@UseValidator` is active, `@Body`, `@Param`, `@Query`, and `@Headers` automatically prefer the validated and sanitised version of the data over the raw request data.

```typescript
import { Body, Param, Query, Headers, Req, Res, Next } from "@weaverkit/express";
import { Request, Response, NextFunction } from "express";

@Controller("/users")
class UserController {
  @Get("/")
  list(
    @Query("page") page: string,          // req.query.page  (validated if available)
    @Query() query: Record<string, any>,  // entire req.query object
    @Headers("authorization") token: string, // req.headers.authorization
  ) { ... }

  @Get("/:id")
  getOne(
    @Param("id") id: string,  // req.params.id
    @Req() req: Request,      // full Request — disables auto-response
  ) { ... }

  @Post("/")
  create(
    @Body() body: any,        // entire req.body (validated if @UseValidator active)
    @Body("email") email: string, // req.body.email
  ) { ... }

  @Delete("/:id")
  remove(
    @Param("id") id: string,
    @Res() res: Response,     // full Response — disables auto-response
    @Next() next: NextFunction, // next function — disables auto-response
  ) {
    res.status(204).send();   // must send manually when @Res/@Next is used
  }
}
```

| Decorator | Source | Key argument |
| --- | --- | --- |
| `@Body(key?)` | `req.body` | Optional field name |
| `@Param(key?)` | `req.params` | Optional param name |
| `@Query(key?)` | `req.query` | Optional field name |
| `@Headers(key?)` | `req.headers` | Optional header name |
| `@Req()` | `req` | — |
| `@Res()` | `res` | — |
| `@Next()` | `next` | — |

> **Auto-response suppression:** Injecting `@Res()` or `@Next()` into any parameter position marks the route as response-handled. The framework will not call `SendResponse` automatically — you are responsible for sending the response.

#### Custom parameter decorators

Use `CreateArgDecorator` to build reusable parameter decorators backed by a custom resolver function:

```typescript
import { CreateArgDecorator } from "@weaverkit/express";

// Inject req.user or a specific field from it
const User = (key?: string) =>
  CreateArgDecorator((req, k) => (k ? req.user?.[k as string] : req.user), key);

@Controller("/profile")
class ProfileController {
  @Get("/")
  get(@User() user: AuthUser) { ... }

  @Get("/email")
  getEmail(@User("email") email: string) { ... }
}
```

The resolver receives `(req: Request, key?: string | symbol)` and may return any value.

### Middleware decorators

`@UseBefore` and `@UseAfter` accept one or more standard Express middleware functions. When applied to a **class**, the middleware is added to the router. When applied to a **method**, it is added to that specific route only.

```typescript
import { UseBefore, UseAfter } from "@weaverkit/express";

@Controller("/admin")
@UseBefore(requireAuthMiddleware)     // runs before ALL routes in this router
@UseBefore(requireAdminMiddleware)    // multiple decorators stack — both run
class AdminController {
  @Get("/stats")
  @UseBefore(rateLimitMiddleware)     // runs before this route only
  @UseAfter(auditLogMiddleware)       // runs after this route's handler
  stats() { ... }
}
```

**Execution order for a request to `GET /admin/stats`:**

1. `requireAuthMiddleware` (router-level `before`)
2. `requireAdminMiddleware` (router-level `before`)
3. `rateLimitMiddleware` (route-level `before`)
4. `stats()` handler
5. `auditLogMiddleware` (route-level `after`)

Multiple `@UseBefore` / `@UseAfter` decorators on the same target stack in declaration order (top-most runs first).

### Controller inheritance

A controller subclass automatically inherits all routes from its parent. Use `MergeRoutes` indirectly through the standard inheritance pattern — the `@Controller` decorator handles the merge automatically:

```typescript
@Controller("/base")
class BaseController {
  @Get("/health")
  health() {
    return { status: "ok" };
  }
}

@Controller("/v2")
class V2Controller extends BaseController {
  @Get("/features")
  features() { ... }
}
// V2Controller has both GET /v2/health and GET /v2/features
```

### Nested controllers

```typescript
@Controller("/addresses")
class AddressController {
  @Get("/")
  list(@Param("userId") userId: string) { ... }
}

@Controller("/users", { children: [AddressController] })
class UserController {
  @Get("/")
  list() { ... }
}
// Mounts AddressController at /users/addresses
```

Children are mounted at their own base path under the parent's path.

### Dependency injection

By default, `GetRouterFromController` instantiates controller classes with `new Ctor()`. Pass a `container` to use a custom DI container:

```typescript
import { RouteLoader } from "@weaverkit/express";
import { Container } from "inversify"; // example — any container works

const container = new Container();
container.bind(UserController).toSelf();

const routes = RouteLoader().fromDecoratedControllers([
  [UserController, { container: { get: (Ctor) => container.get(Ctor) } }],
]);
```

The container interface is minimal:

```typescript
interface Container {
  get(token: any): any;
}
```

You can also pass pre-constructed instances instead of class constructors:

```typescript
const userControllerInstance = new UserController(someService);

RouteLoader().fromDecoratedControllers([userControllerInstance]);
```

### Loading controllers

`RouteLoader().fromDecoratedControllers(controllers)` converts an array of controller classes (or `[class, config]` tuples) into a `RouteCollection` ready to pass to `WeaverExpressApp`:

```typescript
import { RouteLoader, WeaverExpressApp } from "@weaverkit/express";

const routes = RouteLoader().fromDecoratedControllers([
  UserController,
  PostController,
  [AdminController, { container: diContainer }],
]);

new WeaverExpressApp({ routes, errorHandler }).init();
```

If a controller's path is not a simple string (e.g. a regex), a warning is logged and you must mount it manually:

```typescript
const { path, router } = GetRouterFromController(ComplexController);
app.app.use(path, router);
```

---

## 4. Response handling

Route handler methods may return any value. The framework calls `SendResponse(res, result)` automatically unless `@Res()` or `@Next()` is present.

| Return value | What happens |
| --- | --- |
| `Artifact` / any `Sendable` | `.send()` is called; HTTP headers and status from the instance are applied; `beforesend` / `aftersend` events are emitted |
| `Redirection` | `res.redirect(httpCode, location)` is called |
| Any other value | Sent as JSON at status 200 (or the `defaultStatusCode` argument) |

```typescript
import { Artifact, Redirection } from "@weaverkit/data";

@Controller("/items")
class ItemController {
  @Get("/")
  list() {
    return new Artifact(items, "Found");          // 200 { message, data }
  }

  @Post("/")
  create(@Body() body: CreateItemDTO) {
    return new Artifact(item).setHttpCode(201);   // 201 { data }
  }

  @Get("/legacy")
  legacy() {
    return new Redirection("/items", 301);        // 301 redirect
  }

  @Get("/raw")
  raw() {
    return { hello: "world" };                    // 200 plain JSON
  }
}
```

---

## 5. Validation

The validation system wraps `express-validator`. DTO classes decorated with `@ValidationObject` and `@Constraint` are compiled into `express-validator` `checkSchema` chains. These chains run as `@UseBefore` middleware injected by `@UseValidator`.

### `@ValidationObject` and `@Constraint`

```typescript
import { ValidationObject, Constraint } from "@weaverkit/express";

@ValidationObject("body")   // declares which request location this DTO validates
class CreateUserDTO {
  @Constraint({ notEmpty: {}, isEmail: {} })
  email: string;

  @Constraint([
    { notEmpty: {} },
    { isLength: { options: { min: 8 } }, errorMessage: "Min 8 characters" },
  ])
  password: string;

  @Constraint({ optional: { options: { nullable: true } }, isURL: {} })
  website?: string;
}
```

`@ValidationObject` location values: `"body"` | `"query"` | `"params"` | `"headers"`.

`@Constraint` accepts a single `FieldConstraint` or an array of them. `FieldConstraint` is `express-validator`'s `ParamSchema` (without `in`) plus an optional `$if` predicate.

`@ValidationObject` supports inheritance — the parent schema is automatically merged into the subclass schema.

### `@NestedConstraint`

Validates a nested object or array of objects by composing another DTO's schema.

```typescript
@ValidationObject("body")
class AddressDTO {
  @Constraint({ notEmpty: {}, isPostalCode: { options: ["US"] } })
  zip: string;

  @Constraint({ notEmpty: {} })
  street: string;
}

@ValidationObject("body")
class CreateOrderDTO {
  @Constraint({ notEmpty: {} })
  title: string;

  @NestedConstraint(AddressDTO)
  shippingAddress: AddressDTO;
  // Validates body.shippingAddress.zip and body.shippingAddress.street

  @NestedConstraint([AddressDTO])
  billingAddresses: AddressDTO[];
  // Validates body.billingAddresses.*.zip and body.billingAddresses.*.street

  @NestedConstraint(AddressDTO, {
    extraRules: { zip: { isLength: { options: { min: 5, max: 10 } } } },
    $if: body("hasAddress").equals("true"), // entire nested block is conditional
  })
  conditionalAddress?: AddressDTO;
}
```

### `@OneOf`

A class-level decorator that requires at least one of the provided validation chain groups to pass:

```typescript
import { OneOf } from "@weaverkit/express";
import { body } from "express-validator";

@OneOf(
  [
    [body("phone").isMobilePhone("any")],
    [body("email").isEmail()],
  ],
  "Provide either a phone number or an email",
)
@ValidationObject("body")
class ContactDTO { ... }
```

If all groups fail, a single error object is produced with a `message` property.

### `@UseValidator`

Attaches validation to a route method. Validation runs before the handler — if validation fails, a `ValidationError` (422) is thrown and propagated to the error handler.

```typescript
import { UseValidator } from "@weaverkit/express";

@Controller("/users")
class UserController {
  @Post("/")
  @UseValidator([CreateUserDTO])
  create(@Body() body: CreateUserDTO) {
    // body is already the validated, sanitised data
    return new Artifact(body, "Created").setHttpCode(201);
  }
}
```

When `@UseValidator` is active, `@Body()`, `@Param()`, `@Query()`, and `@Headers()` automatically return the **validated and sanitised** version of the data (stored under `req[VALIDATED_REQUEST_SYMBOL]`) rather than the raw `req.body` / `req.params` etc.

`@UseValidator` also accepts raw `express-validator` chains alongside DTOs:

```typescript
import { body } from "express-validator";

@Post("/import")
@UseValidator({
  objects: [ImportDTO],
  chains: [
    [body("format").isIn(["csv", "json"])], // raw chain
    ["body"],                                 // locations for the raw chain
  ],
})
import(@Body() body: any) { ... }
```

### Conditional validation with `$if`

`$if` conditionally runs a constraint only when its predicate is satisfied. It accepts either an `express-validator` `ValidationChain` (run in dry-run mode) or a plain function:

```typescript
@ValidationObject("body")
class SubscriptionDTO {
  @Constraint({ isIn: { options: [["free", "premium"]] } })
  plan: string;

  // Only validate promoCode when plan === "premium"
  @Constraint({
    optional: {},
    isLength: { options: { min: 6 } },
    $if: body("plan").equals("premium"),
  })
  promoCode?: string;
}
```

### Global validation options

Override the defaults applied to all `@UseValidator` calls:

```typescript
import { SetGlobalValidationOptions } from "@weaverkit/express";

SetGlobalValidationOptions({
  errorFormatter: (error) => ({ field: error.path, msg: error.msg }),
  errorOptions: { onlyFirstError: false },           // report all errors per field
  matchedDataOptions: { includeOptionals: false },   // exclude optional fields
});
```

### Imperative validation

Run DTO validation outside of the decorator system (e.g. in a plain middleware or service):

```typescript
import { RunValidationMiddleware, RunValidators, GetSchemaValidators } from "@weaverkit/express";

// All-in-one: run validators + check result → throws ValidationError on failure
await RunValidationMiddleware({ objects: [CreateUserDTO], req, res });

// Two-step: run validators, then check result manually
const { validators, locations } = GetSchemaValidators([CreateUserDTO]);
await RunValidators([CreateUserDTO], req);
const result = validationResult(req);  // express-validator
```

`ValidateRequest(req, options?)` is also available as a lower-level function — it reads the `express-validator` result already stored on `req`, throws `ValidationError` if there are errors, or returns the matched data:

```typescript
import { ValidateRequest } from "@weaverkit/express";

router.post(
  "/",
  ...someExpressValidatorChains,
  (req, res, next) => {
    try {
      const data = ValidateRequest(req);
      // use data...
    } catch (err) {
      next(err); // passes ValidationError to error handler
    }
  }
);
```

---

## 6. RouteLoader

`RouteLoader()` returns three utility functions for building `express.Router` instances.

### `fromDecoratedControllers(controllers)`

Converts an array of decorated controller classes into a `RouteCollection`. See [Loading controllers](#loading-controllers) above.

### `fromDefinition(definition, options?)`

Builds a router from a plain object. Useful for non-decorator route definitions:

```typescript
import { RouteLoader } from "@weaverkit/express";

const router = RouteLoader().fromDefinition({
  get: [
    ["/",    listHandler],
    ["/:id", getHandler, cacheMiddleware],   // multiple handlers per route
  ],
  post: [
    ["/", authMiddleware, createHandler],
  ],
  put: [
    ["/:id", updateHandler],
  ],
  delete: [
    ["/:id", deleteHandler],
  ],
  use: [
    ["/sub", subRouter],                     // mount a sub-router
  ],
}, {
  router: existingRouter, // optionally provide an existing Router to extend
});
```

Route tuples follow the shape `[path, ...handlers]`. The `use` key mounts sub-routers.

### `fromPath(modulePath)`

Requires a module and returns it as a Router. Throws if the module is not an Express Router:

```typescript
const usersRouter = RouteLoader().fromPath(
  require.resolve("./routes/users")
);
```

---

## 7. Standalone helpers

### `ValidatedRequestHandler(action, options?)`

Wraps a plain async function as a complete Express middleware: runs `ValidateRequest`, calls the action with `(validatedData, context)`, and sends the response. Errors are forwarded to `next()`.

```typescript
import { ValidatedRequestHandler } from "@weaverkit/express";

router.post(
  "/",
  ...validators,            // run express-validator chains first
  ValidatedRequestHandler(
    async (data, context) => {
      // data    = matchedData(req) — already validated
      // context = req.context || {} (or custom resolver result)
      return new Artifact(await createUser(data));
    },
    {
      contextResolver: (req) => req.user,      // custom context extractor
      validatorOptions: { onlyFirstError: false },
    }
  )
);
```

### `RunMiddlewareIf(condition, middleware)`

Conditionally executes middleware based on the request. The `condition` function may be async:

```typescript
import { RunMiddlewareIf } from "@weaverkit/express";

router.use(
  RunMiddlewareIf(
    async (req) => req.headers["x-api-version"] === "2",
    v2TransformMiddleware,
  )
);

router.get(
  "/download",
  RunMiddlewareIf(
    (req) => !!req.query.compress,
    compressionMiddleware,
  ),
  downloadHandler,
);
```

Errors thrown by either the condition or the middleware are forwarded to `next(error)`.

### `MountCollection(app, collection)`

Mount a `RouteCollection` onto any object with a `.use(path, handler)` method. Values that are not a Router or `BaseExpressApp` throw a `ServerError`:

```typescript
import { MountCollection, CreateRouter } from "@weaverkit/express";

const router = CreateRouter({ strict: true });
MountCollection(router, {
  "/users": usersRouter,
  "/posts": postsRouter,
});
```

### `SendResponse(res, result, defaultStatusCode?)`

Manually send a response. Handles `Sendable` instances (including `Redirection`) and plain values:

```typescript
import { SendResponse } from "@weaverkit/express";

// Sendable — headers, status, beforesend/aftersend events applied automatically
await SendResponse(res, new Artifact(data).setHttpCode(201));

// Redirection — calls res.redirect()
await SendResponse(res, new Redirection("/new-path", 301));

// Plain value — sent as JSON
await SendResponse(res, { ok: true });                    // 200
await SendResponse(res, { created: true }, 201);          // 201
```

### `ApplyHeaders(res, headers)`

Set multiple response headers in one call, skipping `null` / `undefined` values:

```typescript
import { ApplyHeaders } from "@weaverkit/express";

ApplyHeaders(res, {
  "X-Request-Id": requestId,
  "Cache-Control": "no-store",
  "X-Rate-Limit": undefined, // skipped
});
```

### `CreateRouter(options?)`

Thin wrapper around `express.Router()`:

```typescript
import { CreateRouter } from "@weaverkit/express";

const router = CreateRouter({ strict: true, caseSensitive: true });
```

### `IsRouter(value)`

Returns `true` if `value` is an Express `Router` (prototype check):

```typescript
import { IsRouter } from "@weaverkit/express";

IsRouter(express.Router()); // true
IsRouter({});               // false
```

### `DefaultValidationErrorFormatter`

The default `express-validator` error formatter used by the validation system. Produces `{ parameter, message }` objects. You can reference it when building custom formatters:

```typescript
import { DefaultValidationErrorFormatter } from "@weaverkit/express";
```

---

## 8. Type reference

```typescript
// Supported HTTP verb names
type SupportedHttpMethods = "get" | "post" | "put" | "patch" | "delete" | "head" | "trace" | "all";

// Standard Express middleware signatures
type NextMiddlewareSignature = (req: Request, res: Response, next: NextFunction) => any;
type MiddlewareSignature     = (req: Request, res: Response, next?: NextFunction) => any;

// Route tuple: [path, ...handlers]
type Route = [PathParams, ...handlers[]];

// Sub-router mount: [path, Router]
type SubRouter = [PathParams, Router];

// Plain RouterDefinition object (for RouteLoader.fromDefinition)
type RouterDefinition = { [k in SupportedHttpMethods]?: Route[] } & { use?: SubRouter[] };

// Map of mount paths to handlers
type RouteCollection = Record<string, Router | BaseExpressApp | string>;

// WeaverExpressApp constructor config
interface WeaverExpressAppConfig {
  routes: RouteCollection;
  errorHandler: ErrorHandler;
  use404Middleware?: boolean;
  useErrorMiddleware?: boolean;
  renderError?: RenderErrorInterceptor;
  cors?: boolean | CorsOptions;
  helmet?: boolean | HelmetOptions;
  bodyParser?: {
    json?: boolean | express.json Options;
    urlencoded?: boolean | express.urlencoded Options;
    text?: boolean | express.text Options;
    raw?: boolean | express.raw Options;
  };
}

// Custom error render interceptor — return true to suppress default response
type RenderErrorInterceptor = (
  error: AppError,
  format: any,
  req: Request,
  res: Response,
) => boolean | Promise<boolean>;

// DI container interface
interface Container {
  get(token: any): any;
}

// Config passed alongside a controller class to fromDecoratedControllers
interface DecoratedRouterConfig {
  container?: Container;
  router?: Router;          // provide an existing Router to extend
}

// FieldConstraint — express-validator ParamSchema minus "in", plus optional $if
type FieldConstraint = Omit<ParamSchema, "in"> & {
  $if?: ValidationChain | CustomValidator;
};

// Validation options applied to @UseValidator and ValidateRequest
interface ExpressValidatorOptions {
  matchedDataOptions?: Partial<MatchedDataOptions>;
  errorFormatter?: ErrorFormatter;
  errorOptions?: { onlyFirstError?: boolean };
}
```
