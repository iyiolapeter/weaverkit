import { resolve } from "path";
import { render, renderFile, Options as EJSOptions } from "ejs";
import { Sendable } from "./sendable";

export interface Layout {
	name: string;
	params?: Record<string, any>;
	contentVar?: string;
}

export interface ViewConfigureOptions {
	path: string;
	extension?: string;
	layoutDir?: string;
}

export interface Renderable {
	render(): Promise<string> | string;
}

export abstract class Renderer extends Sendable implements Renderable {
	public abstract render(): Promise<string> | string;

	public send() {
		return this.render();
	}
}

export interface EJSRenderConfig {
	data?: Record<string, any>;
	ejsOptions?: EJSOptions;
}

export interface ContentConfig extends EJSRenderConfig {
	template: string;
}

export class Content extends Renderer {
	constructor(private config: ContentConfig) {
		super();
	}

	public async render() {
		return render(this.config.template, this.config.data, this.config.ejsOptions);
	}
}

export interface ViewConfig extends EJSRenderConfig {
	name: string;
	layout?: Layout;
}

export abstract class BaseView extends Renderer {
	protected abstract path: string;
	protected abstract extension: string;
	protected abstract layoutsDir: string;

	public self: typeof BaseView;

	constructor(public config: ViewConfig) {
		super();
		this.self = new.target;
	}

	public static normalize(view: string, folder: string, ext: string) {
		ext = `.${ext}`;
		if (view.endsWith("/")) {
			view += `index${ext}`;
		}
		if (!view.startsWith("//") && view.startsWith("/")) {
			view = view.substring(1);
		}
		return resolve(folder, `${view}${view.endsWith(ext) ? "" : ext}`);
	}

	public async render() {
		const { name, data = {}, layout } = this.config;
		let view = this.self.normalize(name, this.path, this.extension);
		if (layout) {
			data.layout = layout.params || {};
			data.layout[layout.contentVar || "content"] = view;
			view = this.self.normalize(`${this.layoutsDir}/${layout.name}`, this.path, this.extension);
		}
		return renderFile(view, data, this.config.ejsOptions);
	}
}

export const ViewFactory = ({ path, extension = "ejs", layoutDir = "layouts" }: ViewConfigureOptions) => {
	return class View extends BaseView {
		public path: string = path;
		public extension: string = extension;
		public layoutsDir: string = layoutDir;
	};
};
