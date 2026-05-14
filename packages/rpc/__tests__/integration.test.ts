import { AppError, NotFoundError, BadRequestError, ValidationError, ServerError } from "@weaverkit/errors";
import { RpcClient } from "../src/client";
import { RpcServer, RpcServerEvents } from "../src/server";
import { encode } from "../src/codec";
/**
 * Coordinated mock Redis that bridges client and server:
 * - Client RPUSH to syn/req lists → Server BLPOP reads from them
 * - Server PUBLISH to reply channel → Client SUBSCRIBE receives them
 */
function createCoordinatedRedis() {
	const lists = new Map<string, Buffer[]>();
	const subscribers = new Map<string, ((_channel: Buffer, message: Buffer) => void)[]>();
	const blpopWaiters = new Map<string, ((result: [string, Buffer] | null) => void)[]>();

	function getList(key: string): Buffer[] {
		if (!lists.has(key)) lists.set(key, []);
		return lists.get(key)!;
	}

	function wakeBlpopWaiter(key: string) {
		const waiters = blpopWaiters.get(key);
		const list = getList(key);
		if (waiters && waiters.length > 0 && list.length > 0) {
			const waiter = waiters.shift()!;
			const item = list.shift()!;
			waiter([key, item]);
		}
	}

	function createConnection() {
		const conn: any = {
			_messageHandler: null as any,
			rpush: jest.fn(async (key: string, value: Buffer) => {
				getList(key).push(value);
				// Wake any BLPOP waiter on next tick to avoid sync issues
				process.nextTick(() => wakeBlpopWaiter(key));
				return 1;
			}),
			expire: jest.fn(async () => 1),
			lpopBuffer: jest.fn(async (key: string) => {
				const list = getList(key);
				return list.length > 0 ? list.shift()! : null;
			}),
			blpopBuffer: jest.fn(async (key: string, timeout: number) => {
				const list = getList(key);
				if (list.length > 0) {
					return [key, list.shift()!];
				}
				return new Promise<[string, Buffer] | null>((resolve) => {
					const timer = setTimeout(() => {
						// Remove waiter on timeout
						const w = blpopWaiters.get(key);
						if (w) {
							const idx = w.indexOf(waiterFn);
							if (idx >= 0) w.splice(idx, 1);
						}
						resolve(null);
					}, timeout * 1000);
					const waiterFn = (result: [string, Buffer] | null) => {
						clearTimeout(timer);
						resolve(result);
					};
					if (!blpopWaiters.has(key)) blpopWaiters.set(key, []);
					blpopWaiters.get(key)!.push(waiterFn);
				});
			}),
			publish: jest.fn(async (channel: string, message: Buffer) => {
				const handlers = subscribers.get(channel) || [];
				for (const handler of handlers) {
					handler(Buffer.from(channel), message as Buffer);
				}
				return handlers.length;
			}),
			subscribe: jest.fn(async (channel: string) => {
				if (!subscribers.has(channel)) subscribers.set(channel, []);
				if (conn._messageHandler && !subscribers.get(channel)!.includes(conn._messageHandler)) {
					subscribers.get(channel)!.push(conn._messageHandler);
				}
			}),
			on: jest.fn((event: string, handler: any) => {
				if (event === "messageBuffer") {
					conn._messageHandler = handler;
					// Register on all existing subscribed channels
					for (const [, handlers] of subscribers) {
						if (!handlers.includes(handler)) {
							handlers.push(handler);
						}
					}
				}
			}),
			unsubscribe: jest.fn(),
			disconnect: jest.fn(),
		};

		return conn;
	}

	function createAdapter() {
		return {
			connection: createConnection(),
			config: {},
			clone: jest.fn(() => ({
				connection: createConnection(),
				config: {},
			})),
		} as any;
	}

	return { createAdapter };
}

describe("RPC Integration", () => {
	let coordinated: ReturnType<typeof createCoordinatedRedis>;
	let client: RpcClient;
	let server: RpcServer;
	let serverLogs: Array<{ level: string; message: string; meta?: any }>;

	beforeEach(async () => {
		coordinated = createCoordinatedRedis();
		serverLogs = [];

		server = new RpcServer({
			redis: coordinated.createAdapter(),
			service: "webhook",
			concurrency: 1,
			ackTimeout: 2000,
			logger: (level, message, meta) => serverLogs.push({ level, message, meta }),
		});

		server.register("echo", async (ctx) => {
			return { echoed: ctx.payload };
		});

		server.register("with-events", async (ctx) => {
			ctx.emit("step", { n: 1 });
			ctx.emit("step", { n: 2 });
			return { done: true };
		});

		server.register("throw-app-error", async () => {
			throw new BadRequestError("Invalid input").setCode("CUSTOM_CODE").setInfo({ field: "name" });
		});

		server.register("throw-validation-error", async () => {
			throw new ValidationError("Bad fields").setFields([{ param: "email", msg: "invalid" }]);
		});

		server.register("throw-plain-error", async () => {
			throw new TypeError("cannot read x of undefined");
		});

		await server.start();

		client = new RpcClient({
			redis: coordinated.createAdapter(),
			ackTimeout: 2000,
			replyTimeout: 5000,
		});
		await client.connect();
	});

	afterEach(async () => {
		await client.disconnect();
		await server.stop();
	});

	it("echo: sends payload and receives result", async () => {
		const result = await client.call("webhook", "echo", { hello: "world" });
		expect(result).toEqual({ echoed: { hello: "world" } });
	});

	it("with-events: receives intermediate events then result", async () => {
		const events: any[] = [];
		const call = client.call("webhook", "with-events", {});
		call.on("event", (name: string, data: any) => events.push({ name, data }));
		const result = await call;
		expect(result).toEqual({ done: true });
		expect(events).toEqual([
			{ name: "step", data: { n: 1 } },
			{ name: "step", data: { n: 2 } },
		]);
	});

	it("throw-app-error: receives deserialized AppError", async () => {
		try {
			await client.call("webhook", "throw-app-error", {});
			fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(BadRequestError);
			expect((err as AppError).code).toBe("CUSTOM_CODE");
			expect((err as AppError).info).toEqual({ field: "name" });
		}
	});

	it("throw-validation-error: receives ValidationError with fields", async () => {
		try {
			await client.call("webhook", "throw-validation-error", {});
			fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ValidationError);
			expect((err as ValidationError).fields).toEqual([{ param: "email", msg: "invalid" }]);
		}
	});

	it("throw-plain-error: caller receives generic ServerError; raw message stays server-side", async () => {
		try {
			await client.call("webhook", "throw-plain-error", {});
			fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ServerError);
			expect((err as AppError).message).toBe("Internal server error");
			expect((err as AppError).message).not.toContain("cannot read x of undefined");
		}
		const serverErrorLog = serverLogs.find((l) => l.message.includes("threw non-AppError"));
		expect(serverErrorLog).toBeDefined();
		expect(serverErrorLog!.level).toBe("error");
		expect((serverErrorLog!.meta!.err as Error).message).toBe("cannot read x of undefined");
	});

	it("unknown action: receives NotFoundError without payload round-trip", async () => {
		try {
			await client.call("webhook", "nonexistent", {});
			fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(NotFoundError);
			expect((err as AppError).message).toContain("nonexistent");
		}
	});

	it("invalid replyTo: SYN is dropped, logged, no publish happens", async () => {
		const directConn = coordinated.createAdapter().connection;
		await directConn.rpush(
			"rpc:syn:webhook",
			encode({
				correlationId: "fake-id",
				replyTo: "evil-channel",
				action: "echo",
				timestamp: Date.now(),
			}),
		);

		await new Promise((r) => setTimeout(r, 100));

		const warnLog = serverLogs.find((l) => l.message.includes("invalid replyTo"));
		expect(warnLog).toBeDefined();
		expect(warnLog!.level).toBe("warn");
		expect(warnLog!.meta!.replyTo).toBe("evil-channel");
	});

	describe("server events", () => {
		const waitFor = (event: RpcServerEvents) => new Promise<any>((resolve) => server.once(event, resolve));

		it("emits handler:start and handler:end on successful call", async () => {
			const events: Array<{ type: string; payload: any }> = [];
			server.on(RpcServerEvents.HANDLER_START, (p) => events.push({ type: "start", payload: p }));
			server.on(RpcServerEvents.HANDLER_END, (p) => events.push({ type: "end", payload: p }));

			const ended = waitFor(RpcServerEvents.HANDLER_END);
			await client.call("webhook", "echo", { x: 1 });
			await ended;

			expect(events).toHaveLength(2);
			expect(events[0].type).toBe("start");
			expect(events[0].payload.action).toBe("echo");
			expect(typeof events[0].payload.correlationId).toBe("string");
			expect(events[1].type).toBe("end");
			expect(events[1].payload.action).toBe("echo");
			expect(events[1].payload.correlationId).toBe(events[0].payload.correlationId);
			expect(typeof events[1].payload.durationMs).toBe("number");
			expect(events[1].payload.durationMs).toBeGreaterThanOrEqual(0);
		});

		it("emits handler:error when the handler throws", async () => {
			const errored = waitFor(RpcServerEvents.HANDLER_ERROR);
			await client.call("webhook", "throw-plain-error", {}).catch(() => {});
			const payload = await errored;

			expect(payload.action).toBe("throw-plain-error");
			expect(payload.error).toBeInstanceOf(Error);
			expect((payload.error as Error).message).toBe("cannot read x of undefined");
			expect(typeof payload.durationMs).toBe("number");
		});

		it("emits syn:rejected with reason=unknown-action for nonexistent actions", async () => {
			const rejected = waitFor(RpcServerEvents.SYN_REJECTED);
			await client.call("webhook", "nonexistent", {}).catch(() => {});
			const payload = await rejected;

			expect(payload.reason).toBe("unknown-action");
			expect(payload.action).toBe("nonexistent");
		});

		it("emits syn:rejected with reason=invalid-replyTo for malformed SYNs", async () => {
			const rejected: any[] = [];
			server.on(RpcServerEvents.SYN_REJECTED, (p) => rejected.push(p));

			const directConn = coordinated.createAdapter().connection;
			await directConn.rpush(
				"rpc:syn:webhook",
				encode({
					correlationId: "fake-id-2",
					replyTo: "evil-channel-2",
					action: "echo",
					timestamp: Date.now(),
				}),
			);
			await new Promise((r) => setTimeout(r, 100));

			expect(rejected).toHaveLength(1);
			expect(rejected[0].reason).toBe("invalid-replyTo");
			expect(rejected[0].replyTo).toBe("evil-channel-2");
		});

		it("does not expose emit() on the public API", () => {
			expect((server as any).emit).toBeUndefined();
		});
	});
});
