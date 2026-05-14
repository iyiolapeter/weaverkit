"use strict";
import { validate, node, oneOf, ValidationNode } from "./../src";

// ---------------------------------------------------------------------------
// ValidationNode class
// ---------------------------------------------------------------------------
describe("ValidationNode", () => {
	describe("constructor", () => {
		it("creates a node with the given id", () => {
			const n = node("email");
			const rule = n.end();
			expect(rule.id).toBe("email");
			expect(rule.required).toBe(false);
			expect(rule.validators).toHaveLength(0);
			expect(rule.sanitizers).toHaveLength(0);
		});
	});

	describe("exists / optional", () => {
		it("exists() marks the field as required", () => {
			const rule = node("name").exists().end();
			expect(rule.required).toBe(true);
		});

		it("optional() marks the field as not required", () => {
			const rule = node("name").exists().optional().end();
			expect(rule.required).toBe(false);
		});
	});

	describe("child / endChild", () => {
		it("child() returns a new ValidationNode with a parent reference", () => {
			const parent = node("address");
			const child = parent.child("street");
			expect(child).toBeInstanceOf(ValidationNode);
			expect(child.parent).toBe(parent);
			expect(child.id).toBe("street");
		});

		it("child() pushes the child node into the parent validators", () => {
			const parent = node("address");
			parent.child("street");
			const rule = parent.end();
			expect(rule.validators).toHaveLength(1);
			expect(rule.validators[0]).toBeInstanceOf(ValidationNode);
		});

		it("endChild() returns the parent node", () => {
			const parent = node("address");
			const child = parent.child("street");
			expect(child.endChild()).toBe(parent);
		});

		it("endChild() throws if node has no parent", () => {
			expect(() => node("field").endChild()).toThrow("Validation Node is not a child");
		});
	});

	describe("not()", () => {
		it("sets negateNext to true", () => {
			const n = node("field");
			n.not();
			expect(n.negateNext).toBe(true);
		});

		it("negateNext is consumed and reset when a customValidator is pushed", () => {
			const n = node("field");
			n.not().customValidator(() => true);
			expect(n.negateNext).toBe(false);
			const rule = n.end();
			expect(rule.validators[0].negate).toBe(true);
		});

		it("negateNext is consumed and reset when a ValidatorJS validator is pushed", () => {
			const n = node("field");
			n.not().isEmail();
			expect(n.negateNext).toBe(false);
			const rule = n.end();
			expect(rule.validators[0].negate).toBe(true);
		});

		it("negateNext only applies to the immediately following validator", () => {
			const n = node("field");
			n.not().isEmail().isNumeric();
			const rule = n.end();
			expect(rule.validators[0].negate).toBe(true);
			expect(rule.validators[1].negate).toBe(false);
		});
	});

	describe("withMessage()", () => {
		it("sets message on the last validator", () => {
			const rule = node("field").isEmail().withMessage("bad email").end();
			expect(rule.validators[0].message).toBe("bad email");
		});

		it("is a no-op when there are no validators", () => {
			const n = node("field");
			const returned = n.withMessage("ignored");
			expect(returned).toBe(n);
			expect(n.end().validators).toHaveLength(0);
		});
	});

	describe("customSanitizer()", () => {
		it("pushes a sanitizer function", () => {
			const sanitizer = (v: any) => v.trim();
			const rule = node("field").customSanitizer(sanitizer).end();
			expect(rule.sanitizers).toHaveLength(1);
			expect(rule.sanitizers[0].fn).toBe(sanitizer);
		});
	});

	describe("isArray()", () => {
		it("adds a validator that passes for arrays", async () => {
			const errors = await validate({ tags: ["a", "b"] }, [node("tags").exists().isArray()]);
			expect(errors).toHaveLength(0);
		});

		it("adds a validator that fails for non-arrays", async () => {
			const errors = await validate({ tags: "not-an-array" }, [node("tags").exists().isArray()]);
			expect(errors).toHaveLength(1);
		});

		it("accepts empty arrays by default", async () => {
			const errors = await validate({ tags: [] }, [node("tags").exists().isArray()]);
			expect(errors).toHaveLength(0);
		});

		it("rejects empty arrays when empty:false", async () => {
			const errors = await validate({ tags: [] }, [node("tags").exists().isArray({ empty: false })]);
			expect(errors).toHaveLength(1);
		});
	});

	describe("isString()", () => {
		it("passes for string values", async () => {
			const errors = await validate({ name: "Alice" }, [node("name").isString()]);
			expect(errors).toHaveLength(0);
		});

		it("fails for non-string values", async () => {
			const errors = await validate({ name: 123 }, [node("name").isString()]);
			expect(errors).toHaveLength(1);
		});
	});
});

// ---------------------------------------------------------------------------
// OneOf class
// ---------------------------------------------------------------------------
describe("OneOf", () => {
	it("has a default message of 'Invalid Value'", () => {
		const o = oneOf([node("a"), node("b")]);
		expect(o.message).toBe("Invalid Value");
	});

	it("withMessage() updates the message", () => {
		const o = oneOf([node("a")]).withMessage("custom");
		expect(o.message).toBe("custom");
	});
});

// ---------------------------------------------------------------------------
// validate() — core function
// ---------------------------------------------------------------------------
describe("validate()", () => {
	// --- empty/trivial cases -----------------------------------------------
	it("returns an empty array for empty nodes list", async () => {
		const errors = await validate({ name: "Alice" }, []);
		expect(errors).toHaveLength(0);
	});

	it("skips non-object nodes (e.g. raw strings)", async () => {
		const errors = await validate({ a: "x" }, ["not-a-node" as any]);
		expect(errors).toHaveLength(0);
	});

	it("accepts ValidationNode instances directly (calls .end() internally)", async () => {
		const errors = await validate({ email: "test@example.com" }, [node("email").isEmail()]);
		expect(errors).toHaveLength(0);
	});

	// --- required / optional -----------------------------------------------
	it("errors when a required field is missing (undefined)", async () => {
		const errors = await validate({}, [node("name").exists()]);
		expect(errors).toHaveLength(1);
		expect(errors[0].parameter).toBe("name");
		expect(errors[0].message).toContain("required");
	});

	it("errors when a required field is null", async () => {
		const errors = await validate({ name: null }, [node("name").exists()]);
		expect(errors).toHaveLength(1);
	});

	it("does NOT error when a required field is 0 (falsy but valid)", async () => {
		const errors = await validate({ count: 0 }, [node("count").exists().isNumeric()]);
		expect(errors).toHaveLength(0);
	});

	it("does NOT error when a required field is false (falsy but valid)", async () => {
		// false is present (not null/undefined) — required check passes
		// use customValidator since ValidatorJS predicates require string/number types
		const errors = await validate({ active: false }, [
			node("active").exists().customValidator((v) => typeof v === "boolean"),
		]);
		expect(errors).toHaveLength(0);
	});

	it("does NOT error when a required field is empty string (falsy but valid)", async () => {
		// empty string is present; whether it passes validators is separate
		const errors = await validate({ tag: "" }, [node("tag").exists().isString()]);
		expect(errors).toHaveLength(0);
	});

	it("skips optional field that is missing", async () => {
		const errors = await validate({}, [node("nickname").optional().isEmail()]);
		expect(errors).toHaveLength(0);
	});

	it("skips optional field that is null", async () => {
		const errors = await validate({ nickname: null }, [node("nickname").optional().isEmail()]);
		expect(errors).toHaveLength(0);
	});

	it("still validates optional field when it is present", async () => {
		const errors = await validate({ nickname: "not-an-email" }, [node("nickname").optional().isEmail()]);
		expect(errors).toHaveLength(1);
	});

	// --- onlyFirst (default true) ------------------------------------------
	it("stops after the first error per field with onlyFirst:true (default)", async () => {
		const errors = await validate({ age: "abc" }, [node("age").exists().isNumeric().isInt()]);
		expect(errors).toHaveLength(1);
	});

	it("collects all errors per field with onlyFirst:false", async () => {
		const errors = await validate({ email: "not" }, [node("email").exists().isEmail().isURL()], { onlyFirst: false });
		expect(errors.length).toBeGreaterThanOrEqual(2);
	});

	// --- missing required field does NOT run validators -------------------
	it("does not run validators on a missing required field (even with onlyFirst:false)", async () => {
		const customFn = jest.fn(() => true);
		const errors = await validate({}, [node("name").exists().customValidator(customFn)], { onlyFirst: false });
		expect(errors).toHaveLength(1); // only the required error
		expect(customFn).not.toHaveBeenCalled();
	});

	// --- ValidatorJS string predicates ------------------------------------
	it("passes a ValidatorJS validator for a valid string value", async () => {
		const errors = await validate({ email: "user@example.com" }, [node("email").isEmail()]);
		expect(errors).toHaveLength(0);
	});

	it("fails a ValidatorJS validator for an invalid string value", async () => {
		const errors = await validate({ email: "not-an-email" }, [node("email").isEmail()]);
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Invalid Value");
	});

	it("passes a ValidatorJS validator for a valid numeric value (coerced to string)", async () => {
		const errors = await validate({ age: 25 }, [node("age").isNumeric()]);
		expect(errors).toHaveLength(0);
	});

	it("reports 'Invalid type' for non-string/number values with a ValidatorJS validator", async () => {
		const errors = await validate({ data: { nested: true } }, [node("data").isEmail()]);
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Invalid type");
	});

	it("stops at 'Invalid type' with onlyFirst:true when multiple validators follow", async () => {
		const errors = await validate({ data: [] }, [node("data").isEmail().isNumeric()]);
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Invalid type");
	});

	it("uses withMessage() on a ValidatorJS validator failure", async () => {
		const errors = await validate({ email: "bad" }, [node("email").isEmail().withMessage("Not a valid email")]);
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Not a valid email");
	});

	// --- not() / negate ---------------------------------------------------
	it("not() negates a ValidatorJS validator: passes when validator would fail", async () => {
		const errors = await validate({ value: "not-an-email" }, [node("value").not().isEmail()]);
		expect(errors).toHaveLength(0);
	});

	it("not() negates a ValidatorJS validator: fails when validator would pass", async () => {
		const errors = await validate({ value: "user@example.com" }, [node("value").not().isEmail()]);
		expect(errors).toHaveLength(1);
	});

	it("not() negates a custom function validator", async () => {
		const errors = await validate({ flag: true }, [node("flag").not().customValidator((v) => v === true)]);
		expect(errors).toHaveLength(1);
	});

	it("not() with async custom validator — negation applied to awaited result", async () => {
		const errors = await validate({ flag: true }, [
			node("flag").not().customValidator(async (v) => v === true),
		]);
		expect(errors).toHaveLength(1);
	});

	// --- custom function validators ----------------------------------------
	it("custom validator: passes when function returns true", async () => {
		const errors = await validate({ age: 30 }, [node("age").customValidator((v) => v >= 18)]);
		expect(errors).toHaveLength(0);
	});

	it("custom validator: fails when function returns false", async () => {
		const errors = await validate({ age: 10 }, [node("age").customValidator((v) => v >= 18)]);
		expect(errors).toHaveLength(1);
	});

	it("custom validator receives the full object as the second argument", async () => {
		const received: any[] = [];
		const obj = { a: 1, b: 2 };
		await validate(obj, [
			node("a").customValidator((value, fullObj) => {
				received.push({ value, fullObj });
				return true;
			}),
		]);
		expect(received[0].value).toBe(1);
		expect(received[0].fullObj).toBe(obj);
	});

	it("async custom validator: awaited and fails correctly", async () => {
		const errors = await validate({ val: "x" }, [
			node("val").customValidator(async () => false),
		]);
		expect(errors).toHaveLength(1);
	});

	it("throws for an unknown predicate type", async () => {
		const rule = node("field").end();
		rule.validators.push({ fn: 42 }); // invalid predicate
		await expect(validate({ field: "x" }, [rule] as any)).rejects.toThrow("Unknown validator");
	});

	it("propagates errors when a ValidationNode is stored as a predicate fn", async () => {
		// Unreachable through the public API but the branch must collect errors, not discard them.
		const rule = node("field").end();
		const nestedNode = node("x").exists(); // x is required but won't exist in { field: "hello" }
		rule.validators.push({ fn: nestedNode }); // ValidationNode as fn
		const errors = await validate({ field: "hello" }, [rule] as any);
		expect(errors.length).toBeGreaterThan(0);
	});

	// --- sanitizers -------------------------------------------------------
	it("applies a ValidatorJS sanitizer when validation passes", async () => {
		const obj = { name: "  Alice  " };
		await validate(obj, [node("name").isString().trim()]);
		expect(obj.name).toBe("Alice");
	});

	it("applies a custom sanitizer function when validation passes", async () => {
		const obj = { name: "alice" };
		await validate(obj, [node("name").isString().customSanitizer((v) => v.toUpperCase())]);
		expect(obj.name).toBe("ALICE");
	});

	it("applies an async custom sanitizer", async () => {
		const obj = { name: "alice" };
		await validate(obj, [node("name").isString().customSanitizer(async (v) => v + "!")]);
		expect(obj.name).toBe("alice!");
	});

	it("does NOT apply sanitizers when validation fails", async () => {
		const obj = { name: 42 };
		await validate(obj, [node("name").isString().customSanitizer((_v) => "sanitized")]);
		expect(obj.name).toBe(42);
	});

	// --- parents / dotted parameter paths ---------------------------------
	it("uses the parents option to build dotted parameter paths", async () => {
		const errors = await validate({ street: null }, [node("street").exists()], {
			parents: ["address"],
		});
		expect(errors[0].parameter).toBe("address.street");
	});

	// --- wildcard "*" -----------------------------------------------------
	it("wildcard * validates every key in the object", async () => {
		const obj = { a: "hello", b: "world" };
		const errors = await validate(obj, [node("*").isString()]);
		expect(errors).toHaveLength(0);
	});

	it("wildcard * collects errors for each failing key", async () => {
		const obj = { a: "hello", b: 123, c: 456 };
		const errors = await validate(obj, [node("*").isString()], { onlyFirst: false });
		expect(errors.length).toBeGreaterThanOrEqual(2);
	});

	it("wildcard * resets the passed flag per element", async () => {
		const obj = { a: "good", b: 99 };
		// 'a' passes, then 'b' should still get its sanitizer if it passes
		const sanitizerCalls: string[] = [];
		await validate(obj, [
			node("*").customValidator((v) => typeof v === "string").customSanitizer((v) => {
				sanitizerCalls.push(v);
				return v;
			}),
		]);
		// Only 'a' passed, so sanitizer called once
		expect(sanitizerCalls).toHaveLength(1);
		expect(sanitizerCalls[0]).toBe("good");
	});

	// --- child nodes (nested validation) ----------------------------------
	it("child node validates nested object properties", async () => {
		const obj = { address: { street: "123 Main St" } };
		const errors = await validate(obj, [
			node("address").child("street").exists().isString().endChild(),
		]);
		expect(errors).toHaveLength(0);
	});

	it("child node reports errors with nested parameter path", async () => {
		const obj = { address: { street: null } };
		const errors = await validate(obj, [
			node("address").child("street").exists().endChild(),
		]);
		expect(errors).toHaveLength(1);
		expect(errors[0].parameter).toBe("address.street");
	});

	// --- oneOf ------------------------------------------------------------
	it("oneOf: no error when one branch passes", async () => {
		const errors = await validate({ value: "user@example.com" }, [
			oneOf([node("value").isEmail(), node("value").isURL()]),
		]);
		expect(errors).toHaveLength(0);
	});

	it("oneOf: error when all branches fail", async () => {
		const errors = await validate({ value: "not-valid" }, [
			oneOf([node("value").isEmail(), node("value").isURL()]),
		]);
		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("Invalid Value");
		expect(errors[0].nestedErrors).toBeDefined();
	});

	it("oneOf: uses custom withMessage when all branches fail", async () => {
		const errors = await validate({ value: "bad" }, [
			oneOf([node("value").isEmail()]).withMessage("Must be email or URL"),
		]);
		expect(errors[0].message).toBe("Must be email or URL");
	});

	it("oneOf: accepts an array branch (multiple nodes that must all pass)", async () => {
		const errors = await validate({ a: "user@example.com", b: "42" }, [
			oneOf([[node("a").isEmail(), node("b").isNumeric()]]),
		]);
		expect(errors).toHaveLength(0);
	});

	it("oneOf: array branch fails if any node fails", async () => {
		const errors = await validate({ a: "bad", b: "42" }, [
			oneOf([[node("a").isEmail(), node("b").isNumeric()]]),
		]);
		expect(errors).toHaveLength(1);
	});

	// --- multiple nodes in a single validate call -------------------------
	it("validates multiple independent nodes", async () => {
		const obj = { name: "Alice", email: "alice@example.com", age: "30" };
		const errors = await validate(obj, [
			node("name").exists().isString(),
			node("email").exists().isEmail(),
			node("age").exists().isNumeric(),
		]);
		expect(errors).toHaveLength(0);
	});

	it("collects errors from multiple failing nodes", async () => {
		const obj = { name: 123, email: "bad" };
		const errors = await validate(obj, [
			node("name").exists().isString(),
			node("email").exists().isEmail(),
		]);
		expect(errors.length).toBeGreaterThanOrEqual(2);
	});

	it("defaults nodes to [] when nodes argument is omitted", async () => {
		const errors = await (validate as any)({ name: "Alice" });
		expect(errors).toEqual([]);
	});
});
