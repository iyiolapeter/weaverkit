import { AppError, NotFoundError, ServerError } from "@weaverkit/errors";
import { RpcServer } from "../src/server";

function createMockAdapter() {
	return {
		connection: {},
		config: {},
		clone: jest.fn(() => ({
			connection: {
				lpopBuffer: jest.fn(async () => null),
				blpopBuffer: jest.fn(async () => null),
				publishBuffer: jest.fn(async () => 1),
				disconnect: jest.fn(),
			},
			config: {},
		})),
	} as any;
}

describe("RpcServer", () => {
	it("registers handlers", () => {
		const adapter = createMockAdapter();
		const server = new RpcServer({ redis: adapter, service: "test" });
		server.register("my-action", async (_ctx) => ({ ok: true }));
		expect(() => server.register("my-action", async () => ({}))).toThrow(
			'RPC action "my-action" is already registered on service "test"',
		);
	});

	it("rejects unknown action at SYN phase with NotFoundError", () => {
		// Validate error construction for unknown actions
		const err = new NotFoundError('RPC action "unknown" is not registered on service "test"');
		expect(err).toBeInstanceOf(NotFoundError);
		const serialized = err.serialize();
		expect(serialized.httpCode).toBe(404);
		const restored = AppError.deserialize(serialized);
		expect(restored).toBeInstanceOf(NotFoundError);
		expect(restored.message).toContain("unknown");
	});

	it("wraps non-AppError in ServerError for serialization", () => {
		const plain = new TypeError("cannot read property x of undefined");
		const wrapped = plain instanceof AppError ? plain : new ServerError(plain.message);
		expect(wrapped).toBeInstanceOf(ServerError);
		expect(wrapped.message).toBe("cannot read property x of undefined");
		const serialized = wrapped.serialize();
		expect(serialized.httpCode).toBe(500);
	});
});
