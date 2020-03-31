import { validationResult, matchedData, ErrorFormatter, MatchedDataOptions } from "express-validator";
import { ValidationError } from "@weaverkit/errors";
import express from "express";

export interface ValidatorOptions {
	onlyValidData?: boolean;
}

export const isRouter = (router: any) => {
	const proto = Object.getPrototypeOf(router);
	return proto === express.Router;
};

export interface ExpressValidatorOptions {
	matchedDataOptions?: Partial<MatchedDataOptions>;
	errorFormatter: ErrorFormatter;
	errorOptions?: {
		onlyFirstError?: boolean;
	};
}

export const validateRequest = (req: express.Request, options?: Partial<ExpressValidatorOptions>) => {
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
