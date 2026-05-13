# `@weaverkit/validator`

> Chainable, async-aware schema validation for plain JavaScript objects, built on top of [validator.js](https://github.com/validatorjs/validator.js).

## Installation

```bash
npm install @weaverkit/validator
```

## Basic usage

```typescript
import { node, oneOf, validate } from "@weaverkit/validator";

const errors = await validate(req.body, [
  node("name").exists().isString(),
  node("email").exists().isEmail().withMessage("Must be a valid email address"),
  node("age").exists().isInt({ min: 18 }).withMessage("Must be 18 or older"),
  node("website").optional().isURL(),
]);

if (errors.length) {
  // errors: [{ parameter: "email", message: "Must be a valid email address" }]
}
```

## `node(id)` — field rule builder

`node(id)` creates a `ValidationNode` for the named field. Rules are chained fluently and the node is passed directly to `validate()`.

### Presence

```typescript
node("field").exists()    // field is required; error if missing/falsy
node("field").optional()  // field may be absent; skipped if not present (default)
```

### Built-in type checks

```typescript
node("name").isString()              // typeof value === "string"
node("tags").isArray()               // Array.isArray(value)
node("tags").isArray({ empty: false }) // non-empty array required
```

### validator.js methods

All `is*` methods from [validator.js](https://github.com/validatorjs/validator.js#validators) are available as chainable validators, and all `to*` / sanitizer methods are available as chainable sanitizers:

```typescript
node("email").isEmail()
node("url").isURL({ protocols: ["https"] })
node("age").isInt({ min: 0, max: 120 })
node("score").isFloat({ min: 0.0, max: 1.0 })
node("slug").isAlphanumeric()
node("id").isUUID(4)
node("phone").isMobilePhone("en-US")
node("code").isPostalCode("US")

// Sanitizers (transform the value in-place on success)
node("email").isEmail().normalizeEmail()
node("text").trim().escape()
```

### Negation

`.not()` negates the immediately following validator:

```typescript
node("username").exists().not().isEmail(); // must exist but must NOT be an email
```

### Custom validators and sanitizers

```typescript
node("username")
  .exists()
  .customValidator(async (value) => {
    const taken = await db.users.exists({ username: value });
    return !taken;
  })
  .withMessage("Username is already taken");

node("price")
  .exists()
  .customSanitizer((value) => parseFloat(value).toFixed(2));
```

Custom validators receive `(value, fullObject, ...extraArgs)` and must return `boolean | Promise<boolean>`.
Custom sanitizers receive `(value, fullObject, ...extraArgs)` and must return the transformed value.

### Error messages

`.withMessage(message)` overrides the message for the **most recently added** validator:

```typescript
node("email")
  .exists().withMessage("Email is required")
  .isEmail().withMessage("Email is not valid");
```

### Nested objects

```typescript
const errors = await validate(body, [
  node("address")
    .child("street").exists().isString().endChild()
    .child("zip").exists().isPostalCode("US").endChild(),
]);
// Error parameter: "address.street"
```

### Wildcard field `"*"`

```typescript
// Validate every key in the object
validate(obj, [node("*").isString()]);
```

---

## `oneOf(nodes)` — conditional groups

At least one of the provided node groups must pass validation entirely.

```typescript
import { node, oneOf, validate } from "@weaverkit/validator";

const errors = await validate(body, [
  oneOf([
    node("phone").exists().isMobilePhone("any"),
    node("email").exists().isEmail(),
  ]).withMessage("Provide either a phone number or an email"),
]);
```

If all groups fail, a single error is added:

```typescript
// { message: "Provide either a phone number or an email", nestedErrors: [[...], [...]] }
```

---

## `validate(obj, nodes, options?)` — run validation

```typescript
const errors = await validate(obj, nodes, {
  onlyFirst: true, // default true — stop after first error per field
});
```

Returns an array of error objects:

```typescript
// Field errors
[{ parameter: "email", message: "Must be a valid email" }]

// OneOf errors
[{ message: "...", nestedErrors: [ [fieldErrors], [fieldErrors] ] }]
```

An empty array means validation passed.

> **Note:** Sanitizers only run when all validators for a field pass. They mutate the `obj` in place.
