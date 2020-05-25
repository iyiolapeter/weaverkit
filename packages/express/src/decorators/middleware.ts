import { GetRoutes, SetRoutes } from "./helpers";
import { MiddlewareSignature, NextMiddlewareSignature } from "../interfaces";
import { InvalidArgumentError } from "@weaverkit/errors";
import { METADATA, GetClassMetadata, SetClassMetadata } from "./metadata";

export type CombinedMiddlewareSignature = MiddlewareSignature | NextMiddlewareSignature;

export interface RouterLevelMiddlewareMetadata {
	before: CombinedMiddlewareSignature[];
	after: CombinedMiddlewareSignature[];
}

export class MiddlewareStorage implements RouterLevelMiddlewareMetadata {
	public before: CombinedMiddlewareSignature[] = [];
	public after: CombinedMiddlewareSignature[] = [];
}

export const Use = (middleware: CombinedMiddlewareSignature[], type: keyof RouterLevelMiddlewareMetadata) => {
	return (target: any, property?: string, descriptor?: PropertyDescriptor) => {
		if (property) {
			if (!descriptor) {
				throw new InvalidArgumentError(`Property(${property}) middleware attachment is not allowed`);
			}
			const routes = GetRoutes(target, [property]);
			const middlewares: MiddlewareStorage = routes[property as any].get(METADATA.MIDDLEWARES) || new MiddlewareStorage();
			middlewares[type] = [...middleware, ...middlewares[type]];
			routes[property as any].set(METADATA.MIDDLEWARES, middlewares);
			SetRoutes(target, routes);
			return descriptor;
		}
		const middlewares: MiddlewareStorage = GetClassMetadata<RouterLevelMiddlewareMetadata>(
			METADATA.MIDDLEWARES,
			target,
			new MiddlewareStorage(),
		);
		middlewares[type] = [...middleware, ...middlewares[type]];
		SetClassMetadata(METADATA.MIDDLEWARES, target, middlewares);
		return target;
	};
};

export const UseBefore = (...middleware: CombinedMiddlewareSignature[]) => {
	return Use(middleware, "before");
};

export const UseAfter = (...middleware: CombinedMiddlewareSignature[]) => {
	return Use(middleware, "after");
};
