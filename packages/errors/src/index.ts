import { EventEmitter } from "events";
import { OutgoingHttpHeaders } from "http";

export interface SerializedAppError {
	httpCode: number;
	code: string | number;
	message: string;
	info?: any;
	fields?: any;
	serviceName?: string;
}

export abstract class AppError extends Error {
	public static LOGGABLE_DEFAULT = true;
	public static REPORTABLE_DEFAULT = true;
	public abstract httpCode: number;
	public abstract code: string | number;

	#httpHeaders?: OutgoingHttpHeaders;

	public message!: string;

	public loggable: boolean;
	public reportable: boolean;
	public info!: any;

	public inner!: Error;

	protected context!: Record<string, any>;

	constructor(message?: any) {
		super(message);
		// restore prototype chain
		this.name = this.constructor.name;
		// Object.setPrototypeOf(this, new.target.prototype);
		this.loggable = new.target.LOGGABLE_DEFAULT;
		this.reportable = new.target.REPORTABLE_DEFAULT;
		if (message) {
			this.message = message;
		}
	}

	public setCode(code: string | number) {
		this.code = code;
		return this;
	}

	public setHttpHeaders(headers: Record<string, any>, append = false) {
		this.#httpHeaders = append ? { ...this.#httpHeaders, ...headers } : headers;
		return this;
	}

	public get httpHeaders() {
		return this.#httpHeaders;
	}

	public setInfo(info: any) {
		this.info = info;
		return this;
	}

	public setContext(context: Record<string, any>, append = false) {
		this.context = append ? { ...this.context, ...context } : context;
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

	// --- RPC Serialization ---

	private static _errorRegistry: Record<number, new (...args: any[]) => AppError> = {};

	public static registerErrorClass(httpCode: number, ctor: new (...args: any[]) => AppError) {
		this._errorRegistry[httpCode] = ctor;
	}

	public static deserialize(data: SerializedAppError): AppError {
		let ErrorClass = this._errorRegistry[data.httpCode];

		// Special case: 422 with fields → ValidationError
		if (data.httpCode === 422 && data.fields) {
			ErrorClass = ValidationError;
		}

		let error: AppError;
		if (ErrorClass) {
			error = new ErrorClass(data.message);
		} else {
			error = new HttpError(data.httpCode, data.message);
		}

		if (data.code !== undefined) {
			error.setCode(data.code);
		}
		if (data.info !== undefined) {
			error.setInfo(data.info);
		}
		if (data.fields && "setFields" in error) {
			(error as ValidationError).setFields(data.fields);
		}
		if (data.serviceName && "setServiceName" in error) {
			(error as ServiceUnavailableError).setServiceName(data.serviceName);
		}

		return error;
	}

	public serialize(): SerializedAppError {
		const result: SerializedAppError = {
			httpCode: this.httpCode,
			code: this.code,
			message: this.message,
		};
		if (this.info !== undefined) {
			result.info = this.info;
		}
		if ("fields" in this && (this as any).fields !== undefined) {
			result.fields = (this as any).fields;
		}
		if ("serviceName" in this && (this as any).serviceName !== undefined) {
			result.serviceName = (this as any).serviceName;
		}
		return result;
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

export class FailedDependencyError extends AppError {
	public httpCode = 424;
	public code = "FAILED_DEPENDENCY_ERROR";

	constructor(public message = "Failed Dependency.") {
		super(message);
	}
}

export class TooManyRequestsError extends AppError {
	public httpCode = 429;
	public code = "TOO_MANY_REQUESTS_ERROR";

	constructor(public message = "Too many requests.") {
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
		return this;
	}
}

export class ServerError extends AppError {
	public httpCode = 500;
	public code = "SERVER_ERROR";

	constructor(public message = "Server Error.") {
		super(message);
	}
}

export class NotImplementedError extends AppError {
	public httpCode = 501;
	public code = "NOT_IMPLEMENTED_ERROR";

	constructor(public message = "Not Implemented.") {
		super(message);
	}
}

export class HttpError extends AppError {
	public code = "HTTP_ERROR";
	constructor(
		public httpCode: number,
		message?: string,
	) {
		super(message);
	}
}

// Populate default error registry
AppError.registerErrorClass(400, BadRequestError);
AppError.registerErrorClass(401, UnauthorizedError);
AppError.registerErrorClass(403, ForbiddenError);
AppError.registerErrorClass(404, NotFoundError);
AppError.registerErrorClass(409, ConflictError);
AppError.registerErrorClass(422, UnprocessibleEntityError);
AppError.registerErrorClass(424, FailedDependencyError);
AppError.registerErrorClass(429, TooManyRequestsError);
AppError.registerErrorClass(500, ServerError);
AppError.registerErrorClass(501, NotImplementedError);
AppError.registerErrorClass(503, ServiceUnavailableError);

export interface ErrorHandlerFormat {
	envelope?: boolean;
	envelopeKey?: string;
}
export interface ErrorHandlerOptions {
	format?: ErrorHandlerFormat;
}
export class ErrorHandler extends EventEmitter {
	constructor(private options: ErrorHandlerOptions = {}) {
		super();
	}
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

	format(error: Error, withUnsafe = false) {
		const { envelope = true, envelopeKey = "error" } = this.options.format || {};
		const wrapped = this.wrap(error);
		const formatted = { format: wrapped.format(withUnsafe), error: wrapped };
		this.emit("format", formatted, withUnsafe);
		if (!envelope) {
			return formatted.format;
		}
		return { [envelopeKey]: formatted.format };
	}
}
