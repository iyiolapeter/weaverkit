import { createRouter, isRouter, validateRequest, ExpressValidatorOptions, sendResponse } from "./helpers";
import { ErrorHandler, ServerError } from "@weaverkit/errors";
import { PathParams } from "express-serve-static-core";
import { BaseExpressApp } from "./app";
import express, { NextFunction } from "express";
import { ValidationChain } from "express-validator";

export type SupportedHttpMethods = "get" | "post" | "put" | "patch" | "delete" | "head" | "trace" | "all";

export type NextMiddlewareSignature = (req: express.Request, res: express.Response, next: express.NextFunction) => any;
export type MiddlewareSignature = (req: express.Request, res: express.Response, next?: express.NextFunction) => any;

export type SubRouter = [PathParams, express.Router];

export type ControllerFn = (data: any, context?: any) => any;

export type Route = [PathParams, ...(MiddlewareSignature | NextMiddlewareSignature | ValidationChain | ValidationChain[])[]];

export interface SubRouterMount {
	use?: SubRouter[];
}

export type RouterDefinition = { [k in SupportedHttpMethods]?: Route[] } & SubRouterMount;

export type RouterPathAlias = string;

export type RouteCollection = Record<string, RouterPathAlias | BaseExpressApp | express.Router>;

export interface CanUse {
	use: (path: PathParams, handler: any) => any;
}

export interface IncomingRouter {
	router?: express.Router;
}

export interface LoaderOptions {
	errorHandler: ErrorHandler;
	contextResolver?: (req: express.Request) => any;
	validatorOptions?: ExpressValidatorOptions;
}

export function RouteLoader(configOptions: LoaderOptions) {
	function controller(controllerFn: ControllerFn, options?: Partial<LoaderOptions>) {
		const {
			contextResolver = (req: express.Request) => {
				return (req as any).context || {};
			},
			validatorOptions,
			errorHandler,
		} = { ...configOptions, ...options };
		const handler = async (req: express.Request, res: express.Response, next: NextFunction) => {
			try {
				const data = validateRequest(req, validatorOptions);
				const result = await controllerFn(data, contextResolver(req));
				sendResponse(res, result);
			} catch (error) {
				next(errorHandler.wrap(error));
			}
		};
		return handler;
	}

	function fromDefinition(definition: RouterDefinition, options: Partial<LoaderOptions> & IncomingRouter = {}) {
		const router = options?.router || createRouter();
		for (const [method, routes] of Object.entries(definition)) {
			for (const route of routes as Required<Route[]>) {
				if (method === "use") {
					router.use(route[0], (route[1] as unknown) as express.Router);
				} else {
					const [path, ...handlers] = route as Route;
					(router as any)[method](path, handlers);
				}
			}
		}
		return router;
	}

	function fromPath(modulePath: string) {
		try {
			const router = require(modulePath); //eslint-disable-line @typescript-eslint/no-var-requires
			if (isRouter(router)) {
				return router as express.Router;
			}
			throw new Error(`Module at ${modulePath} is not an express router`);
		} catch (error) {
			throw error;
		}
	}

	return {
		controller,
		fromDefinition,
		fromPath,
	};
}

export const mountCollection = (app: CanUse, collection: RouteCollection) => {
	for (const [route, loc] of Object.entries(collection)) {
		const handler = isRouter(loc)
			? (loc as express.Router)
			: loc instanceof BaseExpressApp
			? loc.app
			: new ServerError(`Handler defined at route ${route} is not an express router or ExpressApp`);
		if (handler instanceof Error) {
			throw handler;
		}
		app.use(route.startsWith("/") ? route : `/${route}`, handler);
	}
};
