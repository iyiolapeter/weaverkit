import mongoose, { Connection, SchemaOptions, ConnectionOptions } from "mongoose";
import { BaseStorageAdapter } from "@weaverkit/adapters.base";

export const DEFAULT_SCHEMA_OPTIONS: SchemaOptions = {
	timestamps: true,
};

interface MongoURI {
	uri: string;
}

export class MongooseStorageAdapter extends BaseStorageAdapter<Connection, ConnectionOptions & MongoURI> {
	public defaultConfig() {
		return {
			useNewUrlParser: true,
			useCreateIndex: true,
			useFindAndModify: false,
			useUnifiedTopology: true,
		};
	}

	public createConnection(options: ConnectionOptions & MongoURI) {
		const { uri, ...rest } = options;
		return mongoose.createConnection(uri, rest);
	}
}
