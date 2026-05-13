# `@weaverkit/data`

> HTTP response type wrappers for Express applications — JSON payloads, EJS template rendering, and redirections.

## Installation

```bash
npm install @weaverkit/data
```

## Overview

All response types extend the abstract `Sendable` base class, which provides:

- `.setHttpCode(code)` — set the HTTP status code (default `200`)
- `.setHttpHeaders(headers, append?)` — set response headers
- `.emitter` — an internal `EventEmitter` for lifecycle hooks

When used with `@weaverkit/express`, `Sendable` instances returned from route handlers are detected automatically and sent via `SendResponse`.

---

## `Artifact<T>` — JSON responses

The standard wrapper for JSON API responses.

```typescript
import { Artifact } from "@weaverkit/data";

// Simple payload
const response = new Artifact({ id: 1, name: "Alice" }, "User retrieved");
response.export(); // { message: "User retrieved", data: { id: 1, name: "Alice" } }

// In a route handler (with @weaverkit/express)
return new Artifact(user, "Created").setHttpCode(201);
```

`export()` and `send()` both return `{ message?, data }`. `data` is `null` if none was provided.

---

## `Content` — inline EJS templates

Renders an EJS template string directly.

```typescript
import { Content } from "@weaverkit/data";

const page = new Content({
  template: "<h1>Hello, <%= name %>!</h1>",
  data: { name: "World" },
  ejsOptions: { /* EJS options */ }
});

const html = await page.send(); // "<h1>Hello, World!</h1>"
```

---

## `BaseView` and `ViewFactory` — file-based EJS templates

`ViewFactory` is the recommended way to create a `View` class backed by a views directory.

```typescript
import { ViewFactory } from "@weaverkit/data";
import path from "path";

const View = ViewFactory({
  path: path.join(__dirname, "views"), // views directory
  extension: "ejs",                   // default "ejs"
  layoutDir: "layouts",               // default "layouts"
});

// Render views/users/profile.ejs
const view = new View({ name: "users/profile", data: { user } });
const html = await view.send();

// With a layout (views/layouts/main.ejs)
const withLayout = new View({
  name: "users/profile",
  data: { user },
  layout: {
    name: "main",
    params: { title: "Profile" },
    contentVar: "content"  // default "content" — variable name in layout template
  }
});
```

Inside the layout template (`layouts/main.ejs`), the rendered view is available as `<%- content %>` (or whatever `contentVar` is set to). The `context` variable is also available and refers to the `View` instance.

### Path normalisation

`BaseView.normalize(view, folder, ext)` handles:

- Trailing `/` → appends `index.ejs`
- Leading `/` → stripped (use `//` to preserve it)
- Missing extension → appended automatically

### Extending `BaseView` directly

```typescript
import { BaseView } from "@weaverkit/data";

class AppView extends BaseView {
  protected path = path.join(__dirname, "views");
  protected extension = "ejs";
  protected layoutsDir = "layouts";
}
```

---

## `Redirection` — HTTP redirects

```typescript
import { Redirection } from "@weaverkit/data";

// 302 Found (default)
const redirect = new Redirection("/login");

// 301 Permanent redirect
const permanent = new Redirection("/new-path", 301);

redirect.send(); // { httpCode: 302, location: "/login" }
```

Supported codes: `301`, `302`, `303`, `304`, `307`, `308`.

When used with `@weaverkit/express`, `Redirection` instances trigger `res.redirect()` automatically.

---

## Sendable lifecycle events

All `Sendable` instances emit events on their internal emitter when processed by `SendResponse`:

```typescript
const artifact = new Artifact(data);

artifact.emitter.on("beforesend", () => {
  // called just before send()
});

artifact.emitter.on("aftersend", () => {
  // called just after send()
});
```
