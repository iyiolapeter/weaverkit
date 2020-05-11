import { Sendable } from "./sendable";
import { Options as EJSOptions } from "ejs";

export interface Renderable {
	render(): Promise<string> | string;
}

export interface EJSRenderConfig {
	data?: Record<string, any>;
	ejsOptions?: EJSOptions;
}

export abstract class Renderer extends Sendable implements Renderable {
	public abstract render(): Promise<string> | string;

	public send() {
		return this.render();
	}
}
