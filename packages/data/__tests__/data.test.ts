"use strict";
import { tmpdir } from "os";
import { writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { Artifact, Content, Redirection, Sendable, BaseView, ViewFactory } from "./../src";

// ---------------------------------------------------------------------------
// Sendable (tested via Artifact which is a concrete subclass)
// ---------------------------------------------------------------------------
describe("Sendable", () => {
	it("has a default httpCode of 200", () => {
		const a = new Artifact();
		expect(a.httpCode).toBe(200);
	});

	it("setHttpCode() updates the code and returns this", () => {
		const a = new Artifact();
		const result = a.setHttpCode(201);
		expect(result).toBe(a);
		expect(a.httpCode).toBe(201);
	});

	it("httpHeaders is undefined by default", () => {
		expect(new Artifact().httpHeaders).toBeUndefined();
	});

	it("setHttpHeaders() sets headers and returns this", () => {
		const a = new Artifact();
		const result = a.setHttpHeaders({ "X-Custom": "value" });
		expect(result).toBe(a);
		expect(a.httpHeaders).toEqual({ "X-Custom": "value" });
	});

	it("setHttpHeaders() replaces headers by default", () => {
		const a = new Artifact();
		a.setHttpHeaders({ "X-A": "1" });
		a.setHttpHeaders({ "X-B": "2" });
		expect(a.httpHeaders).toEqual({ "X-B": "2" });
	});

	it("setHttpHeaders() appends headers when append=true", () => {
		const a = new Artifact();
		a.setHttpHeaders({ "X-A": "1" });
		a.setHttpHeaders({ "X-B": "2" }, true);
		expect(a.httpHeaders).toEqual({ "X-A": "1", "X-B": "2" });
	});

	it("emitter is an EventEmitter instance", () => {
		const a = new Artifact();
		expect(typeof a.emitter.on).toBe("function");
		expect(typeof a.emitter.emit).toBe("function");
	});

	it("emitter fires events", () => {
		const a = new Artifact();
		const spy = jest.fn();
		a.emitter.on("beforesend", spy);
		a.emitter.emit("beforesend");
		expect(spy).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------
describe("Artifact", () => {
	it("constructs with null data and undefined message by default", () => {
		const a = new Artifact();
		expect(a.data).toBeNull();
		expect(a.message).toBeUndefined();
	});

	it("accepts data and message", () => {
		const data = { id: 1 };
		const a = new Artifact(data, "Created");
		expect(a.data).toBe(data);
		expect(a.message).toBe("Created");
	});

	it("export() returns { data, message }", () => {
		const a = new Artifact({ id: 42 }, "ok");
		expect(a.export()).toEqual({ data: { id: 42 }, message: "ok" });
	});

	it("send() returns the same as export()", async () => {
		const a = new Artifact([1, 2, 3], "list");
		expect(await a.send()).toEqual(a.export());
	});

	it("is an instance of Sendable", () => {
		expect(new Artifact()).toBeInstanceOf(Sendable);
	});

	it("supports generic typing", () => {
		const a = new Artifact<{ name: string }>({ name: "Alice" });
		expect(a.data?.name).toBe("Alice");
	});
});

// ---------------------------------------------------------------------------
// Redirection
// ---------------------------------------------------------------------------
describe("Redirection", () => {
	it("defaults to HTTP 302", () => {
		const r = new Redirection("/home");
		expect(r.httpCode).toBe(302);
		expect(r.location).toBe("/home");
	});

	it("accepts a custom redirect code", () => {
		const r = new Redirection("/new", 301);
		expect(r.httpCode).toBe(301);
	});

	it("send() returns { httpCode, location }", async () => {
		const r = new Redirection("/dashboard", 307);
		expect(await r.send()).toEqual({ httpCode: 307, location: "/dashboard" });
	});

	it("is an instance of Sendable", () => {
		expect(new Redirection("/x")).toBeInstanceOf(Sendable);
	});

	it("supports setHttpCode() inherited from Sendable", () => {
		const r = new Redirection("/x");
		r.setHttpCode(308);
		expect(r.httpCode).toBe(308);
	});
});

// ---------------------------------------------------------------------------
// Content (EJS inline template renderer)
// ---------------------------------------------------------------------------
describe("Content", () => {
	it("render() returns rendered EJS template", async () => {
		const c = new Content({ template: "<h1><%= title %></h1>", data: { title: "Hello" } });
		expect(await c.render()).toBe("<h1>Hello</h1>");
	});

	it("send() delegates to render()", async () => {
		const c = new Content({ template: "value: <%= v %>", data: { v: 42 } });
		expect(await c.send()).toBe("value: 42");
	});

	it("render() works with no data", async () => {
		const c = new Content({ template: "<p>static</p>" });
		expect(await c.render()).toBe("<p>static</p>");
	});

	it("is an instance of Sendable", () => {
		expect(new Content({ template: "" })).toBeInstanceOf(Sendable);
	});
});

// ---------------------------------------------------------------------------
// BaseView.normalize() — static utility
// ---------------------------------------------------------------------------
describe("BaseView.normalize()", () => {
	const folder = "/views";
	const ext = "ejs";

	it("appends the extension when not present", () => {
		expect(BaseView.normalize("index", folder, ext)).toContain("index.ejs");
	});

	it("does not double-append the extension", () => {
		const result = BaseView.normalize("index.ejs", folder, ext);
		expect(result).not.toContain("index.ejs.ejs");
	});

	it("resolves trailing slash to index file", () => {
		expect(BaseView.normalize("admin/", folder, ext)).toContain("index.ejs");
	});

	it("strips a leading single slash (relative to folder)", () => {
		const withSlash = BaseView.normalize("/index", folder, ext);
		const withoutSlash = BaseView.normalize("index", folder, ext);
		expect(withSlash).toBe(withoutSlash);
	});

	it("double-slash paths bypass the traversal guard (explicit absolute opt-in)", () => {
		const result = BaseView.normalize("//absolute/path", folder, ext);
		expect(result).toContain("/absolute/path.ejs");
	});

	it("rejects ../ traversal escaping the views folder", () => {
		expect(() => BaseView.normalize("../../etc/passwd", folder, ext)).toThrow(/path traversal blocked/);
	});

	it("rejects ../ traversal even from nested view names", () => {
		expect(() => BaseView.normalize("admin/../../etc/passwd", folder, ext)).toThrow(
			/path traversal blocked/,
		);
	});

	it("allows nested paths that stay under the folder", () => {
		const result = BaseView.normalize("admin/users/profile", folder, ext);
		expect(result).toBe(resolve(folder, "admin/users/profile.ejs"));
	});
});

// ---------------------------------------------------------------------------
// ViewFactory
// ---------------------------------------------------------------------------
describe("ViewFactory", () => {
	it("creates a class with the configured path and extension", () => {
		const View = ViewFactory({ path: "/views", extension: "html" });
		const instance = new View({ name: "test" });
		expect((instance as any).path).toBe("/views");
		expect((instance as any).extension).toBe("html");
	});

	it("defaults extension to 'ejs' when not provided", () => {
		const View = ViewFactory({ path: "/views" });
		const instance = new View({ name: "test" });
		expect((instance as any).extension).toBe("ejs");
	});

	it("defaults layoutDir to 'layouts' when not provided", () => {
		const View = ViewFactory({ path: "/views" });
		const instance = new View({ name: "test" });
		expect((instance as any).layoutsDir).toBe("layouts");
	});

	it("accepts a custom layoutDir", () => {
		const View = ViewFactory({ path: "/views", layoutDir: "_layouts" });
		const instance = new View({ name: "test" });
		expect((instance as any).layoutsDir).toBe("_layouts");
	});

	it("produced class is a subclass of BaseView", () => {
		const View = ViewFactory({ path: "/views" });
		expect(new View({ name: "test" })).toBeInstanceOf(BaseView);
	});

	it("produced class is a subclass of Sendable", () => {
		const View = ViewFactory({ path: "/views" });
		expect(new View({ name: "test" })).toBeInstanceOf(Sendable);
	});
});

// ---------------------------------------------------------------------------
// BaseView.render() — file-based EJS rendering with optional layout
// ---------------------------------------------------------------------------
describe("BaseView.render()", () => {
	const tmpBase = join(tmpdir(), `weaverkit-test-${Date.now()}`);
	const viewsDir = join(tmpBase, "views");
	const layoutsDir = join(viewsDir, "layouts");
	let View: any;

	beforeAll(() => {
		mkdirSync(layoutsDir, { recursive: true });
		writeFileSync(join(viewsDir, "page.ejs"), "<main><%= title %></main>");
		writeFileSync(join(viewsDir, "static.ejs"), "<p>static</p>");
		writeFileSync(join(layoutsDir, "base.ejs"), "<html><%- content %></html>");
		writeFileSync(join(layoutsDir, "custom.ejs"), "<html><%- body %></html>");
		View = ViewFactory({ path: viewsDir });
	});

	it("render() returns rendered EJS content without a layout", async () => {
		const v = new View({ name: "page", data: { title: "Hello" } });
		expect(await v.render()).toBe("<main>Hello</main>");
	});

	it("send() delegates to render()", async () => {
		const v = new View({ name: "page", data: { title: "Send" } });
		expect(await v.send()).toBe("<main>Send</main>");
	});

	it("render() with no data defaults to empty object", async () => {
		const v = new View({ name: "static" });
		expect(await v.render()).toBe("<p>static</p>");
	});

	it("render() wraps content in layout when layout is provided", async () => {
		const v = new View({ name: "page", data: { title: "World" }, layout: { name: "base" } });
		expect(await v.render()).toBe("<html><main>World</main></html>");
	});

	it("render() uses a custom contentVar in the layout", async () => {
		const v = new View({ name: "page", data: { title: "Var" }, layout: { name: "custom", contentVar: "body" } });
		expect(await v.render()).toBe("<html><main>Var</main></html>");
	});
});
