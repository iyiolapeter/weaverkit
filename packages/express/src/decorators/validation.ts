import {
	ParamSchema,
	Location,
	checkSchema,
	validationResult,
	matchedData,
	ValidationChain,
	oneOf,
	OneOfCustomMessageBuilder,
} from "express-validator";
import { GetClassMetadata, SetClassMetadata } from "./metadata";
import { ClassType } from "../interfaces";
import { Use } from "./middleware";
import { Request, Response, NextFunction } from "express";
import { ValidationError } from "@weaverkit/errors";
import { Middleware } from "express-validator/src/base";
import { ExpressValidatorOptions } from "../helpers";

export type FieldConstraint = Omit<ParamSchema, "in">;

export type { Location } from "express-validator";

export const SCHEMA_SYMBOL = Symbol("Schema");
export const ONEOF_SCHEMA_SYMBOL = Symbol("OneofSchema");
export const SCHEMA_LOCATION_SYMBOL = Symbol("SchemaLocation");
export const VALIDATED_REQUEST_SYMBOL = Symbol("ValidatedRequest");

export const ValidationObject = (location: Location) => {
	return (target: ClassType<any>) => {
		SetClassMetadata(SCHEMA_LOCATION_SYMBOL, target.prototype, location);
		return target;
	};
};

export const Constraint = (constraints: FieldConstraint | FieldConstraint[]) => {
	return (target: any, property: string) => {
		const schema = GetClassMetadata<Record<string, FieldConstraint[]>>(SCHEMA_SYMBOL, target, {});
		if (!schema[property]) {
			schema[property] = [];
		}
		Array.isArray(constraints) ? schema[property].push(...constraints) : schema[property].push(constraints);
		SetClassMetadata(SCHEMA_SYMBOL, target, schema);
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
		const {
			errorFormatter = DEFAULTS.validator.errorFormatter,
			errorOptions = DEFAULTS.validator.errorOptions,
			matchedDataOptions = DEFAULTS.validator.matchedDataOptions,
		} = options;
		const errors = validationResult(req).formatWith(errorFormatter);
		if (!errors.isEmpty()) {
			throw new ValidationError().setFields(errors.array(errorOptions));
		}
		const validated: Record<Location, any> = (req as any)[VALIDATED_REQUEST_SYMBOL] ?? {};
		locations.forEach((location) => {
			validated[location] = matchedData(req, { ...matchedDataOptions, locations: [location] });
		});
		(req as any)[VALIDATED_REQUEST_SYMBOL] = validated;
		return next();
	};
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
		const schema = GetClassMetadata<Record<string, FieldConstraint[]>>(SCHEMA_SYMBOL, obj.prototype, {});
		for (const [field, constraints] of Object.entries(schema)) {
			constraints.forEach((constraint) => {
				validators.push(...checkSchema({ [field]: constraint }, [location]));
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
	return new Promise((resolve, reject) => {
		if ((validator as ValidationChain).run && typeof (validator as ValidationChain).run === "function") {
			(validator as ValidationChain).run(req);
			return resolve();
		}
		if (typeof validator === "function") {
			// could be oneOf, use as a middleware
			const next = (error?: any) => {
				if (error) {
					return reject(error);
				}
				return resolve();
			};
			return validator(req, res, next);
		}
		return reject(new Error("Unable to run validator imperatively"));
	});
};

export const RunValidators = async (objects: ClassType<any>[], req: Request, res?: Response) => {
	const { validators } = GetSchemaValidators(objects);
	await Promise.all(validators.map((validator) => RunImperative(validator, req, res)));
	return validationResult(req);
};
