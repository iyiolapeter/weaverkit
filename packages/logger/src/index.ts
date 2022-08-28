import { getUniqueReference } from "@weaverkit/utils";
import { createNamespace, getNamespace } from "cls-hooked";
import path from "path";
import { createLogger, format, transports } from "winston";
import LogRotator from "winston-daily-rotate-file";
import * as Transport from "winston-transport";

export const NAMESPACE = "log";
const namespace = createNamespace(NAMESPACE);

export const getLogNamespace = () => {
	return getNamespace(NAMESPACE);
};

export const UppercaseLevel = format((info) => {
	info.level = info.level.toLocaleUpperCase();
	return info;
});

export const LogContextId = format((info) => {
	const namespace = getNamespace(NAMESPACE);
	if (namespace) {
		const contextId = namespace.get("ContextId");
		const context = namespace.get("context");
		if (contextId) {
			info.ContextId = contextId;
		}
		if (context) {
			info.$context = Object.fromEntries(context);
		}
	}
	return info;
});

export const createContextId = (cb: (error: Error | null, contextId: string | false) => any) => {
	if (!namespace) {
		return cb(null, false);
	}
	const contextId = getUniqueReference();
	namespace.run(() => {
		namespace.set("ContextId", contextId);
		cb(null, contextId);
	});
};

export const Context = {
	create: (cb: (error: Error | null, context: Map<string, any> | false) => any) => {
		if (!namespace) {
			return cb(null, false);
		}
		const context = new Map<string, any>();
		namespace.run(() => {
			namespace.set("context", context);
			cb(null, context);
		});
	},
	get: () => {
		const context = namespace.get("context");
		if (context) {
			return context as Map<string, any>;
		}
		return undefined;
	},
	set: (key: string, value: string) => {
		const context = Context.get();
		if (!context) {
			return false;
		}
		return context.set(key, value);
	},
};

const TRANSPORTS: Record<string, Transport> = {
	console: new transports.Console({
		level: "debug",
		handleExceptions: true,
		format: format.combine(
			format.errors({ stack: true }),
			format.timestamp(),
			UppercaseLevel(),
			LogContextId(),
			format.colorize(),
			format.simple(),
		),
		silent: false,
	}),
};

export const Logger = createLogger({
	transports: Object.values(TRANSPORTS),
});

// export default Logger;

export const LogStream = {
	write: (message: any) => {
		Logger.info(message);
	},
};

export const addFileLogging = (logDir: string) => {
	(TRANSPORTS.file = new LogRotator({
		level: "debug",
		handleExceptions: true,
		format: format.combine(format.errors({ stack: true }), format.timestamp(), UppercaseLevel(), LogContextId(), format.simple()),
		silent: false,
		filename: path.resolve(logDir, "%DATE%.log"),
	})),
		Logger.add(TRANSPORTS.file);
};
