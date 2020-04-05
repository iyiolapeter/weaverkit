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
	HttpError,
} from "./../src/index";

describe("errors", () => {
	const handler = new ErrorHandler();
	handler.on("handle", (error) => {
		expect(error).toBeInstanceOf(AppError);
	});
	test("Generic Error", () => {
		try {
			throw new Error("Something bad happened");
		} catch (error) {
			const wrapped = handler.wrap(error);
			expect(wrapped).toBeInstanceOf(AppError);
			expect(error).toEqual(wrapped.inner);
			expect(wrapped).toBeInstanceOf(ServerError);
		}
	});
	test("Error Message Default", () => {
		try {
			throw new BadRequestError();
		} catch (error) {
			expect(error.message).toEqual("Bad Request.");
		}
	});
	test("Error Message Propagation", () => {
		const errorCtors = [
			BadRequestError,
			InvalidArgumentError,
			InvalidActionError,
			UnauthorizedError,
			ForbiddenError,
			NotFoundError,
			ConflictError,
			ValidationError,
			UnprocessibleEntityError,
			ServiceUnavailableError,
			ServerError,
		];
		const asserter = (error: AppError, Ctor: any, message: string) => {
			try {
				expect(error.code).toBeDefined();
				expect(error.loggable).toBe(true);
				expect(error.reportable).toBe(true);
				error.setLoggable(false);
				error.setReportable(false);
				expect(error.loggable).toBe(false);
				expect(error.reportable).toBe(false);
				const info = { someinfo: "someinfo" };
				error.setInfo(info);
				expect(error.info).toBe(info);
				const context = { user: 1 };
				error.setContext(context);
				error.setCode(400);
				expect(error.code).toEqual(400);
				if (error instanceof ValidationError) {
					const fields = {
						id: "Id must be supplied",
					};
					error.setFields(fields);
					expect(error.fields).toStrictEqual(fields);
				}
				if (error instanceof ServiceUnavailableError) {
					const serviceName = "SomeService";
					error.setServiceName(serviceName);
					expect(error.serviceName).toEqual(serviceName);
				}
				throw error;
			} catch (error) {
				expect(error.message).toEqual(message);
				expect(error.constructor.name).toBe(Ctor.name);
				expect(handler.format(error, false)).toStrictEqual({ error: error.format(false) });
				expect(handler.format(error, true)).toStrictEqual({ error: error.format(true) });
				handler.handle(error);
			}
		};
		const message = "This is a custom bad request error message";
		for (const Ctor of errorCtors) {
			asserter(new Ctor(message), Ctor, message);
		}
		asserter(new HttpError(400, message), HttpError, message);
	});
});
