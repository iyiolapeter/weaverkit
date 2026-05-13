import { AppError, ConflictError, NotFoundError, ServerError } from "@weaverkit/errors";
import { Logger } from "@weaverkit/logger";
import { encode, decode } from "./codec";
import type { RpcSyn, RpcPayload, RpcReply, RpcHandler, RpcHandlerContext, RpcServerOptions } from "./types";

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_ACK_TIMEOUT = 2000;
const BLPOP_TIMEOUT = 5; // seconds — finite for graceful shutdown
const PAYLOAD_BLPOP_TIMEOUT = 60; // seconds — matches req key TTL

export class RpcServer {
	private readonly service: string;
	private readonly concurrency: number;
	private readonly ackTimeout: number;
	private readonly adapter: any;
	private readonly handlers = new Map<string, RpcHandler>();
	private publisher!: any;
	private listeners: any[] = [];
	private loopPromises: Promise<void>[] = [];
	private running = false;

	constructor(options: RpcServerOptions) {
		this.adapter = options.redis;
		this.service = options.service;
		this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
		this.ackTimeout = options.ackTimeout ?? DEFAULT_ACK_TIMEOUT;
	}

	public register<T = any, R = any>(action: string, handler: RpcHandler<T, R>): void {
		if (this.handlers.has(action)) {
			throw new ConflictError(
				`RPC action "${action}" is already registered on service "${this.service}"`,
			);
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
			this.listeners.push(conn);
			this.loopPromises.push(this.listenLoop(conn));
		}
	}

	public async stop(): Promise<void> {
		this.running = false;
		// Each listener exits its loop after at most BLPOP_TIMEOUT + handler runtime
		await Promise.allSettled(this.loopPromises);
		for (const conn of this.listeners) {
			conn.disconnect();
		}
		this.publisher?.disconnect();
		this.listeners = [];
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
					continue; // stale
				}

				// Awaited so a slow payload-BLPOP can't queue behind the loop's
				// next SYN-BLPOP on the same connection. Real concurrency = N listeners.
				try {
					await this.handleSyn(conn, syn);
				} catch (err) {
					Logger.error(`[rpc:${this.service}] handler error for action "${syn.action}"`, {
						err,
						correlationId: syn.correlationId,
					});
				}
			} catch (err) {
				if (!this.running) break;
				Logger.error(`[rpc:${this.service}] listener error`, { err });
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	}

	private async handleSyn(conn: any, syn: RpcSyn): Promise<void> {
		const { correlationId, replyTo, action } = syn;

		// Check if action is registered
		const handler = this.handlers.get(action);
		if (!handler) {
			await this.publishReply(replyTo, {
				type: "error",
				correlationId,
				error: new NotFoundError(
					`RPC action "${action}" is not registered on service "${this.service}"`,
				).serialize(),
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
			Logger.warn(`[rpc:${this.service}] orphaned correlation — no payload received`, {
				correlationId,
			});
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
		try {
			const result = await handler(ctx);
			await this.publishReply(replyTo, { type: "result", correlationId, data: result });
		} catch (err) {
			const appError = err instanceof AppError ? err : new ServerError((err as Error).message);
			await this.publishReply(replyTo, {
				type: "error",
				correlationId,
				error: appError.serialize(),
			});
		}
	}

	private async publishReply(channel: string, reply: RpcReply): Promise<void> {
		await this.publisher.publish(channel, encode(reply));
	}
}
