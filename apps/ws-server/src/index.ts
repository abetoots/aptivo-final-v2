/**
 * WFE3-02: ws-server process entry point.
 *
 * Reads config from env, starts the server, and handles SIGTERM / SIGINT
 * by calling the graceful-shutdown path (broadcast reconnect, close
 * sockets, exit).
 */

import { createWsServer } from './server.js';

export { createWsServer } from './server.js';
export type { WsServer, ServerConfig } from './server.js';
export { verifyWsToken } from './auth.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    // eslint-disable-next-line no-console
    console.error(`[ws-server] missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

// only run as a script when invoked directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createWsServer({
    port: Number(process.env.WS_PORT) || 3001,
    jwtSecret: requireEnv('WS_JWT_SECRET'),
    jwtIssuer: process.env.WS_JWT_ISSUER ?? 'aptivo-web',
    jwtAudience: process.env.WS_JWT_AUDIENCE ?? 'aptivo-ws',
  });

  // eslint-disable-next-line no-console
  console.log(`[ws-server] listening on port ${process.env.WS_PORT ?? 3001}`);

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[ws-server] received ${signal}, stopping`);
    await server.stop('deployment', 5000);
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
}
