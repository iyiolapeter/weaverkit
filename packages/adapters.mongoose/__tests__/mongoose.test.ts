"use strict";

// Mock mongoose before any imports so no real MongoDB connection is attempted
jest.mock("mongoose", () => ({
	createConnection: jest.fn().mockReturnValue({ fakeConnection: true }),
}));

import mongoose from "mongoose";
import { MongooseStorageAdapter, DEFAULT_SCHEMA_OPTIONS } from "../src";

const mockCreateConnection = mongoose.createConnection as jest.Mock;

afterEach(() => {
	mockCreateConnection.mockClear();
	(MongooseStorageAdapter as any)._defaultConnection = undefined;
});

// ---------------------------------------------------------------------------
// DEFAULT_SCHEMA_OPTIONS
// ---------------------------------------------------------------------------
describe("DEFAULT_SCHEMA_OPTIONS", () => {
	it("has timestamps: true", () => {
		expect(DEFAULT_SCHEMA_OPTIONS).toEqual({ timestamps: true });
	});
});

// ---------------------------------------------------------------------------
// MongooseStorageAdapter
// ---------------------------------------------------------------------------
describe("MongooseStorageAdapter", () => {
	it("defaultConfig() returns {}", () => {
		expect(new MongooseStorageAdapter().defaultConfig()).toEqual({});
	});

	it("createConnection() calls mongoose.createConnection with uri and remaining options", () => {
		const adapter = new MongooseStorageAdapter();
		adapter.initialize({ uri: "mongodb://localhost/test", authSource: "admin" } as any);
		expect(mockCreateConnection).toHaveBeenCalledWith("mongodb://localhost/test", { authSource: "admin" });
	});

	it("createConnection() calls mongoose.createConnection with just the uri when no extra options", () => {
		const adapter = new MongooseStorageAdapter();
		adapter.initialize({ uri: "mongodb://localhost/db" } as any);
		expect(mockCreateConnection).toHaveBeenCalledWith("mongodb://localhost/db", {});
	});

	it("connection getter returns the value from createConnection()", () => {
		const adapter = new MongooseStorageAdapter();
		adapter.initialize({ uri: "mongodb://localhost/db" } as any);
		expect(adapter.connection).toEqual({ fakeConnection: true });
	});
});
