export type Stage =
  | 'cache'
  | 'dns'
  | 'tcp'
  | 'tls'
  | 'request'
  | 'server'
  | 'response';
export type Preset = 'cold' | 'warm' | 'fresh' | 'revalidate';
export type Fault =
  | 'none'
  | 'dns'
  | 'certificate'
  | 'timeout'
  | 'server'
  | 'offline';
export interface Config {
  preset: Preset;
  method: 'GET' | 'POST';
  fault: Fault;
  latency: number;
  serverDelay: number;
  path: string;
}
export interface Step {
  stage: Stage;
  title: string;
  detail: string;
  duration: number;
  at: number;
  kind: 'normal' | 'success' | 'error' | 'cached';
}
export interface Journey {
  steps: Step[];
  status: number | null;
  statusText: string;
  outcome: 'success' | 'network-error' | 'http-error';
  source: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  body: string;
  wireBody: string;
  total: number;
  network: boolean;
}
export const defaults: Config = {
  preset: 'cold',
  method: 'GET',
  fault: 'none',
  latency: 100,
  serverDelay: 180,
  path: '/api/ideas',
};
export const sampleBody = JSON.stringify(
  {
    idea: 'Make something a little weird.',
    approvedBy: 'the cat',
    nextStep: 'Ship a small version.',
  },
  null,
  2,
);
/** An illustrative HTTP/1.1 + TLS 1.3 journey, not browser telemetry. Latency is round-trip time. */
export function buildJourney(config: Config): Journey {
  const c = {
    ...config,
    latency: Math.max(0, Math.min(1000, Number(config.latency) || 0)),
    serverDelay: Math.max(0, Math.min(3000, Number(config.serverDelay) || 0)),
  };
  const steps: Step[] = [];
  let time = 0;
  const add = (
    stage: Stage,
    title: string,
    detail: string,
    duration = 0,
    kind: Step['kind'] = 'normal',
  ) => {
    steps.push({ stage, title, detail, duration, at: time, kind });
    time += duration;
  };
  const requestHeaders: Record<string, string> = {
    Host: 'api.example.invalid',
    Accept: 'application/json',
  };
  if (c.method === 'POST') requestHeaders['Content-Type'] = 'application/json';
  const result = (
    status: number | null,
    statusText: string,
    outcome: Journey['outcome'],
    source: string,
    responseHeaders: Record<string, string>,
    body: string,
    wireBody: string,
    network = true,
  ): Journey => ({
    steps,
    status,
    statusText,
    outcome,
    source,
    requestHeaders,
    responseHeaders,
    body,
    wireBody,
    total: time,
    network,
  });
  const fail = (
    stage: Stage,
    title: string,
    detail: string,
    duration: number,
  ) => {
    add(stage, title, detail, duration, 'error');
    return result(
      null,
      title,
      'network-error',
      'No HTTP response',
      {},
      '',
      '',
      true,
    );
  };
  add(
    'cache',
    'Check the browser cache',
    c.method === 'POST'
      ? 'This POST bypasses this demo’s response cache. GET is the only cacheable method in this lab.'
      : c.preset === 'fresh'
        ? 'A stored GET response is still fresh: max-age=60 and Age=12. No network is needed.'
        : c.preset === 'revalidate'
          ? 'A stored response is stale. Its ETag lets the browser ask whether the representation changed.'
          : 'No fresh response is available. Continue to the network.',
    0,
    c.method === 'GET' && c.preset === 'fresh' ? 'cached' : 'normal',
  );
  if (c.method === 'GET' && c.preset === 'fresh') {
    add(
      'response',
      '200 · served from cache',
      'The cached representation is displayed. No DNS lookup, TCP connection, TLS handshake, or API call occurs.',
      0,
      'cached',
    );
    return result(
      200,
      'OK · cached',
      'success',
      'Fresh browser cache',
      { 'Cache-Control': 'public, max-age=60', Age: '12', ETag: '"ideas-v1"' },
      sampleBody,
      '',
      false,
    );
  }
  if (c.fault === 'offline')
    return fail(
      'dns',
      'Offline',
      'The browser cannot reach the network. A fresh cached GET could still have worked. No HTTP response exists.',
      0,
    );
  if (c.fault === 'dns')
    return fail(
      'dns',
      'DNS lookup failed',
      'The simulated resolver cannot find an address. No TCP connection, TLS handshake, or HTTP request follows.',
      60 + c.latency,
    );
  add(
    'dns',
    c.preset === 'warm' ? 'DNS answer reused' : 'Resolve the hostname',
    c.preset === 'warm'
      ? 'The DNS cache already holds a non-expired answer. Reusing DNS is not the same as caching the HTTP response.'
      : 'The resolver maps api.example.invalid to an illustrative documentation address, 192.0.2.42.',
    c.preset === 'warm' ? 0 : 60 + c.latency,
    c.preset === 'warm' ? 'cached' : 'normal',
  );
  add(
    'tcp',
    'Open a TCP connection',
    'SYN → SYN-ACK → ACK establishes a reliable byte stream. This lab uses a new HTTP/1.1 connection for clarity.',
    c.latency,
  );
  if (c.fault === 'certificate')
    return fail(
      'tls',
      'Certificate rejected',
      'The server certificate cannot be trusted. HTTPS stops before any HTTP headers or body are sent.',
      c.latency,
    );
  add(
    'tls',
    'Negotiate TLS 1.3',
    'The browser checks the certificate and negotiates encryption keys. TLS protects bytes in transit; it does not make the application’s content trustworthy.',
    c.latency,
  );
  if (c.method === 'GET' && c.preset === 'revalidate')
    requestHeaders['If-None-Match'] = '"ideas-v1"';
  add(
    'request',
    `${c.method} ${c.path || '/api/ideas'}`,
    c.method === 'GET' && c.preset === 'revalidate'
      ? 'If-None-Match sends the stored ETag. The API can respond 304 if the representation is unchanged.'
      : c.method === 'POST'
        ? 'A small JSON payload asks the API to create a new idea. This response is not stored in the demo’s cache.'
        : 'The browser sends an HTTP request through the encrypted connection.',
    c.latency / 2,
  );
  if (c.fault === 'timeout')
    return fail(
      'server',
      'Request timed out',
      'The API does not return headers before the lab’s 2,000 ms deadline. This is a client-side timeout, not an HTTP status code.',
      2000,
    );
  add(
    'server',
    'The API does its work',
    c.fault === 'server'
      ? 'The request reaches the API, but its handler fails. An HTTP 500 response will travel back normally.'
      : c.method === 'GET' && c.preset === 'revalidate'
        ? 'The API compares ETags and finds the stored representation unchanged.'
        : 'The API reads its data and prepares a JSON response.',
    c.serverDelay,
  );
  if (c.fault === 'server') {
    const body = JSON.stringify(
      { error: 'Our imaginary server needs a coffee.' },
      null,
      2,
    );
    add(
      'response',
      '500 · Internal Server Error',
      'DNS, TCP, TLS and HTTP all worked. The application failed. The response is marked no-store.',
      c.latency / 2,
      'error',
    );
    return result(
      500,
      'Internal Server Error',
      'http-error',
      'API response',
      { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body,
      body,
    );
  }
  if (c.method === 'GET' && c.preset === 'revalidate') {
    add(
      'response',
      '304 · Not Modified',
      'The network response has no representation body. The browser reuses its stored JSON and refreshes its cache metadata.',
      c.latency / 2,
      'success',
    );
    return result(
      304,
      'Not Modified',
      'success',
      'Revalidated browser cache',
      { 'Cache-Control': 'public, max-age=60', ETag: '"ideas-v1"' },
      sampleBody,
      '',
    );
  }
  const status = c.method === 'POST' ? 201 : 200;
  add(
    'response',
    `${status} · ${status === 201 ? 'Created' : 'OK'}`,
    c.method === 'POST'
      ? 'A new idea was created. Cache-Control: no-store keeps this response out of the demo cache.'
      : 'JSON arrives, is displayed, and is stored for future GET requests with a 60-second freshness lifetime.',
    c.latency / 2,
    'success',
  );
  return result(
    status,
    status === 201 ? 'Created' : 'OK',
    'success',
    'API response',
    {
      'Content-Type': 'application/json',
      'Cache-Control': c.method === 'POST' ? 'no-store' : 'public, max-age=60',
      ...(c.method === 'GET' ? { ETag: '"ideas-v1"' } : {}),
    },
    sampleBody,
    sampleBody,
  );
}
