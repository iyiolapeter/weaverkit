# `@weaverkit/adapters.redis`

> Redis connection adapter and high-level hash/key-value utilities for `@weaverkit/adapters.base`.

## Installation

```bash
npm install @weaverkit/adapters.redis ioredis
npm install --save-dev @types/ioredis
```

---

## `RedisStorageAdapter`

Wraps `ioredis` using the base adapter pattern.

```typescript
import { RedisStorageAdapter } from "@weaverkit/adapters.redis";

const adapter = new RedisStorageAdapter();

adapter.initialize({
  host: "localhost",
  port: 6379,
  password: "secret",
  prefix: "myapp",  // optional key prefix
  // or: url: "redis://:secret@localhost:6379"
}, true); // true = set as class-level default

const redis = adapter.connection; // ioredis IORedis instance
```

---

## `RedisHash<T>`

A `Map`-based wrapper around a Redis hash key with automatic serialization. Strings and numbers are stored as raw strings; arrays and objects are JSON-serialized.

### Static methods

```typescript
import { RedisHash } from "@weaverkit/adapters.redis";

// Find a hash by key — returns null if not found
const hash = await RedisHash.find<UserSession>({ key: "session:u_42" });
if (hash) {
  hash.get("userId");   // deserialized value
  hash.toObject();      // plain object representation
}

// Get a single field
const value = await RedisHash.get({ key: "session:u_42", field: "userId" });

// Save a plain object or Map as a hash
await RedisHash.save("session:u_42", { userId: "u_42", role: "admin" }, {
  expire: 3600, // seconds
});

// Delete the entire hash key
await RedisHash.clear({ key: "session:u_42" });

// With a non-default adapter
await RedisHash.find({ key: "session:u_42", adapter: replicaAdapter });
```

### Instance methods

```typescript
// Construct from existing data
const hash = new RedisHash<UserSession>("session:u_42", {
  userId: "u_42",
  role: "admin",
});

hash.get("userId");        // "u_42"
hash.set("lastSeen", new Date().toISOString());
hash.getKey();             // "session:u_42"
hash.toObject();           // { userId: "u_42", role: "admin", lastSeen: "..." }

await hash.save({ expire: 3600 });
```

---

## `KeyVal`

Static utility for simple string/JSON key-value operations.

```typescript
import { KeyVal } from "@weaverkit/adapters.redis";

// Set a value
await KeyVal.set({
  key: "user:42:token",
  value: { token: "abc", expires: 1234567890 }, // objects are JSON-serialized
  prefix: "myapp",   // optional — results in key "myapp:user:42:token"
  ttl: ["EX", 3600], // ["EX"|"PX"|"EXAT"|"PXAT", number] or "KEEPTTL"
  condition: "NX",   // "NX" = only set if key does not exist, "XX" = only if exists
});
// returns true on success, false on failure (e.g. NX condition not met)

// Get a value
const data = await KeyVal.get({ key: "user:42:token", prefix: "myapp" });
// returns the deserialized value, or null

// Delete a key
await KeyVal.delete({ key: "user:42:token", prefix: "myapp" });

// With a non-default adapter
await KeyVal.get({ key: "user:42:token", adapter: replicaAdapter });
```

### TTL options

| Value | Meaning |
| --- | --- |
| `["EX", n]` | Expire in `n` seconds |
| `["PX", n]` | Expire in `n` milliseconds |
| `["EXAT", n]` | Expire at Unix timestamp (seconds) |
| `["PXAT", n]` | Expire at Unix timestamp (milliseconds) |
| `"KEEPTTL"` | Retain existing TTL |

---

## `makeKey(key, prefix?)` utility

Builds a namespaced Redis key with smart colon handling:

```typescript
import { makeKey } from "@weaverkit/adapters.redis";

makeKey("user:42", "myapp");  // "myapp:user:42"
makeKey("user:42", "myapp:"); // "myapp:user:42"  (no double colon)
makeKey("user:42", "");       // "user:42"
makeKey("user:42");           // "user:42"
```
