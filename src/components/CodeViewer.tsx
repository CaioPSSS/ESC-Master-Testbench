import { Copy, Check, ChevronDown, ChevronUp, Radio, Cpu } from 'lucide-react';
import { useState } from 'react';

import ESP32_BRIDGE_CODE from '../../esp32_lora_bridge/esp32_lora_bridge.ino?raw';
import ARDUINO_REMOTE_CODE from '../../arduino_lora_remote/arduino_lora_remote.ino?raw';

export function CodeViewer() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'esp32' | 'arduino'>('esp32');

  const currentCode = activeTab === 'esp32' ? ESP32_BRIDGE_CODE : ARDUINO_REMOTE_CODE;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex justify-between items-start">
        <div>
          <h2 className="text-sm font-bold text-white mb-1 uppercase tracking-tight flex items-center gap-2">
            Código dos Microcontroladores
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed italic pr-4">
            Arquitetura wireless: ESP32 BLE Bridge (BLE UART↔LoRa) + Arduino Remoto (LoRa↔ESC/Servos). Filtro anti-sag, telemetria 2S Li-ion e mixagem de elevons preservados.
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-600 font-bold uppercase tracking-wider ml-4 cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'COPIADO' : 'COPIAR'}
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex mb-3 gap-1 shrink-0">
        <button
          onClick={() => { setActiveTab('esp32'); setCopied(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-[11px] font-bold uppercase tracking-wider transition-colors border border-b-0 cursor-pointer ${
            activeTab === 'esp32'
              ? 'bg-[#011627] text-amber-400 border-slate-700'
              : 'bg-slate-800/50 text-slate-500 border-slate-800 hover:text-slate-350'
          }`}
        >
          <Radio className="w-3 h-3" />
          Bridge WiFi (ESP32)
        </button>
        <button
          onClick={() => { setActiveTab('arduino'); setCopied(false); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-[11px] font-bold uppercase tracking-wider transition-colors border border-b-0 cursor-pointer ${
            activeTab === 'arduino'
              ? 'bg-[#011627] text-emerald-400 border-slate-700'
              : 'bg-slate-800/50 text-slate-500 border-slate-800 hover:text-slate-350'
          }`}
        >
          <Cpu className="w-3 h-3" />
          Receptor (Arduino Remoto)
        </button>
      </div>

      {/* Code Snippet Visual */}
      <div className="bg-[#011627] rounded-b-lg rounded-tr-lg p-5 font-mono text-[11px] leading-relaxed border border-slate-700 shadow-2xl overflow-y-auto flex-1 mb-4 min-h-[250px]">
        <div className="flex gap-1.5 mb-4 sticky top-0 bg-[#011627] pb-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
          <span className="ml-3 text-[10px] text-slate-600 font-sans">
            {activeTab === 'esp32' ? 'esp32_lora_bridge.ino' : 'arduino_lora_remote.ino'}
          </span>
        </div>
        <pre className="text-cyan-300">
          <code>{currentCode}</code>
        </pre>
      </div>

      {/* Connection Diagram - Updated for BLE + LoRa architecture */}
      <div className="border-t border-slate-800 pt-4 shrink-0">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Diagrama da Arquitetura BLE + LoRa</h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-cyan-700 border border-cyan-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">📱 Celular</div>
            <div className="flex-1 h-px bg-blue-500/30 relative border-t border-dashed border-blue-500/50">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-blue-400 italic whitespace-nowrap">~~~ BLE (Nordic UART) ~~~</div>
            </div>
            <div className="w-16 h-5 bg-amber-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESP32</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-slate-700 border border-slate-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">BLE API</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 italic whitespace-nowrap">Service: 6E400001-...</div>
            </div>
            <div className="w-16 h-5 bg-amber-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESP32</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-amber-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESP32</div>
            <div className="flex-1 h-px bg-amber-500/30 relative border-t border-dashed border-amber-500/50">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-amber-500 italic whitespace-nowrap">~~~ LoRa 433MHz ~~~</div>
            </div>
            <div className="w-16 h-5 bg-emerald-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Arduino</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-emerald-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Arduino</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 italic whitespace-nowrap">PWM Pino 6</div>
            </div>
            <div className="w-16 h-5 bg-rose-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">ESC</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-emerald-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Arduino</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] text-slate-500 italic whitespace-nowrap">PWM Pinos 3 e 5</div>
            </div>
            <div className="w-16 h-5 bg-cyan-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">Servos L/R</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-5 bg-red-600 rounded-sm flex items-center justify-center text-[9px] font-bold text-white">VCC</div>
            <div className="flex-1 h-px bg-slate-700 relative">
              <div className="absolute -top-3 left-0 text-[9px] text-slate-500 italic">2S 18650 (7.4V)</div>
            </div>
            <div className="text-[9px] text-slate-400">ESC + A0 (Divisor)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
