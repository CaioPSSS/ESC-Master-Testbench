import { useState, useRef, useCallback } from 'react';

export interface TelemetryData {
  v?: string;   // Voltage
  p?: string;   // Battery percent
  s?: string;   // Status
  r?: string;   // RSSI at ESP32
  n?: string;   // SNR at ESP32
  ar?: string;  // RSSI at Arduino
  pit?: string; // Pitch (MPU6050)
  rol?: string; // Roll (MPU6050)
  alt?: string; // Altitude (BMP280)
  lat?: string; // Latitude (GPS)
  lon?: string; // Longitude (GPS)
  sat?: string; // Satellites (GPS)
  fix?: string; // Fix Quality (GPS)
  crs?: string; // Course (GPS)
}

// UUIDs padrão Nordic UART
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const CHARACTERISTIC_UUID_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const CHARACTERISTIC_UUID_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export function useBluetooth() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [packetCount, setPacketCount] = useState(0);
  const [lastPacketTime, setLastPacketTime] = useState<number | null>(null);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const rxCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const parseTelemetry = useCallback((line: string) => {
    const cleanLine = line.trim();
    if (cleanLine.startsWith('T:')) {
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
      } catch (e) {
        // Malformed telemetry — ignore
      }
    }
  }, []);

  const handleCharacteristicValueChanged = useCallback((event: any) => {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const data = decoder.decode(value);
    
    // The ESP32 sends telemetry lines (may contain \n if buffered)
    const lines = data.split('\n');
    for (const line of lines) {
      if (line.trim().length > 0) {
        parseTelemetry(line);
      }
    }
  }, [parseTelemetry]);

  const onDisconnected = useCallback(() => {
    console.log('[BLE] Dispositivo desconectado');
    setIsConnected(false);
    deviceRef.current = null;
    rxCharacteristicRef.current = null;
    setError('Conexão Bluetooth perdida.');
  }, []);

  const connect = async () => {
    try {
      if (!navigator.bluetooth) {
        throw new Error('Navegador não suporta Web Bluetooth. Use o Chrome ou Edge.');
      }

      setError(null);
      console.log('[BLE] Solicitando dispositivo...');
      
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'ESC-TestBench-BLE' }],
        optionalServices: [SERVICE_UUID]
      });

      device.addEventListener('gattserverdisconnected', onDisconnected);
      deviceRef.current = device;

      console.log('[BLE] Conectando ao GATT Server...');
      const server = await device.gatt?.connect();
      if (!server) throw new Error('Falha ao conectar ao servidor GATT.');

      console.log('[BLE] Obtendo Serviço UART...');
      const service = await server.getPrimaryService(SERVICE_UUID);

      console.log('[BLE] Obtendo características...');
      const rxChar = await service.getCharacteristic(CHARACTERISTIC_UUID_RX);
      const txChar = await service.getCharacteristic(CHARACTERISTIC_UUID_TX);

      rxCharacteristicRef.current = rxChar;

      // Habilita notificações para receber dados
      await txChar.startNotifications();
      txChar.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);

      setIsConnected(true);
      setError(null);
      setPacketCount(0);
      setLastPacketTime(null);
      console.log('[BLE] Conexão estabelecida com sucesso!');
      
    } catch (err: any) {
      console.error('[BLE] Falha na conexão:', err);
      if (err.name === 'NotFoundError') {
         setError('Seleção cancelada ou dispositivo não encontrado.');
      } else {
         setError(err.message || 'Falha ao conectar via Bluetooth.');
      }
    }
  };

  const disconnect = useCallback(() => {
    if (deviceRef.current && deviceRef.current.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    onDisconnected();
    setError(null);
  }, [onDisconnected]);

  const send = useCallback(async (data: string) => {
    if (rxCharacteristicRef.current && isConnected) {
      try {
        const encoder = new TextEncoder();
        await rxCharacteristicRef.current.writeValue(encoder.encode(data));
      } catch (err) {
        console.error('[BLE] Erro ao enviar:', err);
      }
    }
  }, [isConnected]);

  return { isConnected, connect, disconnect, send, error, telemetry, packetCount, lastPacketTime };
}
