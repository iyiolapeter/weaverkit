# `@weaverkit/adapters.base`

> Abstract base class for building pluggable storage adapters with connection lifecycle management.

## Installation

```bash
npm install @weaverkit/adapters.base
```

## Overview

`BaseStorageAdapter<T, C>` provides a consistent connection management pattern that all `@weaverkit` storage adapters implement. It is intended for use as a base class — you would not typically use it directly unless building your own adapter.

**Generic parameters:**

- `T` — the connection type (e.g. `mongoose.Connection`, `IORedis`, `Sequelize`)
- `C` — the configuration type

---

## Implementing a custom adapter

```typescript
import { BaseStorageAdapter } from "@weaverkit/adapters.base";
import { createClient, RedisClientType } from "redis";

interface MyConfig {
  url: string;
  password?: string;
}

class MyRedisAdapter extends BaseStorageAdapter<RedisClientType, MyConfig> {
  defaultConfig(): Partial<MyConfig> {
    return { url: "redis://localhost:6379" };
  }

  createConnection(options: MyConfig): RedisClientType {
    return createClient({ url: options.url, password: options.password });
  }
}
```

## Lifecycle

### `initialize(options?, makeDefault?): this`

Merges `options` with `defaultConfig()`, calls `createConnection()`, and stores the result. Pass `true` as the second argument to set this connection as the class-level default.

```typescript
const adapter = new MyRedisAdapter();
adapter.initialize({ url: "redis://prod:6379", password: "secret" }, true);

adapter.connection; // the RedisClientType instance
```

### `connection` (getter)

Returns the connection created by `initialize()`.

### `clone(options?): BaseStorageAdapter<T, C>`

Creates a new adapter instance with the current config merged with `options`. Useful for creating isolated connections with minor config differences.

```typescript
const devAdapter = adapter.clone({ url: "redis://dev:6379" });
```

---

## Default connection

Each adapter subclass maintains a static default connection. Once set, it acts as a fallback when no explicit adapter is provided to methods.

```typescript
// Set as default at startup
const adapter = new MyRedisAdapter();
adapter.initialize({ url: "redis://prod:6379" }, true); // makeDefault = true

// Later — resolve the connection from default or explicit adapter
MyRedisAdapter.ensure();          // returns defaultConnection
MyRedisAdapter.ensure(adapter);   // returns adapter.connection
MyRedisAdapter.ensure();          // throws if neither has been initialized
```

`ensure(adapter?)` throws with a descriptive message if no connection is available.
