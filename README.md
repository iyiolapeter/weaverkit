# weaverkit

> Collection of focused TypeScript helpers for building secure, observable Express/Node.js services. Pick the pieces you need; each `@weaverkit/*` package is independently installable.

[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-4.9-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Packages

| Package | Purpose |
| --- | --- |
| [`@weaverkit/express`](packages/express) | App bootstrap, decorator-based controllers, validation pipeline, error middleware, lifecycle events |
| [`@weaverkit/errors`](packages/errors) | Structured chainable HTTP error classes with safe-vs-unsafe serialization for cross-boundary transport |
| [`@weaverkit/data`](packages/data) | HTTP response wrappers — `Artifact` (JSON), `BaseView` (EJS file), `Content` (inline EJS), `Redirection` |
| [`@weaverkit/validator`](packages/validator) | Chainable, async-aware schema validation built on [validator.js](https://github.com/validatorjs/validator.js) |
| [`@weaverkit/rpc`](packages/rpc) | Redis-backed RPC with a SYN/ACK handshake, typed events for metrics, and injectable logger |
| [`@weaverkit/logger`](packages/logger) | Winston logger with per-request context tracking via CLS |
| [`@weaverkit/adapters.base`](packages/adapters.base) | Abstract base for pluggable storage adapters |
| [`@weaverkit/adapters.mongoose`](packages/adapters.mongoose) | Mongoose connection adapter |
| [`@weaverkit/adapters.redis`](packages/adapters.redis) | Redis connection adapter + `RedisHash` / `KeyVal` utilities |
| [`@weaverkit/adapters.sequelize`](packages/adapters.sequelize) | Sequelize connection adapter |
| [`@weaverkit/utils`](packages/utils) | Lightweight ID and random-number helpers |

Each package documents its own API and security model in its README.

## Quickstart

A minimal Express app with weaverkit:

```bash
npm install @weaverkit/express @weaverkit/errors @weaverkit/data express reflect-metadata
```

```ts
import "reflect-metadata";
import { WeaverExpressApp, Controller, Get, RouteLoader } from "@weaverkit/express";
import { ErrorHandler } from "@weaverkit/errors";
import { Artifact } from "@weaverkit/data";

@Controller("/")
class HomeController {
  @Get("/")
  async index() {
    return new Artifact({ ok: true });
  }
}

const routes = RouteLoader().fromDecoratedControllers([HomeController]);
const app = new WeaverExpressApp({
  routes: { "/": routes },
  errorHandler: new ErrorHandler(),
});
app.init();
app.app.listen(3000);
```

See the individual package READMEs for the full surface — validation decorators, Redis adapter, RPC, and the rest.

## Requirements

- **Node.js >= 20**
- **TypeScript 4.9.5+** with `experimentalDecorators` and `emitDecoratorMetadata` enabled (`strict` mode supported)
- CommonJS output (each package ships `lib/index.js`)

## Security model

Each package documents its trust assumptions and footguns. Highlights:

- [`@weaverkit/errors`](packages/errors#security-model) — when to use `format()` vs `format(true)` vs `serialize()`; `inner` is server-only.
- [`@weaverkit/data`](packages/data#security-model) — view names must be server-controlled; `Content` template strings execute as code.
- [`@weaverkit/rpc`](packages/rpc#security-model) — Redis is a trusted bus; non-`AppError` handler exceptions stay server-side; `replyTo` is validated.

If you ship weaverkit-based services on a multi-tenant or less-trusted infrastructure, read those sections before integrating.

## Development

This is a [Lerna](https://lerna.js.org/) monorepo.

```bash
git clone git@github.com:iyiolapeter/weaverkit.git
cd weaverkit
npm install

npm test                  # run all package test suites
npm run test:watch        # watch mode
npm run lint              # eslint
npm run lint:fix          # eslint --fix
npm run format            # prettier
npm run prepare:commit    # lint-staged + lint:fix + lerna build
npm run publish           # lerna run build && lerna publish (for maintainers)
```

> Tests must be run from the repo root — individual packages intentionally throw if you `npm test` inside them.

See [CLAUDE.md](CLAUDE.md) for architectural notes, package interdependencies, and cross-cutting patterns.

## License

[MIT](LICENSE)
