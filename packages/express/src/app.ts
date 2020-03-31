import { ServerError, ErrorHandler } from "@weaverkit/errors";
import { EventEmitter } from "events";
import { RouteCollection } from "./loader";
import { isRouter } from "./helpers";
import bodyParser from "body-parser";
import express from "express";
import helmet from "helmet";
import cors from "cors";

export class BaseExpressApp extends EventEmitter {
	constructor(public app: express.Application) {
		super();
	}
}

interface ExpressAppConfig {
	routes: RouteCollection;
	errorHandler: ErrorHandler;
}

export class ExpressApp extends BaseExpressApp {
	private routes: RouteCollection;
	private errorHandler: ErrorHandler;

	constructor({ routes, errorHandler }: ExpressAppConfig) {
		super(express());
		this.routes = routes;
		this.errorHandler = errorHandler;
		this.init();
	}

	private init() {
		this.emit("preinit", this);
		this.app.use(cors());
		this.app.use(helmet());
		this.app.use(bodyParser.json());
		this.app.use(bodyParser.urlencoded({ extended: true }));
		this.emit("init", this);
		this.bindRoutes();
		this.setErrorHandler();
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
		this.emit("routes:willbind", this);
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
		this.emit("routes:didbind", this);
	}
}
