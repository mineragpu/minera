/**
 * Appends an absolute route to a base URL, keeping any path prefix the base carries, so a service
 * behind a reverse proxy at `https://host/prefix` is reached at `https://host/prefix/route`.
 */
export function endpoint(base: string, route: string): URL {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${route}`;
  url.search = '';
  url.hash = '';
  return url;
}
