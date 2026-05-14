"use strict";

import {
	ErrorHandler,
	AppError,
	ServerError,
	BadRequestError,
	UnauthorizedError,
	ForbiddenError,
	ValidationError,
	UnprocessibleEntityError,
	ConflictError,
	ServiceUnavailableError,
	NotFoundError,
	InvalidArgumentError,
	InvalidActionError,
	FailedDependencyError,
	TooManyRequestsError,
	NotImplementedError,
	HttpError,
} from "./../src/index";

// ---------------------------------------------------------------------------
// Error class hierarchy and defaults
// ---------------------------------------------------------------------------
describe("error classes", () => {
	it.each([
		[BadRequestError, 400, "BAD_REQUEST_ERROR", "Bad Request."],
		[InvalidArgumentError, 400, "INVALID_ARGUMENT_ERROR", "Bad Request."],
		[InvalidActionError, 400, "INVALID_ACTION_ERROR", "Requested action is invalid."],
		[UnauthorizedError, 401, "UNAUTHORIZED_ERROR", "Unauthorized."],
		[ForbiddenError, 403, "FORBIDDEN_ERROR", "Forbidden."],
		[NotFoundError, 404, "NOT_FOUND_ERROR", "Not found."],
		[ConflictError, 409, "CONFLICT_ERROR", "Conflict."],
		[UnprocessibleEntityError, 422, "UNPROCESSIBLE_ENTITY_ERROR", "Unprocessible Entity."],
		[FailedDependencyError, 424, "FAILED_DEPENDENCY_ERROR", "Failed Dependency."],
		[TooManyRequestsError, 429, "TOO_MANY_REQUESTS_ERROR", "Too many requests."],
		[ValidationError, 422, "INPUT_VALIDATION_ERROR", "One or more fields in supplied input raised validation errors."],
		[ServiceUnavailableError, 503, "SERVICE_UNAVAILABLE_ERROR", "Service Unavailable."],
		[ServerError, 500, "SERVER_ERROR", "Server Error."],
		[NotImplementedError, 501, "NOT_IMPLEMENTED_ERROR", "Not Implemented."],
	])("%s has correct defaults", (Ctor: any, httpCode, code, defaultMessage) => {
		const error = new Ctor();
		expect(error).toBeInstanceOf(AppError);
		expect(error).toBeInstanceOf(Error);
		expect(error.httpCode).toBe(httpCode);
		expect(error.code).toBe(code);
		expect(error.message).toBe(defaultMessage);
		expect(error.loggable).toBe(true);
		expect(error.reportable).toBe(true);
		expect(error.name).toBe(Ctor.name);
	});

	it("accepts a custom message", () => {
		const err = new BadRequestError("custom");
		expect(err.message).toBe("custom");
	});

	it("HttpError accepts httpCode and optional message", () => {
		const err = new HttpError(418, "I'm a teapot");
		expect(err.httpCode).toBe(418);
		expect(err.message).toBe("I'm a teapot");
		expect(err.code).toBe("HTTP_ERROR");
	});
});

// ---------------------------------------------------------------------------
// AppError fluent API
// ---------------------------------------------------------------------------
describe("AppError fluent API", () => {
	it("setCode() overrides the code and returns this", () => {
		const err = new ServerError();
		const result = err.setCode("CUSTOM");
		expect(result).toBe(err);
		expect(err.code).toBe("CUSTOM");
	});

	it("setInfo() stores arbitrary info and returns this", () => {
		const info = { requestId: "abc" };
		const err = new ServerError();
		expect(err.setInfo(info)).toBe(err);
		expect(err.info).toBe(info);
	});

	it("setInner() stores the inner error and returns this", () => {
		const inner = new Error("cause");
		const err = new ServerError();
		expect(err.setInner(inner)).toBe(err);
		expect(err.inner).toBe(inner);
	});

	it("setLoggable() / setReportable() toggle flags", () => {
		const err = new ServerError();
		err.setLoggable(false).setReportable(false);
		expect(err.loggable).toBe(false);
		expect(err.reportable).toBe(false);
	});

	it("setContext() replaces context by default", () => {
		const err = new ServerError();
		err.setContext({ a: 1 });
		err.setContext({ b: 2 });
		expect((err as any).context).toEqual({ b: 2 });
	});

	it("setContext() appends context when append=true", () => {
		const err = new ServerError();
		err.setContext({ a: 1 });
		err.setContext({ b: 2 }, true);
		expect((err as any).context).toEqual({ a: 1, b: 2 });
	});

	it("setHttpHeaders() sets headers and returns this", () => {
		const err = new ServerError();
		const result = err.setHttpHeaders({ "X-Request-Id": "123" });
		expect(result).toBe(err);
		expect(err.httpHeaders).toEqual({ "X-Request-Id": "123" });
	});

	it("setHttpHeaders() replaces headers by default", () => {
		const err = new ServerError();
		err.setHttpHeaders({ "X-A": "1" });
		err.setHttpHeaders({ "X-B": "2" });
		expect(err.httpHeaders).toEqual({ "X-B": "2" });
	});

	it("setHttpHeaders() appends headers when append=true", () => {
		const err = new ServerError();
		err.setHttpHeaders({ "X-A": "1" });
		err.setHttpHeaders({ "X-B": "2" }, true);
		expect(err.httpHeaders).toEqual({ "X-A": "1", "X-B": "2" });
	});
});

// ---------------------------------------------------------------------------
// AppError.format()
// ---------------------------------------------------------------------------
describe("AppError.format()", () => {
	it("returns only safe props by default", () => {
		const err = new BadRequestError("oops");
		const formatted = err.format() as any;
		expect(formatted.code).toBe("BAD_REQUEST_ERROR");
		expect(formatted.message).toBe("oops");
		expect(formatted.info).toBeUndefined();
		expect(formatted.inner).toBeUndefined();
	});

	it("returns the error instance when withUnsafe=true", () => {
		const err = new BadRequestError("oops");
		expect(err.format(true)).toBe(err);
	});

	it("ValidationError includes fields in safe props", () => {
		const fields = [{ parameter: "email", message: "Invalid" }];
		const err = new ValidationError().setFields(fields);
		const formatted = err.format() as any;
		expect(formatted.fields).toEqual(fields);
	});
});

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------
describe("ValidationError", () => {
	it("setFields() stores fields and returns this", () => {
		const fields = [{ parameter: "name", message: "Required" }];
		const err = new ValidationError();
		expect(err.setFields(fields)).toBe(err);
		expect(err.fields).toEqual(fields);
	});
});

// ---------------------------------------------------------------------------
// ServiceUnavailableError
// ---------------------------------------------------------------------------
describe("ServiceUnavailableError", () => {
	it("setServiceName() stores service name and returns this", () => {
		const err = new ServiceUnavailableError();
		expect(err.setServiceName("PaymentService")).toBe(err);
		expect(err.serviceName).toBe("PaymentService");
	});
});

// ---------------------------------------------------------------------------
// ErrorHandler
// ---------------------------------------------------------------------------
describe("ErrorHandler", () => {
	it("wrap() returns the same AppError if already an AppError", () => {
		const handler = new ErrorHandler();
		const appErr = new NotFoundError();
		expect(handler.wrap(appErr)).toBe(appErr);
	});

	it("wrap() wraps a plain Error in a ServerError", () => {
		const handler = new ErrorHandler();
		const plain = new Error("boom");
		const wrapped = handler.wrap(plain);
		expect(wrapped).toBeInstanceOf(ServerError);
		expect(wrapped.inner).toBe(plain);
	});

	it("handle() emits a 'handle' event with the wrapped error", () => {
		const handler = new ErrorHandler();
		const spy = jest.fn();
		handler.on("handle", spy);
		const err = new BadRequestError();
		handler.handle(err);
		expect(spy).toHaveBeenCalledWith(err);
	});

	it("handle() wraps plain errors before emitting", () => {
		const handler = new ErrorHandler();
		const spy = jest.fn();
		handler.on("handle", spy);
		const plain = new Error("boom");
		handler.handle(plain);
		expect(spy.mock.calls[0][0]).toBeInstanceOf(ServerError);
	});

	it("format() wraps in { error: formatted } envelope by default", () => {
		const handler = new ErrorHandler();
		const err = new BadRequestError("bad");
		const result = handler.format(err) as any;
		expect(result).toHaveProperty("error");
		expect(result.error.message).toBe("bad");
	});

	it("format() with envelope:false returns the formatted object directly", () => {
		const handler = new ErrorHandler({ format: { envelope: false } });
		const err = new BadRequestError("bad");
		const result = handler.format(err) as any;
		expect(result).not.toHaveProperty("error");
		expect(result.message).toBe("bad");
	});

	it("format() with custom envelopeKey uses that key", () => {
		const handler = new ErrorHandler({ format: { envelopeKey: "err" } });
		const err = new BadRequestError("bad");
		const result = handler.format(err) as any;
		expect(result).toHaveProperty("err");
		expect(result.err.message).toBe("bad");
	});

	it("format() emits a 'format' event with the formatted result", () => {
		const handler = new ErrorHandler();
		const spy = jest.fn();
		handler.on("format", spy);
		const err = new BadRequestError("bad");
		handler.format(err, false);
		expect(spy).toHaveBeenCalled();
		expect(spy.mock.calls[0][1]).toBe(false); // withUnsafe argument
	});
});

// ---------------------------------------------------------------------------
// AppError.serialize() / AppError.deserialize()
// ---------------------------------------------------------------------------
describe("AppError.serialize()", () => {
	it("serializes a basic error with httpCode, code, message", () => {
		const err = new NotFoundError("Thing missing");
		const serialized = err.serialize();
		expect(serialized).toEqual({
			httpCode: 404,
			code: "NOT_FOUND_ERROR",
			message: "Thing missing",
		});
	});

	it("includes info when set", () => {
		const err = new BadRequestError("bad").setInfo({ field: "email" });
		const serialized = err.serialize();
		expect(serialized.info).toEqual({ field: "email" });
	});

	it("includes custom code when overridden via setCode", () => {
		const err = new BadRequestError("bad").setCode("MISSING_HEADER");
		const serialized = err.serialize();
		expect(serialized.code).toBe("MISSING_HEADER");
	});

	it("includes fields for ValidationError", () => {
		const fields = [{ parameter: "email", message: "invalid" }];
		const err = new ValidationError().setFields(fields);
		const serialized = err.serialize();
		expect(serialized.fields).toEqual(fields);
	});

	it("includes serviceName for ServiceUnavailableError", () => {
		const err = new ServiceUnavailableError().setServiceName("webhook");
		const serialized = err.serialize();
		expect(serialized.serviceName).toBe("webhook");
	});

	it("excludes context, inner, httpHeaders, loggable, reportable", () => {
		const err = new ServerError("boom")
			.setContext({ debug: true })
			.setInner(new Error("cause"))
			.setHttpHeaders({ "X-Foo": "bar" })
			.setLoggable(false)
			.setReportable(false);
		const serialized = err.serialize();
		expect(serialized).toEqual({
			httpCode: 500,
			code: "SERVER_ERROR",
			message: "boom",
		});
		expect((serialized as any).context).toBeUndefined();
		expect((serialized as any).inner).toBeUndefined();
		expect((serialized as any).httpHeaders).toBeUndefined();
		expect((serialized as any).loggable).toBeUndefined();
		expect((serialized as any).reportable).toBeUndefined();
	});

	it("serializes HttpError with dynamic httpCode", () => {
		const err = new HttpError(418, "I'm a teapot");
		const serialized = err.serialize();
		expect(serialized).toEqual({
			httpCode: 418,
			code: "HTTP_ERROR",
			message: "I'm a teapot",
		});
	});
});

describe("AppError.deserialize()", () => {
	it.each([
		[400, BadRequestError],
		[401, UnauthorizedError],
		[403, ForbiddenError],
		[404, NotFoundError],
		[409, ConflictError],
		[422, UnprocessibleEntityError],
		[424, FailedDependencyError],
		[429, TooManyRequestsError],
		[500, ServerError],
		[501, NotImplementedError],
		[503, ServiceUnavailableError],
	])("httpCode %d deserializes to %s", (httpCode, ExpectedClass) => {
		const err = AppError.deserialize({ httpCode, code: "CUSTOM", message: "msg" });
		expect(err).toBeInstanceOf(ExpectedClass);
		expect(err).toBeInstanceOf(AppError);
		expect(err.code).toBe("CUSTOM");
		expect(err.message).toBe("msg");
	});

	it("falls back to HttpError for unknown httpCode", () => {
		const err = AppError.deserialize({ httpCode: 418, code: "TEAPOT", message: "brew" });
		expect(err).toBeInstanceOf(HttpError);
		expect(err.httpCode).toBe(418);
		expect(err.code).toBe("TEAPOT");
		expect(err.message).toBe("brew");
	});

	it("deserializes 422 with fields as ValidationError", () => {
		const fields = [{ parameter: "email", message: "invalid" }];
		const err = AppError.deserialize({
			httpCode: 422,
			code: "INPUT_VALIDATION_ERROR",
			message: "Validation failed",
			fields,
		});
		expect(err).toBeInstanceOf(ValidationError);
		expect((err as ValidationError).fields).toEqual(fields);
	});

	it("deserializes 422 without fields as UnprocessibleEntityError", () => {
		const err = AppError.deserialize({
			httpCode: 422,
			code: "UNPROCESSIBLE_ENTITY_ERROR",
			message: "Cannot process",
		});
		expect(err).toBeInstanceOf(UnprocessibleEntityError);
		expect(err).not.toBeInstanceOf(ValidationError);
	});

	it("deserializes 503 with serviceName", () => {
		const err = AppError.deserialize({
			httpCode: 503,
			code: "SERVICE_UNAVAILABLE_ERROR",
			message: "Down",
			serviceName: "webhook",
		});
		expect(err).toBeInstanceOf(ServiceUnavailableError);
		expect((err as ServiceUnavailableError).serviceName).toBe("webhook");
	});

	it("preserves info", () => {
		const err = AppError.deserialize({
			httpCode: 400,
			code: "BAD_REQUEST_ERROR",
			message: "bad",
			info: { detail: "missing field" },
		});
		expect(err.info).toEqual({ detail: "missing field" });
	});

	it("round-trips through serialize/deserialize", () => {
		const original = new ValidationError("Validation failed")
			.setCode("CUSTOM_VALIDATION")
			.setInfo({ requestId: "abc" })
			.setFields([{ parameter: "name", message: "required" }]);
		const restored = AppError.deserialize(original.serialize());
		expect(restored).toBeInstanceOf(ValidationError);
		expect(restored.code).toBe("CUSTOM_VALIDATION");
		expect(restored.message).toBe("Validation failed");
		expect(restored.info).toEqual({ requestId: "abc" });
		expect((restored as ValidationError).fields).toEqual([{ parameter: "name", message: "required" }]);
	});
});

describe("AppError.registerErrorClass()", () => {
	afterEach(() => {
		// Reset registry by re-registering the default for 400
		AppError.registerErrorClass(400, BadRequestError);
	});

	it("overrides the default class for a given httpCode", () => {
		class CustomBadRequest extends AppError {
			public httpCode = 400;
			public code = "CUSTOM_BAD_REQUEST";
			constructor(public message = "Custom bad.") {
				super(message);
			}
		}
		AppError.registerErrorClass(400, CustomBadRequest);
		const err = AppError.deserialize({ httpCode: 400, code: "TEST", message: "test" });
		expect(err).toBeInstanceOf(CustomBadRequest);
		expect(err.code).toBe("TEST");
	});
});
