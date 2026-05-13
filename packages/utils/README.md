# `@weaverkit/utils`

> Lightweight utility functions for ID and random number generation.

## Installation

```bash
npm install @weaverkit/utils
```

## API

```typescript
import {
  getUniqueReference,
  getShortId,
  getNumberReference,
  getRandom,
  noop,
} from "@weaverkit/utils";
```

### `getUniqueReference(): string`

Returns a UUID v4 string. Suitable for globally unique IDs, correlation IDs, and tokens.

```typescript
getUniqueReference(); // "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

### `getShortId(): string`

Returns a short, URL-friendly ID using the `shortid` library.

```typescript
getShortId(); // "PPBqWA9"
```

### `getNumberReference(): number`

Returns the current timestamp in milliseconds (`Date.now()`).

```typescript
getNumberReference(); // 1708612345678
```

### `getRandom(digits: number): number`

Returns a random integer with exactly `digits` digits.

```typescript
getRandom(4); // e.g. 4271  (always between 1000–9999)
getRandom(6); // e.g. 823419 (always between 100000–999999)
```

### `noop(...args): any`

A no-op function. Useful as a default callback placeholder.

```typescript
noop(); // does nothing
```
