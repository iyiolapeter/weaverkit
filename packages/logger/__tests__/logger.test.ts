"use strict";

import { tmpdir } from "os";
import {
	NAMESPACE,
	getLogNamespace,
	UppercaseLevel,
	LogContextId,
	createContextId,
	Context,
	Logger,
	LogStream,
	addFileLogging,
} from "../src/index";

// Silence console transport output during tests
beforeAll(() => {
	Logger.transports.forEach((t: any) => {
		t.silent = true;
	});
});

afterAll(() => {
	Logger.transports.forEach((t: any) => {
		t.silent = false;
	});
});

// ---------------------------------------------------------------------------
// NAMESPACE constant
// ---------------------------------------------------------------------------
describe("NAMESPACE", () => {
	it("is the string 'log'", () => {
		expect(NAMESPACE).toBe("log");
	});
});

// ---------------------------------------------------------------------------
// getLogNamespace()
// ---------------------------------------------------------------------------
describe("getLogNamespace()", () => {
	it("returns the cls-hooked namespace", () => {
		const ns = getLogNamespace();
		expect(ns).not.toBeNull();
		expect(ns).not.toBeUndefined();
		expect(typeof (ns as any).run).toBe("function");
	});

	it("returns a namespace with the correct name", () => {
		const ns = getLogNamespace();
		expect((ns as any).name).toBe(NAMESPACE);
	});
});

// ---------------------------------------------------------------------------
// UppercaseLevel format
// ---------------------------------------------------------------------------
describe("UppercaseLevel", () => {
	it("uppercases the level property of log info", () => {
		const formatter = UppercaseLevel();
		const info = { level: "info", message: "test" } as any;
		const result = formatter.transform(info) as any;
		expect(result.level).toBe("INFO");
	});

	it("uppercases 'debug' level", () => {
		const formatter = UppercaseLevel();
		const info = { level: "debug", message: "test" } as any;
		const result = formatter.transform(info) as any;
		expect(result.level).toBe("DEBUG");
	});

	it("uppercases 'error' level", () => {
		const formatter = UppercaseLevel();
		const info = { level: "error", message: "oops" } as any;
		const result = formatter.transform(info) as any;
		expect(result.level).toBe("ERROR");
	});

	it("returns the same info object", () => {
		const formatter = UppercaseLevel();
		const info = { level: "warn", message: "test" } as any;
		const result = formatter.transform(info);
		expect(result).toBe(info);
	});
});

// ---------------------------------------------------------------------------
// createContextId()
// ---------------------------------------------------------------------------
describe("createContextId()", () => {
	it("calls callback with (null, string contextId)", (done) => {
		createContextId((err, contextId) => {
			expect(err).toBeNull();
			expect(typeof contextId).toBe("string");
			expect(contextId).not.toBe(false);
			done();
		});
	});

	it("provides a unique contextId on each call", (done) => {
		createContextId((_err1, id1) => {
			createContextId((_err2, id2) => {
				expect(id1).not.toBe(id2);
				done();
			});
		});
	});
});

// ---------------------------------------------------------------------------
// LogContextId format
// ---------------------------------------------------------------------------
describe("LogContextId", () => {
	it("returns the info object without ContextId or $context when no context is active", () => {
		const formatter = LogContextId();
		const info = { level: "info", message: "test" } as any;
		const result = formatter.transform(info) as any;
		expect(result).toBe(info);
		expect(result.ContextId).toBeUndefined();
		expect(result.$context).toBeUndefined();
	});

	it("injects ContextId when running inside a createContextId callback", (done) => {
		createContextId((_err, contextId) => {
			const formatter = LogContextId();
			const info = { level: "info", message: "test" } as any;
			const result = formatter.transform(info) as any;
			expect(result.ContextId).toBe(contextId);
			done();
		});
	});

	it("injects $context as a plain object when a Context Map is active", (done) => {
		Context.create((_err, context) => {
			(context as Map<string, any>).set("userId", "42");
			const formatter = LogContextId();
			const info = { level: "info", message: "test" } as any;
			const result = formatter.transform(info) as any;
			expect(result.$context).toEqual({ userId: "42" });
			done();
		});
	});
});

// ---------------------------------------------------------------------------
// Context.create()
// ---------------------------------------------------------------------------
describe("Context.create()", () => {
	it("calls callback with (null, Map)", (done) => {
		Context.create((_err, context) => {
			expect(context).toBeInstanceOf(Map);
			done();
		});
	});
});

// ---------------------------------------------------------------------------
// Context.get()
// ---------------------------------------------------------------------------
describe("Context.get()", () => {
	it("returns undefined when called outside a context", () => {
		expect(Context.get()).toBeUndefined();
	});

	it("returns the context Map when called inside Context.create()", (done) => {
		Context.create((_err, context) => {
			expect(Context.get()).toBe(context);
			done();
		});
	});
});

// ---------------------------------------------------------------------------
// Context.set()
// ---------------------------------------------------------------------------
describe("Context.set()", () => {
	it("returns false when called outside a context", () => {
		expect(Context.set("key", "value")).toBe(false);
	});

	it("sets key-value in the context Map and returns true", (done) => {
		Context.create((_err, context) => {
			const result = Context.set("env", "production");
			expect(result).toBe(true);
			expect((context as Map<string, any>).get("env")).toBe("production");
			done();
		});
	});
});

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
describe("Logger", () => {
	it("has standard logging methods", () => {
		expect(typeof Logger.info).toBe("function");
		expect(typeof Logger.error).toBe("function");
		expect(typeof Logger.debug).toBe("function");
		expect(typeof Logger.warn).toBe("function");
	});

	it("has at least one transport configured", () => {
		expect(Logger.transports.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// LogStream
// ---------------------------------------------------------------------------
describe("LogStream", () => {
	it("write() calls Logger.info with the message", () => {
		const spy = jest.spyOn(Logger, "info").mockImplementation(() => Logger as any);
		LogStream.write("hello from stream");
		expect(spy).toHaveBeenCalledWith("hello from stream");
		spy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// addFileLogging()
// ---------------------------------------------------------------------------
describe("addFileLogging()", () => {
	it("adds a file transport to the Logger", () => {
		const countBefore = Logger.transports.length;
		addFileLogging(tmpdir());
		expect(Logger.transports.length).toBeGreaterThan(countBefore);
	});
});
