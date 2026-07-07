/**
 * Best-effort HTTP redirect resolution for WebSocket URLs.
 * The standard WebSocket API fails on 3xx handshake responses, so we
 * pre-resolve the final location with a plain GET before connecting.
 */

/**
 * Resolve HTTP redirects for a ws(s) URL via a pre-flight fetch.
 * Converts ws→http / wss→https, fetches with redirect following, and maps
 * the final response.url back to the ws scheme. The final response status
 * is irrelevant (e.g. 426 Upgrade Required is fine) — only response.url
 * is used, verbatim. Never throws: on fetch failure or a missing
 * response.url, returns the input unchanged.
 */
export async function resolveWsUrl(wsUrl: string): Promise<string> {
  const httpUrl = wsUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');
  try {
    const response = await fetch(httpUrl, {
      method: 'GET',
      redirect: 'follow',
    });
    if (!response.url) {
      return wsUrl;
    }
    return response.url
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');
  } catch {
    return wsUrl;
  }
}
