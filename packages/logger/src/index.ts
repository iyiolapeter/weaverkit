import { getUniqueReference } from "@weaverkit/utils";
import { createNamespace, getNamespace } from "cls-hooked";
import path from "path";
import winston from "winston";
import LogRotator from "winston-daily-rotate-file";

export const NAMESPACE = "log";
const logNamespace = createNamespace(NAMESPACE);

export const getLogNamespace = () => {
	return getNamespace(NAMESPACE);
};

const { createLogger, format, transports } = winston;
let tracing = false;
const logExtras = format((info) => {
	if (tracing) {
		info.level = info.level.toLocaleUpperCase();
		const namespace = getNamespace(NAMESPACE);
		if (namespace) {
			const context = namespace.get("context");
			if (context) {
				info.context = context;
			}
		}
	}
	return info;
});

export const requestTracer = () => {
	tracing = true;
	return (req: any, res: any, next: any) => {
		if (logNamespace) {
			const context = getUniqueReference();
			res.set("X-Context-Id", context);
			logNamespace.run(() => {
				logNamespace.set("context", context);
				next();
			});
		} else {
			next();
		}
	};
};

export const Logger = createLogger({
	transports: [
		new transports.Console({
			level: "debug",
			handleExceptions: true,
			format: format.combine(format.errors({ stack: true }), logExtras(), format.colorize(), format.simple()),
			silent: false,
		}),
	],
});

// export default Logger;

export const LogStream = {
	write: (message: any) => {
		Logger.info(message);
	},
};

export const addFileLogging = (logDir: string) => {
	Logger.add(
		new LogRotator({
			level: "debug",
			handleExceptions: true,
			format: format.combine(format.errors({ stack: true }), format.timestamp(), logExtras(), format.simple()),
			silent: false,
			filename: path.resolve(logDir, "%DATE%.log"),
		}),
	);
};
