import { isRouter, validateRequest, ExpressValidatorOptions } from "./helpers";
import { Artifact, Renderer } from "@weaverkit/data";
import { ErrorHandler } from "@weaverkit/errors";
import { PathParams } from "express-serve-static-core";
import { BaseExpressApp } from "./app";
import express, { NextFunction } from "express";

export type SupportedHttpMethods = "get" | "post" | "put" | "patch" | "delete" | "head" | "trace" | "all";

export type NextMiddlewareSignature = (req: express.Request, res: express.Response, next: express.NextFunction) => any;
export type MiddlewareSignature = (req: express.Request, res: express.Response, next?: express.NextFunction) => any;

export type SubRouter = [PathParams, express.Router];

export type ControllerFn = (data: any, context?: any) => any;

export type Route = [PathParams, ...(MiddlewareSignature | NextMiddlewareSignature)[]];

export interface SubRouterMount {
	use?: SubRouter[];
}

export type RouterDefinition = { [k in SupportedHttpMethods]?: Route[] } & SubRouterMount;

export type RouterPathAlias = string;

export type RouteCollection = Record<string, RouterPathAlias | BaseExpressApp | express.Router>;

interface IncomingRouter {
	router?: express.Router;
}

interface LoaderOptions {
	errorHandler: ErrorHandler;
	contextResolver?: (req: express.Request) => any;
	validatorOptions?: ExpressValidatorOptions;
}

export class RouteLoader {
	public constructor(protected options: LoaderOptions) {}

	public controller(controllerFn: ControllerFn, options?: Partial<LoaderOptions>) {
		const {
			contextResolver = (req: express.Request) => {
				return (req as any).context || {};
			},
			validatorOptions,
			errorHandler,
		} = { ...this.options, ...options };
		const handler = async (req: express.Request, res: express.Response, next: NextFunction) => {
			try {
				const data = validateRequest(req, validatorOptions);
				const result = await controllerFn(data, contextResolver(req));
				if (result instanceof Artifact) {
					res.status(result.httpCode).json(result.export());
				} else if (result instanceof Renderer) {
					res.status(result.httpCode).send(await result.render());
				} else {
					res.status(200).send(result);
				}
			} catch (error) {
				next(errorHandler.wrap(error));
			}
		};
		return handler;
	}

	public fromDefinition(definition: RouterDefinition, options: Partial<LoaderOptions> & IncomingRouter = {}) {
		const router = options?.router || express.Router();
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

	public fromPath(modulePath: string) {
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
}
