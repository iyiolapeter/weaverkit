import { Router, Response, Request, NextFunction } from "express";
import { PathParams } from "express-serve-static-core";
import type { BaseExpressApp } from "./app";

export { PathParams };

export interface ClassType<T> extends Function {
	new (...args: any[]): T;
}

export type SupportedHttpMethods = "get" | "post" | "put" | "patch" | "delete" | "head" | "trace" | "all";

export type NextMiddlewareSignature = (req: Request, res: Response, next: NextFunction) => any;
export type MiddlewareSignature = (req: Request, res: Response, next?: NextFunction) => any;

export type SubRouter = [PathParams, Router];

export type Route = [PathParams, ...(MiddlewareSignature | NextMiddlewareSignature | MiddlewareSignature[] | NextMiddlewareSignature[])[]];

export interface SubRouterMount {
	use?: SubRouter[];
}

export type RouterDefinition = { [k in SupportedHttpMethods]?: Route[] } & SubRouterMount;

export type RouterPathAlias = string;

export type RouteCollection = Record<string, RouterPathAlias | BaseExpressApp | Router>;

export interface CanUse {
	use: (path: PathParams, handler: any) => any;
}

export interface IncomingRouter {
	router?: Router;
}
