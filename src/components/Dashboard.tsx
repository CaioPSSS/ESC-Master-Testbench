import { useState, useEffect } from 'react';
import { Power, AlertOctagon } from 'lucide-react';

interface DashboardProps {
  isConnected: boolean;
  send: (data: string) => void;
  telemetry?: { v?: string, p?: string, s?: string } | null;
}

export function Dashboard({ isConnected, send, telemetry }: DashboardProps) {
  const [throttle, setThrottle] = useState(0);
  const [isArmed, setIsArmed] = useState(false);

  // Auto emergency disarm if Arduino reports battery error
  useEffect(() => {
    if (telemetry?.s === 'ERROR_BATTERY' && isArmed) {
      setThrottle(0);
      setIsArmed(false);
    }
  }, [telemetry?.s, isArmed]);

  // Send the throttle value to the serial port whenever it changes
  useEffect(() => {
    if (isConnected) {
      send(`${throttle}\n`);
    }
  }, [throttle, isConnected, send]);

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
  const voltage = telemetry?.v ? parseFloat(telemetry.v).toFixed(2) : (8.4 - (throttle * 0.008)).toFixed(1);
  const percent = telemetry?.p ? parseInt(telemetry.p) : 100;

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

    {/* Telemetry Cards */}
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
          ) : isBatteryLow ? (
             <span className="text-rose-500">CORTE ATIVO</span>
          ) : telemetry?.s === 'OK' ? (
             <span className="text-emerald-400">NORMAL</span>
          ) : (
             <span className="text-blue-400">NO TELEMETRY</span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 mt-2">Corte: ~6.0V (3.0V/célula)</div>
      </div>
    </div>
  </>
  );
}
