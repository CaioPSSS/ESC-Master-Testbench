import { useState, useEffect } from 'react';
import { Power, AlertOctagon, Radio, Signal, Activity, Gauge } from 'lucide-react';
import type { TelemetryData } from '../hooks/useSerial';

interface DashboardProps {
  isConnected: boolean;
  send: (data: string) => void;
  telemetry?: TelemetryData | null;
  packetCount: number;
  lastPacketTime: number | null;
}

// Derive link quality percentage from RSSI (dBm)
// -30 dBm = excellent (100%), -120 dBm = no signal (0%)
function rssiToQuality(rssi: number): number {
  return Math.max(0, Math.min(100, Math.round(((rssi + 120) / 90) * 100)));
}

function rssiLabel(rssi: number): { text: string; color: string } {
  if (rssi >= -50) return { text: 'EXCELENTE', color: 'text-emerald-400' };
  if (rssi >= -70) return { text: 'BOM', color: 'text-emerald-400' };
  if (rssi >= -85) return { text: 'REGULAR', color: 'text-amber-400' };
  if (rssi >= -100) return { text: 'FRACO', color: 'text-amber-500' };
  return { text: 'CRÍTICO', color: 'text-rose-500' };
}

function rssiBarColor(rssi: number): string {
  if (rssi >= -50) return 'bg-emerald-500';
  if (rssi >= -70) return 'bg-emerald-400';
  if (rssi >= -85) return 'bg-amber-400';
  if (rssi >= -100) return 'bg-amber-500';
  return 'bg-rose-500';
}

function snrLabel(snr: number): { text: string; color: string } {
  if (snr >= 7) return { text: 'LIMPO', color: 'text-emerald-400' };
  if (snr >= 0) return { text: 'OK', color: 'text-amber-400' };
  return { text: 'RUIDOSO', color: 'text-rose-500' };
}

export function Dashboard({ isConnected, send, telemetry, packetCount, lastPacketTime }: DashboardProps) {
  const [throttle, setThrottle] = useState(0);
  const [isArmed, setIsArmed] = useState(false);
  const [timeSincePacket, setTimeSincePacket] = useState<number | null>(null);

  // Auto emergency disarm if Arduino reports battery error or failsafe
  useEffect(() => {
    if ((telemetry?.s === 'ERROR_BATTERY' || telemetry?.s === 'FAILSAFE') && isArmed) {
      setThrottle(0);
      setIsArmed(false);
    }
  }, [telemetry?.s, isArmed]);

  // Auto-disarm failsafe: if telemetry goes stale for 3+ seconds while armed
  useEffect(() => {
    if (isArmed && isConnected && timeSincePacket !== null && timeSincePacket > 3000) {
      setThrottle(0);
      setIsArmed(false);
      send('0\n');
    }
  }, [timeSincePacket, isArmed, isConnected, send]);

  // Send the throttle value to the serial port whenever it changes
  useEffect(() => {
    if (isConnected) {
      send(`${throttle}\n`);
    }
  }, [throttle, isConnected, send]);

  // Update "time since last packet" every 200ms
  useEffect(() => {
    if (!lastPacketTime) {
      setTimeSincePacket(null);
      return;
    }
    const interval = setInterval(() => {
      setTimeSincePacket(Date.now() - lastPacketTime);
    }, 200);
    return () => clearInterval(interval);
  }, [lastPacketTime]);

  const handleArm = () => {
    if (telemetry?.s === 'ERROR_BATTERY') {
      alert("Atenção: Tensão da bateria muito baixa! A armação foi bloqueada para proteger as células 18650.");
      return;
    }
    setThrottle(0);
    setIsArmed(true);
  };

  const handleEmergencyStop = () => {
    setThrottle(0);
    setIsArmed(false);
  };

  const isBatteryLow = telemetry?.s === 'ERROR_BATTERY';
  const isFailsafe = telemetry?.s === 'FAILSAFE';
  const voltage = telemetry?.v ? parseFloat(telemetry.v).toFixed(2) : (8.4 - (throttle * 0.008)).toFixed(1);
  const percent = telemetry?.p ? parseInt(telemetry.p) : 100;

  // LoRa link metrics
  const espRssi = telemetry?.r ? parseInt(telemetry.r) : null;
  const espSnr = telemetry?.n ? parseFloat(telemetry.n) : null;
  const ardRssi = telemetry?.ar ? parseInt(telemetry.ar) : null;

  const espQuality = espRssi !== null ? rssiToQuality(espRssi) : null;
  const isStale = timeSincePacket !== null && timeSincePacket > 2000;
  const isRecentPulse = timeSincePacket !== null && timeSincePacket < 800;

  return (
    <>
      {/* Main Slider Area */}
      <div className={`bg-slate-900/50 rounded-xl p-6 border ${isBatteryLow ? 'border-rose-500/50' : 'border-slate-800'}`}>
        <div className="flex justify-between items-end mb-6">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Throttle Control (PWM)</label>
            <div className={`text-5xl font-mono font-bold ${isBatteryLow ? 'text-rose-500' : 'text-white'}`}>{throttle}<span className="text-2xl text-slate-600">%</span></div>
          </div>
          <div className="text-right">
            {isBatteryLow ? (
              <div className="text-xs font-bold text-rose-500 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">LOW BATTERY LOCKOUT</div>
            ) : isArmed ? (
              <div className="text-xs font-bold text-rose-500 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">MOTOR ARMED (DANGER)</div>
            ) : (
              <div className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">MOTOR DISARMED (SAFE)</div>
            )}
          </div>
        </div>
        
        <div className="relative h-12 bg-slate-800 rounded-full w-full flex items-center px-2 mb-2">
          {/* Custom Track */}
          <div className={`h-8 rounded-full transition-all ${isBatteryLow ? 'bg-slate-700' : 'bg-gradient-to-r from-amber-600 to-amber-400'}`} style={{ width: `${throttle}%` }}></div>
          {/* Custom Thumb */}
          <div 
            className="absolute -translate-x-1/2 w-10 h-10 bg-white rounded-full shadow-lg border-4 border-amber-500 flex items-center justify-center pointer-events-none transition-all"
            style={{ left: `calc(0.5rem + (100% - 1rem) * ${throttle / 100})` }}
          >
            <div className="w-1 h-4 bg-slate-400 rounded"></div>
          </div>
          
          {/* Invisible Range Input for interaction */}
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={throttle}
            onChange={(e) => setThrottle(parseInt(e.target.value))}
            disabled={!isConnected || !isArmed || isBatteryLow}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500 px-2 mb-6">
          <span>1000µs (0%)</span>
          <span>1500µs (50%)</span>
          <span>2000µs (100%)</span>
        </div>

      {/* Control Buttons */}
      <div className="w-full flex gap-4">
        {!isArmed ? (
          <div className="flex flex-1 gap-4">
            <button
              onClick={handleArm}
              disabled={!isConnected || isBatteryLow}
              className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700 disabled:border text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-sm"
            >
              <Power className="w-4 h-4" />
              {isBatteryLow ? 'BATTERY TOO LOW' : 'ARM ESC'}
            </button>
            <button
              onClick={() => isConnected && send('CALIBRATE\n')}
              disabled={!isConnected || isBatteryLow}
              className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700 disabled:border text-white rounded-lg font-bold flex items-center justify-center transition-colors text-xs tracking-wider uppercase"
              title="Calibrar os extremos do acelerador (Requer desplugar bateria)"
            >
              Calibrar 2S
            </button>
          </div>
        ) : (
          <button
            onClick={handleEmergencyStop}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-colors text-sm"
          >
            <AlertOctagon className="w-4 h-4" />
            EMERGENCY STOP
          </button>
        )}
      </div>
    </div>

    {/* Telemetry Cards — Motor & Battery */}
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between">
        <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Bateria 2S Li-ion</div>
        <div className="flex items-end justify-between">
          <div className={`text-2xl font-mono ${isBatteryLow ? 'text-rose-500' : 'text-emerald-400'}`}>{percent}<span className="text-sm ml-1">%</span></div>
          <div className="text-xs text-slate-500 mb-1">{telemetry?.v ? 'Real' : 'Est.'}</div>
        </div>
        {/* Battery bar */}
        <div className="w-full h-1 bg-slate-800 mt-2 rounded-full overflow-hidden">
          <div className={`h-full ${isBatteryLow ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${percent}%` }}></div>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between">
        <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Voltagem Total</div>
        <div className="flex items-end justify-between">
          <div className={`text-2xl font-mono ${isBatteryLow ? 'text-rose-500' : 'text-white'}`}>{voltage}<span className="text-sm ml-1">V</span></div>
        </div>
        <div className="text-[10px] text-slate-500 mt-2">{telemetry ? 'A0 (Divisor 1:1, ex: 10k/10k ou 8k/8k)' : 'Simulação UI'}</div>
      </div>
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between">
        <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Status do MCU</div>
        <div className="text-sm font-bold mt-1 uppercase">
          {!isConnected ? (
             <span className="text-slate-600">OFFLINE</span>
          ) : isFailsafe ? (
             <span className="text-amber-500">FAILSAFE</span>
          ) : isBatteryLow ? (
             <span className="text-rose-500">CORTE ATIVO</span>
          ) : isStale ? (
             <span className="text-amber-400">SEM SINAL</span>
          ) : telemetry?.s === 'OK' ? (
             <span className="text-emerald-400">NORMAL</span>
          ) : (
             <span className="text-blue-400">NO TELEMETRY</span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 mt-2">
          {isFailsafe ? 'Motor parado: LoRa timeout (2s)' : 'Corte: ~6.0V (3.0V/célula)'}
        </div>
      </div>
    </div>

    {/* LoRa Link Diagnostics */}
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4 text-amber-500" />
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Link LoRa 433MHz</h3>
        {/* Live pulse indicator */}
        <div className="flex items-center gap-1.5 ml-auto">
          {isConnected && lastPacketTime ? (
            <>
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                isStale ? 'bg-rose-500' : isRecentPulse ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-emerald-500/50'
              }`}></div>
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                isStale ? 'text-rose-500' : 'text-emerald-500'
              }`}>
                {isStale ? 'STALE' : 'LIVE'}
              </span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-slate-700"></div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600">IDLE</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* RSSI ESP32 (Arduino → ESP32) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center gap-1.5 mb-2">
            <Signal className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] text-slate-500 font-bold uppercase">RSSI (Arduino → ESP32)</span>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-mono text-white">
              {espRssi !== null ? espRssi : '—'}<span className="text-sm text-slate-500 ml-1">dBm</span>
            </div>
            {espRssi !== null && (
              <span className={`text-[10px] font-bold uppercase ${rssiLabel(espRssi).color}`}>
                {rssiLabel(espRssi).text}
              </span>
            )}
          </div>
          {/* Signal bar */}
          <div className="w-full h-1.5 bg-slate-800 mt-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${espRssi !== null ? rssiBarColor(espRssi) : 'bg-slate-700'}`}
              style={{ width: `${espQuality ?? 0}%` }}
            ></div>
          </div>
        </div>

        {/* SNR (Signal-to-Noise) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span className="text-[10px] text-slate-500 font-bold uppercase">SNR (Sinal / Ruído)</span>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-mono text-white">
              {espSnr !== null ? espSnr.toFixed(1) : '—'}<span className="text-sm text-slate-500 ml-1">dB</span>
            </div>
            {espSnr !== null && (
              <span className={`text-[10px] font-bold uppercase ${snrLabel(espSnr).color}`}>
                {snrLabel(espSnr).text}
              </span>
            )}
          </div>
          {/* SNR bar: -20dB to +10dB → 0% to 100% */}
          <div className="w-full h-1.5 bg-slate-800 mt-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${espSnr !== null ? (espSnr >= 0 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-700'}`}
              style={{ width: `${espSnr !== null ? Math.max(0, Math.min(100, ((espSnr + 20) / 30) * 100)) : 0}%` }}
            ></div>
          </div>
        </div>

        {/* RSSI Arduino (ESP32 → Arduino) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center gap-1.5 mb-2">
            <Signal className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-slate-500 font-bold uppercase">RSSI (ESP32 → Arduino)</span>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-mono text-white">
              {ardRssi !== null ? ardRssi : '—'}<span className="text-sm text-slate-500 ml-1">dBm</span>
            </div>
            {ardRssi !== null && (
              <span className={`text-[10px] font-bold uppercase ${rssiLabel(ardRssi).color}`}>
                {rssiLabel(ardRssi).text}
              </span>
            )}
          </div>
          {/* Signal bar */}
          <div className="w-full h-1.5 bg-slate-800 mt-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${ardRssi !== null ? rssiBarColor(ardRssi) : 'bg-slate-700'}`}
              style={{ width: `${ardRssi !== null ? rssiToQuality(ardRssi) : 0}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Link stats row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Link Quality */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-slate-500 font-bold uppercase">Qualidade do Link</span>
          </div>
          <div className="flex items-end justify-between">
            <div className={`text-2xl font-mono font-bold ${
              espQuality === null ? 'text-slate-600' :
              espQuality >= 70 ? 'text-emerald-400' :
              espQuality >= 40 ? 'text-amber-400' : 'text-rose-500'
            }`}>
              {espQuality !== null ? espQuality : '—'}<span className="text-sm text-slate-500 ml-1">%</span>
            </div>
          </div>
          {/* Quality bar segmented */}
          <div className="flex gap-0.5 mt-3">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-sm transition-all duration-300 ${
                  espQuality !== null && i < Math.ceil(espQuality / 10)
                    ? espQuality >= 70 ? 'bg-emerald-500' : espQuality >= 40 ? 'bg-amber-400' : 'bg-rose-500'
                    : 'bg-slate-800'
                }`}
              ></div>
            ))}
          </div>
        </div>

        {/* Packets & Timing */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
          <div className="flex items-center gap-1.5 mb-2">
            <Radio className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-slate-500 font-bold uppercase">Pacotes Recebidos</span>
          </div>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-mono text-white">
              {packetCount > 0 ? packetCount.toLocaleString() : '—'}
            </div>
            <div className="text-right">
              {timeSincePacket !== null ? (
                <span className={`text-[10px] font-mono font-bold ${isStale ? 'text-rose-500' : 'text-slate-400'}`}>
                  {timeSincePacket < 1000
                    ? `${timeSincePacket}ms`
                    : `${(timeSincePacket / 1000).toFixed(1)}s`
                  } atrás
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-600">— ms</span>
              )}
            </div>
          </div>
          <div className="text-[10px] text-slate-500 mt-2">Telemetria a cada ~500ms via LoRa</div>
        </div>
      </div>
    </div>
  </>
  );
}
