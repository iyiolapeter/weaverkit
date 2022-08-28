import { ErrorHandler, NotFoundError, AppError } from "@weaverkit/errors";
import { EventEmitter } from "events";
import { MountCollection } from "./helpers";
import { RouteCollection } from "./interfaces";
import express from "express";
import helmet from "helmet";
import cors from "cors";

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

export type RenderErrorInterceptor = (
	error: AppError,
	format: any,
	req: express.Request,
	res: express.Response,
) => boolean | Promise<boolean>;
export interface WeaverExpressAppConfig {
	routes: RouteCollection;
	errorHandler: ErrorHandler;
	use404Middleware?: boolean;
	useErrorMiddleware?: boolean;
	renderError?: RenderErrorInterceptor;
	cors?: boolean | cors.CorsOptions;
	helmet?: boolean | Parameters<typeof helmet>[0];
	bodyParser?: {
		json?: boolean | Parameters<typeof express.json>[0];
		urlencoded?: boolean | Parameters<typeof express.urlencoded>[0];
		text?: boolean | Parameters<typeof express.text>[0];
		raw?: boolean | Parameters<typeof express.raw>[0];
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
		const { cors: corsOpts = true, helmet: helmetOpts = true } = this.config;
		if (helmetOpts !== false) {
			this._app.use(helmet(this.extractOptions(helmetOpts)));
		}
		if (corsOpts !== false) {
			this._app.use(cors(this.extractOptions(corsOpts)));
		}
		const { json = true, urlencoded = { extended: true }, text = false, raw = false } = this.config.bodyParser || {};
		if (json !== false) {
			this._app.use(express.json(this.extractOptions(json)));
		}
		if (urlencoded !== false) {
			this._app.use(express.urlencoded(this.extractOptions(urlencoded)));
		}
		if (text !== false) {
			this._app.use(express.text(this.extractOptions(text)));
		}
		if (raw !== false) {
			this._app.use(express.raw(this.extractOptions(raw)));
		}
	}

	protected preinit() {
		this.applyMiddlewares();
		this.emit(WeaverExpressAppEvents.PREINIT, this._app);
	}

	public init() {
		if (!this._init) {
			this.preinit();
			super.init();
			this.bindRoutes();
			this.emit(WeaverExpressAppEvents.INIT, this._app);
			const { use404Middleware = true, useErrorMiddleware = true } = this.config;
			if (use404Middleware) {
				this.applyPageNotFoundMiddleware();
			}
			if (useErrorMiddleware) {
				this.applyErrorHandlerMiddleware();
			}
		}
		return this;
	}

	protected applyPageNotFoundMiddleware() {
		this._app.use(function (req, _res, next) {
			next(new NotFoundError(`Cannot ${req.method} to requested resource ${req.url}`));
		});
	}

	protected applyErrorHandlerMiddleware() {
		const { errorHandler, renderError } = this.config;
		this._app.use(async (caught: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
			const error = errorHandler.handle(caught);
			if (res.headersSent) {
				return next(error);
			}
			const format = errorHandler.format(error);
			if (renderError) {
				const rendered = await renderError(error, format, req, res);
				if (rendered) {
					return;
				}
			}
			return res.status(error.httpCode).send(format);
		});
	}

	private bindRoutes() {
		this.emit(WeaverExpressAppEvents.ROUTES_WILL_BIND, this._app);
		MountCollection(this._app, this.config.routes);
		this.emit(WeaverExpressAppEvents.ROUTES_DID_BIND, this._app);
	}
}
