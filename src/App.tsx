import { useEffect, useMemo, useState } from 'react';
import { Activity, Bluetooth, BluetoothOff, MapPinned, RadioTower, SlidersHorizontal } from 'lucide-react';

import { useGamepad } from './hooks/useGamepad';
import { useRcWorker } from './hooks/useRcWorker';
import { useWebSocket } from './hooks/useWebSocket';
import type { FlightMode } from './lib/protocol';
import { Dashboard } from './components/Dashboard';
import { MapWidget } from './components/MapWidget';
import { RCGamepadTab } from './components/RCGamepadTab';
import { TuningParamsTab } from './components/TuningParamsTab';

export default function App() {
  const { connect, disconnect, error, isConnected, isTelemetryLost, lastTelemetry, lastPacketTime, packetCount, sendBinary, status, url } = useWebSocket();
  const gamepad = useGamepad();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'map' | 'rc' | 'tuning'>('dashboard');
  const [armed, setArmed] = useState(false);
  const [mode, setMode] = useState<FlightMode>(0);

  const canSendToVant = isConnected && !isTelemetryLost;
  const telemetry = lastTelemetry;
  const connectedToVant = canSendToVant;

  useRcWorker({
    armed,
    canSend: canSendToVant,
    gamepad,
    mode,
    sendBinary,
  });

  useEffect(() => {
    setArmed(lastTelemetry?.armed ?? false);
    setMode(lastTelemetry?.mode ?? 0);
  }, [lastTelemetry?.armed, lastTelemetry?.mode]);

  const connectionLabel = useMemo(() => {
    if (status === 'connected') return 'CONNECTED';
    if (status === 'connecting') return 'CONNECTING';
    if (status === 'error') return 'ERROR';
    if (status === 'disconnected') return 'DISCONNECTED';
    return 'IDLE';
  }, [status]);

  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: Activity },
    { id: 'map' as const, label: 'Map Widget', icon: MapPinned },
    { id: 'rc' as const, label: 'RC & Gamepad', icon: RadioTower },
    { id: 'tuning' as const, label: 'Tuning & Params', icon: SlidersHorizontal },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 font-sans text-slate-300">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.08),_transparent_26%)]" />

      <div className="relative flex min-h-screen flex-col">
        <header className="border-b border-slate-800/80 bg-slate-950/90 px-4 py-3 backdrop-blur-md lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.45em] text-cyan-400/80">GNC Ground Station</div>
              <h1 className="mt-1 text-2xl font-semibold text-white lg:text-3xl">VANT Binary Control Surface</h1>
              <p className="mt-1 text-sm text-slate-400">WebSocket binário para ESP32 AP, leitura de gamepad e telemetria 0xAA em tempo real.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {error && <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.35em] text-rose-300">{error}</span>}
              <div className="rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.35em] text-slate-400">{connectionLabel}</div>
              <div className="rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-[10px] font-mono text-slate-400">{url}</div>
              <div className="rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-[10px] font-mono text-slate-400">PKT {packetCount}</div>
              {!isConnected ? (
                <button
                  onClick={() => connect()}
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-200 transition-colors hover:bg-cyan-500/20"
                >
                  <Bluetooth className="h-3.5 w-3.5" />
                  Connect
                </button>
              ) : (
                <button
                  onClick={disconnect}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.35em] text-slate-300 transition-colors hover:border-rose-500/30 hover:text-rose-200"
                >
                  <BluetoothOff className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              )}
            </div>
          </div>

          <nav className="mt-5 flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] transition-colors ${active ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.12)]' : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="relative flex-1 overflow-y-auto px-4 py-5 lg:px-8">
          {activeTab === 'dashboard' && <Dashboard isConnected={connectedToVant} telemetryLost={isTelemetryLost} telemetry={telemetry} packetCount={packetCount} lastPacketTime={lastPacketTime} />}

          {activeTab === 'map' && (
            <section className="grid gap-6 lg:grid-cols-[1fr_0.6fr]">
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-md">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">Live Map</div>
                    <h2 className="mt-1 text-2xl font-semibold text-white">MapWidget</h2>
                    <p className="mt-2 text-sm text-slate-400">Posição, trilha e leitura de GPS em tempo real.</p>
                  </div>
                  <MapPinned className="h-5 w-5 text-emerald-400" />
                </div>

                <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
                  <MapWidget lat={telemetry?.lat ?? -12.9714} lon={telemetry?.lon ?? -38.5104} />
                </div>
              </div>

              <div className="space-y-4">
                <InfoPanel title="GPS Snapshot" value={`${(telemetry?.lat ?? 0).toFixed(6)}, ${(telemetry?.lon ?? 0).toFixed(6)}`} />
                <InfoPanel title="Altitude" value={`${(telemetry?.altitude ?? 0).toFixed(1)} m`} />
                <InfoPanel title="Ground Speed" value={`${(telemetry?.groundSpeed ?? 0).toFixed(2)} m/s`} />
                <InfoPanel title="Satellites" value={`${telemetry?.sats ?? 0}`} />
              </div>
            </section>
          )}

          {activeTab === 'rc' && (
            <RCGamepadTab
              armed={armed}
              mode={mode}
              isConnected={connectedToVant}
              gamepad={gamepad}
              onArmChange={setArmed}
              onModeChange={setMode}
            />
          )}

          {activeTab === 'tuning' && <TuningParamsTab sendBinary={sendBinary} />}
        </main>

        <footer className="border-t border-slate-800/80 bg-slate-950/90 px-4 py-3 text-[10px] uppercase tracking-[0.35em] text-slate-500 lg:px-8">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>WS {connectionLabel} • {new Date().toLocaleTimeString()} • {packetCount} packets</div>
            <div>SSID VANT_GCS • Password admin • Binary little-endian control path</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function InfoPanel({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md">
      <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">{title}</div>
      <div className="mt-2 font-mono text-lg text-white">{value}</div>
    </div>
  );
}
