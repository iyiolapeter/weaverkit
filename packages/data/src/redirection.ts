import { Sendable } from "./sendable";

type RedirectionHttpCodes = 301 | 302 | 304 | 303 | 307 | 308;

export class Redirection extends Sendable {
	constructor(public location: string, public httpCode: RedirectionHttpCodes = 302) {
		super();
	}

	public send() {
		return {
			httpCode: this.httpCode,
			location: this.location,
		};
	}
}
