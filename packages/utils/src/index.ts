import shortid from "shortid";
import { v4 as uuidv4 } from "uuid";

// tslint:disable-next-line: no-empty
export const noop = (..._args: any[]): any => {}; // eslint-disable-line @typescript-eslint/no-empty-function,@typescript-eslint/no-unused-vars

export const getNumberReference = () => {
	return new Date().valueOf();
};

export const getUniqueReference = () => {
	return uuidv4();
};

export const getShortId = () => {
	return shortid.generate();
};

export const getRandom = (digits: number) => {
	// tslint:disable-next-line: radix
	return Math.floor(Math.random() * parseInt("8" + "9".repeat(digits - 1)) + parseInt("1" + "0".repeat(digits - 1)));
};
