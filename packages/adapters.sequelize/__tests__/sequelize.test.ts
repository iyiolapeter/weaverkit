"use strict";

// Mock sequelize-typescript before any imports so no real DB connection is attempted
jest.mock("sequelize-typescript", () => ({
	Sequelize: jest.fn().mockImplementation((options: any) => ({ options })),
}));

import { Sequelize } from "sequelize-typescript";
import { SequelizeStorageAdapter } from "../src";

const MockSequelize = Sequelize as unknown as jest.Mock;

afterEach(() => {
	MockSequelize.mockClear();
	(SequelizeStorageAdapter as any)._defaultConnection = undefined;
});

// ---------------------------------------------------------------------------
// SequelizeStorageAdapter
// ---------------------------------------------------------------------------
describe("SequelizeStorageAdapter", () => {
	it("defaultConfig() returns {}", () => {
		expect(new SequelizeStorageAdapter().defaultConfig()).toEqual({});
	});

	it("createConnection() calls new Sequelize(options)", () => {
		const adapter = new SequelizeStorageAdapter();
		adapter.initialize({ dialect: "sqlite" } as any);
		expect(MockSequelize).toHaveBeenCalledWith({ dialect: "sqlite" });
	});

	it("connection getter returns the Sequelize instance", () => {
		const adapter = new SequelizeStorageAdapter();
		adapter.initialize({ dialect: "sqlite" } as any);
		expect(adapter.connection).toEqual({ options: { dialect: "sqlite" } });
	});

	it("passes merged config (defaultConfig + options) to Sequelize", () => {
		const adapter = new SequelizeStorageAdapter();
		adapter.initialize({ dialect: "postgres", database: "mydb" } as any);
		expect(MockSequelize).toHaveBeenCalledWith({ dialect: "postgres", database: "mydb" });
	});
});
