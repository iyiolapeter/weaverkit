import { RedisStorageAdapter } from "./adapter";

export const makeKey = (key: string, prefix = "") => {
	return prefix === "" || prefix.endsWith(":") ? `${prefix}${key}` : `${prefix}:${key}`;
};

const serialize = (data: string | any[] | Record<string, any>) => {
	if (typeof data === "string" || typeof data === "number") {
		return String(data);
	} else if (Array.isArray(data) || typeof data === "object") {
		return JSON.stringify(data);
	} else {
		throw new Error("Failed to serialize data with unsupported type " + typeof data);
	}
};

const unserialize = (data: string) => {
	try {
		return isNaN(Number(data)) ? JSON.parse(data) : data;
	} catch (error) {
		return data;
	}
};

type HashEntry = [string, string];

export interface RedisHash<T = Record<string, any>> {
	get<R = any>(id: keyof T): R;
}

interface HasAdapter {
	adapter?: RedisStorageAdapter;
}

interface HasKey {
	key: string;
}

export interface RedisHashGetOptions extends HasAdapter, HasKey {
	field: string;
}

export interface RedisHashFindOptions extends HasAdapter, HasKey {}

export interface RedisHashClearOptions extends HasAdapter, HasKey {}

export interface RedisHashSaveOptions extends HasAdapter {
	expire?: number;
}

export class RedisHash<T = Record<string, any>> extends Map<keyof T, any> {
	public static get(options: RedisHashGetOptions) {
		const { key, field, adapter } = options;
		return RedisStorageAdapter.ensure(adapter).hget(key, field);
	}

	public static clear(options: RedisHashClearOptions) {
		const { key, adapter } = options;
		return RedisStorageAdapter.ensure(adapter).del(key);
	}

	public static async find<T = Record<string, any>>(options: RedisHashFindOptions) {
		const { key, adapter } = options;
		const hash = await RedisStorageAdapter.ensure(adapter).hgetall(key);
		if (!hash || !Object.keys(hash).length) {
			return null;
		}
		const unwrapped = Object.entries(hash).map((entry) => {
			entry[1] = unserialize(entry[1] as any);
			return entry;
		});
		return new RedisHash<T>(key, unwrapped as any);
	}

	public static async save(key: string, data: RedisHash | Record<string, any>, options: RedisHashSaveOptions = {}) {
		const { expire, adapter } = options;
		const connection = RedisStorageAdapter.ensure(adapter);
		const entries = Array.from(data instanceof Map ? data : Object.entries(data), (entry) => {
			entry[1] = serialize(entry[1]);
			return entry as HashEntry;
		});
		const saved = await connection.hmset(key, Object.fromEntries(entries));
		if (saved && expire) {
			await connection.expire(key, expire);
		}
		return saved;
	}

	// tslint:disable-next-line: variable-name
	private __key: string;

	constructor(key: string, entries?: Record<keyof T, any> | [keyof T, any][]) {
		if (Array.isArray(entries) || entries === undefined) {
			super(entries);
		} else if (typeof entries === "object") {
			super(Object.entries(entries) as any);
		} else {
			throw new Error("Unknown Hash construction");
		}
		this.__key = key;
	}

	public getKey() {
		return this.__key;
	}

	public async save(options: RedisHashSaveOptions = {}) {
		return RedisHash.save(this.getKey(), this, options);
	}

	public toObject() {
		return Object.fromEntries(this) as T;
	}
}

export interface HasPrefix {
	prefix: string;
}

export interface KeyValGetOptions extends HasAdapter, HasKey, Partial<HasPrefix> {}

export type TTL = ["EX" | "PX" | "EXAT" | "PXAT", number] | "KEEPTTL";

export interface KeyValSetOptions extends HasAdapter, HasKey, Partial<HasPrefix> {
	value: string | any[] | Record<string, any>;
	ttl?: TTL;
	condition?: "NX" | "XX";
}

export interface KeyValDeleteOptions extends HasAdapter, HasKey, Partial<HasPrefix> {}

export class KeyVal {
	public static async get(options: KeyValGetOptions) {
		const { key, prefix, adapter } = options;
		const data = await RedisStorageAdapter.ensure(adapter).get(makeKey(key, prefix));
		return data ? unserialize(data) : data;
	}

	public static delete(options: KeyValDeleteOptions) {
		const { key, prefix, adapter } = options;
		return RedisStorageAdapter.ensure(adapter).del(makeKey(key, prefix));
	}

	public static async set(options: KeyValSetOptions) {
		const { key, value, prefix, ttl, condition, adapter } = options;
		const connection = RedisStorageAdapter.ensure(adapter);
		try {
			let set = null;
			const accessor = makeKey(key, prefix);
			const val = serialize(value);
			if (ttl && condition) {
				set = await connection.set(accessor, val, ...(typeof ttl === "string" ? ([ttl] as any) : ttl), condition);
			} else if (ttl) {
				set = await connection.set(accessor, val, ttl as any);
			} else if (condition) {
				set = await connection.set(accessor, val, condition as any);
			} else {
				set = await connection.set(accessor, val);
			}
			if (set) {
				return true;
			}
			return false;
		} catch (error) {
			return false;
		}
	}
}
