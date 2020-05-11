import { render } from "ejs";
import { Renderer, EJSRenderConfig } from "./renderer";

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
