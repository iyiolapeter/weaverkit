import ValidatorJS from "validator";
import { Validator } from "./interface";
const extraValidators = ["contains", "equals", "matches"];
const extraSanitizers = ["blacklist", "escape", "unescape", "normalizeEmail", "ltrim", "rtrim", "trim", "stripLow", "whitelist"];

const isSanitizer = (name: string) => name.startsWith("to") || extraSanitizers.includes(name);
const isValidator = (name: string) => name.startsWith("is") || extraValidators.includes(name);

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ValidationNode extends Validator {}
export class ValidationNode {
	public negateNext!: boolean;
	protected rule: Record<string, any>;
	constructor(public id: string, public parent?: ValidationNode) {
		this.rule = {
			id,
			required: false,
			validators: [],
			sanitizers: [],
		};
	}

	public child(id: string) {
		const child = new ValidationNode(id, this);
		this.rule.validators.push(child);
		return child;
	}

	public endChild() {
		if (!this.parent) {
			throw new Error("Validation Node is not a child");
		}
		return this.parent;
	}

	public exists() {
		this.rule.required = true;
		return this;
	}

	public optional() {
		this.rule.required = false;
		return this;
	}

	public isString() {
		return this.customValidator((value: any) => {
			return typeof value === "string";
		});
	}

	public isArray(options: any = {}) {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		return this.customValidator((value: any, _obj: any) => {
			const { empty = true } = options;
			if (!Array.isArray(value)) {
				return false;
			}
			if (!empty) {
				return !!value.length;
			}
			return true;
		}).withMessage(`${this.rule.id} must be an array`);
	}

	public customValidator(fn: (...args: any[]) => any, ...args: any[]) {
		this.rule.validators.push({
			fn,
			args,
		});
		return this;
	}

	public customSanitizer(fn: (...args: any[]) => any, ...args: any[]) {
		this.rule.sanitizers.push({
			fn,
			args,
		});
		return this;
	}

	public withMessage(message: string) {
		const len = this.rule.validators.length;
		if (!len) {
			return this;
		}
		this.rule.validators[len - 1].message = message;
		return this;
	}

	public not() {
		this.negateNext = true;
		return this;
	}

	public end() {
		return this.rule;
	}
}

for (const key of Object.keys(ValidatorJS)) {
	if (key !== "default" && typeof (ValidatorJS as any)[key] === "function") {
		if (isSanitizer(key)) {
			(ValidationNode.prototype as any)[key] = function (...args: any[]) {
				this.rule.sanitizers.push({
					fn: key,
					args,
				});
				return this;
			};
		} else if (isValidator(key)) {
			(ValidationNode as any).prototype[key] = function (...args: any[]) {
				this.rule.validators.push({
					fn: key,
					args,
				});
				return this;
			};
		}
	}
}

export class OneOf {
	public message: string;
	constructor(public nodes: Array<ValidationNode | ValidationNode[]>) {
		this.message = "Invalid Value";
	}

	public withMessage(message: string) {
		this.message = message;
		return this;
	}
}

export function node(id: string) {
	return new ValidationNode(id);
}

export function oneOf(nodes: Array<ValidationNode | ValidationNode[]>) {
	return new OneOf(nodes);
}

type ValidateFunction = (obj: Record<string, any>, nodes: Array<OneOf | ValidationNode>, options?: any) => any[] | Promise<any[]>;
export const validate: ValidateFunction = async (obj: Record<string, any>, nodes: any[] = [], options: any = {}) => {
	const { onlyFirst = true, parents = [] } = options;
	const errors: any = [];
	// tslint:disable-next-line: no-shadowed-variable
	for (let node of nodes) {
		let passed = true;
		if (node instanceof ValidationNode) {
			node = node.end();
		} else if (node instanceof OneOf) {
			const oneOfErrors = [];
			for (let oneOfNode of node.nodes) {
				if (!Array.isArray(oneOfNode)) {
					oneOfNode = [oneOfNode];
				}
				const oneOfError = await validate(obj, oneOfNode, options);
				if (!oneOfError.length) {
					passed = true;
					break;
				} else {
					oneOfErrors.push(oneOfError);
					passed = false;
				}
			}
			if (!passed) {
				errors.push({
					message: node.message,
					nestedErrors: oneOfErrors,
				});
			}
			continue;
		} else if (typeof node !== "object") {
			continue;
		}
		const { id: path, ...rule } = node;
		let elems = [];
		if (path === "*") {
			elems = Object.keys(obj);
		} else {
			elems.push(path);
		}
		for (const id of elems) {
			const paths = parents.slice();
			paths.push(id);
			const parameter = paths.join(".");
			if (rule.required && !obj[id]) {
				passed = false;
				errors.push({
					parameter,
					message: `${id} is required`,
				});
				if (onlyFirst) {
					continue;
				}
			}
			if (!rule.required && !obj[id]) {
				continue;
			}
			for (const validatorObj of rule.validators) {
				if (validatorObj instanceof ValidationNode) {
					const childOptions = JSON.parse(JSON.stringify(options));
					childOptions.parents = paths;
					errors.push(...(await validate(obj[id], [validatorObj], childOptions)));
					continue;
				}
				const { fn: predicate, args, message } = validatorObj;
				if (typeof predicate === "string") {
					if (["string", "number"].includes(typeof obj[id])) {
						if (!(ValidatorJS as any)[predicate](String(obj[id]), ...args)) {
							passed = false;
							errors.push({
								parameter,
								message: message || "Invalid Value",
							});
							if (onlyFirst) {
								continue;
							}
						}
					} else {
						passed = false;
						errors.push({
							parameter,
							message: "Invalid type",
						});
					}
				} else if (predicate instanceof ValidationNode) {
					await validate(obj[id], [predicate], options);
				} else if (typeof predicate === "function") {
					if (!(await predicate(obj[id], obj, ...args))) {
						passed = false;
						errors.push({
							parameter,
							message: message || "Invalid Value",
						});
						if (onlyFirst) {
							continue;
						}
					}
				} else {
					throw new Error("Unknown validator " + predicate);
				}
			}
			if (passed) {
				for (const { fn: sanitizer, args } of rule.sanitizers) {
					if (typeof sanitizer === "string") {
						obj[id] = (ValidatorJS as any)[sanitizer](String(obj[id]), ...args);
					} else if (typeof sanitizer === "function") {
						obj[id] = await sanitizer(obj[id], obj, ...args);
					}
				}
			}
		}
	}
	return errors;
};
