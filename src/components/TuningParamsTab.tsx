import { useState } from 'react';
import { SlidersHorizontal, Upload } from 'lucide-react';

import { buildTuningPacket, PARAMETER_NAMES } from '../lib/protocol';

interface TuningParamsTabProps {
  sendBinary: (buffer: ArrayBuffer) => boolean;
}

type ParamValueMap = Record<number, string>;

const PARAMETER_DEFAULTS = [
  0.80, 0.02, 0.015, 0.00,
  0.82, 0.02, 0.015, 0.00,
  1.20, 0.55, 18.0, 1.50, 0.12,
];

export function TuningParamsTab({ sendBinary }: TuningParamsTabProps) {
  const [values, setValues] = useState<ParamValueMap>(
    Object.fromEntries(PARAMETER_NAMES.map((name, index) => [index, String(PARAMETER_DEFAULTS[index] ?? 0)])),
  );
  const [lastWritten, setLastWritten] = useState<number | null>(null);

  const handleWrite = (paramId: number) => {
    const numericValue = Number.parseFloat(values[paramId] ?? '0');
    sendBinary(buildTuningPacket(paramId, numericValue));
    setLastWritten(paramId);
  };

  return (
    <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">Remote Tuning</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Tuning & Params</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Envio binário de parâmetros para o VANT via pacote `0xDD`, com edição individual e escrita imediata.
          </p>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/70">Formato</div>
          <div className="mt-1 text-sm font-bold text-cyan-100">Little-endian + Float32</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-[1.1fr_0.4fr_1.1fr_0.5fr] bg-slate-950/80 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">
          <div>Parameter</div>
          <div>Param ID</div>
          <div>Value</div>
          <div className="text-right">Action</div>
        </div>
        <div className="divide-y divide-slate-800 bg-slate-950/60">
          {PARAMETER_NAMES.map((name, index) => (
            <div key={name} className={`grid grid-cols-[1.1fr_0.4fr_1.1fr_0.5fr] items-center gap-3 px-4 py-3 ${lastWritten === index ? 'bg-cyan-500/5' : ''}`}>
              <div>
                <div className="text-sm font-semibold text-slate-100">{name}</div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">{index === 9 ? 'Cruise throttle' : 'PID / feedforward control'}</div>
              </div>
              <div className="font-mono text-sm text-cyan-300">{index}</div>
              <input
                type="number"
                step="0.001"
                value={values[index] ?? '0'}
                onChange={(event) => setValues((current) => ({ ...current, [index]: event.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
              />
              <button
                onClick={() => handleWrite(index)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.25em] text-emerald-300 transition-colors hover:bg-emerald-500/20"
              >
                <Upload className="h-3.5 w-3.5" />
                Write to VANT
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
            Operational Notes
          </div>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li>• Cada escrita usa exatamente 6 bytes e segue o protocolo binário little-endian.</li>
            <li>• Os campos são enviados como Float32 IEEE 754, sem serialização textual.</li>
            <li>• Os parâmetros podem ser ajustados em voo sem alterar o fluxo de telemetria.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Last Write</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {lastWritten === null ? 'Nenhum parâmetro enviado' : PARAMETER_NAMES[lastWritten]}
          </div>
          <div className="mt-2 text-sm text-slate-400 font-mono">
            {lastWritten === null ? 'Aguardando interação' : `Param ${lastWritten} atualizado`}
          </div>
        </div>
      </div>
    </section>
  );
}