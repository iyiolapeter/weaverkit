import mongoose, { Connection, SchemaOptions, ConnectOptions } from "mongoose";
import { BaseStorageAdapter } from "@weaverkit/adapters.base";

export const DEFAULT_SCHEMA_OPTIONS: SchemaOptions = {
	timestamps: true,
};

interface MongoURI {
	uri: string;
}

export class MongooseStorageAdapter extends BaseStorageAdapter<Connection, ConnectOptions & MongoURI> {
	public defaultConfig() {
		return {};
	}

	public createConnection(options: ConnectOptions & MongoURI) {
		const { uri, ...rest } = options;
		return mongoose.createConnection(uri, rest);
	}
}
