"use strict";
import { noop, getNumberReference, getRandom, getShortId, getUniqueReference } from "./../src/index";

describe("noop", () => {
	it("returns undefined", () => {
		expect(noop()).toBeUndefined();
	});

	it("accepts any number of arguments without throwing", () => {
		expect(() => noop(1, "two", { three: 3 }, [4])).not.toThrow();
	});
});

describe("getNumberReference", () => {
	it("returns a number", () => {
		expect(typeof getNumberReference()).toBe("number");
	});

	it("returns a positive integer (millisecond timestamp)", () => {
		expect(getNumberReference()).toBeGreaterThan(0);
	});

	it("returns a non-decreasing value across calls", () => {
		const a = getNumberReference();
		const b = getNumberReference();
		expect(b).toBeGreaterThanOrEqual(a);
	});
});

describe("getUniqueReference", () => {
	it("returns a valid UUID v4 string", () => {
		const ref = getUniqueReference();
		expect(ref).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});

	it("returns a unique value on each call", () => {
		expect(getUniqueReference()).not.toBe(getUniqueReference());
	});
});

describe("getShortId", () => {
	it("returns a non-empty string", () => {
		const id = getShortId();
		expect(typeof id).toBe("string");
		expect(id.length).toBeGreaterThan(0);
	});

	it("returns a unique value on each call", () => {
		expect(getShortId()).not.toBe(getShortId());
	});
});

describe("getRandom", () => {
	const ITERATIONS = 500;

	it.each([1, 2, 3, 4, 5])("always returns a %i-digit integer", (digits) => {
		for (let i = 0; i < ITERATIONS; i++) {
			const value = getRandom(digits);
			expect(Number.isInteger(value)).toBe(true);
			expect(String(value).length).toBe(digits);
		}
	});

	it.each([1, 2, 3])("covers the full range for %i digit(s) — including the highest value", (digits) => {
		const min = Math.pow(10, digits - 1);
		const max = Math.pow(10, digits) - 1;
		const seen = new Set<number>();
		for (let i = 0; i < 5000; i++) {
			seen.add(getRandom(digits));
		}
		// min and max of seen set should be close to the theoretical bounds
		expect(Math.min(...seen)).toBeLessThanOrEqual(min + 2);
		expect(Math.max(...seen)).toBeGreaterThanOrEqual(max - 2);
	});
});
