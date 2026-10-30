import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { isIP } from 'node:net';

// gym-server's front door, like Supabase's API gateway: /auth/v1 to Auth, /rest/v1 to PostgREST,
// /functions/v1/staff-admin to the staff module, and the two keys swapped for tokens. The service
// token is only ever given to requests from the server PC itself (loopback), and Auth's admin API
// is refused to everyone else, so no PC on the LAN can create or change logins directly.

export type Route =
  | { readonly kind: 'auth'; readonly path: string }
  | { readonly kind: 'rest'; readonly path: string }
  | { readonly kind: 'staff-admin' }
  | { readonly kind: 'health' }
  | { readonly kind: 'info' }
  | { readonly kind: 'admin'; readonly name: string }
  | { readonly kind: 'pair' }
  | { readonly kind: 'not_found' };

function under(url: string, prefix: string): string | null {
  if (url === prefix) return '/';
  if (url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`)) {
    const rest = url.slice(prefix.length);
    return rest.startsWith('?') ? `/${rest}` : rest;
  }
  return null;
}

/** Where a request goes, from its path (with its query). */
export function route(url: string): Route {
  const auth = under(url, '/auth/v1');
  if (auth !== null) return { kind: 'auth', path: auth };
  const rest = under(url, '/rest/v1');
  if (rest !== null) return { kind: 'rest', path: rest };
  const pathOnly = url.split('?')[0];
  if (pathOnly === '/functions/v1/staff-admin') return { kind: 'staff-admin' };
  if (pathOnly === '/server/v1/health') return { kind: 'health' };
  if (pathOnly === '/server/v1/info') return { kind: 'info' };
  if (pathOnly === '/server/v1/pair') return { kind: 'pair' };
  const admin = /^\/server\/v1\/admin\/([a-z-]+)$/.exec(pathOnly ?? '')?.[1];
  if (admin !== undefined) return { kind: 'admin', name: admin };
  return { kind: 'not_found' };
}

export interface GatewayKeys {
  readonly publishableKey: string;
  readonly secretKey: string;
  readonly anonToken: string;
  readonly serviceToken: string;
}

export type Credentials =
  | { readonly ok: true; readonly authorization: string; readonly service: boolean }
  | { readonly ok: false; readonly status: 401 | 403; readonly message: string };

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The Authorization header the request goes on with. The publishable key becomes the anon token
 * and the secret key the service token (loopback only); a session token (a JWT) goes on as it
 * is, and Auth or PostgREST check its signature. Anything else is refused, like Supabase's gateway
 * refuses a request without a known key.
 */
export function credentials(
  headers: IncomingHttpHeaders,
  keys: GatewayKeys,
  fromServerPc: boolean,
): Credentials {
  const apikey = header(headers, 'apikey');
  const bearer = /^Bearer\s+(\S+)$/i.exec(header(headers, 'authorization') ?? '')?.[1];
  const usesSecret = apikey === keys.secretKey || bearer === keys.secretKey;
  if (usesSecret) {
    if (!fromServerPc) return { ok: false, status: 403, message: 'secret_key_not_allowed' };
    return { ok: true, authorization: `Bearer ${keys.serviceToken}`, service: true };
  }
  if (apikey !== keys.publishableKey) {
    return { ok: false, status: 401, message: 'no_api_key' };
  }
  if (bearer === undefined || bearer === keys.publishableKey) {
    return { ok: true, authorization: `Bearer ${keys.anonToken}`, service: false };
  }
  return { ok: true, authorization: `Bearer ${bearer}`, service: false };
}

/** Paths of Auth that need no key, as on Supabase: its health and its public key set. */
export function authPathIsPublic(path: string): boolean {
  const pathOnly = path.split('?')[0];
  return pathOnly === '/health' || pathOnly === '/.well-known/jwks.json';
}

/** Auth's admin API: only the server PC's own tools (with the secret key) may use it. */
export function authPathIsAdmin(path: string): boolean {
  const pathOnly = path.split('?')[0] ?? '';
  return pathOnly === '/admin' || pathOnly.startsWith('/admin/');
}

/** Whether a connection comes from the server PC itself. */
export function isLoopback(address: string | undefined): boolean {
  if (address === undefined) return false;
  const plain = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(plain) === 4) return plain.startsWith('127.');
  return plain === '::1';
}

const CORS_EXPOSE = 'content-range, content-profile, x-supabase-api-version';

function corsHeaders(request: IncomingMessage): Record<string, string> {
  return {
    'access-control-allow-origin': request.headers.origin ?? '*',
    'access-control-expose-headers': CORS_EXPOSE,
    vary: 'Origin',
  };
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { ...corsHeaders(request), 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/** A web-standard handler (the staff module's), served from Node. */
export type FetchHandler = (request: Request) => Promise<Response>;

export interface GatewayOptions {
  readonly keys: GatewayKeys;
  readonly authPort: number;
  readonly restPort: number;
  readonly staffAdmin: FetchHandler;
  /** Whether every program runs: answered to anyone, it holds no data. */
  readonly health: () => unknown;
  /** Which gym and version this is: what a PC shows before it pairs (OF-d). */
  readonly info: () => Promise<unknown>;
  /** The server's own settings (license, first Owner, clock, pairing): from the server PC only. */
  readonly admin?: AdminHandler;
  /**
   * Who on the server PC may use them: the server's secret key (gym-server-admin), anyone while the
   * gym has no staff yet (the first setup), otherwise staff with server.manage. Absent: anyone on
   * the server PC.
   */
  readonly adminAccess?: (headers: IncomingHttpHeaders, name: string) => Promise<boolean>;
  /**
   * The paired PCs (OF-d). When set, every request from another PC needs its pairing token, except
   * the health check, the info, pairing itself and Auth's public paths.
   */
  readonly pairing?: {
    readonly isPaired: (token: string) => boolean;
    readonly pair: (body: unknown) => Promise<AdminAnswer>;
  };
}

/** The header the Windows app adds with its pairing token. */
export const DEVICE_TOKEN_HEADER = 'x-gym-device-token';

/** Routes another PC may use before it is paired (and that hold no gym data). */
export function isOpenRoute(target: Route): boolean {
  return (
    target.kind === 'health' ||
    target.kind === 'info' ||
    target.kind === 'pair' ||
    (target.kind === 'auth' && authPathIsPublic(target.path))
  );
}

export interface AdminAnswer {
  readonly status: number;
  readonly body: unknown;
}

export type AdminHandler = (method: string, name: string, body: unknown) => Promise<AdminAnswer>;

/** The largest admin request body (a license and an activation are under 2 KB). */
const ADMIN_BODY_LIMIT = 64 * 1024;

/** Hop-by-hop headers never go on (RFC 9110), nor the client's own Host. */
const DROPPED = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host']);

function forward(
  request: IncomingMessage,
  response: ServerResponse,
  port: number,
  path: string,
  authorization: string,
): void {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (!DROPPED.has(name) && name !== 'authorization') headers[name] = value;
  }
  if (authorization !== '') headers.authorization = authorization;
  headers.host = `127.0.0.1:${String(port)}`;
  const upstream = http.request(
    { host: '127.0.0.1', port, method: request.method, path, headers },
    (answer) => {
      const out: http.OutgoingHttpHeaders = {};
      for (const [name, value] of Object.entries(answer.headers)) {
        if (!name.startsWith('access-control-') && !DROPPED.has(name)) out[name] = value;
      }
      response.writeHead(answer.statusCode ?? 502, { ...out, ...corsHeaders(request) });
      answer.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent)
      sendJson(request, response, 502, { message: 'upstream_unavailable' });
    else response.destroy();
  });
  request.pipe(upstream);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** The staff module answers web Requests; this turns Node's request into one and back. */
async function serveFetch(
  handler: FetchHandler,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || DROPPED.has(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  const method = request.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(request);
  const answer = await handler(
    new Request(`http://127.0.0.1${request.url ?? '/'}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    }),
  );
  const out: Record<string, string> = {};
  answer.headers.forEach((value, name) => {
    if (!name.startsWith('access-control-')) out[name] = value;
  });
  response.writeHead(answer.status, { ...out, ...corsHeaders(request) });
  response.end(Buffer.from(await answer.arrayBuffer()));
}

/** Reads a small JSON body, answers with what the handler says (500 when it throws). */
function answerJson(
  request: IncomingMessage,
  response: ServerResponse,
  handle: (body: unknown) => Promise<AdminAnswer>,
): void {
  readBody(request)
    .then(async (raw): Promise<AdminAnswer> => {
      if (raw.length > ADMIN_BODY_LIMIT) return { status: 413, body: { error: 'too_large' } };
      let body: unknown = null;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          return { status: 400, body: { error: 'invalid_json' } };
        }
      }
      return handle(body);
    })
    .then(
      (answer) => {
        sendJson(request, response, answer.status, answer.body);
      },
      () => {
        sendJson(request, response, 500, { error: 'internal' });
      },
    );
}

/** gym-server's request handler. */
export function createGateway(options: GatewayOptions): http.RequestListener {
  return (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        ...corsHeaders(request),
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
        'access-control-allow-headers': request.headers['access-control-request-headers'] ?? '*',
        'access-control-max-age': '3600',
      });
      response.end();
      return;
    }
    const target = route(request.url ?? '/');
    const fromServerPc = isLoopback(request.socket.remoteAddress);
    if (target.kind === 'not_found') {
      sendJson(request, response, 404, { message: 'no_route' });
      return;
    }
    if (!fromServerPc && options.pairing && !isOpenRoute(target)) {
      const token = header(request.headers, DEVICE_TOKEN_HEADER);
      if (token === undefined || !options.pairing.isPaired(token)) {
        sendJson(request, response, 401, { message: 'pc_not_paired' });
        return;
      }
    }
    if (target.kind === 'health') {
      sendJson(request, response, 200, options.health());
      return;
    }
    if (target.kind === 'pair') {
      const { pairing } = options;
      if (request.method !== 'POST' || pairing === undefined) {
        sendJson(request, response, 404, { message: 'no_route' });
        return;
      }
      answerJson(request, response, (body) => pairing.pair(body));
      return;
    }
    if (target.kind === 'admin') {
      const { admin, adminAccess } = options;
      if (!fromServerPc || admin === undefined) {
        sendJson(request, response, 403, { message: 'admin_not_allowed' });
        return;
      }
      answerJson(request, response, async (body) => {
        if (adminAccess && !(await adminAccess(request.headers, target.name))) {
          return { status: 403, body: { error: 'not_allowed' } };
        }
        return admin(request.method ?? 'GET', target.name, body);
      });
      return;
    }
    if (target.kind === 'info') {
      options.info().then(
        (info) => {
          sendJson(request, response, 200, info);
        },
        () => {
          sendJson(request, response, 503, { message: 'info_unavailable' });
        },
      );
      return;
    }
    if (target.kind === 'auth' && authPathIsPublic(target.path)) {
      forward(request, response, options.authPort, target.path, '');
      return;
    }
    const allowed = credentials(request.headers, options.keys, fromServerPc);
    if (!allowed.ok) {
      sendJson(request, response, allowed.status, { message: allowed.message });
      return;
    }
    if (target.kind === 'staff-admin') {
      serveFetch(options.staffAdmin, request, response).catch(() => {
        if (!response.headersSent) sendJson(request, response, 500, { error: 'internal' });
        else response.destroy();
      });
      return;
    }
    if (target.kind === 'auth') {
      if (authPathIsAdmin(target.path) && !allowed.service) {
        sendJson(request, response, 403, { message: 'admin_not_allowed' });
        return;
      }
      forward(request, response, options.authPort, target.path, allowed.authorization);
      return;
    }
    forward(request, response, options.restPort, target.path, allowed.authorization);
  };
}
