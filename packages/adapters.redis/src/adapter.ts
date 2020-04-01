import { BaseStorageAdapter } from "@weaverkit/adapters.base";
import { IHandyRedis, createHandyClient } from "handy-redis";
import { ClientOpts } from "redis";

export class RedisStorageAdapter extends BaseStorageAdapter<IHandyRedis, ClientOpts> {
	public defaultConfig() {
		return {};
	}

	public createConnection(options: ClientOpts) {
		return createHandyClient(options);
	}
}
