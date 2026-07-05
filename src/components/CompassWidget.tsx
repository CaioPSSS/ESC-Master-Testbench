import React from 'react';

interface CompassWidgetProps {
  heading: number; // 0 to 360
}

export function CompassWidget({ heading }: CompassWidgetProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <div className="relative w-36 h-36 bg-slate-900/60 rounded-full border-2 border-slate-700/80 flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,0,0,0.6)]">
        
        {/* The rotating dial */}
        <div 
          className="absolute inset-1.5 rounded-full border border-slate-700/50 transition-transform duration-500 ease-out"
          style={{ transform: `rotate(${-heading}deg)` }}
        >
          {/* Cardinal Points */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 text-cyan-400 font-bold text-xs drop-shadow-[0_0_4px_rgba(6,182,212,0.8)]">N</div>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-slate-400 font-bold text-xs">S</div>
          <div className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">W</div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">E</div>
          
          {/* Tick marks via SVG */}
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none">
            {[...Array(36)].map((_, i) => (
              <line 
                key={i} 
                x1="50" y1="12" x2="50" y2={i % 9 === 0 ? "18" : "15"} 
                stroke={i % 9 === 0 ? "#06b6d4" : "#475569"} 
                strokeWidth={i % 9 === 0 ? "1.5" : "1"}
                transform={`rotate(${i * 10} 50 50)`}
              />
            ))}
          </svg>
        </div>
        
        {/* Fixed Center Indicator (Lubber Line) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1.5 drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]">
          <svg width="14" height="14" viewBox="0 0 12 12">
            <polygon points="6,0 12,12 0,12" fill="#ef4444" />
          </svg>
        </div>

        {/* Central Readout */}
        <div className="z-10 bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-700/50 backdrop-blur-md shadow-lg">
          <div className="text-lg font-mono font-bold text-white leading-none tracking-wider">
            {heading.toFixed(0).padStart(3, '0')}°
          </div>
        </div>
      </div>
    </div>
  );
}
