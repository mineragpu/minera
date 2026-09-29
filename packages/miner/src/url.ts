/**
 * Service URLs: checking the ones the operator gives, and joining routes onto them.
 */

export type UrlCheck = { ok: true; url: string } | { ok: false; problem: string };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Accepts an http(s) URL without credentials and returns it without query, fragment or trailing
 * slashes. With `requireTls`, plain http is accepted only for this machine.
 */
export function checkServiceUrl(value: string, requireTls: boolean): UrlCheck {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, problem: 'must be a full URL that starts with https://' };
  }
  if (url.username || url.password) return { ok: false, problem: 'must not contain a user name or password' };
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || !requireTls))) {
    return {
      ok: false,
      problem: requireTls ? 'must use https. Plain http is allowed only for this machine' : 'must use http or https',
    };
  }
  return { ok: true, url: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
}

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
