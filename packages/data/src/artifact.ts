import { Sendable } from "./sendable";

export class Artifact<T = Record<string, any>> extends Sendable {
	constructor(public data: T | null = null, public message?: string) {
		super();
	}

	public export() {
		return {
			message: this.message,
			data: this.data,
		};
	}

	public send() {
		return this.export();
	}
}
