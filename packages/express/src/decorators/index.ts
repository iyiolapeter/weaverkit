import { GetRoutes, ApplyRoute } from "./helpers";
import { Router, RouterOptions } from "express";
import { IncomingRouter, ClassType } from "../interfaces";
import { RouterLevelMiddlewareMetadata } from "./middleware";
import { GetClassMetadata, METADATA } from "./metadata";
import { ControllerOptions } from "./controller";

export interface Container {
	get(token: any): any;
}

export interface DecoratedRouterConfig extends IncomingRouter {
	container?: Container;
}

const DefaultContainer: Container = {
	get(Ctor: ClassType<any>) {
		return new Ctor();
	},
};

const NormalizeRoutePath = (routePath: string) => (routePath.startsWith("/") ? routePath : `/${routePath}`);

export const GetRouterFromController = (controller: ClassType<any> | InstanceType<any>, config: DecoratedRouterConfig = {}) => {
	let instance: InstanceType<any>;
	let constructor: ClassType<any>;
	const { container = DefaultContainer } = config;
	if (typeof controller === "function") {
		instance = container.get(controller);
		constructor = controller;
	} else {
		instance = controller;
		constructor = controller.constructor;
	}
	const { path, options = {} } = GetClassMetadata<{ path: string; options: ControllerOptions }>(METADATA.ROUTER, constructor) || {};
	if (path === undefined) {
		throw new Error(`Constructor for ${constructor.name} is not a decorated as a controller`);
	}
	const { router = Router(options.routerOptions as RouterOptions) } = config;
	const use = GetClassMetadata<RouterLevelMiddlewareMetadata>(METADATA.MIDDLEWARES, constructor);
	// load router level pre middleware
	if (use && use.before.length) {
		use.before.forEach((middleware) => {
			router.use(middleware);
		});
	}
	// load static routes
	for (const [property, definition] of Object.entries(GetRoutes(constructor))) {
		ApplyRoute(constructor, property, definition, router);
	}
	// load instance routes
	for (const [property, definition] of Object.entries(GetRoutes(constructor.prototype))) {
		ApplyRoute(instance, property, definition, router);
	}
	if (options.children && Array.isArray(options.children)) {
		options.children.forEach((child) => {
			const mountable = GetRouterFromController(child, {
				container: config.container,
			});
			router.use(NormalizeRoutePath(mountable.path), mountable.router);
		});
	}
	// load router level post middleware
	if (use && use.after.length) {
		use.after.forEach((middleware) => {
			router.use(middleware);
		});
	}
	return {
		path,
		router,
	};
};

export * from "./controller";
export * from "./middleware";
export * from "./http-verbs";
export * from "./args";
