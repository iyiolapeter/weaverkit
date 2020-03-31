import { ServerError, ErrorHandler } from "@weaverkit/errors";
import { EventEmitter } from "events";
import { RouteCollection } from "./loader";
import { isRouter } from "./helpers";
import bodyParser from "body-parser";
import express from "express";
import helmet from "helmet";
import cors from "cors";

export class BaseExpressApp extends EventEmitter {
	constructor(private _app: express.Application, protected _init = true) {
		super();
	}

	get app() {
		if (!this._init) {
			throw new Error("App is not initialized. Call init method first");
		}
		return this._app;
	}
}

export interface WeaverExpressAppConfig {
	routes: RouteCollection;
	errorHandler: ErrorHandler;
}

export enum WeaverExpressAppEvents {
	PREINIT = "preinit",
	INIT = "init",
	ROUTES_WILL_BIND = "routes:willbind",
	ROUTES_DID_BIND = "routes:didbind",
}

export class WeaverExpressApp extends BaseExpressApp {
	private routes: RouteCollection;
	private errorHandler: ErrorHandler;

	constructor({ routes, errorHandler }: WeaverExpressAppConfig) {
		super(express(), false);
		this.routes = routes;
		this.errorHandler = errorHandler;
	}

	protected preinit() {
		this.emit(WeaverExpressAppEvents.PREINIT, this.app);
		this.app.use(cors());
		this.app.use(helmet());
		this.app.use(bodyParser.json());
		this.app.use(bodyParser.urlencoded({ extended: true }));
	}

	public init() {
		this.preinit();
		this.emit(WeaverExpressAppEvents.INIT, this.app);
		this.bindRoutes();
		this.setErrorHandler();
		this._init = true;
	}

	protected setErrorHandler() {
		this.app.use((error: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
			const wrapped = this.errorHandler.wrap(error);
			this.errorHandler.handle(wrapped);
			if (res.headersSent) {
				return next(error);
			}
			return res.status(wrapped.httpCode).send(wrapped.format());
		});
	}

	private bindRoutes() {
		this.emit(WeaverExpressAppEvents.ROUTES_WILL_BIND, this.app);
		for (const [route, loc] of Object.entries(this.routes)) {
			const handler = isRouter(loc)
				? (loc as express.Router)
				: loc instanceof BaseExpressApp
				? loc.app
				: new ServerError(`Handler defined at route ${route} is not an express router or ExpressApp`);
			if (handler instanceof Error) {
				throw handler;
			}
			this.app.use(`/${route}`, handler);
		}
		this.emit(WeaverExpressAppEvents.ROUTES_DID_BIND, this.app);
	}
}
