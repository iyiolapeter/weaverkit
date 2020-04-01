export abstract class BaseStorageAdapter<T = any, C = any> {
	protected static _defaultConnection: any;

	public static get defaultConnection() {
		return this._defaultConnection;
	}

	public static ensure<T extends BaseStorageAdapter>(adapter?: T) {
		if (adapter && adapter.connection !== undefined) {
			return adapter.connection;
		}
		if (this.defaultConnection) {
			return this.defaultConnection as T;
		}
		throw new Error("Please pass a connection instance to this method or initialize a default connection in storage adapter");
	}

	#connection!: T;

	protected config!: C;
	#self: any;

	public constructor() {
		this.#self = new.target;
	}

	public initialize(options?: Partial<C>, makeDefault?: boolean) {
		this.config = { ...this.defaultConfig(), ...options } as C;
		this.#connection = this.createConnection(this.config);
		if (makeDefault) {
			this.#self._defaultConnection = this;
		}
		return this;
	}

	public get connection() {
		return this.#connection;
	}

	public abstract defaultConfig(): Partial<C>;
	public abstract createConnection(options: C): T;

	public clone(options?: C) {
		return (new this.#self() as BaseStorageAdapter<T, C>).initialize({ ...this.config, ...options });
	}
}
