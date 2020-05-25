import { ErrorFormatter, MatchedDataOptions, matchedData, validationResult } from "express-validator";
import { Request, Response, RouterOptions, Router, NextFunction } from "express";
import { ValidationError, ServerError } from "@weaverkit/errors";
import { Sendable, Redirection } from "@weaverkit/data";
import { CanUse, RouteCollection } from "./interfaces";
import { BaseExpressApp } from "./app";

export interface ExpressValidatorOptions {
	matchedDataOptions?: Partial<MatchedDataOptions>;
	errorFormatter: ErrorFormatter;
	errorOptions?: {
		onlyFirstError?: boolean;
	};
}
export interface ValidatedRequestHandlerOptions {
	contextResolver?: (req: Request) => any;
	validatorOptions?: ExpressValidatorOptions;
}

const NormalizeRoutePath = (routePath: string) => (routePath.startsWith("/") ? routePath : `/${routePath}`);

export const IsRouter = (router: any) => {
	const proto = Object.getPrototypeOf(router);
	return proto === Router;
};

export const CreateRouter = (options?: RouterOptions) => {
	return Router(options);
};

export const ValidateRequest = (req: Request, options?: Partial<ExpressValidatorOptions>) => {
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

const ResolveContext = (req: Request, resolver?: (req: Request) => any) => {
	if (resolver) {
		return resolver(req);
	}
	return (req as any).context || {};
};

export const SendResponse = (res: Response, result: any) => {
	if (result instanceof Sendable) {
		if (result instanceof Redirection) {
			return res.redirect(result.httpCode, result.location);
		}
		result.emitter.emit("beforesend");
		res.status(result.httpCode).json(result.send());
		return result.emitter.emit("aftersend");
	} else {
		res.status(200).send(result);
	}
};

export const ValidatedRequestHandler = (action: (data: any, context?: any) => any, options: ValidatedRequestHandlerOptions = {}) => {
	const { contextResolver: resolver, validatorOptions } = options;
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = await action(ValidateRequest(req, validatorOptions), ResolveContext(req, resolver));
			SendResponse(res, data);
		} catch (error) {
			next(error);
		}
	};
};

export const MountCollection = (app: CanUse, collection: RouteCollection) => {
	for (const [route, loc] of Object.entries(collection)) {
		const handler = IsRouter(loc)
			? (loc as Router)
			: loc instanceof BaseExpressApp
			? loc.app
			: new ServerError(`Handler defined at route ${route} is not an express router or ExpressApp`);
		if (handler instanceof Error) {
			throw handler;
		}
		app.use(NormalizeRoutePath(route), handler);
	}
};
