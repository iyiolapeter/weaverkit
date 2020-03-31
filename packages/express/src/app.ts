import { ServerError, ErrorHandler } from "@weaverkit/errors";
import { EventEmitter } from "events";
import { RouteCollection } from "./loader";
import { isRouter } from "./helpers";
import bodyParser from "body-parser";
import express from "express";
import helmet from "helmet";
import cors, { CorsOptions } from "cors";

export class BaseExpressApp extends EventEmitter {
	constructor(protected _app: express.Application, protected _init = true) {
		super();
	}

	get app() {
		if (!this._init) {
			throw new Error("App is not initialized. Call init method first");
		}
		return this._app;
	}

	public init() {
		this._init = true;
	}
}

export interface WeaverExpressAppConfig {
	routes: RouteCollection;
	errorHandler: ErrorHandler;
	cors?: boolean | CorsOptions;
	helmet?: boolean | helmet.IHelmetConfiguration;
	bodyParser?: {
		json?: boolean | bodyParser.OptionsJson;
		urlencoded?: boolean | bodyParser.OptionsUrlencoded;
		text?: boolean | bodyParser.OptionsText;
		raw?: boolean | bodyParser.Options;
	};
}

export enum WeaverExpressAppEvents {
	PREINIT = "preinit",
	INIT = "init",
	ROUTES_WILL_BIND = "routes:willbind",
	ROUTES_DID_BIND = "routes:didbind",
}

export class WeaverExpressApp extends BaseExpressApp {
	constructor(private config: WeaverExpressAppConfig) {
		super(express(), false);
	}

	private extractOptions(options: any) {
		return typeof options === "boolean" ? undefined : options;
	}

	private applyMiddlewares() {
		const { cors: corsOpts, helmet: helmetOpts } = this.config;
		this._app.use(helmet(this.extractOptions(helmetOpts)));
		this._app.use(cors(this.extractOptions(corsOpts)));
		const { json = true, urlencoded = { extended: true }, text = false, raw = false } = this.config.bodyParser || {};
		if (json !== false) {
			this._app.use(bodyParser.json(this.extractOptions(json)));
		}
		if (urlencoded !== false) {
			this._app.use(bodyParser.urlencoded(this.extractOptions(urlencoded)));
		}
		if (text !== false) {
			this._app.use(bodyParser.raw(this.extractOptions(text)));
		}
		if (raw !== false) {
			this._app.use(bodyParser.raw(this.extractOptions(raw)));
		}
	}

	protected preinit() {
		this.applyMiddlewares();
		this.emit(WeaverExpressAppEvents.PREINIT, this._app);
	}

	public init() {
		this.preinit();
		this.bindRoutes();
		this.setErrorHandler();
		super.init();
		this.emit(WeaverExpressAppEvents.INIT, this._app);
	}

	protected setErrorHandler() {
		const { errorHandler } = this.config;
		this._app.use((error: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
			const wrapped = errorHandler.wrap(error);
			errorHandler.handle(wrapped);
			if (res.headersSent) {
				return next(error);
			}
			return res.status(wrapped.httpCode).send(wrapped.format());
		});
	}

	private bindRoutes() {
		this.emit(WeaverExpressAppEvents.ROUTES_WILL_BIND, this._app);
		const { routes } = this.config;
		for (const [route, loc] of Object.entries(routes)) {
			const handler = isRouter(loc)
				? (loc as express.Router)
				: loc instanceof BaseExpressApp
				? loc.app
				: new ServerError(`Handler defined at route ${route} is not an express router or ExpressApp`);
			if (handler instanceof Error) {
				throw handler;
			}
			this._app.use(`/${route}`, handler);
		}
		this.emit(WeaverExpressAppEvents.ROUTES_DID_BIND, this._app);
	}
}
