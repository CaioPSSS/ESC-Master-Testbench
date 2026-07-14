import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_WS_URL,
  parseTelemetry,
  type TelemetryData,
  buildMissionPacket,
  buildMissionControlPacket,
  parseMissionControl,
  type MissionControlData,
} from '../lib/protocol';

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

  // States for tracking upload transaction progress
  const [syncStatus, setSyncStatus] = useState<'idle' | 'starting' | 'uploading' | 'verifying' | 'synced' | 'error'>('idle');
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Ref for resolving/notifying when a handshake packet is received
  const waitForAckRef = useRef<((packet: MissionControlData) => void) | null>(null);

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

      // Check if the parsed packet is a mission control packet
      const missionControl = parseMissionControl(payload);
      if (missionControl) {
        if (waitForAckRef.current) {
          waitForAckRef.current(missionControl);
        }
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

  const sendPacketAndWaitForAck = useCallback(async (
    packet: ArrayBuffer,
    expectedCmd: number,
    expectedData1: number
  ): Promise<void> => {
    let attempt = 0;
    const maxRetries = 5;

    while (attempt <= maxRetries) {
      const sent = sendBinary(packet);
      if (!sent) {
        throw new Error('WebSocket is not connected');
      }

      let timeoutId: number | undefined;
      const ackPromise = new Promise<void>((resolve, reject) => {
        waitForAckRef.current = (missionControl: MissionControlData) => {
          if (missionControl.cmd === 4) {
            reject(new Error('NACK error'));
            return;
          }
          if (missionControl.cmd === expectedCmd && missionControl.data1 === expectedData1) {
            resolve();
          }
        };

        timeoutId = window.setTimeout(() => {
          reject(new Error('Timeout error'));
        }, 500);
      });

      try {
        await ackPromise;
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
        waitForAckRef.current = null;
        return; // Success, ACK received!
      } catch (error: any) {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
        waitForAckRef.current = null;

        if (error.message === 'NACK error') {
          throw error;
        }

        // Retry on timeout
        attempt++;
        if (attempt > maxRetries) {
          throw new Error('Timeout error: failed to receive ACK after 5 retries');
        }
      }
    }
  }, [sendBinary]);

  const uploadMission = useCallback(async (waypoints: {
    lat: number;
    lon: number;
    alt?: number;
    altDecimeters?: number;
    speed?: number;
    speedCentimeters?: number;
    cmd: number;
    cmdVal?: number;
    cmd_val?: number;
  }[]) => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      if (waypoints.length === 0) {
        throw new Error('No waypoints to upload');
      }

      // Step 1: Starting
      setSyncStatus('starting');
      setSyncProgress(0);
      const wpCount = waypoints.length;
      const startPacket = buildMissionControlPacket(1, wpCount, 0);
      await sendPacketAndWaitForAck(startPacket, 3, wpCount);

      // Step 2: Uploading
      setSyncStatus('uploading');
      const wpPackets: ArrayBuffer[] = [];
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const altDecimeters = typeof wp.altDecimeters === 'number' ? wp.altDecimeters : (wp.alt !== undefined ? wp.alt * 10 : 0);
        const speedCentimeters = typeof wp.speedCentimeters === 'number' ? wp.speedCentimeters : (wp.speed !== undefined ? wp.speed * 100 : 0);
        const cmdVal = typeof wp.cmdVal === 'number' ? wp.cmdVal : (wp.cmd_val !== undefined ? wp.cmd_val : 0);

        const wpPacket = buildMissionPacket(
          i,
          wp.lat,
          wp.lon,
          altDecimeters,
          speedCentimeters,
          wp.cmd,
          cmdVal
        );
        wpPackets.push(wpPacket);

        await sendPacketAndWaitForAck(wpPacket, 3, i);
        setSyncProgress(Math.round(((i + 1) / waypoints.length) * 100));
      }

      // Step 3: Verifying
      setSyncStatus('verifying');
      let computedChecksum = 0;
      for (const packet of wpPackets) {
        const bytes = new Uint8Array(packet);
        for (let j = 0; j < bytes.length; j++) {
          computedChecksum += bytes[j];
        }
      }
      computedChecksum = computedChecksum >>> 0;

      const verifyPacket = buildMissionControlPacket(2, 0xFF, computedChecksum);
      await sendPacketAndWaitForAck(verifyPacket, 3, 0xFF);

      // Step 4: Synced
      setSyncStatus('synced');
      setSyncProgress(100);
    } catch (error: any) {
      setSyncStatus('error');
      setSyncError(error.message || String(error));
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [sendPacketAndWaitForAck]);

  const clearMission = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      setSyncStatus('starting');
      setSyncProgress(0);
      const clearPacket = buildMissionControlPacket(5, 0, 0);
      await sendPacketAndWaitForAck(clearPacket, 3, 0xFF);
      setSyncStatus('synced');
      setSyncProgress(100);
    } catch (error: any) {
      setSyncStatus('error');
      setSyncError(error.message || String(error));
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [sendPacketAndWaitForAck]);

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
    uploadMission,
    clearMission,
    syncStatus,
    syncProgress,
    syncError,
    isSyncing,
  };
}