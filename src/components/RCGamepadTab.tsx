import { useEffect, useRef } from 'react';
import { Armchair, Gamepad2, Power, RotateCcw, SatelliteDish, ShieldAlert } from 'lucide-react';

import type { FlightMode, ParsedGamepadState } from '../lib/protocol';

interface RCGamepadTabProps {
  armed: boolean;
  mode: FlightMode;
  isConnected: boolean;
  gamepad: ParsedGamepadState;
  onArmChange: (armed: boolean) => void;
  onModeChange: (mode: FlightMode) => void;
  workerThrottle?: number;
}

const MODES: Array<{ value: FlightMode; label: string; accent: string }> = [
  { value: 0, label: 'MANUAL', accent: 'text-slate-300' },
  { value: 1, label: 'ANGLE', accent: 'text-cyan-400' },
  { value: 2, label: 'HOLD', accent: 'text-emerald-400' },
  { value: 3, label: 'AUTO', accent: 'text-amber-400' },
  { value: 4, label: 'RTH', accent: 'text-rose-400' },
];

function normalizeBarValue(value: number): number {
  return Math.max(0, Math.min(100, Math.round(((value + 1) / 2) * 100)));
}

function formatThrottle(throttle: number): string {
  return `${Math.round(throttle)} / 1000`;
}

export function RCGamepadTab({ armed, mode, isConnected, gamepad, onArmChange, onModeChange, workerThrottle }: RCGamepadTabProps) {
  const previousButtonsRef = useRef(gamepad.buttons);

  useEffect(() => {
    const previousButtons = previousButtonsRef.current;

    if (gamepad.buttons.start && !previousButtons.start) {
      const nextArmed = !armed;
      onArmChange(nextArmed);
    }

    if (gamepad.buttons.b && !previousButtons.b) {
      onModeChange(4);
    }

    if (gamepad.buttons.a && !previousButtons.a) {
      onModeChange(0);
    }

    if (gamepad.buttons.x && !previousButtons.x) {
      onModeChange(1);
    }

    if (gamepad.buttons.y && !previousButtons.y) {
      onModeChange(3);
    }

    previousButtonsRef.current = gamepad.buttons;
  }, [armed, gamepad.buttons, onArmChange, onModeChange]);

  const handleArmToggle = () => {
    const nextArmed = !armed;
    onArmChange(nextArmed);
  };

  const handleModeSelect = (nextMode: FlightMode) => {
    onModeChange(nextMode);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">GameSir Nova Lite</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">RC & Gamepad</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Leitura em 60 Hz via Gamepad API, envio binário a 10 Hz e botões virtuais para touchscreen.
            </p>
          </div>
          <div className={`rounded-lg border px-3 py-2 text-right ${gamepad.connected ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700 bg-slate-900'}`}>
            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Status</div>
            <div className={`mt-1 text-sm font-bold ${gamepad.connected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {gamepad.connected ? 'CONTROLE ATIVO' : 'AGUARDANDO CONTROLE'}
            </div>
            <div className="mt-1 text-[10px] text-slate-500 font-mono">
              {gamepad.id ?? 'Nenhum gamepad detectado'}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <AxisCard label="Roll" value={gamepad.axes.roll} accent="cyan" />
          <AxisCard label="Pitch" value={gamepad.axes.pitch} accent="emerald" />
          <AxisCard label="Throttle" value={(workerThrottle ?? gamepad.axes.throttle) / 1000} accent="amber" throttleValue={workerThrottle ?? gamepad.axes.throttle} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <VirtualStickPanel title="Stick Direito" subtitle="Roll / Pitch" xValue={gamepad.axes.rightX} yValue={gamepad.axes.rightY} />
          <VirtualStickPanel title="Stick Esquerdo" subtitle="Throttle / Aux" xValue={gamepad.axes.leftX} yValue={gamepad.axes.leftY} throttleLabel={formatThrottle(workerThrottle ?? gamepad.axes.throttle)} />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleArmToggle}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] transition-colors ${armed ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'} disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600`}
            disabled={!isConnected}
          >
            {armed ? <ShieldAlert className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {armed ? 'DESARMAR' : 'ARMAR'}
          </button>
          <button
            onClick={() => handleModeSelect(4)}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-rose-300 transition-colors hover:bg-rose-500/20"
          >
            <SatelliteDish className="h-4 w-4" />
            RTH
          </button>
          <button
            onClick={() => handleModeSelect(0)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-cyan-300"
          >
            <RotateCcw className="h-4 w-4" />
            Manual
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Flight Mode</div>
              <div className="mt-1 text-lg font-semibold text-white">{MODES.find((item) => item.value === mode)?.label ?? 'UNKNOWN'}</div>
            </div>
            <div className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] ${armed ? 'border-rose-500/30 text-rose-300' : 'border-emerald-500/30 text-emerald-300'}`}>
              {armed ? 'ARMED' : 'DISARMED'}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MODES.map((item) => (
              <button
                key={item.value}
                onClick={() => handleModeSelect(item.value)}
                className={`rounded-lg border px-3 py-3 text-left text-xs font-bold uppercase tracking-[0.2em] transition-colors ${mode === item.value ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.12)]' : 'border-slate-700 bg-slate-950/60 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}
              >
                <div>{item.label}</div>
                <div className={`mt-1 text-[10px] ${item.accent}`}>Mode {item.value}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Touches Físicas</div>
              <div className="mt-1 text-sm text-slate-300">Start alterna armamento; B envia RTH; A/X/Y trocam modos rápidos.</div>
            </div>
            <Gamepad2 className="h-5 w-5 text-cyan-400" />
          </div>

          <div className="grid gap-2 text-xs text-slate-400">
            <KeyValueRow label="Start" value={gamepad.buttons.start ? 'PRESSIONADO' : 'LIVRE'} />
            <KeyValueRow label="B" value={gamepad.buttons.b ? 'RTH' : 'OK'} />
            <KeyValueRow label="A" value={gamepad.buttons.a ? 'MANUAL' : 'OK'} />
            <KeyValueRow label="X" value={gamepad.buttons.x ? 'ANGLE' : 'OK'} />
            <KeyValueRow label="Y" value={gamepad.buttons.y ? 'AUTO' : 'OK'} />
          </div>
        </div>
      </section>
    </div>
  );
}

function AxisCard({ label, value, accent, throttleValue }: { label: string; value: number; accent: 'cyan' | 'emerald' | 'amber'; throttleValue?: number; }) {
  const barValue = accent === 'amber' && typeof throttleValue === 'number' ? throttleValue / 10 : normalizeBarValue(value);
  const accentClass = accent === 'cyan' ? 'from-cyan-400 to-cyan-600' : accent === 'emerald' ? 'from-emerald-400 to-emerald-600' : 'from-amber-400 to-amber-600';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-500">
        <span>{label}</span>
        <span className="font-mono text-slate-300">{label === 'Throttle' ? `${Math.round((throttleValue ?? 0))}` : value.toFixed(2)}</span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full bg-gradient-to-r ${accentClass}`} style={{ width: `${barValue}%` }} />
      </div>
    </div>
  );
}

function VirtualStickPanel({ title, subtitle, xValue, yValue, throttleLabel }: { title: string; subtitle: string; xValue: number; yValue: number; throttleLabel?: string; }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">{title}</div>
          <div className="mt-1 text-sm text-slate-300">{subtitle}</div>
        </div>
        <Armchair className="h-4 w-4 text-cyan-400" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
        <KeyValueRow label="X" value={xValue.toFixed(2)} />
        <KeyValueRow label="Y" value={yValue.toFixed(2)} />
        <KeyValueRow label="Throttle" value={throttleLabel ?? 'N/A'} />
        <KeyValueRow label="Mode Hint" value="10 Hz" />
      </div>
    </div>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-200">{value}</span>
    </div>
  );
}