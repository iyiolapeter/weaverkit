"use strict";

import { BaseStorageAdapter } from "../src";

// Concrete subclass used across all tests — no real I/O
class FakeAdapter extends BaseStorageAdapter<Record<string, any>, { host: string; port: number }> {
	public defaultConfig() {
		return { host: "localhost", port: 6379 };
	}

	public createConnection(options: { host: string; port: number }) {
		return { connected: true, ...options };
	}
}

afterEach(() => {
	// Reset the per-class static so tests don't bleed into each other
	(FakeAdapter as any)._defaultConnection = undefined;
});

// ---------------------------------------------------------------------------
// defaultConnection static getter
// ---------------------------------------------------------------------------
describe("defaultConnection", () => {
	it("is undefined before initialize is called", () => {
		expect(FakeAdapter.defaultConnection).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------
describe("initialize()", () => {
	it("merges defaultConfig() with provided options", () => {
		const adapter = new FakeAdapter();
		adapter.initialize({ host: "redis.example.com" });
		expect((adapter as any).config).toEqual({ host: "redis.example.com", port: 6379 });
	});

	it("uses only defaultConfig() when no options are provided", () => {
		const adapter = new FakeAdapter();
		adapter.initialize();
		expect((adapter as any).config).toEqual({ host: "localhost", port: 6379 });
	});

	it("returns this for chaining", () => {
		const adapter = new FakeAdapter();
		expect(adapter.initialize()).toBe(adapter);
	});

	it("does not set defaultConnection when makeDefault is omitted", () => {
		new FakeAdapter().initialize({});
		expect(FakeAdapter.defaultConnection).toBeUndefined();
	});

	it("does not set defaultConnection when makeDefault is false", () => {
		new FakeAdapter().initialize({}, false);
		expect(FakeAdapter.defaultConnection).toBeUndefined();
	});

	it("sets defaultConnection on the class when makeDefault is true", () => {
		const adapter = new FakeAdapter();
		adapter.initialize({ host: "default-host" }, true);
		expect(FakeAdapter.defaultConnection).toEqual({ connected: true, host: "default-host", port: 6379 });
	});
});

// ---------------------------------------------------------------------------
// connection getter
// ---------------------------------------------------------------------------
describe("connection getter", () => {
	it("returns the object created by createConnection()", () => {
		const adapter = new FakeAdapter();
		adapter.initialize({ host: "myhost", port: 1234 });
		expect(adapter.connection).toEqual({ connected: true, host: "myhost", port: 1234 });
	});
});

// ---------------------------------------------------------------------------
// ensure()
// ---------------------------------------------------------------------------
describe("ensure()", () => {
	it("returns the adapter's connection when an initialized adapter is passed", () => {
		const adapter = new FakeAdapter();
		adapter.initialize({ host: "a" });
		expect(FakeAdapter.ensure(adapter as any)).toBe(adapter.connection);
	});

	it("falls through to defaultConnection when adapter has no connection (not initialized)", () => {
		const def = new FakeAdapter();
		def.initialize({}, true);
		const uninitialized = new FakeAdapter(); // connection is undefined
		expect(FakeAdapter.ensure(uninitialized as any)).toBe(FakeAdapter.defaultConnection);
	});

	it("returns defaultConnection when no adapter argument is given", () => {
		const adapter = new FakeAdapter();
		adapter.initialize({}, true);
		expect(FakeAdapter.ensure()).toBe(FakeAdapter.defaultConnection);
	});

	it("throws when no adapter is provided and no defaultConnection is set", () => {
		expect(() => FakeAdapter.ensure()).toThrow("Please pass a connection instance to this method or initialize a default connection");
	});
});

// ---------------------------------------------------------------------------
// clone()
// ---------------------------------------------------------------------------
describe("clone()", () => {
	it("returns a new instance of the same concrete class", () => {
		const adapter = new FakeAdapter();
		adapter.initialize({ host: "original" });
		const cloned = adapter.clone();
		expect(cloned).toBeInstanceOf(FakeAdapter);
		expect(cloned).not.toBe(adapter);
	});

	it("inherits the original config when no override options are given", () => {
		const adapter = new FakeAdapter();
		adapter.initialize({ host: "original", port: 9999 });
		const cloned = adapter.clone();
		expect((cloned as any).config).toEqual({ host: "original", port: 9999 });
	});

	it("overrides specific fields when options are provided", () => {
		const adapter = new FakeAdapter();
		adapter.initialize({ host: "original", port: 1234 });
		const cloned = adapter.clone({ host: "cloned" } as any);
		expect((cloned as any).config.host).toBe("cloned");
		expect((cloned as any).config.port).toBe(1234);
	});
});
