import { Packr } from "msgpackr";

const packr = new Packr({ useRecords: false });

export function encode(data: any): Buffer {
	return packr.pack(data);
}

export function decode(buffer: Buffer | Uint8Array): any {
	return packr.unpack(buffer as Buffer);
}
