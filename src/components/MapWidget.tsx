import { useEffect, useRef, useState } from 'react';

interface RadarMapProps {
  lat: number;
  lon: number;
  homeLat?: number;
  homeLon?: number;
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

export function MapWidget({ lat, lon, homeLat, homeLon }: RadarMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const [dims, setDims] = useState({ w: 400, h: 400 });

  const hLat = homeLat ?? lat;
  const hLon = homeLon ?? lon;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const s = Math.min(width, height, 600);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h } = dims;
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2); // retina

    const cx = w / 2;
    const cy = h / 2;
    const maxRing = RINGS[RINGS.length - 1];
    const scale = (Math.min(w, h) / 2 - 30) / maxRing;

    // Background
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, w, h);

    // Distance rings
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

    // Crosshair
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.2)';
    ctx.beginPath();
    ctx.moveTo(cx, 10); ctx.lineTo(cx, h - 10);
    ctx.moveTo(10, cy); ctx.lineTo(w - 10, cy);
    ctx.stroke();

    // North indicator
    ctx.fillStyle = '#f43f5e';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 18);
    ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
    ctx.fillText('S', cx, h - 8);
    ctx.fillText('E', w - 12, cy + 5);
    ctx.fillText('W', 12, cy + 5);

    // Home marker
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(34, 211, 238, 0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HOME', cx + 8, cy - 4);

    // Trail
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

    // Aircraft position
    const pos = toMeters(hLat, hLon, lat, lon);
    const ax = cx + pos.x * scale;
    const ay = cy + pos.y * scale;

    // Aircraft marker (triangle)
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(ax, ay - 8);
    ctx.lineTo(ax - 5, ay + 5);
    ctx.lineTo(ax + 5, ay + 5);
    ctx.closePath();
    ctx.fill();

    // Info panel
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
  }, [lat, lon, hLat, hLon, dims]);

  return (
    <div className="w-full aspect-square max-w-[600px] mx-auto">
      <canvas
        ref={canvasRef}
        style={{ width: dims.w, height: dims.h }}
        className="rounded-xl border border-slate-800"
      />
    </div>
  );
}
