import { BaseStorageAdapter } from "@weaverkit/adapters.base";
import IORedis, { RedisOptions } from "ioredis";

interface WithPrefix {
	prefix?: string;
}

interface WithUrl {
	url?: string;
}
export class RedisStorageAdapter extends BaseStorageAdapter<IORedis, RedisOptions & WithUrl & WithPrefix> {
	public defaultConfig() {
		return {};
	}

	public createConnection(options: RedisOptions & WithUrl & WithPrefix) {
		const { url, prefix, ...rest } = options;
		const opts: RedisOptions = prefix ? { keyPrefix: prefix, ...rest } : rest;
		const redis = url ? new IORedis(url, opts) : new IORedis(opts);
		return redis;
	}
}
