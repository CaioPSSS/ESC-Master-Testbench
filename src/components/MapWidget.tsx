import { useEffect, useRef, useState } from 'react';
import { Trash, Upload, X, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import type { TelemetryData } from '../lib/protocol';

interface RadarMapProps {
  lat: number;
  lon: number;
  homeLat: number;
  homeLon: number;
  telemetry: TelemetryData | null;
  isConnected: boolean;
  isTelemetryLost: boolean;
  uploadMission: (waypoints: any[]) => Promise<void>;
  clearMission: () => Promise<void>;
  syncStatus: string;
  syncProgress: number;
  syncError: string | null;
  isSyncing: boolean;
}

const METERS_PER_DEG_LAT = 111320;
const TRAIL_MAX = 500;
const RINGS = [50, 100, 200, 500];

function toMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = (lat2 - lat1) * METERS_PER_DEG_LAT;
  const dLon = (lon2 - lon1) * METERS_PER_DEG_LAT * Math.cos((lat1 * Math.PI) / 180);
  return { x: dLon, y: -dLat }; // x=East, y=North (screen: up = -y)
}

function distance(x: number, y: number) {
  return Math.sqrt(x * x + y * y);
}

function bearing(x: number, y: number) {
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function getCrossTrackError(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) {
    return Math.sqrt(apx * apx + apy * apy);
  }
  
  let t = (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t)); // clamp to segment
  
  const closestX = a.x + t * abx;
  const closestY = a.y + t * aby;
  
  const dx = p.x - closestX;
  const dy = p.y - closestY;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface Waypoint {
  lat: number;
  lon: number;
  alt: number;     // meters
  speed: number;   // m/s
  cmd: number;     // 0=WAYPOINT, 1=LOITER_TIME, 2=RTL
  cmdVal: number;  // loiter duration / custom parameter
}

export function MapWidget({
  lat,
  lon,
  homeLat,
  homeLon,
  telemetry,
  isConnected,
  isTelemetryLost,
  uploadMission,
  clearMission,
  syncStatus,
  syncProgress,
  syncError,
  isSyncing
}: RadarMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const [dims, setDims] = useState({ w: 400, h: 400 });
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [selectedWpIndex, setSelectedWpIndex] = useState<number | null>(null);
  const [activeWpIndex, setActiveWpIndex] = useState<number>(0);
  const draggingIndexRef = useRef<number | null>(null);

  const hLat = homeLat ?? lat;
  const hLon = homeLon ?? lon;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      const s = Math.max(200, Math.min(width, 500));
      setDims({ w: s, h: s });
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const pos = toMeters(hLat, hLon, lat, lon);
    const trail = trailRef.current;
    const last = trail[trail.length - 1];
    if (!last || distance(pos.x - last.x, pos.y - last.y) > 2) {
      trail.push(pos);
      if (trail.length > TRAIL_MAX) trail.shift();
    }
  }, [lat, lon, hLat, hLon]);

  // Track active target waypoint index sequentially
  useEffect(() => {
    if (!telemetry || telemetry.mode !== 3 || waypoints.length === 0) {
      setActiveWpIndex(0);
      return;
    }
    
    if (activeWpIndex < waypoints.length) {
      const wp = waypoints[activeWpIndex];
      const pos = toMeters(telemetry.lat, telemetry.lon, wp.lat, wp.lon);
      const distToWp = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      if (distToWp < 10) { // 10m threshold
        setActiveWpIndex(prev => Math.min(prev + 1, waypoints.length - 1));
      }
    }
  }, [telemetry?.lat, telemetry?.lon, telemetry?.mode, waypoints, activeWpIndex]);

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = dims;
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);

    const cx = w / 2;
    const cy = h / 2;
    const maxRing = RINGS[RINGS.length - 1];
    const scale = (Math.min(w, h) / 2 - 30) / maxRing;

    // 1. Background
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, w, h);

    // 2. Distance rings
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const r of RINGS) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.font = '10px monospace';
      ctx.fillText(`${r}m`, cx + r * scale + 4, cy - 4);
    }
    ctx.setLineDash([]);

    // 3. Crosshair
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.2)';
    ctx.beginPath();
    ctx.moveTo(cx, 10); ctx.lineTo(cx, h - 10);
    ctx.moveTo(10, cy); ctx.lineTo(w - 10, cy);
    ctx.stroke();

    // 4. North indicator
    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 18);
    ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.fillText('S', cx, h - 8);
    ctx.fillText('E', w - 12, cy + 5);
    ctx.fillText('W', 12, cy + 5);

    // 5. Home marker
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(34, 211, 238, 0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HOME', cx + 8, cy - 4);

    // 6. Draw Waypoint connection lines: Home --> WP 0 --> WP 1 --> ...
    if (waypoints.length > 0) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      
      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const pos = toMeters(hLat, hLon, wp.lat, wp.lon);
        ctx.lineTo(cx + pos.x * scale, cy + pos.y * scale);
      }
      ctx.stroke();
    }

    // 7. Draw Waypoint circles
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const pos = toMeters(hLat, hLon, wp.lat, wp.lon);
      const wpX = cx + pos.x * scale;
      const wpY = cy + pos.y * scale;
      const isSelected = i === selectedWpIndex;

      if (isSelected) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(wpX, wpY, 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = isSelected ? '#f59e0b' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(wpX, wpY, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${i}`, wpX, wpY + 2.5);

      ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
      ctx.font = '9px monospace';
      ctx.fillText(`WP ${i}`, wpX, wpY - 10);
    }

    // 8. Trail
    const trail = trailRef.current;
    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + trail[0].x * scale, cy + trail[0].y * scale);
      for (let i = 1; i < trail.length; i++) {
        ctx.lineTo(cx + trail[i].x * scale, cy + trail[i].y * scale);
      }
      ctx.stroke();
    }

    // 9. Aircraft position
    const pos = toMeters(hLat, hLon, lat, lon);
    const ax = cx + pos.x * scale;
    const ay = cy + pos.y * scale;

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(ax, ay - 8);
    ctx.lineTo(ax - 5, ay + 5);
    ctx.lineTo(ax + 5, ay + 5);
    ctx.closePath();
    ctx.fill();

    // 10. Info panel
    const dist = distance(pos.x, pos.y);
    const brg = bearing(pos.x, pos.y);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(8, h - 58, 180, 50);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`DST: ${dist.toFixed(1)}m`, 14, h - 40);
    ctx.fillText(`BRG: ${brg.toFixed(0).padStart(3, '0')}°`, 14, h - 26);
    ctx.fillText(`POS: ${lat.toFixed(6)}, ${lon.toFixed(6)}`, 14, h - 12);

    ctx.textAlign = 'center';
  }, [lat, lon, hLat, hLon, dims, waypoints, selectedWpIndex]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = dims.w / 2;
    const cy = dims.h / 2;
    const maxRing = RINGS[RINGS.length - 1];
    const scale = (Math.min(dims.w, dims.h) / 2 - 30) / maxRing;

    let foundIdx: number | null = null;
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const pos = toMeters(hLat, hLon, wp.lat, wp.lon);
      const wpX = cx + pos.x * scale;
      const wpY = cy + pos.y * scale;
      const dist = Math.sqrt((x - wpX) ** 2 + (y - wpY) ** 2);
      if (dist <= 15) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx !== null) {
      setSelectedWpIndex(foundIdx);
      draggingIndexRef.current = foundIdx;
    } else {
      const dx = x - cx;
      const dy = y - cy;
      const xMeters = dx / scale;
      const yMeters = dy / scale;

      const dLat = -yMeters / METERS_PER_DEG_LAT;
      const dLon = xMeters / (METERS_PER_DEG_LAT * Math.cos((hLat * Math.PI) / 180));

      const newWp: Waypoint = {
        lat: hLat + dLat,
        lon: hLon + dLon,
        alt: 15,
        speed: 10,
        cmd: 0,
        cmdVal: 0
      };

      const newWps = [...waypoints, newWp];
      setWaypoints(newWps);
      setSelectedWpIndex(newWps.length - 1);
      draggingIndexRef.current = newWps.length - 1;
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingIndexRef.current === null) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const cx = dims.w / 2;
    const cy = dims.h / 2;
    const maxRing = RINGS[RINGS.length - 1];
    const scale = (Math.min(dims.w, dims.h) / 2 - 30) / maxRing;

    const dx = x - cx;
    const dy = y - cy;
    const xMeters = dx / scale;
    const yMeters = dy / scale;

    const dLat = -yMeters / METERS_PER_DEG_LAT;
    const dLon = xMeters / (METERS_PER_DEG_LAT * Math.cos((hLat * Math.PI) / 180));

    const targetIdx = draggingIndexRef.current;
    setWaypoints(prev => prev.map((wp, i) => {
      if (i === targetIdx) {
        return {
          ...wp,
          lat: hLat + dLat,
          lon: hLon + dLon
        };
      }
      return wp;
    }));
  };

  const handleCanvasMouseUp = () => {
    draggingIndexRef.current = null;
  };

  const handleUpload = async () => {
    try {
      await uploadMission(waypoints);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClear = () => {
    setWaypoints([]);
    setSelectedWpIndex(null);
  };

  const handleRead = async () => {
    setWaypoints([]);
    setSelectedWpIndex(null);
    try {
      await clearMission();
    } catch (err) {
      console.error(err);
    }
  };

  const updateWp = (index: number, key: keyof Waypoint, value: any) => {
    setWaypoints(prev => prev.map((wp, i) => {
      if (i === index) {
        return {
          ...wp,
          [key]: value
        };
      }
      return wp;
    }));
  };

  const handleInputChange = (index: number, key: keyof Waypoint, rawVal: string) => {
    let val: number = 0;
    if (rawVal !== '') {
      const parsed = parseFloat(rawVal);
      if (!isNaN(parsed)) {
        val = parsed;
      } else {
        return;
      }
    }
    updateWp(index, key, val);
  };

  const deleteWp = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setWaypoints(prev => prev.filter((_, i) => i !== index));
    if (selectedWpIndex === index) {
      setSelectedWpIndex(null);
    } else if (selectedWpIndex !== null && selectedWpIndex > index) {
      setSelectedWpIndex(selectedWpIndex - 1);
    }
  };

  let crossTrackError = 0;
  if (telemetry && waypoints.length > 0 && activeWpIndex < waypoints.length) {
    const p = toMeters(hLat, hLon, telemetry.lat, telemetry.lon);
    const b = toMeters(hLat, hLon, waypoints[activeWpIndex].lat, waypoints[activeWpIndex].lon);
    const a = activeWpIndex === 0
      ? { x: 0, y: 0 }
      : toMeters(hLat, hLon, waypoints[activeWpIndex - 1].lat, waypoints[activeWpIndex - 1].lon);
    
    crossTrackError = getCrossTrackError(p, a, b);
  }

  let altitudeError = 0;
  if (telemetry && waypoints.length > 0 && activeWpIndex < waypoints.length) {
    const targetWp = waypoints[activeWpIndex];
    altitudeError = Math.abs(targetWp.alt - telemetry.altitude);
  }

  const showCrossTrackWarning = telemetry?.mode === 3 && crossTrackError > 50;
  const showAltWarning = telemetry?.mode === 3 && altitudeError > 15;
  const showGpsWarning = telemetry?.mode === 3 && (!telemetry.sats || telemetry.sats < 4);
  const showLinkTimeoutWarning = isTelemetryLost;

  let hdop = 99.9;
  let vdop = 99.9;
  if (telemetry && telemetry.sats >= 4) {
    const sats = telemetry.sats;
    hdop = parseFloat(Math.max(0.8, 2.0 - (sats - 4) * 0.1).toFixed(1));
    vdop = parseFloat(Math.max(1.0, 2.5 - (sats - 4) * 0.12).toFixed(1));
  }
  const fixType = (telemetry && telemetry.sats >= 4) ? '3D Fix' : 'No Fix';

  const distanceRemaining = (waypoints.length > 0 && activeWpIndex < waypoints.length && telemetry)
    ? (() => {
        const wp = waypoints[activeWpIndex];
        const pos = toMeters(telemetry.lat, telemetry.lon, wp.lat, wp.lon);
        return Math.sqrt(pos.x * pos.x + pos.y * pos.y);
      })()
    : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-6 w-full items-start">
      {/* Left Side: Canvas Radar Map */}
      <div className="flex flex-col rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">Live Map</div>
            <h2 className="text-xl font-semibold text-white">Radar Navigation</h2>
          </div>
        </div>

        <div className="relative aspect-square w-full max-w-[500px] mx-auto flex items-center justify-center border border-slate-800 rounded-xl overflow-hidden bg-[#0a0f1a]">
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            style={{ width: dims.w, height: dims.h }}
            className="cursor-crosshair"
          />
        </div>
      </div>

      {/* Right Side: Waypoint Table & Action Panel */}
      <div className="flex flex-col gap-5 bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-slate-500">Mission Coordinator</div>
          <h2 className="text-xl font-semibold text-white">Waypoint Table & Action Panel</h2>
        </div>

        {/* Warning Banners */}
        {(showLinkTimeoutWarning || showGpsWarning || showCrossTrackWarning || showAltWarning) && (
          <div className="flex flex-col gap-2">
            {showLinkTimeoutWarning && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-2.5 rounded-lg flex items-center gap-2 font-semibold text-xs tracking-wider uppercase animate-pulse">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                LoRa Link Timeout Warning: Telemetry connection lost!
              </div>
            )}
            {showGpsWarning && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-2.5 rounded-lg flex items-center gap-2 font-semibold text-xs tracking-wider uppercase animate-pulse">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                Loss of GPS Warning: Poor satellite coverage in AUTO mode!
              </div>
            )}
            {showCrossTrackWarning && (
              <div className="bg-amber-500/10 border border-amber-500/50 text-amber-200 px-4 py-2.5 rounded-lg flex items-center gap-2 font-semibold text-xs tracking-wider uppercase animate-pulse">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                Cross-Track Error Warning: Deviation {crossTrackError.toFixed(1)}m exceeds 50m!
              </div>
            )}
            {showAltWarning && (
              <div className="bg-amber-500/10 border border-amber-500/50 text-amber-200 px-4 py-2.5 rounded-lg flex items-center gap-2 font-semibold text-xs tracking-wider uppercase animate-pulse">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                Alt Error Warning: Altitude error {altitudeError.toFixed(1)}m exceeds 15m!
              </div>
            )}
          </div>
        )}

        {/* Sync Status HUD */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Sync Status:</div>
            {syncStatus === 'synced' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 uppercase tracking-wider">
                <Check className="h-3 w-3" /> Synced
              </span>
            )}
            {syncStatus === 'error' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 border border-red-500/30 text-red-400 uppercase tracking-wider">
                <X className="h-3 w-3" /> Error
              </span>
            )}
            {isSyncing && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 uppercase tracking-wider animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" /> {syncStatus}
              </span>
            )}
            {!isSyncing && syncStatus !== 'synced' && syncStatus !== 'error' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 border border-slate-700 text-slate-400 uppercase tracking-wider">
                Idle
              </span>
            )}
          </div>

          {isSyncing && (
            <div className="flex-1 max-w-[200px] flex items-center gap-2">
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${syncProgress}%` }} />
              </div>
              <span className="font-mono text-xs text-cyan-400">{syncProgress}%</span>
            </div>
          )}

          {syncStatus === 'error' && syncError && (
            <div className="w-full mt-2 text-xs text-red-400 font-mono bg-red-950/20 border border-red-900/30 p-2 rounded">
              Error: {syncError}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleUpload}
            disabled={isSyncing || waypoints.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-850 disabled:text-slate-500 text-slate-950 transition-colors shadow-lg shadow-cyan-500/10 disabled:shadow-none"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Mission
          </button>
          <button
            onClick={handleClear}
            disabled={isSyncing || waypoints.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 transition-colors border border-slate-755"
          >
            <Trash className="h-3.5 w-3.5" />
            Clear Mission
          </button>
          <button
            onClick={handleRead}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/30 text-amber-300 disabled:bg-slate-850 disabled:text-slate-500 disabled:border-transparent transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Read Mission
          </button>
        </div>

        {/* Waypoint Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40 max-h-[350px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                <th className="p-3 font-mono">Index</th>
                <th className="p-3">Lat / Lon</th>
                <th className="p-3">Alt (m)</th>
                <th className="p-3">Speed (m/s)</th>
                <th className="p-3">Command</th>
                <th className="p-3">Value</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {waypoints.map((wp, idx) => (
                <tr
                  key={idx}
                  onClick={() => setSelectedWpIndex(idx)}
                  onDoubleClick={() => setSelectedWpIndex(idx)}
                  className={`hover:bg-slate-800/30 cursor-pointer transition-colors ${
                    selectedWpIndex === idx ? 'bg-slate-800/40 text-white font-medium border-l-2 border-cyan-400' : 'text-slate-300'
                  }`}
                >
                  <td className="p-3 font-mono">{idx}</td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <input
                        type="number"
                        step="0.000001"
                        value={wp.lat}
                        onChange={(e) => handleInputChange(idx, 'lat', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-[100px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
                      />
                      <input
                        type="number"
                        step="0.000001"
                        value={wp.lon}
                        onChange={(e) => handleInputChange(idx, 'lon', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-[100px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
                      />
                    </div>
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.1"
                      value={wp.alt}
                      onChange={(e) => handleInputChange(idx, 'alt', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-[60px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.1"
                      value={wp.speed}
                      onChange={(e) => handleInputChange(idx, 'speed', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-[60px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono"
                    />
                  </td>
                  <td className="p-3">
                    <select
                      value={wp.cmd}
                      onChange={(e) => updateWp(idx, 'cmd', parseInt(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                    >
                      <option value={0}>WAYPOINT (0)</option>
                      <option value={1}>LOITER_TIME (1)</option>
                      <option value={2}>RTL (2)</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="1"
                      value={wp.cmdVal}
                      disabled={wp.cmd === 2}
                      onChange={(e) => handleInputChange(idx, 'cmdVal', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-[60px] bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white focus:border-cyan-500 focus:outline-none font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={(e) => deleteWp(idx, e)}
                      className="p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
                      title="Delete Waypoint"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {waypoints.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500 font-mono">
                    No waypoints in mission. Click on map to add waypoints.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Status Telemetry HUD */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">GPS Sats</div>
            <div className="mt-1 font-mono text-base text-white">{telemetry?.sats ?? 0} Sats</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fix / Dilution</div>
            <div className="mt-1 font-mono text-sm text-white">
              {fixType} <span className="text-[10px] text-slate-400 font-normal">({hdop.toFixed(1)}H/{vdop.toFixed(1)}V)</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active WP</div>
            <div className="mt-1 font-mono text-base text-white">
              {waypoints.length > 0 ? `WP ${activeWpIndex}` : 'None'}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Distance target</div>
            <div className="mt-1 font-mono text-base text-white">
              {waypoints.length > 0 && telemetry ? `${distanceRemaining.toFixed(1)} m` : '0.0 m'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
