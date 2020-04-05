# `@weaverkit/express`

> Collection of helper non-obstructive classes and utilities to make Node.js app development faster with express

## Installation

```
npm install --save @weaverkit/express express express-validator
npm install --save-dev @types/express
```

## Usage

```typescript
import { WeaverExpressApp, RouteCollection } from "@weaverkit/express";
import { ErrorHandler } from "@weaverkit/errors";
import { UserRouter } from "./user.router";

const errorHandler = new ErrorHandler();

errorHandler.on("handle", (error: Error) => {
	console.error(error);
});

const routes: RouteCollection = {
    user: UserRouter
}

const weaver = new WeaverExpressApp({
    errorHandler,
    routes
});

weaver.init();

weaver.app.listen(3000, () => {
	console.log("Listening on 3000");
});

```
