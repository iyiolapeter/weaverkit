import { ErrorFormatter, MatchedDataOptions, matchedData, validationResult } from "express-validator";
import { Request, Response, RouterOptions, Router, NextFunction } from "express";
import { ValidationError, ServerError } from "@weaverkit/errors";
import { Sendable, Redirection } from "@weaverkit/data";
import { CanUse, RouteCollection } from "./interfaces";
import { BaseExpressApp } from "./app";

export interface ExpressValidatorOptions {
	matchedDataOptions?: Partial<MatchedDataOptions>;
	errorFormatter?: ErrorFormatter;
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

export const ValidateRequest = (req: Request, options: ExpressValidatorOptions = {}) => {
	const defaultErrorFormatter = ({ msg, param }: any) => {
		return {
			parameter: param,
			message: msg,
		};
	};
	const {
		errorFormatter = defaultErrorFormatter,
		errorOptions = { onlyFirstError: true },
		matchedDataOptions = { onlyValidData: true, includeOptionals: true },
	} = options;
	const errors = validationResult(req).formatWith(errorFormatter);
	if (!errors.isEmpty()) {
		throw new ValidationError().setFields(errors.array(errorOptions));
	}
	const data = matchedData(req, matchedDataOptions);
	return data;
};

const ResolveContext = (req: Request, resolver?: (req: Request) => any) => {
	if (resolver) {
		return resolver(req);
	}
	return (req as any).context || {};
};

export const SendResponse = async (res: Response, result: any, defaultStatusCode = 200) => {
	if (result instanceof Sendable) {
		if (result instanceof Redirection) {
			return res.redirect(result.httpCode, result.location);
		}
		result.emitter.emit("beforesend");
		const body = await result.send();
		res.status(result.httpCode).send(body);
		result.emitter.emit("aftersend");
	} else {
		res.status(defaultStatusCode).send(result);
	}
	return true;
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
