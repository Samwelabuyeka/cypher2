// Stub declarations for missing modules to allow standalone compilation

declare module 'gadget-server' {
  export type Logger = any;
  export const api: any;
  export const logger: any;
  export const connections: any;
  export const email: any;
}

declare module 'fastify' {
  export function fastify(options?: any): any;
  export type FastifyRequest = any;
  export type FastifyReply = any;
  export default fastify;
}

declare module 'ethers' {
  export const ethers: any;
  export const Contract: any;
  export const Wallet: any;
  export const providers: any;
  export const utils: any;
  export const constants: any;
  export default ethers;
}

declare module 'ccxt' {
  const ccxt: any;
  export type Exchange = any;
  export default ccxt;
}

declare module 'ws' {
  export class WebSocket {
    static OPEN: number;
    static CLOSED: number;
    readonly readyState: number;
    constructor(address: string, protocols?: string | string[]);
    send(data: any, callback?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    on(event: string, listener: (...args: any[]) => void): this;
    [key: string]: any;
  }
  export class WebSocketServer {
    constructor(options: { server?: any; path?: string; port?: number; [key: string]: any });
    on(event: string, listener: (...args: any[]) => void): this;
    close(callback?: (err?: Error) => void): void;
    [key: string]: any;
  }
  export default WebSocket;
}