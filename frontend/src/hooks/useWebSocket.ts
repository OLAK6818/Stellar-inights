import { useEffect, useRef, useState, useCallback } from "react";
import { logger } from "@/lib/logger";
import {
  WsMessage as ValidatedWsMessage,
  parseWebSocketMessage,
} from "@/lib/websocket-message-parser";

export enum ConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  RECONNECTING = "RECONNECTING",
  STALE_DATA = "STALE_DATA",
}

// For backward compatibility with code that uses the generic type
export type WsMessage = ValidatedWsMessage | { type: string; [key: string]: unknown };

export interface UseWebSocketOptions {
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  staleDataThreshold?: number; // ms without message before marking as stale
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WsMessage) => void;
  onStaleData?: () => void;
}

export interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isStaleData: boolean;
  lastMessage: WsMessage | null;
  lastMessageTime: number | null;
  connectionAttempts: number;
  send: (message: WsMessage) => void;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
  reconnect: () => void;
}

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  const {
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    staleDataThreshold = 30000, // 30s default
    onOpen,
    onClose,
    onError,
    onMessage,
    onStaleData,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isStaleData, setIsStaleData] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<number | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED
  );

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const staleDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    // Prevent duplicate connections
    if (isConnectingRef.current) {
      return;
    }

    // Check if already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    isConnectingRef.current = true;
    setIsConnecting(true);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        logger.debug("WebSocket connected");
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionState(ConnectionState.CONNECTED);
        setConnectionAttempts(0);
        isConnectingRef.current = false;
        onOpen?.();
      };

      ws.onclose = () => {
        logger.debug("WebSocket disconnected");
        setIsConnected(false);
        setIsConnecting(false);
        isConnectingRef.current = false;
        onClose?.();

        // Attempt to reconnect if enabled and under max attempts
        if (
          shouldReconnectRef.current &&
          connectionAttempts < maxReconnectAttempts
        ) {
          setConnectionAttempts((prev) => prev + 1);
          reconnectTimeoutRef.current = setTimeout(
            () => {
              connect();
            },
            reconnectInterval * Math.pow(1.5, connectionAttempts),
          ); // Exponential backoff
        }
      };

      ws.onerror = (error) => {
        logger.error("WebSocket error:", error);
        setIsConnecting(false);
        isConnectingRef.current = false;
        setConnectionState(ConnectionState.DISCONNECTED);
        onError?.(error);
      };

      ws.onmessage = (event) => {
        try {
          const parsedData = JSON.parse(event.data);
          const message = parseWebSocketMessage(parsedData);

          // Ignore malformed messages
          if (!message) {
            return;
          }

          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          logger.error("Failed to parse WebSocket message:", error);
        }
      };
    } catch (error) {
      logger.error("Failed to create WebSocket connection:", error);
      setIsConnecting(false);
      isConnectingRef.current = false;
      setConnectionState(ConnectionState.DISCONNECTED);
    }
  }, [
    url,
    connectionAttempts,
    maxReconnectAttempts,
    reconnectInterval,
    onOpen,
    onClose,
    onError,
    onMessage,
  ]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setConnectionState(ConnectionState.DISCONNECTED);
  }, []);

  const send = useCallback((message: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      logger.warn("WebSocket is not connected. Cannot send message:", message);
    }
  }, []);

  const subscribe = useCallback(
    (channels: string[]) => {
      send({
        type: "subscribe",
        channels,
      });
    },
    [send],
  );

  const unsubscribe = useCallback(
    (channels: string[]) => {
      send({
        type: "unsubscribe",
        channels,
      });
    },
    [send],
  );

  const reconnect = useCallback(() => {
    // Disconnect first
    disconnect();

    // Reset attempts and enable reconnect
    shouldReconnectRef.current = true;
    setConnectionAttempts(0);

    // Delay slightly before reconnecting
    setTimeout(() => {
      connect();
    }, 100);
  }, [connect, disconnect]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    isStaleData,
    lastMessage,
    connectionAttempts,
    send,
    subscribe,
    unsubscribe,
    reconnect,
  };
}
