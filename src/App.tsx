import { Plug, Unplug, Settings2, Activity } from 'lucide-react';
import { useSerial } from './hooks/useSerial';
import { Dashboard } from './components/Dashboard';
import { CodeViewer } from './components/CodeViewer';
import { WiringGuide } from './components/WiringGuide';

export default function App() {
  const { isConnected, connect, disconnect, send, error, telemetry, packetCount, lastPacketTime } = useSerial();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-300 overflow-hidden select-none">
      
      {/* Top Navigation / Status Bar */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center text-slate-950 font-bold">M</div>
          <h1 className="text-xl font-semibold tracking-tight text-white">ESC Pro Controller <span className="text-slate-500 font-normal text-sm ml-2">v3.0.0</span></h1>
        </div>
        
        <div className="flex items-center gap-6">
          {error && (
            <span className="text-rose-400 text-xs font-bold uppercase tracking-widest bg-rose-500/10 px-2 py-1 rounded">
              {error}
            </span>
          )}
          
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span className={`text-xs uppercase tracking-widest font-bold ${isConnected ? 'text-emerald-500' : 'text-rose-500'}`}>
              {isConnected ? 'MCU CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="text-xs text-slate-500 border-l border-slate-800 pl-6 flex items-center gap-4">
            {!isConnected ? (
              <button
                onClick={connect}
                className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
              >
                <Plug className="w-4 h-4" />
                CONNECT
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="flex items-center gap-1.5 hover:text-rose-400 transition-colors"
              >
                <Unplug className="w-4 h-4" />
                DISCONNECT
              </button>
            )}
            <div>
              DEVICE: <span className="text-slate-300 font-mono">ESP32_LORA_BRIDGE</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Control Dashboard */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        
        {/* Left Panel: Controls & Telemetry */}
        <div className="lg:col-span-7 border-r border-slate-800 p-8 flex flex-col gap-8 overflow-y-auto">
          <Dashboard isConnected={isConnected} send={send} telemetry={telemetry} packetCount={packetCount} lastPacketTime={lastPacketTime} />
          <WiringGuide />
        </div>

        {/* Right Panel: Logic & Documentation */}
        <div className="lg:col-span-5 bg-slate-900/30 p-8 flex flex-col overflow-y-auto">
          <CodeViewer />
        </div>
        
      </main>

      {/* Footer Info Bar */}
      <footer className="h-10 bg-slate-900 border-t border-slate-800 px-8 flex items-center justify-between shrink-0">
        <div className="text-[10px] text-slate-500 font-medium">
          LOG: [{new Date().toLocaleTimeString()}] {isConnected ? 'SYSTEM READY' : 'WAITING FOR CONNECTION'}
        </div>
        <div className="text-[10px] text-slate-600">
          SISTEMA DE TESTE DE BANCADA • AEROMODELISMO DIY
        </div>
      </footer>
    </div>
  );
}
