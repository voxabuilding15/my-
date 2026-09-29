/**
 * A TCP proxy in front of the local Supabase API that behaves like a mobile network: added
 * latency, limited bandwidth in each direction, and connections that can be cut mid-transfer.
 * Clients pointed at `url` go through it; everything else is untouched.
 */
import { createServer, type Server, Socket } from 'node:net';

export type NetworkProfile = {
  name: string;
  /** One-way latency added to every packet. */
  latencyMs: number;
  downBytesPerSecond: number;
  upBytesPerSecond: number;
};

/** Typical figures (ITU / OpenSignal medians); upload is slower than download. */
export const PROFILES = {
  '2g': { name: '2G (EDGE)', latencyMs: 400, downBytesPerSecond: 30_000, upBytesPerSecond: 12_000 },
  '3g': { name: '3G', latencyMs: 150, downBytesPerSecond: 200_000, upBytesPerSecond: 90_000 },
  '4g': { name: '4G', latencyMs: 40, downBytesPerSecond: 2_500_000, upBytesPerSecond: 1_000_000 },
} satisfies Record<string, NetworkProfile>;

/** Paces a stream to a byte rate after a fixed delay, preserving order. */
function pipeThrottled(from: Socket, to: Socket, latencyMs: number, bytesPerSecond: number) {
  let queueEnd = Date.now();
  from.on('data', (chunk: Buffer) => {
    from.pause();
    const sendAt = Math.max(Date.now() + latencyMs, queueEnd);
    const duration = (chunk.length / bytesPerSecond) * 1000;
    queueEnd = sendAt + duration;
    setTimeout(
      () => {
        if (!to.destroyed) to.write(chunk);
        from.resume();
      },
      Math.max(0, queueEnd - Date.now()),
    );
  });
  from.on('end', () => setTimeout(() => to.end(), Math.max(0, queueEnd - Date.now())));
}

export async function startNetworkProxy(target: string, profile: NetworkProfile) {
  const { hostname, port } = new URL(target);
  const sockets = new Set<Socket>();
  let bytesUp = 0;

  const server: Server = createServer((client) => {
    const upstream = new Socket();
    upstream.connect(Number(port), hostname);
    sockets.add(client);
    sockets.add(upstream);
    client.on('data', (chunk: Buffer) => {
      bytesUp += chunk.length;
    });
    pipeThrottled(client, upstream, profile.latencyMs, profile.upBytesPerSecond);
    pipeThrottled(upstream, client, profile.latencyMs, profile.downBytesPerSecond);
    const close = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    client.on('error', close);
    upstream.on('error', close);
    client.on('close', close);
    upstream.on('close', close);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };

  return {
    url: `http://127.0.0.1:${address.port}`,
    /** Drops every open connection, like losing signal in a lift. */
    cutAll() {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
    },
    bytesUploaded: () => bytesUp,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
