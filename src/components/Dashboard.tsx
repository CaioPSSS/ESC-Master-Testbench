import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, BatteryCharging, Crosshair, Globe2, Radio, Satellite, Shield, Signal } from 'lucide-react';

import type { TelemetryData } from '../lib/protocol';
import { AttitudeIndicator } from './AttitudeIndicator';

interface DashboardProps {
  isConnected: boolean;
  telemetryLost?: boolean;
  telemetry?: TelemetryData | null;
  packetCount: number;
  lastPacketTime: number | null;
}

function rssiToQuality(rssi: number): number {
  return Math.max(0, Math.min(100, Math.round(((rssi + 120) / 90) * 100)));
}

function modeLabel(mode: number): string {
  switch (mode) {
    case 0:
      return 'MANUAL';
    case 1:
      return 'ANGLE';
    case 2:
      return 'HOLD';
    case 3:
      return 'AUTO';
    case 4:
      return 'RTH';
    default:
      return 'UNKNOWN';
  }
}

export function Dashboard({ isConnected, telemetryLost = false, telemetry, packetCount, lastPacketTime }: DashboardProps) {
  const [timeSincePacket, setTimeSincePacket] = useState<number | null>(null);

  useEffect(() => {
    if (!lastPacketTime) {
      setTimeSincePacket(null);
      return;
    }

    const interval = window.setInterval(() => {
      setTimeSincePacket(Date.now() - lastPacketTime);
    }, 200);

    return () => {
      window.clearInterval(interval);
    };
  }, [lastPacketTime]);

  const isFailsafe = telemetry?.failsafe === 1;
  const isArmed = telemetry?.armed ?? false;
  const isStale = timeSincePacket !== null && timeSincePacket > 2000;
  const statusLabel = useMemo(() => {
    if (!isConnected) return 'OFFLINE';
    if (telemetryLost) return 'TELEMETRY LOST';
    if (isFailsafe) return 'FAILSAFE';
    if (isStale) return 'SEM SINAL';
    if (isArmed) return 'NORMAL';
    return 'NO TELEMETRY';
  }, [isArmed, isConnected, isFailsafe, isStale, telemetryLost]);

  const latitude = telemetry?.lat ?? -12.9714;
  const longitude = telemetry?.lon ?? -38.5104;
  const altitude = telemetry?.altitude ?? 0;
  const pitch = telemetry?.pitch ?? 0;
  const roll = telemetry?.roll ?? 0;
  const vbat = telemetry?.vbat ?? 0;
  const signalQuality = telemetry ? rssiToQuality(telemetry.rssi) : 0;

  return (
    <section className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">Telemetry Overview</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">Dashboard</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Painel principal com telemetria binária, atitude do voo e consciência situacional do enlace.
              </p>
            </div>
            <div className={`rounded-lg border px-3 py-2 text-right ${telemetryLost ? 'border-rose-500/30 bg-rose-500/10' : isConnected ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700 bg-slate-950/60'}`}>
              <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">MCU</div>
              <div className={`mt-1 text-sm font-bold ${telemetryLost ? 'text-rose-400 animate-pulse' : isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>{statusLabel}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="Battery" value={`${vbat.toFixed(2)} V`} icon={<BatteryCharging className="h-4 w-4 text-emerald-400" />} tone={vbat < 6.4 ? 'rose' : 'emerald'} />
            <InfoTile label="Mode" value={modeLabel(telemetry?.mode ?? 0)} icon={<Shield className="h-4 w-4 text-cyan-400" />} tone="cyan" />
            <InfoTile label="RSSI" value={`${telemetry?.rssi ?? '--'} dBm`} icon={<Signal className="h-4 w-4 text-amber-400" />} tone="amber" />
            <InfoTile label="Speed" value={`${(telemetry?.groundSpeed ?? 0).toFixed(2)} m/s`} icon={<Activity className="h-4 w-4 text-cyan-400" />} tone="cyan" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Attitude</div>
                  <div className="mt-1 text-lg font-semibold text-white">Artificial Horizon</div>
                </div>
                <Crosshair className="h-5 w-5 text-cyan-400" />
              </div>
              <div className="mt-4 flex justify-center">
                <AttitudeIndicator pitch={pitch} roll={roll} />
              </div>
                <div className={`mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400 ${telemetryLost ? 'animate-pulse' : ''}`}>
                <MiniStat label="Pitch" value={`${pitch.toFixed(2)}°`} />
                <MiniStat label="Roll" value={`${roll.toFixed(2)}°`} />
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Navigation</div>
                    <div className="mt-1 text-lg font-semibold text-white">GPS / Mission State</div>
                  </div>
                  <Globe2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
                  <MiniStat label="Altitude" value={`${altitude.toFixed(1)} m`} />
                  <MiniStat label="Sats" value={`${telemetry?.sats ?? 0}`} />
                  <MiniStat label="Latitude" value={latitude.toFixed(6)} />
                  <MiniStat label="Longitude" value={longitude.toFixed(6)} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Telemetry Health</div>
                    <div className="mt-1 text-lg font-semibold text-white">Link Quality</div>
                  </div>
                  <Radio className="h-5 w-5 text-amber-400" />
                </div>
                <div className="mt-4 grid gap-3 text-xs text-slate-400">
                  <ProgressRow label="RSSI Quality" value={signalQuality} />
                  <ProgressRow label="Packets" value={Math.min(100, packetCount % 100)} />
                  <ProgressRow label="Stale Age" value={timeSincePacket !== null ? Math.max(0, 100 - Math.min(100, Math.round(timeSincePacket / 30))) : 0} />
                </div>
              </div>
            </div>
          </div>
        </article>

        <aside className="space-y-4">
              <div className={`rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md ${telemetryLost ? 'ring-1 ring-rose-500/30' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Link State</div>
                <div className="mt-1 text-lg font-semibold text-white">WS Bridge</div>
              </div>
              <Satellite className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <KeyValue label="Packets" value={String(packetCount)} />
              <KeyValue label="Age" value={timeSincePacket === null ? '--' : `${timeSincePacket} ms`} />
              <KeyValue label="Mode" value={modeLabel(telemetry?.mode ?? 0)} />
              <KeyValue label="Failsafe" value={isFailsafe ? '1' : '0'} />
            </div>
          </div>

              <div className={`rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md ${telemetryLost ? 'ring-1 ring-rose-500/30' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Flight Safety</div>
                <div className="mt-1 text-lg font-semibold text-white">MCU State</div>
              </div>
              <AlertTriangle className={`h-5 w-5 ${telemetryLost ? 'text-rose-400' : isFailsafe ? 'text-amber-400' : isStale ? 'text-rose-400' : 'text-emerald-400'}`} />
            </div>
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Status</div>
              <div className={`mt-1 text-lg font-semibold ${telemetryLost ? 'text-rose-400' : isConnected ? 'text-white' : 'text-slate-500'}`}>{statusLabel}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
              <MiniStat label="Armed" value={isArmed ? 'YES' : 'NO'} />
              <MiniStat label="Failsafe" value={String(telemetry?.failsafe ?? 0)} />
              <MiniStat label="Ground Speed" value={`${(telemetry?.groundSpeed ?? 0).toFixed(2)} m/s`} />
              <MiniStat label="Last Packet" value={timeSincePacket === null ? '--' : `${Math.round(timeSincePacket / 100) / 10}s`} />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function InfoTile({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone: 'emerald' | 'cyan' | 'amber' | 'rose' }) {
  const toneClass = tone === 'emerald' ? 'border-emerald-500/20 bg-emerald-500/10' : tone === 'cyan' ? 'border-cyan-500/20 bg-cyan-500/10' : tone === 'amber' ? 'border-amber-500/20 bg-amber-500/10' : 'border-rose-500/20 bg-rose-500/10';

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-mono text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-slate-500">
        <span>{label}</span>
        <span className="font-mono text-slate-300">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}
