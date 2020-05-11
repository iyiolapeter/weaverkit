import { resolve } from "path";
import { renderFile } from "ejs";
import { EJSRenderConfig, Renderer } from "./renderer";

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
		const { name, data = {} } = this.config;
		let view = this.self.normalize(name, this.path, this.extension);
		const content = await renderFile(view, data, this.config.ejsOptions);
		const layout = this.config.layout;
		if (!layout) {
			return content;
		}
		view = this.self.normalize(`${this.layoutsDir}/${layout.name}`, this.path, this.extension);
		return renderFile(
			view,
			{
				params: layout.params,
				[layout.contentVar || "content"]: content,
				context: this,
			},
			this.config.ejsOptions,
		);
	}
}

export const ViewFactory = ({ path, extension = "ejs", layoutDir = "layouts" }: ViewConfigureOptions) => {
	return class View extends BaseView {
		public path: string = path;
		public extension: string = extension;
		public layoutsDir: string = layoutDir;
	};
};
