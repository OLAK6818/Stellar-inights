import { useEffect, useState, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { logger } from "@/lib/logger";
import { config } from "@/config";
import {
  WsCorridorUpdate,
  WsHealthAlert,
  WsNewPayment,
  WsSubscriptionConfirm,
  WsPing,
  WsUnknownMessage,
  isCorridorUpdate,
  isHealthAlert,
  isNewPayment,
  isSubscriptionConfirm,
  isPing,
} from "@/lib/websocket-message-parser";

export interface CorridorUpdate extends WsCorridorUpdate {
  asset_a_code: string;
  asset_a_issuer: string;
  asset_b_code: string;
  asset_b_issuer: string;
  health_score?: number;
}

export interface HealthAlert extends WsHealthAlert {
  // Fully inherits from WsHealthAlert
}

export interface NewPayment extends WsNewPayment {
  // Fully inherits from WsNewPayment
}

export interface UseRealtimeCorridorsOptions {
  corridorKeys?: string[];
  enablePaymentStream?: boolean;
  onCorridorUpdate?: (update: CorridorUpdate) => void;
  onHealthAlert?: (alert: HealthAlert) => void;
  onNewPayment?: (payment: NewPayment) => void;
}

export interface UseRealtimeCorridorsReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isStaleData: boolean;
  connectionAttempts: number;
  corridorUpdates: Map<string, CorridorUpdate>;
  healthAlerts: HealthAlert[];
  recentPayments: NewPayment[];
  subscribeToCorridors: (corridorKeys: string[]) => void;
  unsubscribeFromCorridors: (corridorKeys: string[]) => void;
  clearHealthAlerts: () => void;
  reconnect: () => void;
}

export function useRealtimeCorridors(
  options: UseRealtimeCorridorsOptions = {},
): UseRealtimeCorridorsReturn {
  const {
    corridorKeys = [],
    enablePaymentStream = false,
    onCorridorUpdate,
    onHealthAlert,
    onNewPayment,
  } = options;

  const [corridorUpdates, setCorridorUpdates] = useState<
    Map<string, CorridorUpdate>
  >(new Map());
  const [healthAlerts, setHealthAlerts] = useState<HealthAlert[]>([]);
  const [recentPayments, setRecentPayments] = useState<NewPayment[]>([]);

  // Track current subscriptions for resubscription on reconnect
  const subscribedKeysRef = useRef<string[]>([]);

  // Get WebSocket URL from environment or default
  const wsUrl = config.wsUrl;

  const handleMessage = useCallback(
    (message: WsCorridorUpdate | WsHealthAlert | WsNewPayment | WsSubscriptionConfirm | WsPing | WsUnknownMessage) => {
      if (isCorridorUpdate(message)) {
        setCorridorUpdates((prev) => {
          const newMap = new Map(prev);
          newMap.set(message.corridor_key, message as CorridorUpdate);
          return newMap;
        });
        onCorridorUpdate?.(message as CorridorUpdate);
      } else if (isHealthAlert(message)) {
        setHealthAlerts((prev) => [message, ...prev].slice(0, 50));
        onHealthAlert?.(message);
      } else if (isNewPayment(message)) {
        if (enablePaymentStream) {
          setRecentPayments((prev) => [message, ...prev].slice(0, 100));
          onNewPayment?.(message);
        }
      } else if (isSubscriptionConfirm(message)) {
        logger.debug("Subscription confirmed for channels:", message.channels);
      } else if (isPing(message)) {
        // Ignore pings silently
      } else {
        logger.debug("Unhandled WebSocket message type:", message.type);
      }
    },
    [enablePaymentStream, onCorridorUpdate, onHealthAlert, onNewPayment],
  );

  const {
    isConnected,
    isConnecting,
    isStaleData,
    connectionAttempts,
    subscribe,
    unsubscribe,
    reconnect,
  } = useWebSocket(wsUrl, {
    staleDataThreshold: 30000, // 30 seconds without updates = stale
    onMessage: handleMessage,
    onOpen: () => {
      logger.debug("Connected to corridor WebSocket");
      // Re-subscribe to all previously subscribed corridors on reconnection
      const keys = subscribedKeysRef.current;
      if (keys.length > 0) {
        const channels = keys.map((key) => `corridor:${key}`);
        if (enablePaymentStream) {
          channels.push(...keys.map((key) => `payments:${key}`));
        }
        subscribe(channels);
        logger.debug("Resubscribed to corridors after reconnect:", keys);
      }
    },
    onClose: () => {
      logger.debug("Disconnected from corridor WebSocket");
    },
    onError: (error) => {
      logger.error("Corridor WebSocket error:", error);
    },
    onStaleData: () => {
      logger.warn("Corridor data is stale - consider fetching snapshot");
    },
  });

  const subscribeToCorridors = useCallback(
    (keys: string[]) => {
      // Track subscribed keys for resubscription
      subscribedKeysRef.current = keys;
      const channels = keys.map((key) => `corridor:${key}`);
      if (enablePaymentStream) {
        channels.push(...keys.map((key) => `payments:${key}`));
      }
      subscribe(channels);
    },
    [subscribe, enablePaymentStream],
  );

  const unsubscribeFromCorridors = useCallback(
    (keys: string[]) => {
      // Remove unsubscribed keys from tracking
      subscribedKeysRef.current = subscribedKeysRef.current.filter(
        (k) => !keys.includes(k),
      );
      const channels = keys.map((key) => `corridor:${key}`);
      if (enablePaymentStream) {
        channels.push(...keys.map((key) => `payments:${key}`));
      }
      unsubscribe(channels);
    },
    [unsubscribe, enablePaymentStream],
  );

  const clearHealthAlerts = useCallback(() => {
    setHealthAlerts([]);
  }, []);

  // Subscribe to initial corridors when connected
  useEffect(() => {
    if (isConnected && corridorKeys.length > 0) {
      subscribeToCorridors(corridorKeys);
    }
  }, [isConnected, corridorKeys, subscribeToCorridors]);

  return {
    isConnected,
    isConnecting,
    isStaleData,
    connectionAttempts,
    corridorUpdates,
    healthAlerts,
    recentPayments,
    subscribeToCorridors,
    unsubscribeFromCorridors,
    clearHealthAlerts,
    reconnect,
  };
}

import { useEffect, useState, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { logger } from "@/lib/logger";
import { config } from "@/config";
import {
  isCorridorUpdate,
  isHealthAlert,
  isNewPayment,
  isSubscriptionConfirm,
} from "@/lib/websocket-message-parser";

export interface CorridorUpdate {
  corridor_key: string;
  asset_a_code: string;
  asset_a_issuer: string;
  asset_b_code: string;
  asset_b_issuer: string;
  success_rate?: number;
  health_score?: number;
  last_updated?: string;
}

export interface HealthAlert {
  corridor_id: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  timestamp: string;
}

export interface NewPayment {
  corridor_id: string;
  amount: number;
  successful: boolean;
  timestamp: string;
}

export interface UseRealtimeCorridorsOptions {
  corridorKeys?: string[];
  enablePaymentStream?: boolean;
  onCorridorUpdate?: (update: CorridorUpdate) => void;
  onHealthAlert?: (alert: HealthAlert) => void;
  onNewPayment?: (payment: NewPayment) => void;
}

export interface UseRealtimeCorridorsReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isStaleData: boolean;
  connectionAttempts: number;
  corridorUpdates: Map<string, CorridorUpdate>;
  healthAlerts: HealthAlert[];
  recentPayments: NewPayment[];
  subscribeToCorridors: (corridorKeys: string[]) => void;
  unsubscribeFromCorridors: (corridorKeys: string[]) => void;
  clearHealthAlerts: () => void;
  reconnect: () => void;
}

export function useRealtimeCorridors(
  options: UseRealtimeCorridorsOptions = {},
): UseRealtimeCorridorsReturn {
  const {
    corridorKeys = [],
    enablePaymentStream = false,
    onCorridorUpdate,
    onHealthAlert,
    onNewPayment,
  } = options;

// TODO: Intended for future use
  const [corridorUpdates, setCorridorUpdates] = useState<
    Map<string, CorridorUpdate>
  >(new Map());
  const [healthAlerts, setHealthAlerts] = useState<HealthAlert[]>([]);
  const [recentPayments, setRecentPayments] = useState<NewPayment[]>([]);

  // Get WebSocket URL from environment or default
  const wsUrl = config.wsUrl;

  const handleMessage = useCallback(
    (message: WsMessage) => {
      if (isCorridorUpdate(message)) {
        setCorridorUpdates((prev) => {
          const newMap = new Map(prev);
          newMap.set(message.corridor_key, message);
          return newMap;
        });
        onCorridorUpdate?.(message);
      } else if (isHealthAlert(message)) {
        setHealthAlerts((prev) => [message, ...prev].slice(0, 50));
        onHealthAlert?.(message);
      } else if (isNewPayment(message)) {
        if (enablePaymentStream) {
          setRecentPayments((prev) => [message, ...prev].slice(0, 100));
          onNewPayment?.(message);
        }
      } else if (isSubscriptionConfirm(message)) {
        logger.debug("Subscription confirmed");
      } else if (message.type !== "ping") {
        logger.debug("Unhandled WebSocket message type:", message.type);
      }
    },
    [enablePaymentStream, onCorridorUpdate, onHealthAlert, onNewPayment],
  );

  const {
    isConnected,
    isConnecting,
    isStaleData,
    connectionAttempts,
    subscribe,
    unsubscribe,
    reconnect,
  } = useWebSocket(wsUrl, {
    staleDataThreshold: 30000, // 30 seconds without updates = stale
    onMessage: handleMessage,
    onOpen: () => {
      logger.debug("Connected to corridor WebSocket");
      // Re-subscribe to corridors on reconnection
      if (corridorKeys.length > 0) {
        subscribeToCorridors(corridorKeys);
      }
    },
    onClose: () => {
      logger.debug("Disconnected from corridor WebSocket");
    },
    onError: (error) => {
      logger.error("Corridor WebSocket error:", error);
    },
    onStaleData: () => {
      logger.warn("Corridor data is stale - consider fetching snapshot");
    },
  });

  const subscribeToCorridors = useCallback(
    (keys: string[]) => {
      const channels = keys.map((key) => `corridor:${key}`);
      if (enablePaymentStream) {
        channels.push(...keys.map((key) => `payments:${key}`));
      }
      subscribe(channels);
    },
    [subscribe, enablePaymentStream],
  );

  const unsubscribeFromCorridors = useCallback(
    (keys: string[]) => {
      const channels = keys.map((key) => `corridor:${key}`);
      if (enablePaymentStream) {
        channels.push(...keys.map((key) => `payments:${key}`));
      }
      unsubscribe(channels);
    },
    [unsubscribe, enablePaymentStream],
  );

  const clearHealthAlerts = useCallback(() => {
    setHealthAlerts([]);
  }, []);

  // Subscribe to initial corridors when connected
  useEffect(() => {
    if (isConnected && corridorKeys.length > 0) {
      subscribeToCorridors(corridorKeys);
    }
  }, [isConnected, corridorKeys, subscribeToCorridors]);

  return {
    isConnected,
    isConnecting,
    isStaleData,
    connectionAttempts,
    corridorUpdates,
    healthAlerts,
    recentPayments,
    subscribeToCorridors,
    unsubscribeFromCorridors,
    clearHealthAlerts,
    reconnect,
  };
}
