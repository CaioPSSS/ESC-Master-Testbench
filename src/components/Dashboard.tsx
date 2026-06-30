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
  if (rssi >= -50) return { text: 'EXC', color: 'text-emerald-400' };
  if (rssi >= -70) return { text: 'BOM', color: 'text-emerald-400' };
  if (rssi >= -85) return { text: 'REG', color: 'text-amber-400' };
  if (rssi >= -100) return { text: 'FRAC', color: 'text-amber-500' };
  return { text: 'CRIT', color: 'text-rose-500' };
}

function snrLabel(snr: number): { text: string; color: string } {
  if (snr >= 7) return { text: 'LIMPO', color: 'text-emerald-400' };
  if (snr >= 0) return { text: 'OK', color: 'text-amber-400' };
  return { text: 'RUIDO', color: 'text-rose-500' };
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

  // Dynamic glow calculation based on throttle value
  const getThrottleGlow = () => {
    if (throttle === 0) return {};
    const intensity = throttle * 0.12;
    const color = throttle > 50 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.3)';
    return {
      boxShadow: `0 0 ${8 + intensity}px ${color}, inset 0 0 ${4 + intensity * 0.5}px ${color}`,
    };
  };

  const getThrottleTextGlow = () => {
    if (throttle === 0) return {};
    const color = throttle > 50 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(245, 158, 11, 0.6)';
    return {
      textShadow: `0 0 ${6 + throttle * 0.08}px ${color}`,
    };
  };

  return (
    <div className="space-y-6">
      {/* Main Slider Area */}
      <div 
        className={`bg-slate-900/40 backdrop-blur-md rounded-xl p-6 border transition-all duration-300 ${
          isBatteryLow ? 'border-rose-500/50 animate-alert-rose' : 
          isFailsafe ? 'border-amber-500/50 animate-alert-amber' : 
          'border-slate-800/80'
        }`}
      >
        <div className="flex justify-between items-end mb-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 block">Throttle Control (PWM)</label>
            <div 
              style={getThrottleTextGlow()} 
              className={`text-4xl font-mono font-bold transition-all duration-150 ${isBatteryLow ? 'text-rose-500' : 'text-white'}`}
            >
              {throttle}<span className="text-xl text-slate-600">%</span>
            </div>
          </div>
          <div className="text-right">
            {isBatteryLow ? (
              <div className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">LOW BATTERY LOCKOUT</div>
            ) : isFailsafe ? (
              <div className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">FAILSAFE TRIGGERED</div>
            ) : isArmed ? (
              <div className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 animate-pulse">MOTOR ARMED (DANGER)</div>
            ) : (
              <div className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">MOTOR DISARMED (SAFE)</div>
            )}
          </div>
        </div>
        
        <div className="relative h-12 bg-slate-850/80 border border-slate-800/40 rounded-full w-full flex items-center px-1.5 mb-2">
          {/* Custom Track */}
          <div 
            style={getThrottleGlow()}
            className={`h-9 rounded-full transition-all duration-150 ${
              isBatteryLow ? 'bg-slate-700' : 'bg-gradient-to-r from-amber-600 to-amber-400'
            }`} 
            style={{ 
              width: `${throttle}%`,
              ...getThrottleGlow()
            }}
          ></div>
          
          {/* Custom Thumb */}
          <div 
            className="absolute -translate-x-1/2 w-10 h-10 bg-white rounded-full shadow-lg border-3 border-amber-500 flex items-center justify-center pointer-events-none transition-all duration-150"
            style={{ left: `calc(0.5rem + (100% - 1rem) * ${throttle / 100})` }}
          >
            <div className="w-0.5 h-4 bg-slate-400 rounded"></div>
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
        <div className="flex justify-between text-[10px] font-mono text-slate-500 px-2 mb-5">
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
                className="flex-[2] py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700 disabled:border text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                {isBatteryLow ? 'BATTERY TOO LOW' : 'ARM ESC'}
              </button>
              <button
                onClick={() => isConnected && send('CALIBRATE\n')}
                disabled={!isConnected || isBatteryLow}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700 disabled:border text-white rounded-lg font-bold flex items-center justify-center transition-all text-[10px] tracking-wider uppercase cursor-pointer"
                title="Calibrar os extremos do acelerador (Requer desplugar bateria)"
              >
                Calibrar 2S
              </button>
            </div>
          ) : (
            <button
              onClick={handleEmergencyStop}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer shadow-[0_0_12px_rgba(239,68,68,0.4)]"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              EMERGENCY STOP
            </button>
          )}
        </div>
      </div>

      {/* Telemetry Cards — Motor & Battery */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-4 rounded-lg flex flex-col justify-between">
          <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Bateria 2S Li-ion</div>
          <div className="flex items-end justify-between">
            <div className={`text-xl font-mono font-bold ${isBatteryLow ? 'text-rose-500' : 'text-emerald-400'}`}>{percent}<span className="text-xs ml-0.5">%</span></div>
            <div className="text-[10px] text-slate-500">{telemetry?.v ? 'Real' : 'Est.'}</div>
          </div>
          {/* Battery bar */}
          <div className="w-full h-1 bg-slate-800 mt-1.5 rounded-full overflow-hidden">
            <div className={`h-full ${isBatteryLow ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${percent}%` }}></div>
          </div>
        </div>
        
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-4 rounded-lg flex flex-col justify-between">
          <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Voltagem Total</div>
          <div className="flex items-end justify-between">
            <div className={`text-xl font-mono font-bold ${isBatteryLow ? 'text-rose-500' : 'text-white'}`}>{voltage}<span className="text-xs ml-0.5">V</span></div>
          </div>
          <div className="text-[8px] text-slate-500 mt-1.5 leading-none">{telemetry ? 'Sensor A0' : 'Simulação UI'}</div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-4 rounded-lg flex flex-col justify-between">
          <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Status do MCU</div>
          <div className="text-xs font-bold uppercase mt-1">
            {!isConnected ? (
               <span className="text-slate-600">OFFLINE</span>
            ) : isFailsafe ? (
               <span className="text-amber-500 animate-pulse">FAILSAFE</span>
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
          <div className="text-[8px] text-slate-500 mt-1.5 leading-none">
            {isFailsafe ? 'LoRa timeout (2s)' : 'Corte: ~6.0V'}
          </div>
        </div>
      </div>

      {/* LoRa Link Diagnostics */}
      <div className="space-y-3.5">
        <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
          <Radio className="w-3.5 h-3.5 text-amber-500" />
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Link LoRa 433MHz</h3>
          
          {/* Prominent dynamic Link Quality bar in header */}
          {espQuality !== null && (
            <div className="flex items-center gap-1.5 ml-4">
              <div className="flex gap-0.5 items-end h-3">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-0.5 rounded-t-xs transition-all duration-300 ${
                      i < Math.ceil(espQuality / 20)
                        ? espQuality >= 70 ? 'bg-emerald-500' : espQuality >= 40 ? 'bg-amber-400' : 'bg-rose-500'
                        : 'bg-slate-800'
                    }`}
                    style={{ height: `${(i + 1) * 20}%` }}
                  ></div>
                ))}
              </div>
              <span className={`text-[10px] font-mono font-bold ${
                espQuality >= 70 ? 'text-emerald-400' : espQuality >= 40 ? 'text-amber-400' : 'text-rose-500'
              }`}>{espQuality}%</span>
            </div>
          )}

          {/* Live heartbeat pulse indicator */}
          <div className="flex items-center gap-1.5 ml-auto">
            {isConnected && lastPacketTime ? (
              <>
                <div className="relative w-2 h-2 flex items-center justify-center">
                  {!isStale && (
                    <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping-slow"></div>
                  )}
                  <div className={`w-2 h-2 rounded-full transition-colors duration-300 relative z-10 ${
                    isStale ? 'bg-rose-500' : 'bg-emerald-400'
                  }`}></div>
                </div>
                <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
                  isStale ? 'text-rose-500' : 'text-emerald-500'
                }`}>
                  {isStale ? 'STALE' : 'LIVE'}
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-600">IDLE</span>
              </>
            )}
          </div>
        </div>

        {/* 4-column compact grid */}
        <div className="grid grid-cols-4 gap-4">
          {/* Card 1: RSSI Bidirecional */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-3.5 rounded-lg flex flex-col justify-between">
            <div className="flex items-center gap-1 mb-1">
              <Signal className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] text-slate-500 font-bold uppercase">RSSI (Sinal)</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-center border-t border-slate-800/40 pt-1 mt-0.5">
              <div>
                <div className="text-[7px] text-slate-500 uppercase font-bold leading-none mb-0.5">Bridge</div>
                <div className="text-xs font-mono text-white font-bold leading-tight">
                  {espRssi !== null ? `${espRssi}` : '—'}<span className="text-[8px] text-slate-500 font-normal">dBm</span>
                </div>
              </div>
              <div className="border-l border-slate-800/60">
                <div className="text-[7px] text-slate-500 uppercase font-bold leading-none mb-0.5">Remoto</div>
                <div className="text-xs font-mono text-white font-bold leading-tight">
                  {ardRssi !== null ? `${ardRssi}` : '—'}<span className="text-[8px] text-slate-500 font-normal">dBm</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: SNR (Ruído) */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-3.5 rounded-lg flex flex-col justify-between">
            <div className="flex items-center gap-1 mb-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] text-slate-500 font-bold uppercase">SNR (Ruído)</span>
            </div>
            <div className="flex items-end justify-between border-t border-slate-800/40 pt-1 mt-0.5">
              <div className="text-xs font-mono text-white font-bold leading-tight">
                {espSnr !== null ? `${espSnr > 0 ? '+' : ''}${espSnr.toFixed(1)}` : '—'}<span className="text-[8px] text-slate-500 font-normal ml-0.5">dB</span>
              </div>
              {espSnr !== null && (
                <span className={`text-[8px] font-bold uppercase scale-90 origin-right ${snrLabel(espSnr).color}`}>
                  {snrLabel(espSnr).text}
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Qualidade do Link */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-3.5 rounded-lg flex flex-col justify-between">
            <div className="flex items-center gap-1 mb-1">
              <Gauge className="w-3 h-3 text-amber-400" />
              <span className="text-[9px] text-slate-500 font-bold uppercase">Link Qual.</span>
            </div>
            <div className="flex items-end justify-between border-t border-slate-800/40 pt-1 mt-0.5">
              <div className={`text-xs font-mono font-bold leading-tight ${
                espQuality === null ? 'text-slate-600' :
                espQuality >= 70 ? 'text-emerald-400' :
                espQuality >= 40 ? 'text-amber-400' : 'text-rose-500'
              }`}>
                {espQuality !== null ? espQuality : '—'}<span className="text-[8px] text-slate-500 font-normal ml-0.5">%</span>
              </div>
              {espRssi !== null && (
                <span className={`text-[8px] font-bold uppercase scale-90 origin-right ${rssiLabel(espRssi).color}`}>
                  {rssiLabel(espRssi).text}
                </span>
              )}
            </div>
          </div>

          {/* Card 4: Pacotes & Tempo */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-3.5 rounded-lg flex flex-col justify-between">
            <div className="flex items-center gap-1 mb-1">
              <Radio className="w-3 h-3 text-amber-400" />
              <span className="text-[9px] text-slate-500 font-bold uppercase">Pacotes</span>
            </div>
            <div className="flex items-end justify-between font-mono border-t border-slate-800/40 pt-1 mt-0.5 leading-tight">
              <div className="text-xs text-white font-bold">
                {packetCount > 0 ? packetCount : '—'}
              </div>
              {timeSincePacket !== null && (
                <span className={`text-[8px] font-bold scale-90 origin-right ${isStale ? 'text-rose-500 animate-pulse' : 'text-slate-500'}`}>
                  {timeSincePacket < 1000 ? `${timeSincePacket}ms` : `${(timeSincePacket / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
