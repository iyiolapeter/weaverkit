# `@weaverkit/errors`

> TODO: description

## Usage

```
const { ErrorHandler, HttpError, InvalidActionError, UnauthorizedError } = require('@weaverkit/errors');

// TODO: DEMONSTRATE API
const handler = new ErrorHandler();
handler.on("handle", (error) => {
    // do stuff like log error
});

try {
    throw new UnauthorizedError('User is not authorized to perform this action)
    .setContext({
        userId: 1
    });
} 
catch (error) {
    handler.handle(error);
}
```
