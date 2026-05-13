import { NotFoundError, ServiceUnavailableError } from "@weaverkit/errors";
import { encode, decode } from "../src/codec";
import { RpcClient } from "../src/client";
import type { RpcAck, RpcResult, RpcError, RpcEvent } from "../src/types";

// --- Mock ioredis ---

type MessageHandler = (channel: Buffer, message: Buffer) => void;

function createMockSubscriber() {
	let handler: MessageHandler | null = null;
	return {
		subscribe: jest.fn(),
		unsubscribe: jest.fn(),
		on: jest.fn((event: string, cb: MessageHandler) => {
			if (event === "messageBuffer") handler = cb;
		}),
		disconnect: jest.fn(),
		// Helper to simulate incoming messages
		simulateMessage(channel: string, data: any) {
			if (handler) {
				handler(Buffer.from(channel), encode(data));
			}
		},
	};
}

function createMockCommander() {
	return {
		rpush: jest.fn(async () => 1),
		expire: jest.fn(async () => 1),
		disconnect: jest.fn(),
	};
}

function createMockAdapter(subscriber: any, commander: any) {
	let callCount = 0;
	return {
		connection: commander,
		config: {},
		clone: jest.fn(() => {
			callCount++;
			// First clone = subscriber, second = commander
			return {
				connection: callCount === 1 ? subscriber : commander,
				config: {},
			};
		}),
	} as any;
}

describe("RpcClient", () => {
	let subscriber: ReturnType<typeof createMockSubscriber>;
	let commander: ReturnType<typeof createMockCommander>;
	let adapter: any;
	let client: RpcClient;

	beforeEach(async () => {
		subscriber = createMockSubscriber();
		commander = createMockCommander();
		adapter = createMockAdapter(subscriber, commander);
		client = new RpcClient({ redis: adapter, ackTimeout: 500, replyTimeout: 2000 });
		await client.connect();
	});

	afterEach(async () => {
		await client.disconnect();
	});

	it("subscribes to reply channel on connect", () => {
		expect(subscriber.subscribe).toHaveBeenCalledWith(expect.stringMatching(/^rpc:reply:/));
	});

	it("resolves with result on successful call", async () => {
		const callPromise = client.call("webhook", "create-subscription", { url: "https://test.com" });

		// Simulate ACK
		await new Promise((r) => setTimeout(r, 10));
		const rpushCall = (commander.rpush.mock.calls as any[])[0];
		const synKey = rpushCall[0] as string;
		expect(synKey).toBe("rpc:syn:webhook");
		const syn = decode(rpushCall[1]);
		const replyChannel = syn.replyTo;

		subscriber.simulateMessage(replyChannel, {
			type: "ack",
			correlationId: syn.correlationId,
		} as RpcAck);

		// Wait for payload push
		await new Promise((r) => setTimeout(r, 10));

		// Simulate result
		subscriber.simulateMessage(replyChannel, {
			type: "result",
			correlationId: syn.correlationId,
			data: { id: "sub_123" },
		} as RpcResult);

		const result = await callPromise;
		expect(result).toEqual({ id: "sub_123" });
	});

	it("throws deserialized AppError on error reply", async () => {
		const callPromise = client.call("webhook", "missing", {});

		await new Promise((r) => setTimeout(r, 10));
		const syn = decode((commander.rpush.mock.calls as any[])[0][1]);
		const replyChannel = syn.replyTo;

		// ACK then error
		subscriber.simulateMessage(replyChannel, { type: "ack", correlationId: syn.correlationId });
		await new Promise((r) => setTimeout(r, 10));

		subscriber.simulateMessage(replyChannel, {
			type: "error",
			correlationId: syn.correlationId,
			error: { httpCode: 404, code: "NOT_FOUND_ERROR", message: "Not found" },
		} as RpcError);

		await expect(callPromise).rejects.toThrow(NotFoundError);
	});

	it("throws ServiceUnavailableError on ack timeout", async () => {
		// No ACK sent — should timeout
		const callPromise = client.call("webhook", "slow", {});
		await expect(callPromise).rejects.toThrow(ServiceUnavailableError);
	}, 5000);

	it("emits intermediate events", async () => {
		const events: { name: string; data: any }[] = [];
		const call = client.call("webhook", "create", {});
		call.on("event", (name: string, data: any) => events.push({ name, data }));

		await new Promise((r) => setTimeout(r, 10));
		const syn = decode((commander.rpush.mock.calls as any[])[0][1]);
		const replyChannel = syn.replyTo;

		subscriber.simulateMessage(replyChannel, { type: "ack", correlationId: syn.correlationId });
		await new Promise((r) => setTimeout(r, 10));

		subscriber.simulateMessage(replyChannel, {
			type: "event",
			correlationId: syn.correlationId,
			name: "validating",
			data: { step: 1 },
		} as RpcEvent);

		subscriber.simulateMessage(replyChannel, {
			type: "result",
			correlationId: syn.correlationId,
			data: { ok: true },
		});

		const result = await call;
		expect(result).toEqual({ ok: true });
		expect(events).toEqual([{ name: "validating", data: { step: 1 } }]);
	});

	it("pushes payload only after ACK", async () => {
		const callPromise = client.call("webhook", "action", { data: "test" });

		await new Promise((r) => setTimeout(r, 10));

		// Only SYN should be pushed so far (1 rpush call)
		expect(commander.rpush).toHaveBeenCalledTimes(1);
		expect(decode((commander.rpush.mock.calls as any[])[0][1]).action).toBe("action");

		const syn = decode((commander.rpush.mock.calls as any[])[0][1]);
		subscriber.simulateMessage(syn.replyTo, { type: "ack", correlationId: syn.correlationId });

		await new Promise((r) => setTimeout(r, 10));

		// Now payload should be pushed (2 rpush calls total)
		expect(commander.rpush).toHaveBeenCalledTimes(2);
		const payloadKey = (commander.rpush.mock.calls as any[])[1][0];
		expect(payloadKey).toBe(`rpc:req:${syn.correlationId}`);
		const payloadData = decode((commander.rpush.mock.calls as any[])[1][1]);
		expect(payloadData.payload).toEqual({ data: "test" });

		// Expire should be set on the payload key
		expect(commander.expire).toHaveBeenCalledWith(payloadKey, 60);

		subscriber.simulateMessage(syn.replyTo, {
			type: "result",
			correlationId: syn.correlationId,
			data: "done",
		});

		await expect(callPromise).resolves.toBe("done");
	});
});
