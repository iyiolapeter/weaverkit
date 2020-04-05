import { EventEmitter } from "events";

export abstract class AppError extends Error {
	public abstract httpCode: number;
	public abstract code: string | number;

	public message!: string;

	public loggable = true;
	public reportable = true;
	public info!: any;

	public inner!: Error;

	protected context!: any;

	constructor(message?: any) {
		super(message);
		// restore prototype chain
		this.name = this.constructor.name;
		// Object.setPrototypeOf(this, new.target.prototype);
		if (message) {
			this.message = message;
		}
	}

	public setCode(code: string | number) {
		this.code = code;
		return this;
	}

	public setInfo(info: any) {
		this.info = info;
		return this;
	}

	public setContext(context: any) {
		this.context = context;
		return this;
	}

	public setInner(error: Error) {
		this.inner = error;
		return this;
	}

	public setReportable(reportable: boolean) {
		this.reportable = reportable;
		return this;
	}

	public setLoggable(loggable: boolean) {
		this.loggable = loggable;
		return this;
	}

	protected safeProps() {
		return ["code", "message", "info"];
	}

	public format(withUnsafe = false) {
		if (withUnsafe) {
			return this;
		}
		return this.safeProps().reduce((props: Record<string, any>, value) => {
			props[value] = (this as any)[value];
			return props;
		}, {});
	}
}

export class BadRequestError extends AppError {
	public httpCode = 400;
	public code = "BAD_REQUEST_ERROR";

	constructor(public message = "Bad Request.") {
		super(message);
	}
}

export class InvalidArgumentError extends BadRequestError {
	public code = "INVALID_ARGUMENT_ERROR";
}

export class InvalidActionError extends BadRequestError {
	public code = "INVALID_ACTION_ERROR";

	constructor(public message = "Requested action is invalid.") {
		super(message);
	}
}

export class UnauthorizedError extends AppError {
	public httpCode = 401;
	public code = "UNAUTHORIZED_ERROR";

	constructor(public message = "Unauthorized.") {
		super(message);
	}
}

export class ForbiddenError extends AppError {
	public httpCode = 403;
	public code = "FORBIDDEN_ERROR";

	constructor(public message = "Forbidden.") {
		super(message);
	}
}

export class NotFoundError extends AppError {
	public httpCode = 404;
	public code = "NOT_FOUND_ERROR";

	constructor(public message = "Not found.") {
		super(message);
	}
}

export class ConflictError extends AppError {
	public httpCode = 409;
	public code = "CONFLICT_ERROR";

	constructor(public message = "Conflict.") {
		super(message);
	}
}

export class UnprocessibleEntityError extends AppError {
	public httpCode = 422;
	public code = "UNPROCESSIBLE_ENTITY_ERROR";

	constructor(public message = "Unprocessible Entity.") {
		super(message);
	}
}

export class ValidationError extends UnprocessibleEntityError {
	public code = "INPUT_VALIDATION_ERROR";
	public fields!: any;

	constructor(public message = "One or more fields in supplied input raised validation errors.") {
		super(message);
	}

	public setFields(fields: any) {
		this.fields = fields;
		return this;
	}

	protected safeProps() {
		return [...super.safeProps(), "fields"];
	}
}

export class ServiceUnavailableError extends AppError {
	public httpCode = 503;
	public code = "SERVICE_UNAVAILABLE_ERROR";

	constructor(public message = "Service Unavailable.") {
		super(message);
	}

	public serviceName?: string;

	public setServiceName(serviceName: string) {
		this.serviceName = serviceName;
	}
}

export class ServerError extends AppError {
	public httpCode = 500;
	public code = "SERVER_ERROR";

	constructor(public message = "Server Error.") {
		super(message);
	}
}

export class HttpError extends AppError {
	public code = "HTTP_ERROR";
	constructor(public httpCode: number, message?: string) {
		super(message);
	}
}

export class ErrorHandler extends EventEmitter {
	wrap(error: Error) {
		if (error instanceof AppError) {
			return error;
		}
		return new ServerError().setInner(error);
	}

	handle(error: Error) {
		const wrapped = this.wrap(error);
		this.emit("handle", wrapped);
		return wrapped;
	}

	format(error: Error, verbose = false) {
		const formatted = this.wrap(error).format(verbose);
		this.emit("format", formatted, verbose);
		return { error: formatted };
	}
}
