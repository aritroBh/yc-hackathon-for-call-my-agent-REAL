/**
 * Server-side dashboard event emitter.
 *
 * lib/socket.ts is a "use client" module, so its getSocketServer() is not
 * callable from a server route bundle (Next turns it into a client ref).
 * This module is server-safe: it lazily connects a socket.io-client to the
 * express-bridge and never throws — dashboard events are best-effort and
 * must not break a live call.
 */
import { io, type Socket } from "socket.io-client";

let _socket: Socket | null = null;

export function emitDashboard(event: string, payload: unknown): void {
  try {
    if (typeof window !== "undefined") return;
    const url =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      process.env.NEXT_PUBLIC_WS_URL ||
      "http://localhost:3001";
    if (!_socket) {
      _socket = io(url, { transports: ["websocket"], autoConnect: true });
      _socket.on("connect_error", () => {});
      _socket.on("error", () => {});
    }
    _socket.emit(event, payload);
  } catch {
    /* best-effort — never throw into the negotiation path */
  }
}
