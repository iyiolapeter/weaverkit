"use strict";
import "reflect-metadata";
import express, { Router, Request, Response, NextFunction } from "express";
import supertest from "supertest";
import {
	IsRouter,
	CreateRouter,
	ApplyHeaders,
	SendResponse,
	DefaultValidationErrorFormatter,
	MountCollection,
	RunMiddlewareIf,
	ValidateRequest,
	ValidatedRequestHandler,
	WeaverExpressApp,
	WeaverExpressAppEvents,
	Controller,
	Get,
	Post,
	Put,
	Patch,
	Delete,
	Head,
	Trace,
	Body,
	Param,
	Query,
	Headers as HeadersDecorator,
	Req as ReqDecorator,
	Res as ResDecorator,
	Next as NextDecorator,
	UseBefore,
	UseAfter,
	UseValidator,
	ValidationObject,
	Constraint,
	NestedConstraint,
	OneOf,
	GetRouterFromController,
	GetSchemaValidators,
	RouteLoader,
	CreateArgDecorator,
	RunValidationMiddleware,
	GetPropertyMetadata,
	SetPropertyMetadata,
	SetGlobalValidationOptions,
	CreateValidationMiddleware,
	RunValidators,
	RunImperative,
} from "../src";
import { ErrorHandler, BadRequestError, ServerError } from "@weaverkit/errors";
import { Artifact, Redirection } from "@weaverkit/data";
import { body as evBody } from "express-validator";

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------
function makeErrorHandler() {
	return new ErrorHandler();
}

// ---------------------------------------------------------------------------
// IsRouter
// ---------------------------------------------------------------------------
describe("IsRouter", () => {
	it("returns true for an Express Router", () => {
		expect(IsRouter(Router())).toBe(true);
	});

	it("returns false for an express Application", () => {
		expect(IsRouter(express())).toBe(false);
	});

	it("returns false for a plain object", () => {
		expect(IsRouter({})).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// CreateRouter
// ---------------------------------------------------------------------------
describe("CreateRouter", () => {
	it("returns an Express Router", () => {
		expect(IsRouter(CreateRouter())).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// ApplyHeaders
// ---------------------------------------------------------------------------
describe("ApplyHeaders", () => {
	function mockRes() {
		return { setHeader: jest.fn() } as any;
	}

	it("sets each provided header on the response", () => {
		const res = mockRes();
		ApplyHeaders(res, { "X-A": "1", "X-B": "2" });
		expect(res.setHeader).toHaveBeenCalledWith("X-A", "1");
		expect(res.setHeader).toHaveBeenCalledWith("X-B", "2");
	});

	it("skips null values", () => {
		const res = mockRes();
		ApplyHeaders(res, { "X-A": null as any });
		expect(res.setHeader).not.toHaveBeenCalled();
	});

	it("skips undefined values", () => {
		const res = mockRes();
		ApplyHeaders(res, { "X-A": undefined });
		expect(res.setHeader).not.toHaveBeenCalled();
	});

	it("sets header with numeric value 0", () => {
		const res = mockRes();
		ApplyHeaders(res, { "X-Count": 0 });
		expect(res.setHeader).toHaveBeenCalledWith("X-Count", 0);
	});
});

// ---------------------------------------------------------------------------
// SendResponse
// ---------------------------------------------------------------------------
describe("SendResponse", () => {
	function mockRes() {
		const send = jest.fn();
		const status = jest.fn(() => ({ send }));
		return { status, redirect: jest.fn(), setHeader: jest.fn(), send } as any;
	}

	it("sends a plain value at HTTP 200 by default", async () => {
		const res = mockRes();
		await SendResponse(res, { data: 1 });
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it("uses a custom defaultStatusCode for plain values", async () => {
		const res = mockRes();
		await SendResponse(res, "created", 201);
		expect(res.status).toHaveBeenCalledWith(201);
	});

	it("sends a Sendable using its own httpCode", async () => {
		const res = mockRes();
		const artifact = new Artifact({ id: 1 });
		artifact.setHttpCode(201);
		await SendResponse(res, artifact);
		expect(res.status).toHaveBeenCalledWith(201);
	});

	it("applies httpHeaders from a Sendable before sending", async () => {
		const res = mockRes();
		const artifact = new Artifact({});
		artifact.setHttpHeaders({ "X-Custom": "val" });
		await SendResponse(res, artifact);
		expect(res.setHeader).toHaveBeenCalledWith("X-Custom", "val");
	});

	it("emits beforesend and aftersend events on a Sendable", async () => {
		const res = mockRes();
		const before = jest.fn();
		const after = jest.fn();
		const artifact = new Artifact({});
		artifact.emitter.on("beforesend", before);
		artifact.emitter.on("aftersend", after);
		await SendResponse(res, artifact);
		expect(before).toHaveBeenCalledTimes(1);
		expect(after).toHaveBeenCalledTimes(1);
	});

	it("redirects for Redirection instances", async () => {
		const res = mockRes();
		const redir = new Redirection("/home", 301);
		await SendResponse(res, redir);
		expect(res.redirect).toHaveBeenCalledWith(301, "/home");
	});

	it("returns true", async () => {
		const res = mockRes();
		const result = await SendResponse(res, {});
		expect(result).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// DefaultValidationErrorFormatter
// ---------------------------------------------------------------------------
describe("DefaultValidationErrorFormatter", () => {
	it("returns { parameter, message } for field errors", () => {
		const err = {
			type: "field",
			path: "email",
			msg: "Invalid email",
			location: "body",
			value: "bad",
			nestedErrors: [],
		} as any;
		expect(DefaultValidationErrorFormatter(err)).toEqual({ parameter: "email", message: "Invalid email" });
	});

	it("returns { message } for non-field errors", () => {
		const err = {
			type: "alternative",
			msg: "At least one required",
			location: "body" as any,
			value: undefined,
			nestedErrors: [],
		} as any;
		expect(DefaultValidationErrorFormatter(err)).toEqual({ message: "At least one required" });
	});
});

// ---------------------------------------------------------------------------
// MountCollection
// ---------------------------------------------------------------------------
describe("MountCollection", () => {
	it("mounts a Router at the specified path", () => {
		const use = jest.fn();
		const router = Router();
		MountCollection({ use } as any, { "/api": router });
		expect(use).toHaveBeenCalledWith("/api", router);
	});

	it("prepends a slash to paths that lack one", () => {
		const use = jest.fn();
		MountCollection({ use } as any, { api: Router() });
		expect(use.mock.calls[0][0]).toBe("/api");
	});

	it("mounts a WeaverExpressApp via its .app property", () => {
		const use = jest.fn();
		const app = new WeaverExpressApp({ routes: {}, errorHandler: makeErrorHandler() }).init();
		MountCollection({ use } as any, { "/sub": app });
		expect(use).toHaveBeenCalledWith("/sub", app.app);
	});

	it("throws ServerError for an unsupported handler type", () => {
		expect(() =>
			MountCollection({ use: jest.fn() } as any, { "/api": "not-valid" as any }),
		).toThrow(ServerError);
	});
});

// ---------------------------------------------------------------------------
// RunMiddlewareIf
// ---------------------------------------------------------------------------
describe("RunMiddlewareIf", () => {
	it("invokes middleware when the condition returns true", async () => {
		const middleware = jest.fn((_req: Request, _res: Response, next: NextFunction) => next());
		const mw = RunMiddlewareIf(() => true, middleware);
		const next = jest.fn();
		await mw({} as any, {} as any, next);
		expect(middleware).toHaveBeenCalledTimes(1);
	});

	it("skips middleware and calls next when condition returns false", async () => {
		const middleware = jest.fn();
		const mw = RunMiddlewareIf(() => false, middleware);
		const next = jest.fn();
		await mw({} as any, {} as any, next);
		expect(middleware).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledWith();
	});

	it("supports async conditions", async () => {
		const middleware = jest.fn((_req: Request, _res: Response, next: NextFunction) => next());
		const mw = RunMiddlewareIf(async () => true, middleware);
		const next = jest.fn();
		await mw({} as any, {} as any, next);
		expect(middleware).toHaveBeenCalledTimes(1);
	});

	it("forwards condition errors to next", async () => {
		const err = new Error("condition failed");
		const mw = RunMiddlewareIf(
			() => {
				throw err;
			},
			jest.fn(),
		);
		const next = jest.fn();
		await mw({} as any, {} as any, next);
		expect(next).toHaveBeenCalledWith(err);
	});
});

// ---------------------------------------------------------------------------
// ValidateRequest (integration via supertest)
// ---------------------------------------------------------------------------
describe("ValidateRequest", () => {
	it("returns matched data when validation passes", async () => {
		const router = Router();
		router.post("/", evBody("email").isEmail(), (req: Request, res: Response, next: NextFunction) => {
			try {
				const data = ValidateRequest(req);
				res.json({ data });
			} catch (e) {
				next(e);
			}
		});
		const app = express();
		app.use(express.json());
		app.use(router);
		const res = await supertest(app).post("/").send({ email: "user@example.com" }).set("Content-Type", "application/json");
		expect(res.status).toBe(200);
		expect(res.body.data.email).toBe("user@example.com");
	});

	it("throws ValidationError when validation fails", async () => {
		const router = Router();
		router.post("/", evBody("email").isEmail(), (req: Request, res: Response, next: NextFunction) => {
			try {
				ValidateRequest(req);
				res.json({ ok: true });
			} catch (e) {
				next(e);
			}
		});
		const errHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
			res.status(422).json({ code: err.code });
		};
		const app = express();
		app.use(express.json());
		app.use(router);
		app.use(errHandler);
		const res = await supertest(app).post("/").send({ email: "not-an-email" }).set("Content-Type", "application/json");
		expect(res.status).toBe(422);
		expect(res.body.code).toBe("INPUT_VALIDATION_ERROR");
	});
});

// ---------------------------------------------------------------------------
// ValidatedRequestHandler (integration via supertest)
// ---------------------------------------------------------------------------
describe("ValidatedRequestHandler", () => {
	it("calls action with validated data and sends the response", async () => {
		const router = Router();
		router.post("/", evBody("name").notEmpty(), ValidatedRequestHandler(async (data: any) => ({ received: data })));
		const app = express();
		app.use(express.json());
		app.use(router);
		const res = await supertest(app).post("/").send({ name: "Alice" }).set("Content-Type", "application/json");
		expect(res.status).toBe(200);
		expect(res.body.received.name).toBe("Alice");
	});

	it("forwards validation errors to next", async () => {
		const router = Router();
		router.post("/", evBody("name").notEmpty(), ValidatedRequestHandler(async (data: any) => data));
		const errHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
			res.status(422).json({ error: err.code });
		};
		const app = express();
		app.use(express.json());
		app.use(router);
		app.use(errHandler);
		const res = await supertest(app).post("/").send({}).set("Content-Type", "application/json");
		expect(res.status).toBe(422);
		expect(res.body.error).toBe("INPUT_VALIDATION_ERROR");
	});

	it("uses contextResolver to provide context to the action", async () => {
		const router = Router();
		router.get(
			"/",
			ValidatedRequestHandler(async (_data: any, ctx: any) => ({ userId: ctx.userId }), {
				contextResolver: (_req: Request) => ({ userId: 99 }),
			}),
		);
		const app = express();
		app.use(router);
		const res = await supertest(app).get("/");
		expect(res.status).toBe(200);
		expect(res.body.userId).toBe(99);
	});
});

// ---------------------------------------------------------------------------
// WeaverExpressApp
// ---------------------------------------------------------------------------
describe("WeaverExpressApp", () => {
	it("throws if .app is accessed before init()", () => {
		const app = new WeaverExpressApp({ routes: {}, errorHandler: makeErrorHandler() });
		expect(() => app.app).toThrow("App is not initialized");
	});

	it("init() marks the app as initialized and returns this", () => {
		const app = new WeaverExpressApp({ routes: {}, errorHandler: makeErrorHandler() });
		const result = app.init();
		expect(result).toBe(app);
		expect(() => app.app).not.toThrow();
	});

	it("calling init() twice is safe", () => {
		const app = new WeaverExpressApp({ routes: {}, errorHandler: makeErrorHandler() });
		app.init();
		expect(() => app.init()).not.toThrow();
	});

	it("emits PREINIT and INIT events on init()", () => {
		const app = new WeaverExpressApp({ routes: {}, errorHandler: makeErrorHandler() });
		const preinit = jest.fn();
		const init = jest.fn();
		app.on(WeaverExpressAppEvents.PREINIT, preinit);
		app.on(WeaverExpressAppEvents.INIT, init);
		app.init();
		expect(preinit).toHaveBeenCalledTimes(1);
		expect(init).toHaveBeenCalledTimes(1);
	});

	it("emits ROUTES_WILL_BIND and ROUTES_DID_BIND events on init()", () => {
		const app = new WeaverExpressApp({ routes: {}, errorHandler: makeErrorHandler() });
		const willBind = jest.fn();
		const didBind = jest.fn();
		app.on(WeaverExpressAppEvents.ROUTES_WILL_BIND, willBind);
		app.on(WeaverExpressAppEvents.ROUTES_DID_BIND, didBind);
		app.init();
		expect(willBind).toHaveBeenCalledTimes(1);
		expect(didBind).toHaveBeenCalledTimes(1);
	});

	it("returns 404 JSON for unknown routes", async () => {
		const wApp = new WeaverExpressApp({ routes: {}, errorHandler: makeErrorHandler() }).init();
		const res = await supertest(wApp.app).get("/unknown");
		expect(res.status).toBe(404);
		expect(res.body.error).toBeDefined();
	});

	it("error handler returns formatted error JSON", async () => {
		const router = Router();
		router.get("/boom", (_req: Request, _res: Response, next: NextFunction) => next(new BadRequestError("bad input")));
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
		}).init();
		const res = await supertest(wApp.app).get("/boom");
		expect(res.status).toBe(400);
		expect(res.body.error.message).toBe("bad input");
	});

	it("error handler wraps plain errors as 500", async () => {
		const router = Router();
		router.get("/crash", (_req: Request, _res: Response, next: NextFunction) => next(new Error("unexpected")));
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
		}).init();
		const res = await supertest(wApp.app).get("/crash");
		expect(res.status).toBe(500);
	});

	it("applies error.httpHeaders in the response", async () => {
		const router = Router();
		router.get("/auth", (_req: Request, _res: Response, next: NextFunction) => {
			const err = new BadRequestError();
			err.setHttpHeaders({ "X-Request-Id": "abc123" });
			next(err);
		});
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
		}).init();
		const res = await supertest(wApp.app).get("/auth");
		expect(res.headers["x-request-id"]).toBe("abc123");
	});

	it("applies helmet security headers by default", async () => {
		const router = Router();
		router.get("/", (_req: Request, res: Response) => res.send("ok"));
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
		}).init();
		const res = await supertest(wApp.app).get("/");
		expect(res.headers["x-content-type-options"]).toBeDefined();
	});

	it("skips helmet when helmet:false", async () => {
		const router = Router();
		router.get("/", (_req: Request, res: Response) => res.send("ok"));
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
			helmet: false,
		}).init();
		const res = await supertest(wApp.app).get("/");
		expect(res.headers["x-content-type-options"]).toBeUndefined();
	});

	it("parses JSON bodies by default", async () => {
		const router = Router();
		router.post("/", (req: Request, res: Response) => res.json({ received: req.body }));
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
		}).init();
		const res = await supertest(wApp.app).post("/").send({ name: "Alice" }).set("Content-Type", "application/json");
		expect(res.body.received).toEqual({ name: "Alice" });
	});

	it("renderError interceptor can take over error rendering", async () => {
		const router = Router();
		router.get("/", (_req: Request, _res: Response, next: NextFunction) => next(new BadRequestError()));
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
			renderError: async (_err, _fmt, _req, res) => {
				res.status(418).send("teapot");
				return true;
			},
		}).init();
		const res = await supertest(wApp.app).get("/");
		expect(res.status).toBe(418);
		expect(res.text).toBe("teapot");
	});

	it("renderError returning false falls through to default handling", async () => {
		const router = Router();
		router.get("/", (_req: Request, _res: Response, next: NextFunction) => next(new BadRequestError("fallthrough")));
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
			renderError: async () => false,
		}).init();
		const res = await supertest(wApp.app).get("/");
		expect(res.status).toBe(400);
		expect(res.body.error.message).toBe("fallthrough");
	});

	it("applyErrorMiddlewares() is idempotent — calling it twice has no ill effect", async () => {
		const wApp = new WeaverExpressApp({ routes: {}, errorHandler: makeErrorHandler() }).init({ applyErrorMiddlewares: false });
		wApp.applyErrorMiddlewares();
		wApp.applyErrorMiddlewares();
		const res = await supertest(wApp.app).get("/unknown");
		expect(res.status).toBe(404);
	});

	it("use404Middleware:false skips the 404 error handler", async () => {
		const wApp = new WeaverExpressApp({
			routes: {},
			errorHandler: makeErrorHandler(),
			use404Middleware: false,
		}).init();
		const res = await supertest(wApp.app).get("/unknown");
		expect(res.body.error).toBeUndefined();
	});

	it("useErrorMiddleware:false skips the error handler middleware", async () => {
		const router = Router();
		router.get("/", (_req: Request, _res: Response, next: NextFunction) => next(new BadRequestError("no handler")));
		const wApp = new WeaverExpressApp({
			routes: { "/": router },
			errorHandler: makeErrorHandler(),
			useErrorMiddleware: false,
		}).init();
		const res = await supertest(wApp.app).get("/");
		expect(res.body.error).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Decorators — HTTP verb routing
// ---------------------------------------------------------------------------
describe("HTTP verb decorators and GetRouterFromController", () => {
	@Controller("/items")
	class ItemController {
		@Get("/")
		list() {
			return new Artifact([1, 2], "list");
		}

		@Post("/")
		create(@Body() body: any) {
			return new Artifact(body, "created");
		}

		@Get("/:id")
		getOne(@Param("id") id: string) {
			return new Artifact({ id }, "found");
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ItemController);
		app = express();
		app.use(express.json());
		app.use(path, router);
	});

	it("GET / returns list artifact", async () => {
		const res = await supertest(app).get("/items/");
		expect(res.status).toBe(200);
		expect(res.body.data).toEqual([1, 2]);
		expect(res.body.message).toBe("list");
	});

	it("POST / injects @Body() and returns artifact", async () => {
		const res = await supertest(app).post("/items/").send({ name: "Widget" }).set("Content-Type", "application/json");
		expect(res.status).toBe(200);
		expect(res.body.data).toEqual({ name: "Widget" });
	});

	it("GET /:id injects @Param('id')", async () => {
		const res = await supertest(app).get("/items/42");
		expect(res.status).toBe(200);
		expect(res.body.data.id).toBe("42");
	});

	it("throws when the class lacks @Controller", () => {
		class Plain {}
		expect(() => GetRouterFromController(Plain)).toThrow();
	});
});

// ---------------------------------------------------------------------------
// Decorators — @Query, @Headers, @Req, @Res
// ---------------------------------------------------------------------------
describe("parameter decorators @Query, @Headers, @Req, @Res", () => {
	@Controller("/params")
	class ParamController {
		@Get("/query")
		fromQuery(@Query("term") term: string) {
			return { term };
		}

		@Get("/headers")
		fromHeaders(@HeadersDecorator("x-token") token: string) {
			return { token };
		}

		@Get("/req")
		fromReq(@ReqDecorator() req: Request) {
			return { originalUrl: req.originalUrl };
		}

		@Get("/res")
		fromRes(@ResDecorator() res: Response) {
			res.status(201).json({ manual: true });
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ParamController);
		app = express();
		app.use(path, router);
	});

	it("@Query() injects query parameter", async () => {
		const res = await supertest(app).get("/params/query?term=hello");
		expect(res.status).toBe(200);
		expect(res.body.term).toBe("hello");
	});

	it("@Headers() injects a header value", async () => {
		const res = await supertest(app).get("/params/headers").set("x-token", "secret");
		expect(res.status).toBe(200);
		expect(res.body.token).toBe("secret");
	});

	it("@Req() injects the raw request object (auto-send still active)", async () => {
		const res = await supertest(app).get("/params/req");
		expect(res.status).toBe(200);
		expect(res.body.originalUrl).toBe("/params/req");
	});

	it("@Res() injects the response object and disables auto-send", async () => {
		const res = await supertest(app).get("/params/res");
		expect(res.status).toBe(201);
		expect(res.body.manual).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Decorators — @UseBefore and @UseAfter
// ---------------------------------------------------------------------------
const beforeSpy = jest.fn((_req: Request, _res: Response, next: NextFunction) => next());
const afterSpy = jest.fn((_req: Request, _res: Response, next: NextFunction) => next());
const classBeforeSpy = jest.fn((_req: Request, _res: Response, next: NextFunction) => next());

describe("@UseBefore and @UseAfter", () => {
	@Controller("/mw")
	@UseBefore(classBeforeSpy)
	class MwController {
		@Get("/method")
		@UseBefore(beforeSpy)
		@UseAfter(afterSpy)
		test() {
			return { ok: true };
		}

		@Get("/other")
		other() {
			return { other: true };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(MwController);
		app = express();
		app.use(path, router);
	});

	beforeEach(() => {
		beforeSpy.mockClear();
		afterSpy.mockClear();
		classBeforeSpy.mockClear();
	});

	it("method-level @UseBefore runs before the handler", async () => {
		const res = await supertest(app).get("/mw/method");
		expect(res.status).toBe(200);
		expect(beforeSpy).toHaveBeenCalledTimes(1);
	});

	it("method-level @UseAfter runs after the handler", async () => {
		await supertest(app).get("/mw/method");
		expect(afterSpy).toHaveBeenCalledTimes(1);
	});

	it("class-level @UseBefore runs for all routes", async () => {
		await supertest(app).get("/mw/method");
		await supertest(app).get("/mw/other");
		expect(classBeforeSpy).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// Decorators — @UseValidator with @ValidationObject and @Constraint
// ---------------------------------------------------------------------------
describe("@UseValidator decorator validation", () => {
	@ValidationObject("body")
	class CreateItemDto {
		@Constraint({ notEmpty: true, errorMessage: "name is required" })
		name!: string;

		@Constraint({ isInt: { options: { min: 1 } }, toInt: true, errorMessage: "qty must be a positive integer" })
		qty!: number;
	}

	@Controller("/validated")
	class ValidatedController {
		@Post("/")
		@UseValidator([CreateItemDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ValidatedController);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("passes with valid input and injects validated body", async () => {
		const res = await supertest(app)
			.post("/validated/")
			.send({ name: "Widget", qty: "5" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
		expect(res.body.body.name).toBe("Widget");
	});

	it("returns 422 with invalid input", async () => {
		const res = await supertest(app)
			.post("/validated/")
			.send({ qty: "abc" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
		expect(res.body.error.code).toBe("INPUT_VALIDATION_ERROR");
	});
});

// ---------------------------------------------------------------------------
// RouteLoader
// ---------------------------------------------------------------------------
describe("RouteLoader", () => {
	describe("fromDefinition", () => {
		it("builds a router from a definition object", async () => {
			const router = RouteLoader().fromDefinition({
				get: [["/", (_req: Request, res: Response) => res.json({ ok: true })]],
			});
			expect(IsRouter(router)).toBe(true);
			const app = express();
			app.use(router);
			const res = await supertest(app).get("/");
			expect(res.status).toBe(200);
			expect(res.body.ok).toBe(true);
		});

		it("registers POST routes", async () => {
			const router = RouteLoader().fromDefinition({
				post: [["/create", (_req: Request, res: Response) => res.status(201).json({ created: true })]],
			});
			const app = express();
			app.use(router);
			const res = await supertest(app).post("/create");
			expect(res.status).toBe(201);
		});

		it("uses an existing router if one is provided", async () => {
			const existing = Router();
			existing.get("/existing", (_req: Request, res: Response) => res.json({ from: "existing" }));
			const router = RouteLoader().fromDefinition(
				{ get: [["/new", (_req: Request, res: Response) => res.json({ from: "new" })]] },
				{ router: existing },
			);
			expect(router).toBe(existing);
			const app = express();
			app.use(router);
			const [r1, r2] = await Promise.all([supertest(app).get("/existing"), supertest(app).get("/new")]);
			expect(r1.body.from).toBe("existing");
			expect(r2.body.from).toBe("new");
		});
	});

	describe("fromDecoratedControllers", () => {
		@Controller("/things")
		class ThingController {
			@Get("/")
			list() {
				return [];
			}
		}

		it("returns a RouteCollection from decorated controllers", () => {
			const collection = RouteLoader().fromDecoratedControllers([ThingController]);
			expect(collection).toHaveProperty("/things");
			expect(IsRouter(collection["/things"] as any)).toBe(true);
		});

		it("produces a working router that handles requests", async () => {
			const collection = RouteLoader().fromDecoratedControllers([ThingController]);
			const app = express();
			for (const [path, handler] of Object.entries(collection)) {
				app.use(path, handler as Router);
			}
			const res = await supertest(app).get("/things/");
			expect(res.status).toBe(200);
		});
	});

	describe("fromPath", () => {
		it("throws when the loaded module is not a Router", () => {
			expect(() => RouteLoader().fromPath("express")).toThrow("is not an express router");
		});

		it("re-throws when the module cannot be found", () => {
			expect(() => RouteLoader().fromPath("/nonexistent/path/to/module")).toThrow();
		});
	});

	describe("fromDefinition with use (sub-router mount)", () => {
		it("mounts a sub-router via the 'use' key", async () => {
			const subRouter = Router();
			subRouter.get("/ping", (_req: Request, res: Response) => res.json({ pong: true }));
			const router = RouteLoader().fromDefinition({
				use: [["/sub", subRouter]],
			});
			const app = express();
			app.use(router);
			const res = await supertest(app).get("/sub/ping");
			expect(res.status).toBe(200);
			expect(res.body.pong).toBe(true);
		});
	});

	describe("fromDecoratedControllers with [class, config] tuple", () => {
		@Controller("/tupled")
		class TupledController {
			@Get("/")
			hello() {
				return { tupled: true };
			}
		}

		it("accepts [class, config] tuple entries", () => {
			const collection = RouteLoader().fromDecoratedControllers([[TupledController, {}]]);
			expect(collection).toHaveProperty("/tupled");
			expect(IsRouter(collection["/tupled"] as any)).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// Additional HTTP verb decorators (Put, Patch, Delete)
// ---------------------------------------------------------------------------
describe("PUT, PATCH, DELETE decorators", () => {
	@Controller("/verbs")
	class VerbController {
		@Put("/resource")
		update() {
			return { verb: "put" };
		}

		@Patch("/resource")
		modify() {
			return { verb: "patch" };
		}

		@Delete("/resource")
		remove() {
			return { verb: "delete" };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(VerbController);
		app = express();
		app.use(path, router);
	});

	it("PUT route responds", async () => {
		const res = await supertest(app).put("/verbs/resource");
		expect(res.status).toBe(200);
		expect(res.body.verb).toBe("put");
	});

	it("PATCH route responds", async () => {
		const res = await supertest(app).patch("/verbs/resource");
		expect(res.status).toBe(200);
		expect(res.body.verb).toBe("patch");
	});

	it("DELETE route responds", async () => {
		const res = await supertest(app).delete("/verbs/resource");
		expect(res.status).toBe(200);
		expect(res.body.verb).toBe("delete");
	});
});

// ---------------------------------------------------------------------------
// @Next() decorator — disables auto-send, injects next function
// ---------------------------------------------------------------------------
describe("@Next() decorator", () => {
	const nextSpy = jest.fn();

	@Controller("/next-ctrl")
	class NextCtrl {
		@Get("/")
		handler(@NextDecorator() next: NextFunction) {
			nextSpy();
			next();
		}
	}

	it("@Next() marks route as RESPONSE_HANDLED and injects next function", async () => {
		const { path, router } = GetRouterFromController(NextCtrl);
		const app = express();
		// Add a final middleware that sends the response after next() is called
		app.use(path, router);
		app.use((_req: Request, res: Response) => res.json({ fromNext: true }));
		const res = await supertest(app).get("/next-ctrl/");
		expect(nextSpy).toHaveBeenCalled();
		expect(res.body.fromNext).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// CreateArgDecorator — custom parameter decorator
// ---------------------------------------------------------------------------
describe("CreateArgDecorator", () => {
	const injectCustom = CreateArgDecorator((req: Request) => (req as any).customField);

	@Controller("/custom-arg")
	class CustomArgCtrl {
		@Get("/")
		test(@injectCustom value: any) {
			return { value };
		}
	}

	it("injects the return value of a custom resolver", async () => {
		const { path, router } = GetRouterFromController(CustomArgCtrl);
		const app = express();
		// Middleware to set customField on req
		app.use((_req: Request, _res: Response, next: NextFunction) => {
			(_req as any).customField = "injected!";
			next();
		});
		app.use(path, router);
		const res = await supertest(app).get("/custom-arg/");
		expect(res.status).toBe(200);
		expect(res.body.value).toBe("injected!");
	});
});

// ---------------------------------------------------------------------------
// Route handler errors forwarded via next()
// ---------------------------------------------------------------------------
describe("Route handler error forwarding", () => {
	@Controller("/err-ctrl")
	class ErrorCtrl {
		@Get("/")
		broken() {
			throw new Error("route crashed");
		}
	}

	it("errors thrown synchronously in a route handler are forwarded to next()", async () => {
		const { path, router } = GetRouterFromController(ErrorCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		const res = await supertest(wApp.app).get("/err-ctrl/");
		expect(res.status).toBe(500);
	});
});

// ---------------------------------------------------------------------------
// Controller inheritance
// ---------------------------------------------------------------------------
describe("Controller inheritance with @Controller on a subclass", () => {
	@Controller("/base-ctrl")
	class BaseCtrl {
		@Get("/inherited")
		inherited() {
			return { route: "inherited" };
		}
	}

	@Controller("/extended-ctrl")
	class ExtCtrl extends BaseCtrl {
		@Get("/own")
		own() {
			return { route: "own" };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ExtCtrl);
		app = express();
		app.use(path, router);
	});

	it("subclass exposes its own routes", async () => {
		const res = await supertest(app).get("/extended-ctrl/own");
		expect(res.status).toBe(200);
		expect(res.body.route).toBe("own");
	});

	it("subclass inherits routes from the parent class", async () => {
		const res = await supertest(app).get("/extended-ctrl/inherited");
		expect(res.status).toBe(200);
		expect(res.body.route).toBe("inherited");
	});
});

// ---------------------------------------------------------------------------
// GetRouterFromController with a pre-instantiated controller
// ---------------------------------------------------------------------------
describe("GetRouterFromController with an instance", () => {
	@Controller("/instanced")
	class InstancedCtrl {
		@Get("/")
		greet() {
			return { hello: "world" };
		}
	}

	it("works when passed a pre-instantiated controller object", async () => {
		const instance = new InstancedCtrl();
		const { path, router } = GetRouterFromController(instance);
		const app = express();
		app.use(path, router);
		const res = await supertest(app).get("/instanced/");
		expect(res.status).toBe(200);
		expect(res.body.hello).toBe("world");
	});
});

// ---------------------------------------------------------------------------
// @Controller with children option
// ---------------------------------------------------------------------------
describe("@Controller with nested child controllers", () => {
	@Controller("/nested-child")
	class ChildCtrl {
		@Get("/")
		hello() {
			return { child: true };
		}
	}

	@Controller("/nested-parent", { children: [ChildCtrl] })
	class ParentCtrl {
		@Get("/")
		hello() {
			return { parent: true };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ParentCtrl);
		app = express();
		app.use(path, router);
	});

	it("parent routes are accessible", async () => {
		const res = await supertest(app).get("/nested-parent/");
		expect(res.status).toBe(200);
		expect(res.body.parent).toBe(true);
	});

	it("child routes are mounted under the parent", async () => {
		const res = await supertest(app).get("/nested-parent/nested-child/");
		expect(res.status).toBe(200);
		expect(res.body.child).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// @ValidationObject schema inheritance
// ---------------------------------------------------------------------------
describe("@ValidationObject schema inheritance", () => {
	@ValidationObject("body")
	class BasePersonDto {
		@Constraint({ notEmpty: true, errorMessage: "name is required" })
		name!: string;
	}

	@ValidationObject("body")
	class EmployeeDto extends BasePersonDto {
		@Constraint({ notEmpty: true, errorMessage: "role is required" })
		role!: string;
	}

	@Controller("/emp")
	class EmployeeCtrl {
		@Post("/")
		@UseValidator([EmployeeDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(EmployeeCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("valid input satisfying both parent and child constraints passes", async () => {
		const res = await supertest(app)
			.post("/emp/")
			.send({ name: "Alice", role: "Engineer" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});

	it("missing inherited parent field fails validation", async () => {
		const res = await supertest(app)
			.post("/emp/")
			.send({ role: "Engineer" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
	});
});

// ---------------------------------------------------------------------------
// @NestedConstraint for nested object validation
// ---------------------------------------------------------------------------
describe("@NestedConstraint", () => {
	@ValidationObject("body")
	class AddressDto {
		@Constraint({ notEmpty: true, errorMessage: "street is required" })
		street!: string;
	}

	@ValidationObject("body")
	class OrderDto {
		@NestedConstraint(AddressDto)
		address!: AddressDto;
	}

	@Controller("/orders")
	class OrderCtrl {
		@Post("/")
		@UseValidator([OrderDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(OrderCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("passes when nested fields are valid", async () => {
		const res = await supertest(app)
			.post("/orders/")
			.send({ address: { street: "123 Main St" } })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});

	it("returns 422 when nested fields fail", async () => {
		const res = await supertest(app)
			.post("/orders/")
			.send({ address: { street: "" } })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
	});
});

// ---------------------------------------------------------------------------
// RunValidationMiddleware — imperative API
// ---------------------------------------------------------------------------
describe("RunValidationMiddleware", () => {
	@ValidationObject("body")
	class SearchDto {
		@Constraint({ notEmpty: true })
		q!: string;
	}

	it("resolves without throwing when input is valid", async () => {
		const router = Router();
		router.post("/", express.json(), async (req: Request, res: Response, next: NextFunction) => {
			try {
				await RunValidationMiddleware({ objects: [SearchDto], req });
				res.json({ ok: true });
			} catch (e) {
				next(e);
			}
		});
		const app = express();
		app.use(router);
		const res = await supertest(app).post("/").send({ q: "hello" }).set("Content-Type", "application/json");
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it("throws ValidationError when input is invalid", async () => {
		const router = Router();
		router.post("/", express.json(), async (req: Request, res: Response, next: NextFunction) => {
			try {
				await RunValidationMiddleware({ objects: [SearchDto], req });
				res.json({ ok: true });
			} catch (e) {
				next(e);
			}
		});
		const errHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
			res.status(422).json({ code: err.code });
		};
		const app = express();
		app.use(router);
		app.use(errHandler);
		const res = await supertest(app).post("/").send({ q: "" }).set("Content-Type", "application/json");
		expect(res.status).toBe(422);
		expect(res.body.code).toBe("INPUT_VALIDATION_ERROR");
	});
});

// ---------------------------------------------------------------------------
// HEAD and TRACE decorators
// ---------------------------------------------------------------------------
describe("Head and Trace decorators", () => {
	@Controller("/http-methods")
	class HttpMethodsCtrl {
		@Head("/resource")
		headResource(@ResDecorator() res: Response) {
			res.status(200).end();
		}

		@Trace("/resource")
		traceResource(@ResDecorator() res: Response) {
			res.status(200).end();
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(HttpMethodsCtrl);
		app = express();
		app.use(path, router);
	});

	it("HEAD route responds with 200", async () => {
		const res = await supertest(app).head("/http-methods/resource");
		expect(res.status).toBe(200);
	});

	it("TRACE route responds with 200", async () => {
		const res = await supertest(app).trace("/http-methods/resource");
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// Class-level @UseAfter
// Class-level @UseAfter registers router.use() middleware; it runs when a
// route calls next() (e.g. via @Next() injection or method-level @UseAfter).
// ---------------------------------------------------------------------------
describe("class-level @UseAfter", () => {
	const classAfterSpy = jest.fn((_req: Request, _res: Response, next: NextFunction) => next());

	@Controller("/class-after")
	@UseAfter(classAfterSpy)
	class ClassAfterCtrl {
		// @Next() injects next so the handler can call it explicitly,
		// allowing the class-level after middleware to run.
		@Get("/")
		handler(@NextDecorator() next: NextFunction) {
			next();
		}
	}

	beforeEach(() => classAfterSpy.mockClear());

	it("class-level @UseAfter middleware runs when the route calls next()", async () => {
		const { path, router } = GetRouterFromController(ClassAfterCtrl);
		const app = express();
		app.use(path, router);
		// App-level fallback to send a final response after next() propagates
		app.use((_req: Request, res: Response) => res.json({ done: true }));
		await supertest(app).get("/class-after/");
		expect(classAfterSpy).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// GetSchemaValidators — error path for non-ValidationObject class
// ---------------------------------------------------------------------------
describe("GetSchemaValidators error path", () => {
	it("throws when a class lacks @ValidationObject decorator", () => {
		class PlainDto {
			name!: string;
		}
		expect(() => GetSchemaValidators([PlainDto])).toThrow("Non-ValidationObject detected");
	});
});

// ---------------------------------------------------------------------------
// @NestedConstraint with array syntax (validates array of objects)
// ---------------------------------------------------------------------------
describe("@NestedConstraint with array of objects", () => {
	@ValidationObject("body")
	class TagDto {
		@Constraint({ notEmpty: true, errorMessage: "tag label is required" })
		label!: string;
	}

	@ValidationObject("body")
	class ArticleDto {
		@NestedConstraint([TagDto])
		tags!: TagDto[];
	}

	@Controller("/articles")
	class ArticleCtrl {
		@Post("/")
		@UseValidator([ArticleDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ArticleCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("passes when array items are valid", async () => {
		const res = await supertest(app)
			.post("/articles/")
			.send({ tags: [{ label: "typescript" }, { label: "testing" }] })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});

	it("returns 422 when an array item fails validation", async () => {
		const res = await supertest(app)
			.post("/articles/")
			.send({ tags: [{ label: "" }] })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
	});
});

// ---------------------------------------------------------------------------
// GetPropertyMetadata and SetPropertyMetadata
// ---------------------------------------------------------------------------
describe("GetPropertyMetadata and SetPropertyMetadata", () => {
	const PROP_KEY = Symbol("test-prop-key");

	it("stores and retrieves property-level metadata", () => {
		const target = {};
		SetPropertyMetadata(PROP_KEY, target, "myProp", { value: 42 });
		const result = GetPropertyMetadata(PROP_KEY, target, "myProp");
		expect(result).toEqual({ value: 42 });
	});

	it("returns onNotExist when no metadata is set for the property", () => {
		const fallback = { default: true };
		const result = GetPropertyMetadata(Symbol("missing"), {}, "noProp", fallback);
		expect(result).toEqual({ default: true });
	});

	it("returns undefined when metadata is not set and no fallback is provided", () => {
		const result = GetPropertyMetadata(Symbol("none"), {}, "noProp");
		expect(result).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// MergeSchema merge branch — same field name in both parent and child
// ---------------------------------------------------------------------------
describe("MergeSchema merge branch — parent and child share a field name", () => {
	@ValidationObject("body")
	class MergeParentDto {
		@Constraint({ notEmpty: true, errorMessage: "name required" })
		name!: string;
	}

	// name exists in parent AND child → triggers the merge branch (lines 39-40)
	@ValidationObject("body")
	class MergeChildDto extends MergeParentDto {
		@Constraint({ isLength: { options: { min: 3 } }, errorMessage: "name too short" })
		name!: string;
	}

	@Controller("/merge-schema")
	class MergeSchemaCtrl {
		@Post("/")
		@UseValidator([MergeChildDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(MergeSchemaCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("fails when parent constraint is violated on the shared field", async () => {
		const res = await supertest(app)
			.post("/merge-schema/")
			.send({ name: "" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
	});

	it("passes when merged constraints are all satisfied", async () => {
		const res = await supertest(app)
			.post("/merge-schema/")
			.send({ name: "Alice" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// @OneOf class decorator
// ---------------------------------------------------------------------------
describe("@OneOf class decorator", () => {
	@OneOf([evBody("email").isEmail(), evBody("phone").isMobilePhone("any")])
	@ValidationObject("body")
	class ContactDto {}

	@Controller("/contact")
	class ContactCtrl {
		@Post("/")
		@UseValidator([ContactDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ContactCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("passes when at least one oneOf chain is satisfied", async () => {
		const res = await supertest(app)
			.post("/contact/")
			.send({ email: "user@example.com" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});

	it("returns 422 when none of the oneOf chains are satisfied", async () => {
		const res = await supertest(app)
			.post("/contact/")
			.send({ email: "not-an-email", phone: "not-a-phone" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
	});
});

// ---------------------------------------------------------------------------
// SetGlobalValidationOptions
// ---------------------------------------------------------------------------
describe("SetGlobalValidationOptions", () => {
	it("merges new options into the global validation defaults without throwing", () => {
		expect(() =>
			SetGlobalValidationOptions({ errorOptions: { onlyFirstError: false } }),
		).not.toThrow();
		// Restore default
		SetGlobalValidationOptions({ errorOptions: { onlyFirstError: true } });
	});
});

// ---------------------------------------------------------------------------
// CreateValidationMiddleware — direct invocation
// ---------------------------------------------------------------------------
describe("CreateValidationMiddleware", () => {
	it("calls next() when validation passes", async () => {
		const router = Router();
		router.post(
			"/",
			express.json(),
			evBody("q").notEmpty(),
			CreateValidationMiddleware(["body"]),
			(_req: Request, res: Response) => res.json({ ok: true }),
		);
		const app = express();
		app.use(router);
		const res = await supertest(app).post("/").send({ q: "hello" }).set("Content-Type", "application/json");
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
	});

	it("throws ValidationError (caught by Express) when validation fails", async () => {
		const router = Router();
		router.post("/", express.json(), evBody("q").notEmpty(), (req: Request, res: Response, next: NextFunction) => {
			try {
				CreateValidationMiddleware(["body"])(req, res, next);
			} catch (e) {
				next(e);
			}
		});
		const errHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
			res.status(422).json({ code: err.code });
		};
		const app = express();
		app.use(router);
		app.use(errHandler);
		const res = await supertest(app).post("/").send({ q: "" }).set("Content-Type", "application/json");
		expect(res.status).toBe(422);
		expect(res.body.code).toBe("INPUT_VALIDATION_ERROR");
	});
});

// ---------------------------------------------------------------------------
// ConstraintToValidator with function $if
// ---------------------------------------------------------------------------
describe("ConstraintToValidator with function $if", () => {
	@ValidationObject("body")
	class ConditionalFnDto {
		@Constraint({
			notEmpty: true,
			errorMessage: "value required when active",
			$if: (bodyValue: any) => !!bodyValue.active,
		})
		value!: string;
	}

	@Controller("/conditional-fn")
	class ConditionalFnCtrl {
		@Post("/")
		@UseValidator([ConditionalFnDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ConditionalFnCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("skips validation when $if function returns false (active: false)", async () => {
		const res = await supertest(app)
			.post("/conditional-fn/")
			.send({ active: false, value: "" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});

	it("runs validation when $if function returns true (active: true)", async () => {
		const res = await supertest(app)
			.post("/conditional-fn/")
			.send({ active: true, value: "" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
	});

	it("passes when $if returns true and value is valid", async () => {
		const res = await supertest(app)
			.post("/conditional-fn/")
			.send({ active: true, value: "present" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// ConstraintToValidator with ValidationChain $if
// ---------------------------------------------------------------------------
describe("ConstraintToValidator with ValidationChain $if", () => {
	@ValidationObject("body")
	class ConditionalChainDto {
		@Constraint({
			notEmpty: true,
			errorMessage: "value required when condition is set",
			$if: evBody("condition").notEmpty(),
		})
		value!: string;
	}

	@Controller("/conditional-chain")
	class ConditionalChainCtrl {
		@Post("/")
		@UseValidator([ConditionalChainDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ConditionalChainCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("skips validation when $if chain fails (condition is empty)", async () => {
		// condition empty → notEmpty chain fails → skip value validation → pass
		const res = await supertest(app)
			.post("/conditional-chain/")
			.send({ condition: "", value: "" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});

	it("runs validation when $if chain passes (condition is set)", async () => {
		// condition set → notEmpty chain passes → validate value → fail (empty)
		const res = await supertest(app)
			.post("/conditional-chain/")
			.send({ condition: "trigger", value: "" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
	});

	it("passes when $if chain passes and value is valid", async () => {
		const res = await supertest(app)
			.post("/conditional-chain/")
			.send({ condition: "trigger", value: "present" })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// NestedConstraint with extraRules and $if
// ---------------------------------------------------------------------------
describe("NestedConstraint with extraRules and $if", () => {
	@ValidationObject("body")
	class SimpleItemDto {
		@Constraint({ notEmpty: true, errorMessage: "title required" })
		title!: string;
	}

	@ValidationObject("body")
	class ContainerWithExtrasDto {
		@NestedConstraint(SimpleItemDto, {
			extraRules: { title: { isLength: { options: { min: 3 } }, errorMessage: "title too short" } },
			$if: (bodyValue: any) => !!bodyValue.validate,
		})
		item!: SimpleItemDto;
	}

	@Controller("/extra-nested")
	class ExtraNestedCtrl {
		@Post("/")
		@UseValidator([ContainerWithExtrasDto])
		create(@Body() body: any) {
			return { body };
		}
	}

	let app: express.Application;

	beforeAll(() => {
		const { path, router } = GetRouterFromController(ExtraNestedCtrl);
		const wApp = new WeaverExpressApp({
			routes: { [path]: router },
			errorHandler: makeErrorHandler(),
		}).init();
		app = wApp.app;
	});

	it("skips nested validation when $if returns false", async () => {
		const res = await supertest(app)
			.post("/extra-nested/")
			.send({ validate: false, item: { title: "" } })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});

	it("applies extraRules and fails when nested field is too short", async () => {
		const res = await supertest(app)
			.post("/extra-nested/")
			.send({ validate: true, item: { title: "ab" } })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(422);
	});

	it("passes when $if returns true and all constraints are satisfied", async () => {
		const res = await supertest(app)
			.post("/extra-nested/")
			.send({ validate: true, item: { title: "abc" } })
			.set("Content-Type", "application/json");
		expect(res.status).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// RunValidators — imperative validation API
// ---------------------------------------------------------------------------
describe("RunValidators", () => {
	@ValidationObject("body")
	class RunValidatorsDto {
		@Constraint({ notEmpty: true, errorMessage: "item required" })
		item!: string;
	}

	it("returns empty validation result for valid input", async () => {
		const router = Router();
		router.post("/", express.json(), async (req: Request, res: Response, next: NextFunction) => {
			try {
				const result = await RunValidators([RunValidatorsDto], req);
				res.json({ isValid: result.isEmpty() });
			} catch (e) {
				next(e);
			}
		});
		const app = express();
		app.use(router);
		const res = await supertest(app).post("/").send({ item: "test" }).set("Content-Type", "application/json");
		expect(res.status).toBe(200);
		expect(res.body.isValid).toBe(true);
	});

	it("returns non-empty validation result for invalid input", async () => {
		const router = Router();
		router.post("/", express.json(), async (req: Request, res: Response, next: NextFunction) => {
			try {
				const result = await RunValidators([RunValidatorsDto], req);
				res.json({ isValid: result.isEmpty() });
			} catch (e) {
				next(e);
			}
		});
		const app = express();
		app.use(router);
		const res = await supertest(app).post("/").send({ item: "" }).set("Content-Type", "application/json");
		expect(res.status).toBe(200);
		expect(res.body.isValid).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// RunImperative — function validator branch (non-ValidationChain)
// ---------------------------------------------------------------------------
describe("RunImperative with a plain function validator", () => {
	it("resolves when the function calls next() with no error", async () => {
		const called = jest.fn();
		const fnValidator: any = (_req: any, _res: any, next: any) => {
			called();
			next();
		};
		await expect(RunImperative(fnValidator, {} as any, undefined)).resolves.toBeUndefined();
		expect(called).toHaveBeenCalledTimes(1);
	});

	it("rejects when the function calls next(error)", async () => {
		const error = new Error("validator failed");
		const fnValidator: any = (_req: any, _res: any, next: any) => next(error);
		await expect(RunImperative(fnValidator, {} as any, undefined)).rejects.toThrow("validator failed");
	});
});
