# `@weaverkit/adapters.sequelize`

> Sequelize connection adapter for `@weaverkit/adapters.base`.

## Installation

```bash
npm install @weaverkit/adapters.sequelize sequelize sequelize-typescript reflect-metadata
npm install --save-dev @types/sequelize
```

Add `import "reflect-metadata"` at the entry point of your application (required by `sequelize-typescript`).

## Usage

```typescript
import "reflect-metadata";
import { SequelizeStorageAdapter } from "@weaverkit/adapters.sequelize";

const adapter = new SequelizeStorageAdapter();

adapter.initialize({
  dialect: "postgres",
  host: "localhost",
  port: 5432,
  database: "mydb",
  username: "user",
  password: "secret",
  models: [User, Post],       // sequelize-typescript model classes
  logging: false,
}, true); // true = set as class-level default

const sequelize = adapter.connection; // Sequelize instance
await sequelize.authenticate();
```

### Multiple connections

```typescript
const primaryAdapter = new SequelizeStorageAdapter();
primaryAdapter.initialize({ dialect: "postgres", host: "primary", ... }, true);

const replicaAdapter = primaryAdapter.clone({ host: "replica" });

SequelizeStorageAdapter.ensure(replicaAdapter); // uses replicaAdapter.connection
SequelizeStorageAdapter.ensure();               // uses primary (default)
```

## Config type

The adapter config is `SequelizeOptions` from `sequelize-typescript`, which extends the standard Sequelize constructor options with support for model auto-discovery via `models`, `modelPaths`, and `repositoryMode`.

## Defining models

```typescript
import { Table, Column, Model, DataType } from "sequelize-typescript";

@Table({ tableName: "users" })
export class User extends Model {
  @Column(DataType.STRING)
  name: string;

  @Column({ type: DataType.STRING, unique: true })
  email: string;
}
```

Pass model classes in the `models` array when calling `initialize()`.
