import { useState, useEffect, useRef } from 'react';
import { Power, AlertOctagon, Radio, Signal, Activity, Gauge, LocateFixed, Satellite } from 'lucide-react';
import type { TelemetryData } from '../hooks/useBluetooth';
import { AttitudeIndicator } from './AttitudeIndicator';
import { MapWidget } from './MapWidget';
import { CompassWidget } from './CompassWidget';

interface DashboardProps {
  isConnected: boolean;
  send: (data: string) => void;
  telemetry?: TelemetryData | null;
  packetCount: number;
  lastPacketTime: number | null;
}

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
  const [pitch, setPitch] = useState(0);
  const [roll, setRoll] = useState(0);
  const [isArmed, setIsArmed] = useState(false);
  const [timeSincePacket, setTimeSincePacket] = useState<number | null>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const lastSendTimeRef = useRef<number>(0);

  const PITCH_TRIM = 0;
  const ROLL_TRIM = 0;

  const handleJoystickMove = (e: React.PointerEvent) => {
    if (!isArmed || isBatteryLow) return;
    if (e.buttons !== 1) return;
    if (!joystickRef.current) return;
    
    const rect = joystickRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    let newRoll = Math.round(((x - centerX) / centerX) * 100);
    let newPitch = Math.round(((centerY - y) / centerY) * 100);
    
    newRoll = Math.max(-100, Math.min(100, newRoll));
    newPitch = Math.max(-100, Math.min(100, newPitch));
    
    setRoll(newRoll);
    setPitch(newPitch);
  };

  const handleJoystickRelease = () => {
    setRoll(0);
    setPitch(0);
  };

  useEffect(() => {
    if ((telemetry?.s === 'ERROR_BATTERY' || telemetry?.s === 'FAILSAFE') && isArmed) {
      setThrottle(0);
      setIsArmed(false);
    }
  }, [telemetry?.s, isArmed]);

  useEffect(() => {
    if (isArmed && isConnected && timeSincePacket !== null && timeSincePacket > 3000) {
      setThrottle(0);
      setIsArmed(false);
      send('0\n');
    }
  }, [timeSincePacket, isArmed, isConnected, send]);

  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    
    const valueToSend = throttle > 0 ? Math.round(6 + ((throttle - 1) * (100 - 6)) / (100 - 1)) : 0;
    const pitchToSend = Math.max(-100, Math.min(100, pitch + PITCH_TRIM));
    const rollToSend = Math.max(-100, Math.min(100, roll + ROLL_TRIM));
    const msg = `${valueToSend},${pitchToSend},${rollToSend}\n`;
    
    const now = Date.now();
    if (now - lastSendTimeRef.current > 100) {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      send(msg);
      lastSendTimeRef.current = now;
    } else if (!pendingTimerRef.current) {
      pendingTimerRef.current = setTimeout(() => {
        send(msg);
        lastSendTimeRef.current = Date.now();
        pendingTimerRef.current = null;
      }, 100 - (now - lastSendTimeRef.current));
    }
  }, [throttle, pitch, roll, isConnected, send]);

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      const valueToSend = throttle > 0 ? Math.round(6 + ((throttle - 1) * (100 - 6)) / (100 - 1)) : 0;
      const pitchToSend = Math.max(-100, Math.min(100, pitch + PITCH_TRIM));
      const rollToSend = Math.max(-100, Math.min(100, roll + ROLL_TRIM));
      send(`${valueToSend},${pitchToSend},${rollToSend}\n`);
    }, 300);
    return () => clearInterval(interval);
  }, [isConnected, throttle, pitch, roll, send]);

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
      alert("Atenção: Tensão da bateria muito baixa!");
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
  
  const mpuPitch = telemetry?.pit ? parseFloat(telemetry.pit) : 0;
  const mpuRoll = telemetry?.rol ? parseFloat(telemetry.rol) : 0;
  const altitude = telemetry?.alt ? parseFloat(telemetry.alt) : 0;
  const latitude = telemetry?.lat ? parseFloat(telemetry.lat) : -12.9714;
  const longitude = telemetry?.lon ? parseFloat(telemetry.lon) : -38.5104;
  const gpsSat = telemetry?.sat ? parseInt(telemetry.sat) : 0;
  const gpsFix = telemetry?.fix ? parseInt(telemetry.fix) : 0;
  const gpsCourse = telemetry?.crs ? parseFloat(telemetry.crs) : 0;

  const espRssi = telemetry?.r ? parseInt(telemetry.r) : null;
  const espSnr = telemetry?.n ? parseFloat(telemetry.n) : null;
  const ardRssi = telemetry?.ar ? parseInt(telemetry.ar) : null;
  const espQuality = espRssi !== null ? rssiToQuality(espRssi) : null;
  const isStale = timeSincePacket !== null && timeSincePacket > 2000;

  const getThrottleGlow = () => {
    if (throttle === 0) return {};
    const intensity = throttle * 0.12;
    const color = throttle > 50 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.3)';
    return { boxShadow: `0 0 ${8 + intensity}px ${color}, inset 0 0 ${4 + intensity * 0.5}px ${color}` };
  };

  const getThrottleTextGlow = () => {
    if (throttle === 0) return {};
    const color = throttle > 50 ? 'rgba(239, 68, 68, 0.7)' : 'rgba(245, 158, 11, 0.6)';
    return { textShadow: `0 0 ${6 + throttle * 0.08}px ${color}` };
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pr-1 custom-scrollbar space-y-6">
      
      {/* --- TOP ROW: CONTROLS (Left) vs INSTRUMENTS (Right) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: Controls & Battery */}
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
          <div className={`bg-slate-900/40 backdrop-blur-md rounded-xl p-6 border transition-all duration-300 ${
            isBatteryLow ? 'border-rose-500/50 animate-alert-rose' : 
            isFailsafe ? 'border-amber-500/50 animate-alert-amber' : 'border-slate-800/80'
          }`}>
            <div className="flex justify-between items-end mb-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 block">Throttle Control (PWM)</label>
                <div style={getThrottleTextGlow()} className={`text-4xl font-mono font-bold transition-all duration-150 ${isBatteryLow ? 'text-rose-500' : 'text-white'}`}>
                  {throttle}<span className="text-xl text-slate-600">%</span>
                </div>
              </div>
              <div className="text-right">
                {isBatteryLow ? (
                  <div className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">LOW BATTERY</div>
                ) : isFailsafe ? (
                  <div className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">FAILSAFE</div>
                ) : isArmed ? (
                  <div className="text-[9px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 animate-pulse">ARMED</div>
                ) : (
                  <div className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">DISARMED</div>
                )}
              </div>
            </div>
            
            <div className="relative h-12 bg-slate-850/80 border border-slate-800/40 rounded-full w-full flex items-center px-1.5 mb-2">
              <div 
                className={`h-9 rounded-full transition-all duration-150 ${isBatteryLow ? 'bg-slate-700' : 'bg-gradient-to-r from-amber-600 to-amber-400'}`} 
                style={{ width: `${throttle}%`, ...getThrottleGlow() }}
              ></div>
              <div 
                className="absolute -translate-x-1/2 w-10 h-10 bg-white rounded-full shadow-lg border-3 border-amber-500 flex items-center justify-center pointer-events-none transition-all duration-150"
                style={{ left: `calc(0.5rem + (100% - 1rem) * ${throttle / 100})` }}
              >
                <div className="w-0.5 h-4 bg-slate-400 rounded"></div>
              </div>
              <input 
                type="range" min="0" max="100" value={throttle}
                onChange={(e) => setThrottle(parseInt(e.target.value))}
                disabled={!isConnected || !isArmed || isBatteryLow}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
              />
            </div>
            
            <div className="w-full flex gap-4 mt-5">
              {!isArmed ? (
                <div className="flex flex-1 gap-4">
                  <button onClick={handleArm} disabled={!isConnected || isBatteryLow} className="flex-[2] py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700 disabled:border text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer">
                    <Power className="w-3.5 h-3.5" /> {isBatteryLow ? 'BATTERY TOO LOW' : 'ARM ESC'}
                  </button>
                  <button onClick={() => isConnected && send('CALIBRATE\n')} disabled={!isConnected || isBatteryLow} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-700 disabled:border text-white rounded-lg font-bold flex items-center justify-center transition-all text-[10px] tracking-wider uppercase cursor-pointer">
                    Calibrar
                  </button>
                </div>
              ) : (
                <button onClick={handleEmergencyStop} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer shadow-[0_0_12px_rgba(239,68,68,0.4)]">
                  <AlertOctagon className="w-3.5 h-3.5" /> EMERGENCY STOP
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={`bg-slate-900/40 backdrop-blur-md rounded-xl p-6 border transition-all duration-300 flex flex-col items-center ${isBatteryLow ? 'border-rose-500/50' : isFailsafe ? 'border-amber-500/50' : 'border-slate-800/80'}`}>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block w-full text-left">Elevon Control</label>
              <div 
                ref={joystickRef}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handleJoystickMove(e); }}
                onPointerMove={handleJoystickMove}
                onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); handleJoystickRelease(); }}
                onPointerCancel={handleJoystickRelease}
                className={`relative w-40 h-40 bg-slate-850/80 border-2 rounded-full overflow-hidden touch-none select-none transition-colors ${isBatteryLow || !isArmed || !isConnected ? 'border-slate-800 cursor-not-allowed opacity-50' : 'border-cyan-900/60 cursor-crosshair'}`}
                style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}
              >
                <div className="absolute inset-x-0 top-1/2 h-px bg-slate-700/50 -translate-y-1/2 pointer-events-none"></div>
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-700/50 -translate-x-1/2 pointer-events-none"></div>
                <div 
                  className="absolute w-10 h-10 bg-white rounded-full shadow-lg border-4 border-cyan-500 pointer-events-none transition-transform duration-75 ease-out"
                  style={{ 
                    left: '50%', top: '50%',
                    transform: `translate(calc(-50% + ${(roll / 100) * 60}px), calc(-50% + ${(-pitch / 100) * 60}px))`,
                    boxShadow: (pitch !== 0 || roll !== 0) ? '0 0 15px rgba(6, 182, 212, 0.5)' : 'none'
                  }}
                ><div className="absolute inset-1.5 bg-slate-200 rounded-full"></div></div>
              </div>
              <div className={`text-xs font-mono font-bold transition-all duration-150 mt-4 ${isBatteryLow ? 'text-rose-500' : 'text-cyan-400'}`}>
                P:{pitch} | R:{roll}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-4 rounded-xl flex-1 flex flex-col justify-between">
                <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Bateria 2S Li-ion</div>
                <div className="flex items-end justify-between">
                  <div className={`text-xl font-mono font-bold ${isBatteryLow ? 'text-rose-500' : 'text-emerald-400'}`}>{percent}<span className="text-xs ml-0.5">%</span></div>
                  <div className={`text-xl font-mono font-bold ${isBatteryLow ? 'text-rose-500' : 'text-white'}`}>{voltage}<span className="text-xs ml-0.5">V</span></div>
                </div>
                <div className="w-full h-1 bg-slate-800 mt-2 rounded-full overflow-hidden">
                  <div className={`h-full ${isBatteryLow ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${percent}%` }}></div>
                </div>
              </div>
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-4 rounded-xl flex-1 flex flex-col justify-between">
                <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Status MCU</div>
                <div className="text-sm font-bold uppercase mt-1">
                  {!isConnected ? <span className="text-slate-600">OFFLINE</span> : isFailsafe ? <span className="text-amber-500 animate-pulse">FAILSAFE</span> : isBatteryLow ? <span className="text-rose-500">CORTE ATIVO</span> : isStale ? <span className="text-amber-400">SEM SINAL</span> : telemetry?.s === 'OK' ? <span className="text-emerald-400">NORMAL</span> : <span className="text-blue-400">NO TELEMETRY</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Instruments */}
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col">
          <div className="grid grid-cols-2 gap-4">
            
            {/* Attitude Indicator */}
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-6 rounded-xl flex flex-col items-center justify-center">
              <div className="w-full flex justify-between items-center mb-4">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Atitude (MPU6050)</span>
              </div>
              <AttitudeIndicator pitch={mpuPitch} roll={mpuRoll} />
              <div className="flex gap-4 mt-4 w-full justify-center">
                <div className="text-center">
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Pitch</div>
                  <div className="text-xs font-mono text-cyan-400 font-bold">{mpuPitch.toFixed(1)}°</div>
                </div>
                <div className="text-center border-l border-slate-800 pl-4">
                  <div className="text-[9px] text-slate-500 uppercase font-bold">Roll</div>
                  <div className="text-xs font-mono text-indigo-400 font-bold">{mpuRoll.toFixed(1)}°</div>
                </div>
              </div>
            </div>

            {/* Compass & Altimeter */}
            <div className="flex flex-col gap-4">
              {/* Compass (Track Angle) */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-4 rounded-xl flex-1 flex flex-col items-center justify-center">
                <div className="w-full flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Curso (Track)</span>
                </div>
                <CompassWidget heading={gpsCourse} />
              </div>

              {/* Altimeter */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-4 rounded-xl flex flex-col items-center justify-center">
                <div className="w-full flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Altitude (Rel)</span>
                </div>
                <div className="text-4xl font-mono font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                  {altitude.toFixed(1)}<span className="text-lg text-slate-500 ml-1">m</span>
                </div>
              </div>
            </div>

          </div>

          {/* LoRa Diagnostics (Moved here to fill empty space) */}
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-3 rounded-xl flex-1 flex flex-col">
            <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2 mb-2.5">
              <Radio className="w-4 h-4 text-amber-500" />
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Link LoRa 433MHz</h3>
              
              <div className="flex items-center gap-1.5 ml-auto">
                {isConnected && lastPacketTime ? (
                  <>
                    <div className="relative w-2 h-2 flex items-center justify-center">
                      {!isStale && <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping-slow"></div>}
                      <div className={`w-2 h-2 rounded-full transition-colors duration-300 relative z-10 ${isStale ? 'bg-rose-500' : 'bg-emerald-400'}`}></div>
                    </div>
                    <span className={`text-[9px] font-mono font-bold uppercase tracking-wider ${isStale ? 'text-rose-500' : 'text-emerald-500'}`}>
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

            <div className="space-y-2 flex-1 flex flex-col justify-between">
              {/* Link Quality */}
              <div className="bg-slate-900/60 border border-slate-800/80 py-1.5 px-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Qualidade</span>
                </div>
                {espQuality !== null ? (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5 items-end h-3.5">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className={`w-1 rounded-t-xs transition-all duration-300 ${i < Math.ceil(espQuality / 20) ? espQuality >= 70 ? 'bg-emerald-500' : espQuality >= 40 ? 'bg-amber-400' : 'bg-rose-500' : 'bg-slate-800'}`}
                          style={{ height: `${(i + 1) * 20}%` }}
                        ></div>
                      ))}
                    </div>
                    <span className={`text-sm font-mono font-bold leading-none ${espQuality >= 70 ? 'text-emerald-400' : espQuality >= 40 ? 'text-amber-400' : 'text-rose-500'}`}>{espQuality}%</span>
                  </div>
                ) : (
                  <span className="text-sm font-mono text-slate-600 font-bold leading-none">—</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/60 border border-slate-800/80 p-2 rounded-lg flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Signal className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[9px] text-slate-500 font-bold uppercase">RSSI (Bridge)</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-base font-mono text-white font-bold leading-none">{espRssi !== null ? `${espRssi}` : '—'}</div>
                    <span className="text-[9px] text-slate-500 font-normal leading-none">dBm</span>
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 p-2 rounded-lg flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Signal className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[9px] text-slate-500 font-bold uppercase">RSSI (Nano)</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-base font-mono text-white font-bold leading-none">{ardRssi !== null ? `${ardRssi}` : '—'}</div>
                    <span className="text-[9px] text-slate-500 font-normal leading-none">dBm</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/60 border border-slate-800/80 p-2 rounded-lg flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[9px] text-slate-500 font-bold uppercase">SNR (Ruído)</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-base font-mono text-white font-bold leading-none">
                      {espSnr !== null ? `${espSnr > 0 ? '+' : ''}${espSnr.toFixed(1)}` : '—'}
                    </div>
                    <span className="text-[9px] text-slate-500 font-normal leading-none">dB</span>
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800/80 p-2 rounded-lg flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Radio className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Pacotes</span>
                  </div>
                  <div className="flex items-end justify-between leading-none">
                    <div className="text-base font-mono text-white font-bold">{packetCount > 0 ? packetCount : '—'}</div>
                    {timeSincePacket !== null && <span className={`text-[8px] font-bold ${isStale ? 'text-rose-500 animate-pulse' : 'text-slate-500'}`}>{timeSincePacket < 1000 ? `${timeSincePacket}ms` : `${(timeSincePacket / 1000).toFixed(1)}s`}</span>}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* --- BOTTOM ROW: MAP --- */}
      <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
        
        {/* GPS Map & Status */}
        <div className="w-full flex flex-col gap-4">
          <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 p-4 rounded-xl w-full flex flex-col min-h-[350px]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <LocateFixed className="w-3.5 h-3.5 text-cyan-500" />
                Rastreamento GPS (NEO6M)
              </span>
              
              <div className="flex items-center gap-4">
                {/* Satellites & Fix Quality */}
                <div className="flex items-center gap-1.5">
                  <Satellite className={`w-3.5 h-3.5 ${gpsFix > 0 ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span className={`text-[10px] font-mono font-bold ${gpsFix > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {gpsSat} SATS
                  </span>
                </div>
                
                <div className="text-[9px] font-mono text-slate-400">
                  LAT: <span className="text-white">{latitude.toFixed(6)}</span> | LON: <span className="text-white">{longitude.toFixed(6)}</span>
                </div>
              </div>
            </div>
            
            <div className="flex-1 rounded-lg overflow-hidden border border-slate-700/50 relative">
              {gpsFix === 0 && (
                <div className="absolute inset-0 z-20 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
                  <Satellite className="w-8 h-8 text-slate-500 mb-2 animate-pulse" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Buscando Satélites (Cold Start)</span>
                </div>
              )}
              <MapWidget lat={latitude} lon={longitude} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
