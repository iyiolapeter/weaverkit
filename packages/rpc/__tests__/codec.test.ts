import { encode, decode } from "../src/codec";

describe("codec", () => {
	it("round-trips a plain object", () => {
		const data = { type: "ack", correlationId: "abc123" };
		const encoded = encode(data);
		expect(Buffer.isBuffer(encoded)).toBe(true);
		expect(decode(encoded)).toEqual(data);
	});

	it("round-trips nested objects and arrays", () => {
		const data = {
			type: "result",
			correlationId: "xyz",
			data: { users: [{ id: 1, name: "Alice" }], count: 1 },
		};
		expect(decode(encode(data))).toEqual(data);
	});

	it("round-trips null values", () => {
		const data = { a: null };
		const result = decode(encode(data));
		expect(result.a).toBeNull();
	});

	it("round-trips numbers, booleans, strings", () => {
		const data = { n: 42, f: 3.14, b: true, s: "hello" };
		expect(decode(encode(data))).toEqual(data);
	});

	it("handles empty object", () => {
		expect(decode(encode({}))).toEqual({});
	});

	it("handles Buffer/binary data in values", () => {
		const data = { bin: Buffer.from([0x00, 0xff, 0x42]) };
		const result = decode(encode(data));
		expect(Buffer.from(result.bin)).toEqual(Buffer.from([0x00, 0xff, 0x42]));
	});
});
