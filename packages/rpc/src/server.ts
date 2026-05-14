import { EventEmitter } from "events";
import { AppError, ConflictError, NotFoundError, ServerError } from "@weaverkit/errors";
import { encode, decode } from "./codec";
import type { RpcSyn, RpcPayload, RpcReply, RpcHandler, RpcHandlerContext, RpcServerOptions, RpcLogger } from "./types";

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_ACK_TIMEOUT = 2000;
const BLPOP_TIMEOUT = 5; // seconds — finite for graceful shutdown
const PAYLOAD_BLPOP_TIMEOUT = 60; // seconds — matches req key TTL
const REPLY_CHANNEL_PATTERN = /^rpc:reply:[A-Za-z0-9_-]{1,64}$/;

export enum RpcServerEvents {
	SYN_REJECTED = "syn:rejected",
	HANDLER_START = "handler:start",
	HANDLER_END = "handler:end",
	HANDLER_ERROR = "handler:error",
	PAYLOAD_TIMEOUT = "payload:timeout",
}

const defaultLogger: RpcLogger = (level, message, meta) => {
	if (meta) console[level](message, meta);
	else console[level](message);
};

export class RpcServer {
	private readonly service: string;
	private readonly concurrency: number;
	private readonly ackTimeout: number;
	private readonly adapter: any;
	private readonly logger: RpcLogger;
	private readonly handlers = new Map<string, RpcHandler>();
	private readonly emitter = new EventEmitter();
	private publisher!: any;
	private listenerConns: any[] = [];
	private loopPromises: Promise<void>[] = [];
	private running = false;

	constructor(options: RpcServerOptions) {
		this.adapter = options.redis;
		this.service = options.service;
		this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
		this.ackTimeout = options.ackTimeout ?? DEFAULT_ACK_TIMEOUT;
		this.logger = options.logger ?? defaultLogger;
	}

	public on(event: RpcServerEvents, listener: (payload: any) => void): this {
		this.emitter.on(event, listener);
		return this;
	}

	public off(event: RpcServerEvents, listener: (payload: any) => void): this {
		this.emitter.off(event, listener);
		return this;
	}

	public once(event: RpcServerEvents, listener: (payload: any) => void): this {
		this.emitter.once(event, listener);
		return this;
	}

	public removeAllListeners(event?: RpcServerEvents): this {
		this.emitter.removeAllListeners(event);
		return this;
	}

	public register<T = any, R = any>(action: string, handler: RpcHandler<T, R>): void {
		if (this.handlers.has(action)) {
			throw new ConflictError(`RPC action "${action}" is already registered on service "${this.service}"`);
		}
		this.handlers.set(action, handler);
	}

	public async start(): Promise<void> {
		this.running = true;

		// Publisher connection (shared by all handlers)
		const pubAdapter = this.adapter.clone({ prefix: "" } as any);
		this.publisher = pubAdapter.connection;

		// Start N BLPOP listener loops
		for (let i = 0; i < this.concurrency; i++) {
			const listenerAdapter = this.adapter.clone({ prefix: "" } as any);
			const conn = listenerAdapter.connection;
			this.listenerConns.push(conn);
			this.loopPromises.push(this.listenLoop(conn));
		}
	}

	public async stop(): Promise<void> {
		this.running = false;
		// Each listener exits its loop after at most BLPOP_TIMEOUT + handler runtime
		await Promise.allSettled(this.loopPromises);
		for (const conn of this.listenerConns) {
			conn.disconnect();
		}
		this.publisher?.disconnect();
		this.listenerConns = [];
		this.loopPromises = [];
	}

	private async drainStale(conn: any): Promise<void> {
		const synKey = `rpc:syn:${this.service}`;
		// Non-blocking drain of stale SYNs accumulated during downtime
		while (true) {
			const raw = await conn.lpopBuffer(synKey);
			if (!raw) break;
			const syn = decode(raw) as RpcSyn;
			if (Date.now() - syn.timestamp <= this.ackTimeout) {
				// Fresh SYN found — process it immediately
				await this.handleSyn(conn, syn);
			}
			// else: stale, discard
		}
	}

	private async listenLoop(conn: any): Promise<void> {
		const synKey = `rpc:syn:${this.service}`;

		// Drain stale SYNs once at startup
		await this.drainStale(conn);

		while (this.running) {
			try {
				const result = await conn.blpopBuffer(synKey, BLPOP_TIMEOUT);
				if (!result) continue; // timeout, check running flag and loop

				const syn = decode(result[1]) as RpcSyn;
				if (Date.now() - syn.timestamp > this.ackTimeout) {
					this.emitter.emit(RpcServerEvents.SYN_REJECTED, {
						correlationId: syn.correlationId,
						action: syn.action,
						replyTo: syn.replyTo,
						reason: "stale",
					});
					continue;
				}

				// Awaited so a slow payload-BLPOP can't queue behind the loop's
				// next SYN-BLPOP on the same connection. Real concurrency = N listeners.
				try {
					await this.handleSyn(conn, syn);
				} catch (err) {
					this.logger("error", `[rpc:${this.service}] handler error for action "${syn.action}"`, {
						err,
						correlationId: syn.correlationId,
					});
				}
			} catch (err) {
				if (!this.running) break;
				this.logger("error", `[rpc:${this.service}] listener error`, { err });
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	}

	private async handleSyn(conn: any, syn: RpcSyn): Promise<void> {
		const { correlationId, replyTo, action } = syn;

		// Reject SYNs whose replyTo doesn't conform to the protocol — protects against
		// a malformed/malicious client directing replies to arbitrary Redis channels.
		if (typeof replyTo !== "string" || !REPLY_CHANNEL_PATTERN.test(replyTo)) {
			this.logger("warn", `[rpc:${this.service}] dropped SYN with invalid replyTo`, {
				correlationId,
				replyTo,
				action,
			});
			this.emitter.emit(RpcServerEvents.SYN_REJECTED, {
				correlationId,
				action,
				replyTo,
				reason: "invalid-replyTo",
			});
			return;
		}

		// Check if action is registered
		const handler = this.handlers.get(action);
		if (!handler) {
			await this.publishReply(replyTo, {
				type: "error",
				correlationId,
				error: new NotFoundError(`RPC action "${action}" is not registered on service "${this.service}"`).serialize(),
			});
			this.emitter.emit(RpcServerEvents.SYN_REJECTED, {
				correlationId,
				action,
				replyTo,
				reason: "unknown-action",
			});
			return;
		}

		// Send ACK
		await this.publishReply(replyTo, { type: "ack", correlationId });

		// Wait for payload
		const payloadKey = `rpc:req:${correlationId}`;
		const payloadResult = await conn.blpopBuffer(payloadKey, PAYLOAD_BLPOP_TIMEOUT);

		if (!payloadResult) {
			// Caller died after ACK — orphaned correlation
			this.logger("warn", `[rpc:${this.service}] orphaned correlation — no payload received`, {
				correlationId,
			});
			this.emitter.emit(RpcServerEvents.PAYLOAD_TIMEOUT, { correlationId, action });
			return;
		}

		const { payload } = decode(payloadResult[1]) as RpcPayload;

		// Build handler context
		const ctx: RpcHandlerContext = {
			action,
			payload,
			correlationId,
			emit: (name: string, data?: any) => {
				// Best-effort, fire-and-forget
				this.publishReply(replyTo, { type: "event", correlationId, name, data }).catch(() => {});
			},
		};

		// Execute handler
		this.emitter.emit(RpcServerEvents.HANDLER_START, { correlationId, action });
		const handlerStart = Date.now();
		try {
			const result = await handler(ctx);
			await this.publishReply(replyTo, { type: "result", correlationId, data: result });
			this.emitter.emit(RpcServerEvents.HANDLER_END, {
				correlationId,
				action,
				durationMs: Date.now() - handlerStart,
			});
		} catch (err) {
			const durationMs = Date.now() - handlerStart;
			let appError: AppError;
			if (err instanceof AppError) {
				appError = err;
			} else {
				// Don't leak raw exception messages (DB errors, file paths, etc.) to the caller.
				// Log server-side; the caller gets a generic message correlatable via correlationId.
				this.logger("error", `[rpc:${this.service}] handler "${action}" threw non-AppError`, {
					err,
					correlationId,
				});
				appError = new ServerError("Internal server error");
			}
			await this.publishReply(replyTo, {
				type: "error",
				correlationId,
				error: appError.serialize(),
			});
			this.emitter.emit(RpcServerEvents.HANDLER_ERROR, {
				correlationId,
				action,
				durationMs,
				error: err as Error,
			});
		}
	}

	private async publishReply(channel: string, reply: RpcReply): Promise<void> {
		await this.publisher.publish(channel, encode(reply));
	}
}
