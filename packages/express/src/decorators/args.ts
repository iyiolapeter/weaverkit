import { GetRoutes, SetRoutes, ArgResolver } from "./helpers";
import { METADATA, ARG, RESPONSE_HANDLED } from "./metadata";

const RegisterArgDecorator = (resolver: symbol | ArgResolver, key?: string | symbol) => {
	return (target: any, property: string | symbol, index: number) => {
		const routes = GetRoutes(target, [property]);
		const args: [symbol | ArgResolver, string | symbol | undefined][] = routes[property as any].get(METADATA.ROUTE_ARGS) || [];
		args[index] = [resolver, key];
		if (typeof resolver === "symbol" && [ARG.RESPONSE, ARG.NEXT].includes(resolver)) {
			routes[property as any].set(RESPONSE_HANDLED, true);
		}
		routes[property as any].set(METADATA.ROUTE_ARGS, args);
		SetRoutes(target, routes);
	};
};

export const CreateArgDecorator = (resolver: ArgResolver, key?: string | symbol) => {
	return RegisterArgDecorator(resolver, key);
};

export const Body = (key?: string | symbol) => RegisterArgDecorator(ARG.BODY, key);
export const Param = (key?: string | symbol) => RegisterArgDecorator(ARG.PARAMS, key);
export const Headers = (key?: string | symbol) => RegisterArgDecorator(ARG.HEADERS, key);
export const Query = (key?: string | symbol) => RegisterArgDecorator(ARG.QUERY, key);

export const Req = () => RegisterArgDecorator(ARG.REQUEST);
export const Res = () => RegisterArgDecorator(ARG.RESPONSE);
export const Next = () => RegisterArgDecorator(ARG.NEXT);
