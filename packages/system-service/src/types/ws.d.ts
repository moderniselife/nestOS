declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage } from 'http';
  import { Duplex } from 'stream';

  class WebSocket extends EventEmitter {
    static Server: typeof WebSocketServer;
    static createWebSocketStream: (ws: WebSocket) => Duplex;

    constructor(address: string | URL, options?: WebSocket.ClientOptions);

    binaryType: 'nodebuffer' | 'arraybuffer' | 'fragments';
    bufferedAmount: number;
    extensions: string;
    protocol: string;
    readyState: number;
    url: string;

    close(code?: number, data?: string | Buffer): void;
    ping(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    pong(data?: any, mask?: boolean, cb?: (err: Error) => void): void;
    send(data: any, cb?: (err?: Error) => void): void;
    send(
      data: any,
      options: {
        mask?: boolean;
        binary?: boolean;
        compress?: boolean;
        fin?: boolean;
      },
      cb?: (err?: Error) => void
    ): void;

    terminate(): void;

    // Events
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: WebSocket.Data) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'ping' | 'pong', listener: (data: Buffer) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  namespace WebSocket {
    interface ClientOptions {
      protocol?: string | string[];
      followRedirects?: boolean;
      handshakeTimeout?: number;
      maxRedirects?: number;
      perMessageDeflate?: boolean | PerMessageDeflateOptions;
      protocolVersion?: number;
      origin?: string;
      maxPayload?: number;
      skipUTF8Validation?: boolean;
    }

    interface PerMessageDeflateOptions {
      serverNoContextTakeover?: boolean;
      clientNoContextTakeover?: boolean;
      serverMaxWindowBits?: number;
      clientMaxWindowBits?: number;
      zlibInflateOptions?: {
        chunkSize?: number;
        windowBits?: number;
        level?: number;
        memLevel?: number;
        strategy?: number;
      };
      zlibDeflateOptions?: {
        chunkSize?: number;
        windowBits?: number;
        level?: number;
        memLevel?: number;
        strategy?: number;
      };
      threshold?: number;
      concurrencyLimit?: number;
    }

    type Data = string | Buffer | ArrayBuffer | Buffer[];
  }

  class WebSocketServer extends EventEmitter {
    constructor(options?: WebSocketServer.ServerOptions, callback?: () => void);

    clients: Set<WebSocket>;
    address(): { port: number; family: string; address: string };
    close(cb?: (err?: Error) => void): void;
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      upgradeHead: Buffer,
      callback: (client: WebSocket, request: IncomingMessage) => void
    ): void;
    shouldHandle(request: IncomingMessage): boolean;

    // Events
    on(event: 'connection', cb: (socket: WebSocket, request: IncomingMessage) => void): this;
    on(event: 'error', cb: (error: Error) => void): this;
    on(event: 'headers', cb: (headers: string[], request: IncomingMessage) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }

  namespace WebSocketServer {
    interface ServerOptions {
      host?: string;
      port?: number;
      backlog?: number;
      server?: any;
      verifyClient?: VerifyClientCallbackAsync | VerifyClientCallbackSync;
      handleProtocols?: (protocols: Set<string>, request: IncomingMessage) => string | false;
      path?: string;
      noServer?: boolean;
      clientTracking?: boolean;
      perMessageDeflate?: boolean | WebSocket.PerMessageDeflateOptions;
      maxPayload?: number;
      skipUTF8Validation?: boolean;
    }

    interface VerifyClientCallbackAsync {
      (
        info: { origin: string; secure: boolean; req: IncomingMessage },
        callback: (res: boolean, code?: number, message?: string, headers?: object) => void
      ): void;
    }

    interface VerifyClientCallbackSync {
      (info: { origin: string; secure: boolean; req: IncomingMessage }):
        | boolean
        | { result: boolean; code?: number; message?: string; headers?: object };
    }
  }

  export = WebSocket;
}