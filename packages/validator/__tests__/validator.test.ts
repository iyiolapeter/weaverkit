"use strict";
import { validate, node } from "./../src";

describe("Validator Module", () => {
	test("Simple Validation", async () => {
		const obj = {
			name: "Paul",
			age: 18,
			height: 1.75,
		};
		const rules = [node("name").exists().isString(), node("age").exists().isNumeric(), node("height").exists().isFloat()];
		const errors = await validate(obj, rules);
		expect(errors).toHaveLength(0);
	});
});
