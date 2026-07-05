import React from 'react';

interface AttitudeIndicatorProps {
  pitch: number;
  roll: number;
}

export function AttitudeIndicator({ pitch, roll }: AttitudeIndicatorProps) {
  // Constrain pitch to sensible visual limits for the indicator (e.g., +/- 90 degrees)
  const clampedPitch = Math.max(-90, Math.min(90, pitch));
  
  // 1 degree of pitch = 2.5px translation roughly (adjust for aesthetics)
  const pitchOffset = clampedPitch * 2.5; 

  return (
    <div className="relative w-full aspect-square max-w-[200px] mx-auto bg-slate-900 rounded-full border-4 border-slate-700 overflow-hidden shadow-inner">
      {/* Container for Pitch & Roll transform */}
      <div 
        className="absolute inset-[-50%] transition-transform duration-100 ease-linear"
        style={{ transform: `rotate(${-roll}deg) translateY(${pitchOffset}px)` }}
      >
        {/* Sky */}
        <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-blue-500 to-blue-300">
          {/* Pitch lines for Sky */}
          <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-4 opacity-50">
            <div className="w-16 h-0.5 bg-white"></div>
            <div className="w-24 h-0.5 bg-white"></div>
            <div className="w-16 h-0.5 bg-white"></div>
          </div>
        </div>
        {/* Ground */}
        <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-b from-amber-700 to-amber-900 border-t-2 border-white">
          {/* Pitch lines for Ground */}
          <div className="absolute top-4 inset-x-0 flex flex-col items-center gap-4 opacity-50">
            <div className="w-16 h-0.5 bg-white"></div>
            <div className="w-24 h-0.5 bg-white"></div>
            <div className="w-16 h-0.5 bg-white"></div>
          </div>
        </div>
      </div>

      {/* Static Overlay (Aircraft Symbol & Bezels) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        {/* Center Dot */}
        <div className="w-2 h-2 bg-rose-500 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)] z-10"></div>
        
        {/* Left Wing */}
        <div className="absolute left-1/4 w-12 h-1 bg-rose-500 rounded-l-full shadow-[0_0_4px_rgba(0,0,0,0.5)]">
          <div className="absolute right-0 w-1 h-3 bg-rose-500 top-0"></div>
        </div>
        
        {/* Right Wing */}
        <div className="absolute right-1/4 w-12 h-1 bg-rose-500 rounded-r-full shadow-[0_0_4px_rgba(0,0,0,0.5)]">
          <div className="absolute left-0 w-1 h-3 bg-rose-500 top-0"></div>
        </div>

        {/* Roll Bezel Tick marks */}
        <div className="absolute inset-2 border-2 border-slate-400/30 rounded-full"></div>
        <div className="absolute top-0 w-1 h-3 bg-rose-500 rounded-b"></div>
      </div>
      
      {/* Top Glass Reflection */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-white/20 rounded-full pointer-events-none"></div>
    </div>
  );
}
