import { Sequelize, SequelizeOptions } from "sequelize-typescript";
import { BaseStorageAdapter } from "@weaverkit/adapters.base";

export class SequelizeStorageAdapter extends BaseStorageAdapter<Sequelize, SequelizeOptions> {
	public defaultConfig() {
		return {};
	}

	public createConnection(options: SequelizeOptions) {
		return new Sequelize(options);
	}
}
