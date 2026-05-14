import type { SerializedAppError } from "@weaverkit/errors";
import type { RedisStorageAdapter } from "@weaverkit/adapters.redis";

// --- SYN (pushed to rpc:syn:{service} list) ---

export interface RpcSyn {
	correlationId: string;
	replyTo: string;
	action: string;
	timestamp: number;
}

// --- Payload (pushed to rpc:req:{correlationId} list) ---

export interface RpcPayload {
	payload: any;
}

// --- Reply messages (published to rpc:reply:{clientId} channel) ---

export interface RpcAck {
	type: "ack";
	correlationId: string;
}

export interface RpcEvent {
	type: "event";
	correlationId: string;
	name: string;
	data: any;
}

export interface RpcResult {
	type: "result";
	correlationId: string;
	data: any;
}

export interface RpcError {
	type: "error";
	correlationId: string;
	error: SerializedAppError;
}

export type RpcReply = RpcAck | RpcEvent | RpcResult | RpcError;

// --- Handler context (passed to registered server handlers) ---

export interface RpcHandlerContext<T = any> {
	action: string;
	payload: T;
	correlationId: string;
	emit(name: string, data?: any): void;
}

export type RpcHandler<T = any, R = any> = (ctx: RpcHandlerContext<T>) => Promise<R>;

// --- Logger ---

export type LogLevel = "error" | "warn" | "info" | "debug";

export type RpcLogger = (level: LogLevel, message: string, meta?: Record<string, any>) => void;

// --- Options ---

export interface RpcClientOptions {
	redis: RedisStorageAdapter;
	ackTimeout?: number;
	replyTimeout?: number;
}

export interface RpcServerOptions {
	redis: RedisStorageAdapter;
	service: string;
	concurrency?: number;
	ackTimeout?: number;
	logger?: RpcLogger;
}

export interface RpcCallOptions {
	ackTimeout?: number;
	replyTimeout?: number;
}
