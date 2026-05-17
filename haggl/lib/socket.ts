"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { logger } from "@/lib/logger";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_DELAY = 1000;
const MAX_DELAY = 30_000;

let _socket: Socket | null = null;
let _reconnectAttempts = 0;
let _intentionalDisconnect = false;

function createSocket(): Socket {
  _intentionalDisconnect = false;
  _reconnectAttempts = 0;

  const s = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: BASE_DELAY,
    reconnectionDelayMax: MAX_DELAY,
    randomizationFactor: 0.5,
    timeout: 10_000,
  });

  s.on("connect", () => {
    _reconnectAttempts = 0;
    logger.info("Socket connected", { metadata: { id: s.id } });
  });

  s.on("disconnect", (reason) => {
    logger.warn("Socket disconnected", { metadata: { reason } });
  });

  s.on("connect_error", (err) => {
    _reconnectAttempts++;
    logger.error("Socket connect error", {
      error: err.message,
      metadata: { attempt: _reconnectAttempts, max: MAX_RECONNECT_ATTEMPTS },
    });
    if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS && !_intentionalDisconnect) {
      logger.error("Socket reconnection exhausted, falling back to polling");
    }
  });

  s.on("error", (err) => {
    logger.error("Socket error", { error: err?.message || String(err) });
  });

  return s;
}

export function getSocket(): Socket {
  if (!_socket) {
    _socket = createSocket();
  }
  return _socket;
}

export function disconnectSocket(): void {
  _intentionalDisconnect = true;
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
}

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    if (!s.connected) {
      s.connect();
    }

    const onConnect = () => {
      setConnected(true);
      setReconnecting(false);
    };
    const onDisconnect = () => {
      setConnected(false);
    };
    const onReconnectAttempt = () => setReconnecting(true);
    const onReconnect = () => {
      setConnected(true);
      setReconnecting(false);
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.io.on("reconnect_attempt", onReconnectAttempt);
    s.io.on("reconnect", onReconnect);

    setConnected(s.connected);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.io.off("reconnect_attempt", onReconnectAttempt);
      s.io.off("reconnect", onReconnect);
    };
  }, []);

  return { socket, connected, reconnecting };
}

let _serverSideSocket: Socket | null = null;

export function getSocketServer() {
  if (typeof window === "undefined") {
    if (!_serverSideSocket) {
      _serverSideSocket = io(SOCKET_URL, {
        transports: ["websocket"],
        autoConnect: true,
      });
    }
    return _serverSideSocket;
  }
  return null;
}

