"use strict";

// Mock ioredis before any imports so the adapter never opens a real connection
jest.mock("ioredis", () => jest.fn().mockReturnValue({ type: "redis-mock" }));

import IORedis from "ioredis";
import { RedisStorageAdapter } from "../src/adapter";
import { makeKey, RedisHash, KeyVal } from "../src/model";

const MockIORedis = IORedis as unknown as jest.Mock;

// ---------------------------------------------------------------------------
// Shared mock client used for all Redis operation tests
// ---------------------------------------------------------------------------
let mockClient: {
	hget: jest.Mock;
	hgetall: jest.Mock;
	hmset: jest.Mock;
	expire: jest.Mock;
	del: jest.Mock;
	get: jest.Mock;
	set: jest.Mock;
};
let ensureSpy: jest.SpyInstance;

beforeEach(() => {
	mockClient = {
		hget: jest.fn(),
		hgetall: jest.fn(),
		hmset: jest.fn(),
		expire: jest.fn(),
		del: jest.fn(),
		get: jest.fn(),
		set: jest.fn(),
	};
	ensureSpy = jest.spyOn(RedisStorageAdapter, "ensure").mockReturnValue(mockClient as any);
});

afterEach(() => {
	ensureSpy.mockRestore();
	MockIORedis.mockClear();
	(RedisStorageAdapter as any)._defaultConnection = undefined;
});

// ===========================================================================
// RedisStorageAdapter
// ===========================================================================
describe("RedisStorageAdapter", () => {
	it("defaultConfig() returns {}", () => {
		expect(new RedisStorageAdapter().defaultConfig()).toEqual({});
	});

	it("createConnection() with url calls new IORedis(url, opts)", () => {
		ensureSpy.mockRestore(); // let real createConnection run
		const adapter = new RedisStorageAdapter();
		adapter.initialize({ url: "redis://localhost:6379" } as any);
		expect(MockIORedis).toHaveBeenCalledWith("redis://localhost:6379", {});
	});

	it("createConnection() without url calls new IORedis(opts)", () => {
		ensureSpy.mockRestore();
		const adapter = new RedisStorageAdapter();
		adapter.initialize({ host: "127.0.0.1", port: 6379 } as any);
		expect(MockIORedis).toHaveBeenCalledWith({ host: "127.0.0.1", port: 6379 });
	});

	it("createConnection() with prefix sets keyPrefix in options", () => {
		ensureSpy.mockRestore();
		const adapter = new RedisStorageAdapter();
		adapter.initialize({ prefix: "myapp" } as any);
		expect(MockIORedis).toHaveBeenCalledWith(expect.objectContaining({ keyPrefix: "myapp" }));
	});

	it("createConnection() without prefix does not include keyPrefix", () => {
		ensureSpy.mockRestore();
		const adapter = new RedisStorageAdapter();
		adapter.initialize({ host: "localhost" } as any);
		const callArgs = MockIORedis.mock.calls[0][0];
		expect(callArgs).not.toHaveProperty("keyPrefix");
	});
});

// ===========================================================================
// makeKey()
// ===========================================================================
describe("makeKey()", () => {
	it("returns key as-is when prefix is omitted (defaults to empty string)", () => {
		expect(makeKey("users:123")).toBe("users:123");
	});

	it("returns key as-is when prefix is an empty string", () => {
		expect(makeKey("foo", "")).toBe("foo");
	});

	it("prepends prefix with colon separator when prefix does not end with ':'", () => {
		expect(makeKey("key", "myapp")).toBe("myapp:key");
	});

	it("does not add an extra colon when prefix already ends with ':'", () => {
		expect(makeKey("key", "myapp:")).toBe("myapp:key");
	});
});

// ===========================================================================
// RedisHash
// ===========================================================================
describe("RedisHash constructor", () => {
	it("creates an empty hash when no entries are provided", () => {
		const hash = new RedisHash("myhash");
		expect(hash.getKey()).toBe("myhash");
		expect(hash.size).toBe(0);
	});

	it("creates a hash from array entries", () => {
		const hash = new RedisHash<Record<string, any>>("h", [
			["name", "Alice"],
			["age", "30"],
		]);
		expect(hash.get("name")).toBe("Alice");
		expect(hash.get("age")).toBe("30");
	});

	it("creates a hash from a plain object", () => {
		const hash = new RedisHash("h", { name: "Bob", role: "admin" });
		expect(hash.get("name")).toBe("Bob");
		expect(hash.get("role")).toBe("admin");
	});

	it("throws when entries is an unsupported type", () => {
		expect(() => new (RedisHash as any)("h", 42)).toThrow("Unknown Hash construction");
	});
});

describe("RedisHash.getKey()", () => {
	it("returns the key passed to the constructor", () => {
		expect(new RedisHash("test-key").getKey()).toBe("test-key");
	});
});

describe("RedisHash.toObject()", () => {
	it("converts the Map to a plain object", () => {
		const hash = new RedisHash("h", { a: "1", b: "2" });
		expect(hash.toObject()).toEqual({ a: "1", b: "2" });
	});

	it("returns an empty object for an empty hash", () => {
		expect(new RedisHash("h").toObject()).toEqual({});
	});
});

describe("RedisHash.get() (static)", () => {
	it("calls hget with the key and field and returns the result", async () => {
		mockClient.hget.mockResolvedValue("alice");
		const result = await RedisHash.get({ key: "users", field: "name" });
		expect(mockClient.hget).toHaveBeenCalledWith("users", "name");
		expect(result).toBe("alice");
	});
});

describe("RedisHash.clear() (static)", () => {
	it("calls del with the key", async () => {
		mockClient.del.mockResolvedValue(1);
		await RedisHash.clear({ key: "users:1" });
		expect(mockClient.del).toHaveBeenCalledWith("users:1");
	});
});

describe("RedisHash.find() (static)", () => {
	it("returns null when hgetall returns null", async () => {
		mockClient.hgetall.mockResolvedValue(null);
		expect(await RedisHash.find({ key: "missing" })).toBeNull();
	});

	it("returns null when hgetall returns an empty object", async () => {
		mockClient.hgetall.mockResolvedValue({});
		expect(await RedisHash.find({ key: "empty" })).toBeNull();
	});

	it("returns a RedisHash with deserialized JSON values", async () => {
		mockClient.hgetall.mockResolvedValue({ name: "Alice", meta: '{"role":"admin"}' });
		const result = await RedisHash.find({ key: "user:1" });
		expect(result).toBeInstanceOf(RedisHash);
		expect(result!.get("name")).toBe("Alice");
		expect(result!.get("meta")).toEqual({ role: "admin" });
	});

	it("returns numeric-looking strings as-is (unserialize skips JSON.parse)", async () => {
		mockClient.hgetall.mockResolvedValue({ score: "42" });
		const result = await RedisHash.find({ key: "item" });
		expect(result!.get("score")).toBe("42");
	});

	it("returns raw string when value is not numeric and not valid JSON", async () => {
		mockClient.hgetall.mockResolvedValue({ note: "plain text" });
		const result = await RedisHash.find({ key: "item" });
		expect(result!.get("note")).toBe("plain text");
	});
});

describe("RedisHash.save() (static)", () => {
	it("serializes a plain object and calls hmset", async () => {
		mockClient.hmset.mockResolvedValue("OK");
		await RedisHash.save("session:1", { user: "Alice", count: 42 });
		expect(mockClient.hmset).toHaveBeenCalledWith("session:1", { user: "Alice", count: "42" });
	});

	it("serializes array values to JSON", async () => {
		mockClient.hmset.mockResolvedValue("OK");
		await RedisHash.save("k", { tags: ["a", "b"] });
		expect(mockClient.hmset).toHaveBeenCalledWith("k", { tags: '["a","b"]' });
	});

	it("serializes a Map (RedisHash instance)", async () => {
		mockClient.hmset.mockResolvedValue("OK");
		const map = new RedisHash("k", [["role", "admin"]]);
		await RedisHash.save("perm:1", map);
		expect(mockClient.hmset).toHaveBeenCalledWith("perm:1", { role: "admin" });
	});

	it("calls expire after hmset when expire option is set and result is truthy", async () => {
		mockClient.hmset.mockResolvedValue("OK");
		mockClient.expire.mockResolvedValue(1);
		await RedisHash.save("session:1", { x: "1" }, { expire: 60 });
		expect(mockClient.expire).toHaveBeenCalledWith("session:1", 60);
	});

	it("does not call expire when hmset returns a falsy result", async () => {
		mockClient.hmset.mockResolvedValue(null);
		await RedisHash.save("session:1", { x: "1" }, { expire: 60 });
		expect(mockClient.expire).not.toHaveBeenCalled();
	});

	it("does not call expire when no expire option is provided", async () => {
		mockClient.hmset.mockResolvedValue("OK");
		await RedisHash.save("session:1", { x: "1" });
		expect(mockClient.expire).not.toHaveBeenCalled();
	});

	it("returns the result of hmset", async () => {
		mockClient.hmset.mockResolvedValue("OK");
		const result = await RedisHash.save("k", { a: "b" });
		expect(result).toBe("OK");
	});
});

describe("RedisHash#save() (instance)", () => {
	it("delegates to the static save with the instance's key", async () => {
		mockClient.hmset.mockResolvedValue("OK");
		const hash = new RedisHash("mykey", [["field", "value"]]);
		await hash.save();
		expect(mockClient.hmset).toHaveBeenCalledWith("mykey", { field: "value" });
	});

	it("forwards options (e.g. expire) to static save", async () => {
		mockClient.hmset.mockResolvedValue("OK");
		mockClient.expire.mockResolvedValue(1);
		const hash = new RedisHash("sess", [["uid", "1"]]);
		await hash.save({ expire: 120 });
		expect(mockClient.expire).toHaveBeenCalledWith("sess", 120);
	});
});

// ===========================================================================
// KeyVal
// ===========================================================================
describe("KeyVal.get()", () => {
	it("returns null when the key does not exist", async () => {
		mockClient.get.mockResolvedValue(null);
		expect(await KeyVal.get({ key: "missing" })).toBeNull();
	});

	it("returns a numeric string as-is (not parsed)", async () => {
		mockClient.get.mockResolvedValue("42");
		expect(await KeyVal.get({ key: "count" })).toBe("42");
	});

	it("returns a parsed object for JSON values", async () => {
		mockClient.get.mockResolvedValue('{"name":"Alice"}');
		expect(await KeyVal.get({ key: "user" })).toEqual({ name: "Alice" });
	});

	it("uses prefix when provided", async () => {
		mockClient.get.mockResolvedValue("val");
		await KeyVal.get({ key: "k", prefix: "app" });
		expect(mockClient.get).toHaveBeenCalledWith("app:k");
	});
});

describe("KeyVal.delete()", () => {
	it("calls del with the bare key when no prefix is provided", async () => {
		mockClient.del.mockResolvedValue(1);
		await KeyVal.delete({ key: "session" });
		expect(mockClient.del).toHaveBeenCalledWith("session");
	});

	it("calls del with the prefixed key", async () => {
		mockClient.del.mockResolvedValue(1);
		await KeyVal.delete({ key: "session", prefix: "auth" });
		expect(mockClient.del).toHaveBeenCalledWith("auth:session");
	});
});

describe("KeyVal.set()", () => {
	it("calls set(key, val) when no ttl or condition", async () => {
		mockClient.set.mockResolvedValue("OK");
		const result = await KeyVal.set({ key: "k", value: "v" });
		expect(mockClient.set).toHaveBeenCalledWith("k", "v");
		expect(result).toBe(true);
	});

	it("calls set with ttl array when only ttl is provided", async () => {
		mockClient.set.mockResolvedValue("OK");
		await KeyVal.set({ key: "k", value: "v", ttl: ["EX", 60] });
		expect(mockClient.set).toHaveBeenCalledWith("k", "v", ["EX", 60]);
	});

	it("calls set with KEEPTTL string when ttl is 'KEEPTTL'", async () => {
		mockClient.set.mockResolvedValue("OK");
		await KeyVal.set({ key: "k", value: "v", ttl: "KEEPTTL" });
		expect(mockClient.set).toHaveBeenCalledWith("k", "v", "KEEPTTL");
	});

	it("calls set with condition when only condition is provided", async () => {
		mockClient.set.mockResolvedValue("OK");
		await KeyVal.set({ key: "k", value: "v", condition: "NX" });
		expect(mockClient.set).toHaveBeenCalledWith("k", "v", "NX");
	});

	it("spreads ttl array and appends condition when both are provided", async () => {
		mockClient.set.mockResolvedValue("OK");
		await KeyVal.set({ key: "k", value: "v", ttl: ["EX", 300], condition: "XX" });
		expect(mockClient.set).toHaveBeenCalledWith("k", "v", "EX", 300, "XX");
	});

	it("uses KEEPTTL string with condition when both are provided", async () => {
		mockClient.set.mockResolvedValue("OK");
		await KeyVal.set({ key: "k", value: "v", ttl: "KEEPTTL", condition: "NX" });
		expect(mockClient.set).toHaveBeenCalledWith("k", "v", "KEEPTTL", "NX");
	});

	it("returns false when set returns a falsy value (e.g. NX condition not met)", async () => {
		mockClient.set.mockResolvedValue(null);
		expect(await KeyVal.set({ key: "k", value: "v", condition: "NX" })).toBe(false);
	});

	it("returns false when set throws an error", async () => {
		mockClient.set.mockRejectedValue(new Error("Redis error"));
		expect(await KeyVal.set({ key: "k", value: "v" })).toBe(false);
	});

	it("serializes an object value to JSON", async () => {
		mockClient.set.mockResolvedValue("OK");
		await KeyVal.set({ key: "k", value: { name: "Alice" } });
		expect(mockClient.set).toHaveBeenCalledWith("k", '{"name":"Alice"}');
	});

	it("serializes an array value to JSON", async () => {
		mockClient.set.mockResolvedValue("OK");
		await KeyVal.set({ key: "k", value: [1, 2, 3] });
		expect(mockClient.set).toHaveBeenCalledWith("k", "[1,2,3]");
	});

	it("applies prefix to the key", async () => {
		mockClient.set.mockResolvedValue("OK");
		await KeyVal.set({ key: "session", value: "data", prefix: "auth" });
		expect(mockClient.set).toHaveBeenCalledWith("auth:session", "data");
	});
});
