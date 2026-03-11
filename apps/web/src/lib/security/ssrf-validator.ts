/**
 * INT-06: SSRF validation for outbound webhook URLs
 * @task INT-06
 * @warning T1-W27
 *
 * validates webhook urls to prevent server-side request forgery.
 * blocks private ip ranges, loopback, link-local (including aws metadata),
 * and non-http schemes.
 *
 * note: dns-based validation (to catch dns rebinding attacks) is a future
 * enhancement. this implementation validates the url string/hostname directly.
 */

import { Result } from '@aptivo/types';

export type SsrfError =
  | { _tag: 'PrivateIpBlocked'; ip: string }
  | { _tag: 'InvalidUrl'; message: string }
  | { _tag: 'BlockedHost'; host: string };

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

/**
 * checks whether a hostname is a private/reserved ip address.
 * covers loopback, private class a/b/c, link-local, unspecified,
 * and ipv6 private ranges (unique-local, link-local, ipv4-mapped).
 */
export function isPrivateIp(hostname: string): boolean {
  // strip brackets for ipv6
  const cleaned = hostname.replace(/^\[|\]$/g, '');
  const lower = cleaned.toLowerCase();

  // blocked hostnames (localhost, 0.0.0.0, etc.)
  if (BLOCKED_HOSTNAMES.has(lower)) return true;

  // --- ipv6 checks ---

  // ipv6 loopback
  if (lower === '::1') return true;

  // ipv6 unspecified
  if (lower === '::') return true;

  // ipv4-mapped ipv6 — dotted form (::ffff:x.x.x.x)
  const mappedDotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) {
    return isPrivateIpv4(mappedDotted[1]!);
  }

  // ipv4-mapped ipv6 — hex form (::ffff:AABB:CCDD), as normalized by URL parser
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1]!, 16);
    const lo = parseInt(mappedHex[2]!, 16);
    const ip = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateIpv4(ip);
  }

  // fc00::/7 — unique-local addresses (ipv6 equivalent of rfc 1918)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

  // fe80::/10 — link-local addresses
  if (lower.startsWith('fe80')) return true;

  // --- ipv4 checks ---
  return isPrivateIpv4(cleaned);
}

/** checks whether a dotted-quad ipv4 address is private/reserved */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const octets = parts.map(Number);
  if (octets.some((o) => isNaN(o) || o < 0 || o > 255)) return false;

  const [a, b] = octets;

  // 127.0.0.0/8 — loopback
  if (a === 127) return true;

  // 10.0.0.0/8 — private class a
  if (a === 10) return true;

  // 172.16.0.0/12 — private class b (172.16.x.x - 172.31.x.x)
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — private class c
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 — link-local (includes aws metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0 — unspecified
  if (a === 0 && b === 0 && octets[2] === 0 && octets[3] === 0) return true;

  return false;
}

/**
 * validates a webhook url to prevent ssrf attacks.
 * returns a parsed URL on success, or an SsrfError on failure.
 */
export function validateWebhookUrl(urlString: string): Result<URL, SsrfError> {
  // parse url
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return Result.err({ _tag: 'InvalidUrl', message: `Invalid URL: ${urlString}` });
  }

  // only allow http/https schemes
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return Result.err({
      _tag: 'InvalidUrl',
      message: `Blocked scheme: ${url.protocol} — only http and https are allowed`,
    });
  }

  const hostname = url.hostname;

  // check blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    return Result.err({ _tag: 'BlockedHost', host: hostname });
  }

  // check private ip ranges
  if (isPrivateIp(hostname)) {
    return Result.err({ _tag: 'PrivateIpBlocked', ip: hostname });
  }

  return Result.ok(url);
}
