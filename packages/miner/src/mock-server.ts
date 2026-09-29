/**
 * A local HTTP server on an ephemeral port that stands in for the model runtime or the
 * coordinator in tests. It records every request and answers with whatever the handler returns.
 */

import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  /** Path and query, as received. */
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface MockReply {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export type MockHandler = (request: RecordedRequest) => MockReply | Promise<MockReply>;

export interface MockServer {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

export async function startMockServer(handler: MockHandler): Promise<MockServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', async () => {
      const request: RecordedRequest = {
        method: incoming.method ?? '',
        url: incoming.url ?? '',
        headers: incoming.headers,
        body: Buffer.concat(chunks),
      };
      requests.push(request);
      try {
        const reply = await handler(request);
        const body = reply.json === undefined ? (reply.text ?? '') : JSON.stringify(reply.json);
        const type = reply.json === undefined ? 'text/plain' : 'application/json';
        outgoing.writeHead(reply.status ?? 200, { 'content-type': type, ...reply.headers });
        outgoing.end(body);
      } catch {
        if (!outgoing.headersSent) outgoing.writeHead(500);
        outgoing.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
