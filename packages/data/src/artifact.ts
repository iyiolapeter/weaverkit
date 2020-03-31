export class Artifact {
	public httpCode = 200;

	constructor(public data: Record<string, any> | null = null, public message?: string) {}

	public setHttpCode(httpCode: number) {
		this.httpCode = httpCode;
		return this;
	}

	public export() {
		return {
			message: this.message,
			data: this.data,
		};
	}
}
