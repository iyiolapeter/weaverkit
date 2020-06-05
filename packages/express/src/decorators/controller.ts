import { MergeRoutes } from "./helpers";
import { RouterOptions } from "express";
import { ClassType } from "../interfaces";
import { SetClassMetadata, METADATA } from "./metadata";

export interface ControllerOptions {
	routerOptions?: RouterOptions;
	children?: (ClassType<any> | InstanceType<any>)[];
}

export const Controller = (path: string, options?: ControllerOptions) => {
	return <T extends ClassType<any>>(target: T) => {
		SetClassMetadata(METADATA.ROUTER, target, { path, options });
		const parent = Object.getPrototypeOf(target.prototype).constructor;
		if (parent.name !== "Object") {
			MergeRoutes(parent, target);
		}
		return target;
	};
};
