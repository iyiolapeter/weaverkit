import { getNumberReference, getRandom, getShortId, getUniqueReference } from "./../src/index";
import { isValid } from "shortid";

describe("Utils Package", () => {
	test("test getNumberReference", () => {
		const ref = getNumberReference();
		expect(typeof ref).toBe("number");
	});
	test("test getRandom", () => {
		const random = getRandom(5);
		expect(String(random).length).toEqual(5);
	});
	test("test getShortId", () => {
		const id = getShortId();
		expect(isValid(id)).toBe(true);
	});
	test("test getUniqueReference", () => {
		const ref = getUniqueReference();
		expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref)).toBe(true);
	});
});
