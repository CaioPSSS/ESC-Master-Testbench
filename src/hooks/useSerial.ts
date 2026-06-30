import { useState, useRef, useCallback } from 'react';

export interface TelemetryData {
  v?: string;   // Voltage
  p?: string;   // Battery percent
  s?: string;   // Status (OK, ERROR_BATTERY, CALIBRATING, CAL_DONE)
  r?: string;   // RSSI at ESP32 (signal from Arduino)
  n?: string;   // SNR at ESP32
  ar?: string;  // RSSI at Arduino (signal from ESP32)
}

export function useSerial() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [packetCount, setPacketCount] = useState(0);
  const [lastPacketTime, setLastPacketTime] = useState<number | null>(null);
  
  const portRef = useRef<any>(null);
  const writerRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const keepReadingRef = useRef(false);
  const readPromiseRef = useRef<Promise<void> | null>(null);

  const readLoop = async (port: any) => {
    while (port.readable && keepReadingRef.current) {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      let buffer = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break; // stream closed
          }
          if (value) {
            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const cleanLine = line.trim();
              if (cleanLine.startsWith('T:')) {
                // Ex: T:V=7.80,P=50,S=OK,R=-45,N=9.5,AR=-52
                try {
                  const parts = cleanLine.substring(2).split(',');
                  const data: any = {};
                  parts.forEach(p => {
                    const [k, v] = p.split('=');
                    if (k && v) data[k.toLowerCase()] = v;
                  });
                  setTelemetry(data);
                  setPacketCount(prev => prev + 1);
                  setLastPacketTime(Date.now());
                } catch(e) {}
              }
            }
          }
        }
      } catch (error: any) {
        console.error("Erro na leitura serial:", error);
        if (error.name === 'NetworkError' || String(error.message).includes('lost')) {
          setError("Dispositivo desconectado.");
          setIsConnected(false);
          keepReadingRef.current = false;
        }
      } finally {
        reader.releaseLock();
      }
    }
  };

  const connect = async () => {
    try {
      if (!('serial' in navigator)) {
        throw new Error('A API Web Serial não é suportada neste navegador.');
      }

      // @ts-ignore
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      
      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(port.writable);
      writerRef.current = textEncoder.writable.getWriter();
      
      keepReadingRef.current = true;
      readPromiseRef.current = readLoop(port);

      setIsConnected(true);
      setError(null);
      setPacketCount(0);
      setLastPacketTime(null);
    } catch (err: any) {
      console.error('Erro de conexão Serial:', err);
      if (err.message.includes('No port selected')) {
        setError('Nenhuma porta selecionada.');
      } else {
        setError(err.message || 'Falha ao conectar à porta serial.');
      }
    }
  };

  const disconnect = async () => {
    keepReadingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel().catch(() => {});
      }
      if (writerRef.current) {
        await writerRef.current.close().catch(() => {});
      }
      if (readPromiseRef.current) {
        await readPromiseRef.current.catch(() => {});
      }
      if (portRef.current) {
        await portRef.current.close().catch(() => {});
      }
    } catch (err) {
      console.error('Erro ao desconectar:', err);
    } finally {
      portRef.current = null;
      writerRef.current = null;
      readerRef.current = null;
      setIsConnected(false);
      setTelemetry(null);
      setPacketCount(0);
      setLastPacketTime(null);
    }
  };

  const send = useCallback(async (data: string) => {
    if (writerRef.current && isConnected) {
      try {
        await writerRef.current.write(data);
      } catch (err) {
        console.error('Erro ao enviar dados:', err);
        disconnect();
      }
    }
  }, [isConnected]);

  return { isConnected, connect, disconnect, send, error, telemetry, packetCount, lastPacketTime };
}
