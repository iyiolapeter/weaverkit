import { Router } from "express";
import { CreateRouter, IsRouter } from "./helpers";
import { RouterDefinition, IncomingRouter, Route, RouteCollection, ClassType } from "./interfaces";
import { DecoratedRouterConfig, GetRouterFromController } from "./decorators";

export function RouteLoader() {
	function fromDefinition(definition: RouterDefinition, options: IncomingRouter = {}) {
		const router = options.router || CreateRouter();
		for (const [method, routes] of Object.entries(definition)) {
			for (const route of routes as Required<Route[]>) {
				if (method === "use") {
					router.use(route[0], (route[1] as unknown) as Router);
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
			if (IsRouter(router)) {
				return router as Router;
			}
			throw new Error(`Module at ${modulePath} is not an express router`);
		} catch (error) {
			throw error;
		}
	}

	function fromDecoratedControllers(
		controllers: (ClassType<any> | InstanceType<any> | [ClassType<any> | InstanceType<any>, DecoratedRouterConfig])[],
	) {
		return controllers.reduce((collection: RouteCollection, controller) => {
			let ctor: ClassType<any> = controller as ClassType<any>;
			let config: DecoratedRouterConfig = {};
			if (Array.isArray(controller)) {
				ctor = controller[0];
				config = controller[1];
			}
			const { path, router } = GetRouterFromController(ctor, config);
			if (typeof path === "string") {
				if(collection[path]){
					(collection[path] as Router).use(router); 
				}else{
					collection[path] = router;
				}
			} else {
				console.warn(
					`Controller ${ctor.name} has a non-simple basePath. Use a combination of getRouterFromController and app.use/router.use to mount`,
				);
			}
			return collection;
		}, {});
	}

	return {
		fromPath,
		fromDefinition,
		fromDecoratedControllers,
	};
}
