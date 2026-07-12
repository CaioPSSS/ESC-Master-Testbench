import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_WS_URL, parseTelemetry, type TelemetryData } from '../lib/protocol';

type WebSocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export function useWebSocket(initialUrl: string = DEFAULT_WS_URL) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const telemetryTimeoutRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const urlRef = useRef(initialUrl);
  const reconnectDelayRef = useRef(1000); // S-10: Exponential backoff delay starting at 1s

  const [status, setStatus] = useState<WebSocketStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastTelemetry, setLastTelemetry] = useState<TelemetryData | null>(null);
  const [packetCount, setPacketCount] = useState(0);
  const [lastPacketTime, setLastPacketTime] = useState<number | null>(null);
  const [isTelemetryLost, setIsTelemetryLost] = useState(false);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearTelemetryTimeout = useCallback(() => {
    if (telemetryTimeoutRef.current !== null) {
      window.clearTimeout(telemetryTimeoutRef.current);
      telemetryTimeoutRef.current = null;
    }
  }, []);

  const armTelemetryTimeout = useCallback(() => {
    clearTelemetryTimeout();
    telemetryTimeoutRef.current = window.setTimeout(() => {
      setIsTelemetryLost(true);
    }, 1500);
  }, [clearTelemetryTimeout]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearReconnectTimer();
    clearTelemetryTimeout();

    if (socketRef.current) {
      socketRef.current.onopen = null;
      socketRef.current.onclose = null;
      socketRef.current.onerror = null;
      socketRef.current.onmessage = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    setStatus('disconnected');
    setIsTelemetryLost(false);
  }, [clearReconnectTimer]);

  const connect = useCallback((nextUrl?: string) => {
    const targetUrl = nextUrl ?? urlRef.current;
    urlRef.current = targetUrl;
    shouldReconnectRef.current = true;
    clearReconnectTimer();

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.CONNECTING) {
      return;
    }

    setStatus('connecting');
    setError(null);
    setIsTelemetryLost(false);

    const socket = new WebSocket(targetUrl);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      setStatus('connected');
      setError(null);
      reconnectDelayRef.current = 1000; // S-10: Reset backoff on success
    };

    socket.onmessage = async (event) => {
      const payload = event.data instanceof ArrayBuffer
        ? event.data
        : event.data instanceof Blob
          ? await event.data.arrayBuffer()
          : null;

      if (!payload) {
        return;
      }

      const telemetry = parseTelemetry(payload);
      if (telemetry) {
        setLastTelemetry(telemetry);
        setPacketCount((previous) => previous + 1);
        setLastPacketTime(Date.now());
        setIsTelemetryLost(false);
        armTelemetryTimeout();
      }
    };

    socket.onerror = () => {
      setStatus('error');
      setError(`Falha no WebSocket em ${targetUrl}`);
    };

    socket.onclose = () => {
      socketRef.current = null;
      clearTelemetryTimeout();

      if (shouldReconnectRef.current) {
        setStatus('connecting');
        const delay = reconnectDelayRef.current;
        // S-10: Double delay up to max 10s
        reconnectDelayRef.current = Math.min(delay * 2, 10000);
        reconnectTimerRef.current = window.setTimeout(() => {
          connect(targetUrl);
        }, delay);
      } else {
        setStatus('disconnected');
      }
    };

    socketRef.current = socket;
  }, [clearReconnectTimer]);

  const sendBinary = useCallback((buffer: ArrayBuffer) => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(buffer);
    return true;
  }, []);

  useEffect(() => {
    connect(urlRef.current);

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    if (!isTelemetryLost) {
      return;
    }

    clearTelemetryTimeout();
  }, [clearTelemetryTimeout, isTelemetryLost]);

  return {
    connect,
    disconnect,
    error,
    isConnected: status === 'connected',
    lastPacketTime,
    lastTelemetry,
    isTelemetryLost,
    packetCount,
    sendBinary,
    status,
    url: urlRef.current,
  };
}