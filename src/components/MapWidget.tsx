import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix para o ícone padrão do Leaflet no React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapWidgetProps {
  lat: number;
  lon: number;
}

// Componente utilitário para recentralizar o mapa quando a coordenada muda (opcionalmente)
function MapUpdater({ lat, lon }: { lat: number, lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], map.getZoom());
  }, [lat, lon, map]);
  return null;
}

export function MapWidget({ lat, lon }: MapWidgetProps) {
  const [path, setPath] = useState<[number, number][]>([]);

  useEffect(() => {
    // Só adiciona ao rastro se a posição mudar consideravelmente ou for a primeira
    setPath(prev => {
      if (prev.length === 0) return [[lat, lon]];
      const last = prev[prev.length - 1];
      const dist = Math.sqrt(Math.pow(last[0] - lat, 2) + Math.pow(last[1] - lon, 2));
      if (dist > 0.00005) { // Threshold pequeno para não poluir
        return [...prev, [lat, lon]];
      }
      return prev;
    });
  }, [lat, lon]);

  return (
    <div className="w-full h-full min-h-[250px] rounded-xl overflow-hidden border border-slate-700 relative z-0">
      <MapContainer 
        center={[lat, lon]} 
        zoom={16} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%', background: '#0f172a' }} // Dark bg fallback
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles"
        />
        <MapUpdater lat={lat} lon={lon} />
        <Marker position={[lat, lon]} />
        {path.length > 1 && (
          <Polyline positions={path} color="#06b6d4" weight={3} opacity={0.8} />
        )}
      </MapContainer>
      
      <style>{`
        /* Dark mode filter para os tiles do OpenStreetMap */
        .map-tiles {
          filter: brightness(0.6) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
        }
      `}</style>
    </div>
  );
}
