import { Sendable } from "./sendable";

export class Artifact extends Sendable {
	constructor(public data: Record<string, any> | null = null, public message?: string) {
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
