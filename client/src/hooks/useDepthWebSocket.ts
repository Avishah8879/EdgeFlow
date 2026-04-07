/**
 * WebSocket hook for real-time order book depth data
 *
 * Connects to the FastAPI WebSocket endpoint for 50-level depth data.
 * Uses msgpack for binary deserialization.
 *
 * Usage:
 *   const { data, isConnected, error, reconnect } = useDepthWebSocket('NSE:RELIANCE-EQ');
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { decode } from '@msgpack/msgpack';
import { getApiBaseUrl } from '@/lib/api-config';

// Depth data structure matching Python serialization
export interface DepthData {
  s: string;       // symbol
  t: number;       // timestamp (nanoseconds)
  tick_ts: number; // exchange tick timestamp
  snap: boolean;   // snapshot flag
  b: number[];     // bid prices (50 levels)
  a: number[];     // ask prices (50 levels)
  bq: number[];    // bid quantities (50 levels)
  aq: number[];    // ask quantities (50 levels)
  bo?: number[];   // bid orders (50 levels, optional)
  ao?: number[];   // ask orders (50 levels, optional)
  tbq: number;     // total buy quantity
  tsq: number;     // total sell quantity
}

// Message types from WebSocket
interface BaseMessage {
  type: 'update' | 'history' | 'heartbeat' | 'error' | 'subscribed' | 'unavailable' | 'pending';
}

interface UpdateMessage extends BaseMessage {
  type: 'update';
  s: string;
  t: number;
  tick_ts: number;
  snap: boolean;
  b: number[];
  a: number[];
  bq: number[];
  aq: number[];
  bo?: number[];
  ao?: number[];
  tbq: number;
  tsq: number;
}

interface HistoryMessage extends BaseMessage {
  type: 'history';
  symbol: string;
  data: DepthData[];
}

interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  ts: number;
}

interface ErrorMessage extends BaseMessage {
  type: 'error';
  message: string;
}

interface SubscribedMessage extends BaseMessage {
  type: 'subscribed';
  symbol: string;
  message: string;
}

interface UnavailableMessage extends BaseMessage {
  type: 'unavailable';
  symbol: string;
  message: string;
}

interface PendingMessage extends BaseMessage {
  type: 'pending';
  symbol: string;
  message: string;
}

type WSMessage = UpdateMessage | HistoryMessage | HeartbeatMessage | ErrorMessage | SubscribedMessage | UnavailableMessage | PendingMessage;

// Hook options
interface UseDepthWebSocketOptions {
  enabled?: boolean;
  maxRetries?: number;
  onHistory?: (data: DepthData[]) => void;
  onError?: (error: string) => void;
}

// Return type
interface UseDepthWebSocketReturn {
  data: DepthData | null;
  history: DepthData[];
  isConnected: boolean;
  isPending: boolean;      // Waiting for subscription confirmation
  isUnavailable: boolean;  // Symbol rejected (all slots occupied)
  error: string | null;
  lastUpdate: number | null;
  reconnect: () => void;
  disconnect: () => void;
}

// WebSocket URL helper
function getWebSocketUrl(symbol: string): string {
  // Connect directly to Python FastAPI which hosts the depth WebSocket handler.
  // Mirrors how REST API calls use getApiBaseUrl() to reach Python (port 8100).
  const httpBase = getApiBaseUrl() || window.location.origin;
  const wsBase = httpBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  return `${wsBase}/ws/depth/${encodeURIComponent(symbol)}`;
}

// Global connection registry to prevent duplicate connections across component remounts
const activeConnections = new Map<string, WebSocket>();
const pendingConnections = new Map<string, NodeJS.Timeout>();
const CONNECTION_DEBOUNCE_MS = 500; // Debounce rapid connect attempts

function getActiveConnection(symbol: string): WebSocket | undefined {
  const ws = activeConnections.get(symbol);
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return ws;
  }
  // Clean up closed connections
  if (ws) {
    activeConnections.delete(symbol);
  }
  return undefined;
}

function registerConnection(symbol: string, ws: WebSocket): void {
  // Close any existing connection for this symbol
  const existing = activeConnections.get(symbol);
  if (existing && existing !== ws) {
    console.log(`[DepthWS] Closing existing connection for ${symbol}`);
    existing.close(1000, 'Replaced by new connection');
  }
  activeConnections.set(symbol, ws);
}

function unregisterConnection(symbol: string, ws: WebSocket): void {
  if (activeConnections.get(symbol) === ws) {
    activeConnections.delete(symbol);
  }
}

function cancelPendingConnection(symbol: string): void {
  const pending = pendingConnections.get(symbol);
  if (pending) {
    clearTimeout(pending);
    pendingConnections.delete(symbol);
    console.log(`[DepthWS] Cancelled pending connection for ${symbol}`);
  }
}

// Exponential backoff helper
function getBackoffDelay(attempt: number): number {
  const baseDelay = 2000; // Start at 2 seconds
  const maxDelay = 60000; // Max 60 seconds
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  return delay + Math.random() * 1000; // Add jitter
}

export function useDepthWebSocket(
  symbol: string,
  options: UseDepthWebSocketOptions = {}
): UseDepthWebSocketReturn {
  const {
    enabled = true,
    maxRetries = 10,
    onHistory,
    onError,
  } = options;

  const [data, setData] = useState<DepthData | null>(null);
  const [history, setHistory] = useState<DepthData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const serviceErrorRef = useRef(false); // Track if we got a service error (don't retry)

  // Track current expected symbol for stale-message guards
  const currentSymbolRef = useRef(symbol);
  currentSymbolRef.current = symbol;

  // Track symbol changes to reset state and bypass debounce
  const prevSymbolRef = useRef(symbol);
  const symbolChangedRef = useRef(false);

  // Use refs for callbacks to avoid re-creating connect function on every render
  const onHistoryRef = useRef(onHistory);
  const onErrorRef = useRef(onError);
  onHistoryRef.current = onHistory;
  onErrorRef.current = onError;

  // Reset all state when symbol changes to prevent stale data display
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      prevSymbolRef.current = symbol;
      symbolChangedRef.current = true;
      setData(null);
      setHistory([]);
      setError(null);
      setLastUpdate(null);
      setIsConnected(false);
      setIsPending(false);
      setIsUnavailable(false);
      retryCountRef.current = 0;
      serviceErrorRef.current = false;
    }
  }, [symbol]);

  // Disconnect function
  const disconnect = useCallback(() => {
    // Cancel any pending connection attempts
    if (symbol) {
      cancelPendingConnection(symbol);
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (wsRef.current) {
      unregisterConnection(symbol, wsRef.current);
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsPending(false);
    setIsUnavailable(false);
  }, [symbol]);

  // Actual connection logic (called after debounce)
  const doConnect = useCallback(() => {
    if (!enabled || !symbol || !mountedRef.current) {
      return;
    }

    // Capture symbol at connection-creation time for stale-message guards
    const connectingSymbol = symbol;

    // Check global registry - close any existing connection for this symbol
    const existingGlobal = getActiveConnection(connectingSymbol);
    if (existingGlobal) {
      // If we already have a reference to this connection, don't create a new one
      if (existingGlobal === wsRef.current) {
        console.log(`[DepthWS] Already using the global connection for ${connectingSymbol}`);
        return;
      }
      // Different instance trying to connect - close the old one first
      console.log(`[DepthWS] Closing stale global connection for ${connectingSymbol}`);
      existingGlobal.close(1000, 'Replaced by new component');
      activeConnections.delete(connectingSymbol);
    }

    // Don't create new connection if this instance already has one
    const currentState = wsRef.current?.readyState;
    if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
      console.log(`[DepthWS] Already connected/connecting (state=${currentState}), skipping`);
      return;
    }

    // Close any existing connection that's closing
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const url = getWebSocketUrl(connectingSymbol);
    console.log(`[DepthWS] Creating NEW connection to ${url}`);

    try {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      // Register in global registry to prevent duplicates
      registerConnection(connectingSymbol, ws);

      ws.onopen = () => {
        if (!mountedRef.current) return;
        // Guard: ignore if symbol changed since this connection was created
        if (currentSymbolRef.current !== connectingSymbol) return;
        console.log(`[DepthWS] Connected to ${connectingSymbol}, waiting for subscription...`);
        setIsConnected(true);
        setIsPending(true);  // Waiting for subscription confirmation
        setIsUnavailable(false);
        setError(null);
        retryCountRef.current = 0;
      };

      ws.onmessage = async (event: MessageEvent) => {
        if (!mountedRef.current) return;
        // Guard: reject messages from stale connections after symbol change
        if (currentSymbolRef.current !== connectingSymbol) return;

        try {
          // Decode msgpack binary data
          const buffer = event.data as ArrayBuffer;
          const message = decode(new Uint8Array(buffer)) as WSMessage;

          switch (message.type) {
            case 'update': {
              const depthData: DepthData = {
                s: message.s,
                t: message.t,
                tick_ts: message.tick_ts,
                snap: message.snap,
                b: message.b,
                a: message.a,
                bq: message.bq,
                aq: message.aq,
                bo: message.bo,
                ao: message.ao,
                tbq: message.tbq,
                tsq: message.tsq,
              };
              setData(depthData);
              setLastUpdate(Date.now());
              break;
            }

            case 'history': {
              const historyData = (message as HistoryMessage).data;
              setHistory(historyData);
              onHistoryRef.current?.(historyData);
              break;
            }

            case 'heartbeat': {
              // Heartbeat received - connection is alive
              setLastUpdate(Date.now());
              break;
            }

            case 'error': {
              const errorMsg = (message as ErrorMessage).message;
              console.error(`[DepthWS] Server error: ${errorMsg}`);
              setError(errorMsg);
              setIsPending(false);
              onErrorRef.current?.(errorMsg);
              // If it's a service unavailable error, don't retry
              if (errorMsg.includes('unavailable') || errorMsg.includes('Redis')) {
                serviceErrorRef.current = true;
              }
              break;
            }

            case 'subscribed': {
              const msg = message as SubscribedMessage;
              console.log(`[DepthWS] Subscribed to ${msg.symbol}: ${msg.message}`);
              setIsPending(false);
              setIsUnavailable(false);
              break;
            }

            case 'unavailable': {
              const msg = message as UnavailableMessage;
              console.warn(`[DepthWS] Symbol unavailable: ${msg.symbol}: ${msg.message}`);
              setIsPending(false);
              setIsUnavailable(true);
              setError(msg.message);
              onErrorRef.current?.(msg.message);
              // Don't retry - server rejected the symbol
              serviceErrorRef.current = true;
              break;
            }

            case 'pending': {
              const msg = message as PendingMessage;
              console.log(`[DepthWS] Pending subscription: ${msg.symbol}: ${msg.message}`);
              setIsPending(true);
              break;
            }
          }
        } catch (err) {
          console.error('[DepthWS] Failed to decode message:', err);
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        // Guard: ignore if symbol changed since this connection was created
        if (currentSymbolRef.current !== connectingSymbol) return;
        console.error('[DepthWS] WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        // Unregister using the symbol this connection was created for
        unregisterConnection(connectingSymbol, ws);

        if (!mountedRef.current) return;
        // Guard: don't update state or retry if symbol has changed
        if (currentSymbolRef.current !== connectingSymbol) return;
        console.log(`[DepthWS] Connection closed: ${event.code} ${event.reason}`);
        setIsConnected(false);
        wsRef.current = null;

        // Don't retry if closed intentionally, component unmounted, or server said to try later
        if (event.code === 1000 || event.code === 1001) {
          return;
        }

        // Don't retry if server said service unavailable (1013 = Try Again Later)
        // or if we received a service error message
        if (event.code === 1013 || serviceErrorRef.current) {
          if (!serviceErrorRef.current) {
            setError('Depth service temporarily unavailable');
          }
          return;
        }

        // Reduce max retries for faster failure when service is down
        const effectiveMaxRetries = Math.min(maxRetries, 5);

        // Retry with exponential backoff
        if (retryCountRef.current < effectiveMaxRetries && enabled) {
          const delay = getBackoffDelay(retryCountRef.current);
          console.log(`[DepthWS] Retrying in ${Math.round(delay)}ms (attempt ${retryCountRef.current + 1}/${effectiveMaxRetries})`);
          retryCountRef.current++;

          retryTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              doConnect();
            }
          }, delay);
        } else if (retryCountRef.current >= effectiveMaxRetries) {
          setError('Depth service unavailable - check if Redis is running');
          onErrorRef.current?.('Maximum reconnection attempts reached');
        }
      };
    } catch (err) {
      console.error('[DepthWS] Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, [enabled, symbol, maxRetries]);

  // Debounced connect wrapper - prevents rapid reconnects during component remounts
  const connect = useCallback(() => {
    if (!enabled || !symbol) {
      return;
    }

    // Cancel any pending connection attempt
    cancelPendingConnection(symbol);

    // If there's already an active connection, don't debounce - check immediately
    const existingGlobal = getActiveConnection(symbol);
    if (existingGlobal && existingGlobal === wsRef.current) {
      console.log(`[DepthWS] Already connected for ${symbol}, no action needed`);
      return;
    }

    // Skip debounce for symbol changes - connect immediately
    if (symbolChangedRef.current) {
      symbolChangedRef.current = false;
      console.log(`[DepthWS] Symbol changed, connecting immediately to ${symbol}`);
      doConnect();
      return;
    }

    // Debounce new connection attempts (for component remounts)
    console.log(`[DepthWS] Scheduling connection for ${symbol} in ${CONNECTION_DEBOUNCE_MS}ms`);
    const timeoutId = setTimeout(() => {
      pendingConnections.delete(symbol);
      if (mountedRef.current) {
        doConnect();
      }
    }, CONNECTION_DEBOUNCE_MS);
    pendingConnections.set(symbol, timeoutId);
  }, [enabled, symbol, doConnect]);

  // Reconnect function (for manual reconnection)
  // Store callbacks in refs to avoid triggering effect re-runs
  const connectRef = useRef(connect);
  const disconnectRef = useRef(disconnect);
  connectRef.current = connect;
  disconnectRef.current = disconnect;

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    serviceErrorRef.current = false; // Reset service error flag
    setError(null);
    setIsUnavailable(false);
    setIsPending(false);
    disconnectRef.current();
    connectRef.current();
  }, []); // No dependencies - uses refs

  // Effect for connection management - ONLY depends on enabled and symbol
  // Captures symbol in closure for correct cleanup (the old symbol, not the new one)
  useEffect(() => {
    mountedRef.current = true;
    const capturedSymbol = symbol;

    if (enabled && symbol) {
      connectRef.current();
    }

    return () => {
      mountedRef.current = false;
      // Use captured symbol for cleanup - disconnectRef may already point to new symbol
      cancelPendingConnection(capturedSymbol);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (wsRef.current) {
        unregisterConnection(capturedSymbol, wsRef.current);
        wsRef.current.close(1000, 'Symbol changed');
        wsRef.current = null;
      }
    };
  }, [enabled, symbol]);

  return {
    data,
    history,
    isConnected,
    isPending,
    isUnavailable,
    error,
    lastUpdate,
    reconnect,
    disconnect,
  };
}

export default useDepthWebSocket;
