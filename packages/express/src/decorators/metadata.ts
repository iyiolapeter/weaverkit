import "reflect-metadata";
import { ClassType } from "../interfaces";

export const METADATA = Object.freeze({
	ROUTES: Symbol("Routes"),
	ROUTE_ARGS: Symbol("RouteArgs"),
	VERB: Symbol("Verb"),
	MIDDLEWARES: Symbol("Middlewares"),
	ROUTER: Symbol("Router"),
	METHOD_PROPS: Symbol("MethodProps"),
});

export const ARG = Object.freeze({
	BODY: Symbol("Body"),
	HEADER: Symbol("Header"),
	NEXT: Symbol("Next"),
	PARAMS: Symbol("Params"),
	QUERY: Symbol("Query"),
	REQUEST: Symbol("Request"),
	RESPONSE: Symbol("Response"),
});

export const RESPONSE_HANDLED = Symbol("ResponseHandled");

export const GetPropertyMetadata = <T = any>(key: string | symbol, target: any, property: string | symbol, onNotExist?: T) => {
	const data: T = Reflect.getOwnMetadata(key, target, property);
	if (!data && onNotExist) {
		return onNotExist;
	}
	return data;
};

export const SetPropertyMetadata = (key: string | symbol, target: any, property: string | symbol, data: any) => {
	Reflect.defineMetadata(key, data, target, property);
};

export const GetClassMetadata = <T = any>(key: string | symbol, target: any, onNotExist?: T): T => {
	const data = Reflect.getOwnMetadata(key, target);
	if (!data && onNotExist) {
		return onNotExist;
	}
	return data;
};

export const SetClassMetadata = (key: string | symbol, target: ClassType<any>, data: any) => {
	Reflect.defineMetadata(key, data, target);
};
