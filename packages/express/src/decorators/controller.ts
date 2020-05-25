import { MergeRoutes } from "./helpers";
import { RouterOptions } from "express";
import { ClassType } from "../interfaces";
import { SetClassMetadata, METADATA } from "./metadata";

export const Controller = (path: string, options?: RouterOptions) => {
	return <T extends ClassType<any>>(target: T) => {
		SetClassMetadata(METADATA.ROUTER, target, { path, options });
		const parent = Object.getPrototypeOf(target.prototype).constructor;
		if (parent.name !== "Object") {
			MergeRoutes(parent, target);
		}
		return target;
	};
};
