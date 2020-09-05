import { SupportedHttpMethods, ClassType } from "../interfaces";
import { Request, Response, Router, NextFunction } from "express";
import { SendResponse } from "../helpers";
import { ARG, METADATA, RESPONSE_HANDLED, GetClassMetadata, SetClassMetadata } from "./metadata";
import { MiddlewareStorage } from "./middleware";
import { VALIDATED_REQUEST_SYMBOL, Location } from "./validation";

export const ExtractArg = (obj: any, key?: any) => {
	if (!key) {
		return obj;
	}
	return obj[key];
};

export type ArgResolver = (req: Request, key?: string | symbol) => any;

const PreferValidated = (req: Request, location: Location) => {
	const validated = (req as any)[VALIDATED_REQUEST_SYMBOL];
	if (validated && validated[location] !== undefined) {
		return validated[location];
	}
	return req[location];
};

export const ARG_RESOLVER = {
	[ARG.BODY]: (req: Request, key: any) => {
		return ExtractArg(PreferValidated(req, "body"), key);
	},
	[ARG.PARAMS]: (req: Request, key: any) => {
		return ExtractArg(PreferValidated(req, "params"), key);
	},
	[ARG.QUERY]: (req: Request, key: any) => {
		return ExtractArg(PreferValidated(req, "query"), key);
	},
	[ARG.HEADERS]: (req: Request, key: any) => {
		return ExtractArg(PreferValidated(req, "headers"), key);
	},
};

export const ResolveArgs = (args: any[], ctx: { req: Request; res: Response; next: NextFunction }) => {
	return args.map(([resolver, key]) => {
		if (typeof resolver === "function") {
			return resolver(ctx.req, key);
		}
		if (typeof resolver !== "symbol") {
			throw new Error("Invalid param resolver");
		}
		switch (resolver) {
			case ARG.REQUEST:
				return ctx.req;
			case ARG.RESPONSE:
				return ctx.res;
			case ARG.NEXT:
				return ctx.next;
			default:
				if (!ARG_RESOLVER[resolver as any]) {
					throw new Error("Invalid param resolver");
				}
				return ARG_RESOLVER[resolver as any](ctx.req, key);
		}
	});
};

export const GetRoutes = (target: any, init: (string | symbol)[] = []) => {
	const routes = GetClassMetadata<Record<string | symbol, Map<string | symbol, any>>>(METADATA.ROUTES, target, {});
	for (const route of init) {
		if (!routes[route as any]) {
			routes[route as any] = new Map<string | symbol, any>();
		}
	}
	return routes;
};

export const SetRoutes = (target: any, routes: Record<string | symbol, Map<string | symbol, any>>) => {
	SetClassMetadata(METADATA.ROUTES, target, routes);
};

export const MergeRoutes = (parent: any, child: any) => {
	SetRoutes(child, {
		...GetRoutes(parent),
		...GetRoutes(child),
	});
	SetRoutes(child.prototype, {
		...GetRoutes(parent.prototype),
		...GetRoutes(child.prototype),
	});
};

interface RequestHandlerFactoryOptions {
	handleResponse: boolean;
	shouldNext: boolean;
}

export const RequestHandlerFactory = (action: (...args: any[]) => any, resolvers: ArgResolver[], options: RequestHandlerFactoryOptions) => {
	const { handleResponse, shouldNext } = options;
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const data = await action(...ResolveArgs(resolvers, { req, res, next }));
			if (handleResponse) {
				SendResponse(res, data);
			}
			if (!shouldNext) {
				return;
			}
			next();
		} catch (error) {
			next(error);
		}
	};
};

export const ApplyRoute = (
	controller: ClassType<any> | InstanceType<any>,
	method: string,
	metadata: Map<string | symbol, any>,
	router: Router,
) => {
	const { verb, path } = metadata.get(METADATA.VERB) as { verb: SupportedHttpMethods; path: string };
	const resolvers: any[] = metadata.get(METADATA.ROUTE_ARGS) || [];
	const middlewares: MiddlewareStorage = metadata.get(METADATA.MIDDLEWARES) || new MiddlewareStorage();
	router[verb](
		path,
		...middlewares.before,
		RequestHandlerFactory(controller[method].bind(controller), resolvers, {
			shouldNext: !!middlewares.after.length,
			handleResponse: !metadata.has(RESPONSE_HANDLED),
		}),
		...middlewares.after,
	);
};
