import { useEffect, useState, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
import { logger } from "@/lib/logger";
import { config } from "@/config";
import {
  WsAnchorUpdate,
  WsSubscriptionConfirm,
  WsPing,
  WsUnknownMessage,
  isAnchorUpdate,
  isSubscriptionConfirm,
  isPing,
} from "@/lib/websocket-message-parser";

export interface AnchorUpdate extends WsAnchorUpdate {
  // Fully inherits from WsAnchorUpdate
}

export interface UseRealtimeAnchorsOptions {
  anchorIds?: string[];
  onAnchorUpdate?: (update: AnchorUpdate) => void;
}

export interface UseRealtimeAnchorsReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connectionAttempts: number;
  anchorUpdates: Map<string, AnchorUpdate>;
  subscribeToAnchors: (anchorIds: string[]) => void;
  unsubscribeFromAnchors: (anchorIds: string[]) => void;
  reconnect: () => void;
}

export function useRealtimeAnchors(
  options: UseRealtimeAnchorsOptions = {},
): UseRealtimeAnchorsReturn {
  const { anchorIds = [], onAnchorUpdate } = options;

  const [anchorUpdates, setAnchorUpdates] = useState<Map<string, AnchorUpdate>>(
    new Map(),
  );

  // Track current subscriptions for resubscription on reconnect
  const subscribedIdsRef = useRef<string[]>([]);

  // Get WebSocket URL from environment or default
  const wsUrl = config.wsUrl;

  const handleMessage = useCallback(
    (message: WsAnchorUpdate | WsSubscriptionConfirm | WsPing | WsUnknownMessage) => {
      if (isAnchorUpdate(message)) {
        setAnchorUpdates((prev) => {
          const newMap = new Map(prev);
          newMap.set(message.anchor_id, message);
          return newMap;
        });
        onAnchorUpdate?.(message);
      } else if (isSubscriptionConfirm(message)) {
        logger.debug("Anchor subscription confirmed for channels:", message.channels);
      } else if (isPing(message)) {
        // Ignore pings silently
      }
    },
    [onAnchorUpdate],
  );

  const {
    isConnected,
    isConnecting,
    connectionAttempts,
    subscribe,
    unsubscribe,
    reconnect,
  } = useWebSocket(wsUrl, {
    onMessage: handleMessage,
    onOpen: () => {
      logger.debug("Connected to anchor WebSocket");
      // Re-subscribe to all previously subscribed anchors on reconnection
      const ids = subscribedIdsRef.current;
      if (ids.length > 0) {
        const channels = ids.map((id) => `anchor:${id}`);
        subscribe(channels);
        logger.debug("Resubscribed to anchors after reconnect:", ids);
      }
    },
    onClose: () => {
      logger.debug("Disconnected from anchor WebSocket");
    },
    onError: (error) => {
      logger.error("Anchor WebSocket error:", error);
    },
  });

  const subscribeToAnchors = useCallback(
    (ids: string[]) => {
      // Track subscribed IDs for resubscription
      subscribedIdsRef.current = ids;
      const channels = ids.map((id) => `anchor:${id}`);
      subscribe(channels);
    },
    [subscribe],
  );

  const unsubscribeFromAnchors = useCallback(
    (ids: string[]) => {
      // Remove unsubscribed IDs from tracking
      subscribedIdsRef.current = subscribedIdsRef.current.filter(
        (id) => !ids.includes(id),
      );
      const channels = ids.map((id) => `anchor:${id}`);
      unsubscribe(channels);
    },
    [unsubscribe],
  );

  // Subscribe to initial anchors when connected
  useEffect(() => {
    if (isConnected && anchorIds.length > 0) {
      subscribeToAnchors(anchorIds);
    }
  }, [isConnected, anchorIds, subscribeToAnchors]);

  return {
    isConnected,
    isConnecting,
    connectionAttempts,
    anchorUpdates,
    subscribeToAnchors,
    unsubscribeFromAnchors,
    reconnect,
  };
}
