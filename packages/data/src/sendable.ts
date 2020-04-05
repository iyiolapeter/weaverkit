import { EventEmitter } from "events";

export abstract class Sendable {
	public httpCode = 200;

	#emitter = new EventEmitter();

	public get emitter() {
		return this.#emitter;
	}

	public setHttpCode(httpCode: number) {
		this.httpCode = httpCode;
		return this;
	}

	public abstract send(): Promise<any> | any;
}
