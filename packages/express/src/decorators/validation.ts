import {
	ParamSchema,
	Location,
	checkSchema,
	validationResult,
	matchedData,
	ValidationChain,
	oneOf,
	OneOfCustomMessageBuilder,
	Result,
	ValidationError as ExpressValidationError,
} from "express-validator";
import { GetClassMetadata, SetClassMetadata } from "./metadata";
import { ClassType } from "../interfaces";
import { Use } from "./middleware";
import { Request, Response, NextFunction } from "express";
import { ValidationError } from "@weaverkit/errors";
import { CustomValidator, Middleware } from "express-validator/src/base";
import { ExpressValidatorOptions } from "../helpers";

export interface ValidateIf {
	$if?: ValidationChain | CustomValidator;
}

export type FieldConstraint = Omit<ParamSchema, "in"> & ValidateIf;

export type { Location } from "express-validator";

export const SCHEMA_SYMBOL = Symbol("Schema");
export const ONEOF_SCHEMA_SYMBOL = Symbol("OneofSchema");
export const SCHEMA_LOCATION_SYMBOL = Symbol("SchemaLocation");
export const VALIDATED_REQUEST_SYMBOL = Symbol("ValidatedRequest");

const MergeSchema = (first: Record<string, FieldConstraint[]>, second: Record<string, FieldConstraint[]>) => {
	const merged = Object.assign({}, first);
	for (const [key, constraints] of Object.entries(second)) {
		if (merged[key]) {
			merged[key].concat(constraints);
			continue;
		}
		merged[key] = constraints;
	}
	return merged;
};

const GetSchema = (prototype: any) => {
	return GetClassMetadata<Record<string, FieldConstraint[]>>(SCHEMA_SYMBOL, prototype, {});
};

const SetSchema = (prototype: any, schema: Record<string, FieldConstraint[]>) => {
	SetClassMetadata(SCHEMA_SYMBOL, prototype, schema);
};

export const ValidationObject = (location: Location) => {
	return (target: ClassType<any>) => {
		SetClassMetadata(SCHEMA_LOCATION_SYMBOL, target.prototype, location);
		const parent = Object.getPrototypeOf(target.prototype).constructor;
		if (parent.name !== "Object") {
			const parentSchema = GetSchema(parent.prototype);
			if (Object.keys(parentSchema).length) {
				const schema = GetSchema(target.prototype);
				SetSchema(target.prototype, MergeSchema(parentSchema, schema));
			}
		}
		return target;
	};
};

export const Constraint = (constraints: FieldConstraint | FieldConstraint[]) => {
	return (target: any, property: string) => {
		const schema = GetSchema(target);
		if (!schema[property]) {
			schema[property] = [];
		}
		Array.isArray(constraints) ? schema[property].push(...constraints) : schema[property].push(constraints);
		SetSchema(target, schema);
	};
};

export type ExtraRules<T> = {
	[key in keyof T]?: FieldConstraint;
};

export const NestedConstraint = <T>(
	obj: ClassType<T> | [ClassType<T>],
	{ extraRules, $if }: { extraRules?: ExtraRules<T> } & ValidateIf = {},
) => {
	return (target: any, property: string) => {
		const schema = GetSchema(target);
		const objectSchema = GetSchema(Array.isArray(obj) ? obj[0].prototype : obj.prototype);
		const linker = Array.isArray(obj) ? ".*." : ".";
		for (const [field, constraints] of Object.entries(objectSchema)) {
			if (extraRules && (extraRules as any)[field]) {
				constraints.push((extraRules as any)[field]);
			}
			schema[`${property}${linker}${field}`] = constraints.map((constraint) => {
				if ($if) {
					constraint.$if = $if;
				}
				return constraint;
			});
		}
		SetSchema(target, schema);
	};
};

interface OneofMetadata {
	chains: (ValidationChain | ValidationChain[])[];
	message?: string | OneOfCustomMessageBuilder;
}

export const OneOf = (chains: (ValidationChain | ValidationChain[])[], message?: string | OneOfCustomMessageBuilder) => {
	return (target: ClassType<any>) => {
		const oneofs = GetClassMetadata<OneofMetadata[]>(ONEOF_SCHEMA_SYMBOL, target.prototype, []);
		oneofs.push({ chains, message });
		SetClassMetadata(ONEOF_SCHEMA_SYMBOL, target.prototype, oneofs);
		return target;
	};
};

interface DefaultsShape {
	validator: Required<ExpressValidatorOptions>;
}

const DEFAULTS: DefaultsShape = {
	validator: {
		errorFormatter: ({ msg, param }: any) => {
			return {
				parameter: param,
				message: msg,
			};
		},
		errorOptions: { onlyFirstError: true },
		matchedDataOptions: { onlyValidData: true, includeOptionals: true },
	},
};

export const SetGlobalValidationOptions = (options: Partial<ExpressValidatorOptions>) => {
	DEFAULTS.validator = { ...DEFAULTS.validator, ...options };
};

export const CreateValidationMiddleware = (locations: Location[], options: ExpressValidatorOptions = {}) => {
	return (req: Request, _res: Response, next: NextFunction) => {
		HandleValidationResult(req, validationResult(req), locations, options);
		return next();
	};
};

export const ConstraintToValidator = (field: string, { $if, ...constraint }: FieldConstraint, location: Location) => {
	const chain = checkSchema({ [field]: constraint }, [location])[0];
	if ($if === undefined) {
		return chain;
	}
	if (!(($if as ValidationChain).run && typeof ($if as ValidationChain).run === "function") && typeof $if !== "function") {
		throw new Error(`$if predicate passed for ${field} is not a function`);
	}
	const middleware: Middleware = async (req, _res, next) => {
		try {
			let passed = false;
			if (($if as ValidationChain).run && typeof ($if as ValidationChain).run === "function") {
				const errors = await ($if as ValidationChain).run(req, { dryRun: true });
				if (!errors.isEmpty()) {
					return next();
				}
				passed = true;
			} else if (typeof $if === "function") {
				passed = !!(await ($if as CustomValidator)(req[location], {
					req,
					location,
					path: field,
				}));
			} else {
				throw new Error(`$if predicate passed for ${field} is not a function`);
			}
			if (!passed) {
				return next();
			}
			return await chain.run(req).then(() => next());
		} catch (error) {
			next(error);
		}
	};
	return middleware;
};

export const GetSchemaValidators = (objects: ClassType<any>[]) => {
	const validators: (ValidationChain | Middleware)[] = [];
	const locations = new Set<Location>();
	for (const obj of objects) {
		const location = GetClassMetadata<Location>(SCHEMA_LOCATION_SYMBOL, obj.prototype);
		if (!location) {
			throw new Error(`Non-ValidationObject detected in ${obj.name}. Please ensure all objects have the ValidationObject decorator`);
		}
		locations.add(location);
		const oneofs = GetClassMetadata<OneofMetadata[]>(ONEOF_SCHEMA_SYMBOL, obj.prototype, []);
		for (const { chains, message } of oneofs) {
			validators.push(oneOf(chains, message));
		}
		const schema = GetSchema(obj.prototype);
		for (const [field, constraints] of Object.entries(schema)) {
			constraints.forEach((constraint) => {
				validators.push(ConstraintToValidator(field, constraint, location));
			});
		}
	}
	return { validators, locations: Array.from(locations) };
};

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
	{
		[K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
	}[Keys];

interface UseValidatorConfig {
	objects: ClassType<any>[];
	chains: [ValidationChain[], Location[]];
}

export function UseValidator(
	input: RequireAtLeastOne<UseValidatorConfig, "chains" | "objects"> | ClassType<any>[],
	options?: ExpressValidatorOptions,
) {
	let chains: (ValidationChain | Middleware)[] = [];
	let objects: ClassType<any>[] = [];
	const locations = new Set<Location>();
	if (Array.isArray(input)) {
		objects = input;
	} else {
		if (input.objects) {
			objects = input.objects;
		}
		if (input.chains) {
			chains = input.chains[0];
			input.chains[1].forEach(locations.add, locations);
		}
	}
	return (target: any, property: string, descriptor: PropertyDescriptor) => {
		if (objects.length) {
			const result = GetSchemaValidators(objects);
			chains.push(...result.validators);
			result.locations.forEach(locations.add, locations);
		}
		return Use([...chains, CreateValidationMiddleware(Array.from(locations), options)], "before")(target, property, descriptor);
	};
}

export const RunImperative = async (validator: ValidationChain | Middleware, req: Request, res?: Response) => {
	try {
		if ((validator as ValidationChain).run && typeof (validator as ValidationChain).run === "function") {
			await (validator as ValidationChain).run(req);
			return;
		}
		if (typeof validator === "function") {
			// could be oneOf, use as a middleware
			await new Promise<void>((resolve, reject) => {
				const next = (error?: any) => {
					if (error) {
						return reject(error);
					}
					return resolve();
				};
				return validator(req, res, next);
			});
			return;
		}
		throw new Error("Unable to run validator imperatively");
	} catch (error) {
		throw error;
	}
};

export const RunValidators = async (objects: ClassType<any>[], req: Request, res?: Response) => {
	const { validators } = GetSchemaValidators(objects);
	await Promise.all(validators.map((validator) => RunImperative(validator, req, res)));
	return validationResult(req);
};

export const HandleValidationResult = (
	req: Request,
	result: Result<ExpressValidationError>,
	locations: Location[],
	options: ExpressValidatorOptions,
) => {
	const {
		errorFormatter = DEFAULTS.validator.errorFormatter,
		errorOptions = DEFAULTS.validator.errorOptions,
		matchedDataOptions = DEFAULTS.validator.matchedDataOptions,
	} = options;
	const errors = result.formatWith(errorFormatter);
	if (!errors.isEmpty()) {
		throw new ValidationError().setFields(errors.array(errorOptions));
	}
	const validated: Record<Location, any> = (req as any)[VALIDATED_REQUEST_SYMBOL] ?? {};
	locations.forEach((location) => {
		validated[location] = matchedData(req, { ...matchedDataOptions, locations: [location] });
	});
	(req as any)[VALIDATED_REQUEST_SYMBOL] = validated;
};

export interface RunValidationMiddlewareOptions {
	objects: ClassType<any>[];
	req: Request;
	res?: Response;
	validationOptions?: ExpressValidatorOptions;
}

export const RunValidationMiddleware = async ({ objects, req, res, validationOptions = {} }: RunValidationMiddlewareOptions) => {
	const { validators, locations } = GetSchemaValidators(objects);
	await Promise.all(validators.map((validator) => RunImperative(validator, req, res)));
	return HandleValidationResult(req, validationResult(req), locations, validationOptions);
};
