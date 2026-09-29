import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** The body bytes exactly as received; node signatures cover these, not the parsed JSON. */
    rawBody: Buffer | null;
  }
}

/** Parse JSON bodies as usual while keeping the original bytes on the request. */
export function keepRawJsonBodies(app: FastifyInstance): void {
  app.decorateRequest('rawBody', null);
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const bytes = body as Buffer;
    request.rawBody = bytes;
    parseJson(request, bytes.toString('utf8'), done);
  });
}
