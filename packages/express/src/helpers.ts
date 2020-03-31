import { ErrorFormatter, MatchedDataOptions, matchedData, validationResult } from "express-validator";
import { Request, RouterOptions, Router } from "express";
import { ValidationError } from "@weaverkit/errors";

export const isRouter = (router: any) => {
	const proto = Object.getPrototypeOf(router);
	return proto === Router;
};

export const createRouter = (options?: RouterOptions) => {
	return Router(options);
};

export interface ExpressValidatorOptions {
	matchedDataOptions?: Partial<MatchedDataOptions>;
	errorFormatter: ErrorFormatter;
	errorOptions?: {
		onlyFirstError?: boolean;
	};
}

export const validateRequest = (req: Request, options?: Partial<ExpressValidatorOptions>) => {
	const defaults: ExpressValidatorOptions = {
		errorFormatter({ msg, param }: any) {
			return {
				parameter: param,
				message: msg,
			};
		},
		matchedDataOptions: {
			onlyValidData: true,
		},
		errorOptions: {
			onlyFirstError: true,
		},
		...options,
	};
	const errors = validationResult(req).formatWith(defaults.errorFormatter);
	if (!errors.isEmpty()) {
		throw new ValidationError().setFields(errors.array(defaults.errorOptions));
	}
	const data = matchedData(req, defaults.matchedDataOptions);
	return data;
};
