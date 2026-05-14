import { EventEmitter } from "events";
import { AppError, ServiceUnavailableError } from "@weaverkit/errors";
import { nanoid } from "nanoid";
import { encode, decode } from "./codec";
import type { RpcSyn, RpcReply, RpcCallOptions, RpcClientOptions } from "./types";

const DEFAULT_ACK_TIMEOUT = 2000;
const DEFAULT_REPLY_TIMEOUT = 30000;
const PAYLOAD_KEY_TTL = 60; // seconds

interface PendingCall {
	resolve: (value: any) => void;
	reject: (error: Error) => void;
	emitter: EventEmitter;
	ackTimer: ReturnType<typeof setTimeout>;
	replyTimer: ReturnType<typeof setTimeout> | null;
	ackTimeout: number;
	replyTimeout: number;
	acked: boolean;
	service: string;
	action: string;
	payload: any;
}

export interface RpcCallHandle<T = any> extends Promise<T> {
	on(event: "event", listener: (name: string, data: any) => void): this;
}

export class RpcClient {
	private readonly clientId: string;
	private readonly replyChannel: string;
	private readonly adapter: any;
	private readonly defaultAckTimeout: number;
	private readonly defaultReplyTimeout: number;

	private subscriber!: any;
	private commander!: any;
	private pending = new Map<string, PendingCall>();

	constructor(options: RpcClientOptions) {
		this.adapter = options.redis;
		this.defaultAckTimeout = options.ackTimeout ?? DEFAULT_ACK_TIMEOUT;
		this.defaultReplyTimeout = options.replyTimeout ?? DEFAULT_REPLY_TIMEOUT;
		this.clientId = nanoid();
		this.replyChannel = `rpc:reply:${this.clientId}`;
	}

	public async connect(): Promise<void> {
		const subAdapter = this.adapter.clone({ prefix: "" });
		this.subscriber = subAdapter.connection;

		const cmdAdapter = this.adapter.clone({ prefix: "" });
		this.commander = cmdAdapter.connection;

		this.subscriber.on("messageBuffer", (_channel: Buffer, message: Buffer) => {
			this.handleMessage(decode(message) as RpcReply);
		});

		await this.subscriber.subscribe(this.replyChannel);
	}

	public async disconnect(): Promise<void> {
		for (const [, pending] of this.pending) {
			clearTimeout(pending.ackTimer);
			if (pending.replyTimer) clearTimeout(pending.replyTimer);
			pending.reject(new ServiceUnavailableError("RPC client disconnecting"));
		}
		this.pending.clear();
		this.subscriber?.disconnect();
		this.commander?.disconnect();
	}

	public call<T = any>(service: string, action: string, payload: any, options?: RpcCallOptions): RpcCallHandle<T> {
		const correlationId = nanoid();
		const emitter = new EventEmitter();
		const ackTimeout = options?.ackTimeout ?? this.defaultAckTimeout;
		const replyTimeout = options?.replyTimeout ?? this.defaultReplyTimeout;

		const promise = new Promise<T>((resolve, reject) => {
			const ackTimer = setTimeout(() => {
				this.pending.delete(correlationId);
				reject(new ServiceUnavailableError(`RPC ack timeout for ${service}/${action}`).setServiceName(service));
			}, ackTimeout);

			this.pending.set(correlationId, {
				resolve,
				reject,
				emitter,
				ackTimer,
				replyTimer: null,
				ackTimeout,
				replyTimeout,
				acked: false,
				service,
				action,
				payload,
			});

			// Push SYN only (payload deferred until ACK)
			const syn: RpcSyn = {
				correlationId,
				replyTo: this.replyChannel,
				action,
				timestamp: Date.now(),
			};
			this.commander.rpush(`rpc:syn:${service}`, encode(syn)).catch((err: Error) => {
				this.cleanupPending(correlationId);
				reject(err);
			});
		});

		const handle = promise as RpcCallHandle<T>;
		handle.on = (event: string, listener: (...args: any[]) => void) => {
			emitter.on(event, listener);
			return handle;
		};
		return handle;
	}

	private handleMessage(reply: RpcReply): void {
		const pending = this.pending.get(reply.correlationId);
		if (!pending) return;

		switch (reply.type) {
			case "ack": {
				if (pending.acked) return;
				pending.acked = true;
				clearTimeout(pending.ackTimer);
				pending.replyTimer = this.startReplyTimer(reply.correlationId, pending);

				// Push payload now that a worker is alive
				const payloadKey = `rpc:req:${reply.correlationId}`;
				this.commander
					.rpush(payloadKey, encode({ payload: pending.payload }))
					.then(() => this.commander.expire(payloadKey, PAYLOAD_KEY_TTL))
					.catch((err: Error) => {
						this.cleanupPending(reply.correlationId);
						pending.reject(err);
					});
				break;
			}
			case "event": {
				if (pending.replyTimer) clearTimeout(pending.replyTimer);
				pending.replyTimer = this.startReplyTimer(reply.correlationId, pending);
				pending.emitter.emit("event", reply.name, reply.data);
				break;
			}
			case "result": {
				this.cleanupPending(reply.correlationId);
				pending.resolve(reply.data);
				break;
			}
			case "error": {
				this.cleanupPending(reply.correlationId);
				pending.reject(AppError.deserialize(reply.error));
				break;
			}
		}
	}

	private startReplyTimer(correlationId: string, pending: PendingCall): ReturnType<typeof setTimeout> {
		return setTimeout(() => {
			this.pending.delete(correlationId);
			pending.reject(new ServiceUnavailableError("RPC reply timeout").setServiceName("rpc"));
		}, pending.replyTimeout);
	}

	private cleanupPending(correlationId: string): void {
		const pending = this.pending.get(correlationId);
		if (pending) {
			clearTimeout(pending.ackTimer);
			if (pending.replyTimer) clearTimeout(pending.replyTimer);
			this.pending.delete(correlationId);
		}
	}
}
