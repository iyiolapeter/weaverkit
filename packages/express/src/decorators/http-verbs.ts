import { GetRoutes, SetRoutes } from "./helpers";
import { METADATA } from "./metadata";
import { PathParams } from "express-serve-static-core";

export const HttpVerbDecorator = (verb: string, path: PathParams) => {
	return (target: any, property: string | symbol, descriptor?: PropertyDescriptor) => {
		const routes = GetRoutes(target, [property]);
		routes[property as any].set(METADATA.VERB, {
			verb,
			path,
		});
		SetRoutes(target, routes);
		if (descriptor) {
			return descriptor;
		}
	};
};

type VerbDecorator = (path: PathParams) => MethodDecorator;

export const Get: VerbDecorator = (path) => {
	return HttpVerbDecorator("get", path);
};

export const Post: VerbDecorator = (path) => {
	return HttpVerbDecorator("post", path);
};

export const Put: VerbDecorator = (path) => {
	return HttpVerbDecorator("put", path);
};

export const Patch: VerbDecorator = (path) => {
	return HttpVerbDecorator("patch", path);
};

export const Delete: VerbDecorator = (path) => {
	return HttpVerbDecorator("delete", path);
};

export const Head: VerbDecorator = (path) => {
	return HttpVerbDecorator("head", path);
};

export const Trace: VerbDecorator = (path) => {
	return HttpVerbDecorator("trace", path);
};
