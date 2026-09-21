import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

interface LocalDnsState {
  configured?: boolean;
}

declare global {
  var studioLocalDns: LocalDnsState | undefined;
}

/** Opt-in workaround for local networks that refuse Atlas SRV/TXT lookups.
 * Configure once, before MongoDB starts resolving; restart dev after changes.
 * This affects only this Node process, never Windows or production DNS.
 */
export function configureLocalDns(
  environment: string | undefined = process.env.NODE_ENV,
  value: string | undefined = process.env.MONGODB_DNS_SERVERS,
  state: LocalDnsState = (globalThis.studioLocalDns ??= {}),
  setServers: (servers: string[]) => void = dns.setServers.bind(dns),
): void {
  if (environment !== 'development' || !value?.trim() || state.configured) return;

  const servers = value.split(',').map((server) => server.trim());
  if (servers.some((server) => !isIP(server))) {
    throw new Error('MONGODB_DNS_SERVERS must contain comma-separated DNS server IP addresses');
  }

  setServers(servers);
  state.configured = true;
}
