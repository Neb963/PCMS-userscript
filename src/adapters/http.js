import { requireThat } from '../shared/domain.js';

const HOSTS = Object.freeze(['perchance.org', 'user.uploads.dev', 'api.github.com']);

export function privilegedRequest(xhr, url, { method = 'GET', body, type = 'json', headers = {} } = {}) {
  const target = new URL(url);
  requireThat(target.protocol === 'https:' && HOSTS.includes(target.hostname) && !target.port && !target.username && !target.password && !target.hash, 'unsupported-http-target');
  requireThat(['GET', 'POST', 'PATCH'].includes(method), 'unsupported-http-method');
  for (const key of Object.keys(headers)) {
    requireThat(['Accept', 'Authorization', 'X-GitHub-Api-Version'].includes(key), 'unsupported-http-header');
    if (key === 'Authorization') requireThat(target.hostname === 'api.github.com', 'credential-target-rejected');
  }
  return new Promise((resolve, reject) => {
    const fail = code => reject(new Error(code));
    xhr({
      url: target.href, method, timeout: 30000, anonymous: true,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      data: body === undefined ? undefined : JSON.stringify(body),
      responseType: type === 'bytes' ? 'arraybuffer' : 'text',
      onload(response) {
        try {
          requireThat(new URL(response.finalUrl || target.href).origin === target.origin, 'redirect-target-rejected');
          requireThat(response.status >= 200 && response.status < 300, response.status === 409 || response.status === 422 ? 'http-conflict' : response.status === 404 ? 'http-not-found' : 'http-unavailable');
          if (type === 'bytes') resolve(new Uint8Array(response.response));
          else resolve(JSON.parse(response.responseText));
        } catch (error) { fail(['redirect-target-rejected', 'http-conflict', 'http-not-found', 'http-unavailable'].includes(error.message) ? error.message : 'http-invalid-response'); }
      },
      onerror: () => fail('http-unavailable'),
      ontimeout: () => fail('http-timeout'),
      onabort: () => fail('http-aborted'),
    });
  });
}
