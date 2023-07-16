import { EventEmitter } from "events";
import { OutgoingHttpHeaders } from "http";

export abstract class Sendable {
	public httpCode = 200;
	#httpHeaders?: OutgoingHttpHeaders;

	#emitter = new EventEmitter();

	public get emitter() {
		return this.#emitter;
	}

	public setHttpCode(httpCode: number) {
		this.httpCode = httpCode;
		return this;
	}

	public setHttpHeaders(headers: Record<string, any>, append = false) {
		this.#httpHeaders = append ? { ...this.#httpHeaders, ...headers } : headers;
		return this;
	}

	public get httpHeaders() {
		return this.#httpHeaders;
	}

	public abstract send(): Promise<any> | any;
}
