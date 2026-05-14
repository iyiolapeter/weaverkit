# `@weaverkit/adapters.mongoose`

> Mongoose connection adapter for `@weaverkit/adapters.base`.

## Installation

```bash
npm install @weaverkit/adapters.mongoose mongoose
npm install --save-dev @types/mongoose
```

## Usage

```typescript
import { MongooseStorageAdapter } from "@weaverkit/adapters.mongoose";

const adapter = new MongooseStorageAdapter();

adapter.initialize({
  uri: "mongodb://localhost:27017/mydb",
  // any additional mongoose ConnectOptions:
  authSource: "admin",
  replicaSet: "rs0",
}, true); // true = set as class-level default

const connection = adapter.connection; // mongoose.Connection instance
```

### Multiple connections

```typescript
const primaryAdapter = new MongooseStorageAdapter();
primaryAdapter.initialize({ uri: "mongodb://primary/mydb" }, true); // default

const replicaAdapter = primaryAdapter.clone({ uri: "mongodb://replica/mydb" });

// Resolve connection: explicit → class default → throws
MongooseStorageAdapter.ensure(replicaAdapter); // uses replicaAdapter
MongooseStorageAdapter.ensure();              // uses primaryAdapter (default)
```

## Schema options

`DEFAULT_SCHEMA_OPTIONS` is exported as a convenience constant for use in Mongoose schema definitions:

```typescript
import { DEFAULT_SCHEMA_OPTIONS } from "@weaverkit/adapters.mongoose";
import mongoose from "mongoose";

// DEFAULT_SCHEMA_OPTIONS = { timestamps: true }
const UserSchema = new mongoose.Schema({ name: String }, DEFAULT_SCHEMA_OPTIONS);

const User = adapter.connection.model("User", UserSchema);
```

## Config type

The adapter config type is `ConnectOptions & { uri: string }` where `ConnectOptions` comes from Mongoose. The `uri` field is required; all other fields are optional Mongoose connection options.
