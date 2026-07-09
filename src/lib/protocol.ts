export type FlightMode = 0 | 1 | 2 | 3 | 4;

export interface TelemetryData {
  roll: number;
  pitch: number;
  yaw: number;
  altitude: number;
  vbat: number;
  lat: number;
  lon: number;
  sats: number;
  mode: FlightMode;
  armed: boolean;
  failsafe: number;
  rssi: number;
  groundSpeed: number;
}

export interface GamepadAxes {
  roll: number;
  pitch: number;
  throttle: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
}

export interface GamepadButtons {
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  start: boolean;
  select: boolean;
  lb: boolean;
  rb: boolean;
  ls: boolean;
  rs: boolean;
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
}

export interface ParsedGamepadState {
  connected: boolean;
  id: string | null;
  index: number | null;
  axes: GamepadAxes;
  buttons: GamepadButtons;
  timestamp: number;
}

export const DEFAULT_WS_URL = 'ws://192.168.4.1/ws';

export const PARAMETER_NAMES = [
  'ROLL_KP',
  'ROLL_KI',
  'ROLL_KD',
  'ROLL_FF',
  'PITCH_KP',
  'PITCH_KI',
  'PITCH_KD',
  'PITCH_FF',
  'ANGLE_KP',
  'THR_CRUISE',
  'L1_PERIOD',
  'LORA_TIMEOUT',
  'TPA_BREAKPOINT',
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function parseTelemetry(buffer: ArrayBuffer): TelemetryData | null {
  const view = new DataView(buffer);

  if (view.byteLength < 26 || view.getUint8(0) !== 0xAA) {
    return null;
  }

  return {
    roll: view.getInt16(1, true) / 100,
    pitch: view.getInt16(3, true) / 100,
    yaw: view.getInt16(5, true) / 100,
    altitude: view.getInt16(7, true) / 10,
    vbat: view.getUint16(9, true) / 100,
    lat: view.getInt32(11, true) / 1e7,
    lon: view.getInt32(15, true) / 1e7,
    sats: view.getUint8(19),
    mode: view.getUint8(20) as FlightMode,
    armed: view.getUint8(21) === 1,
    failsafe: view.getUint8(22),
    rssi: view.getInt8(23),
    groundSpeed: view.getUint16(24, true) / 100,
  };
}

export function buildRcPacket(axes: Pick<GamepadAxes, 'roll' | 'pitch' | 'throttle'>, mode: number, armed: boolean): ArrayBuffer {
  const buffer = new ArrayBuffer(9);
  const view = new DataView(buffer);

  view.setUint8(0, 0xBB);
  view.setInt16(1, Math.trunc(clamp(axes.roll, -1, 1) * 1000), true);
  view.setInt16(3, Math.trunc(clamp(axes.pitch, -1, 1) * 1000), true);
  view.setUint16(5, clamp(Math.trunc(axes.throttle), 0, 1000), true);
  view.setUint8(7, clamp(Math.trunc(mode), 0, 255));
  view.setUint8(8, armed ? 1 : 0);

  return buffer;
}

export function buildMissionPacket(index: number, lat: number, lon: number, altDecimeters: number, speedCentimeters: number): ArrayBuffer {
  const buffer = new ArrayBuffer(14);
  const view = new DataView(buffer);

  view.setUint8(0, 0xCC);
  view.setUint8(1, clamp(Math.trunc(index), 0, 255));
  view.setInt32(2, Math.trunc(lat * 1e7), true);
  view.setInt32(6, Math.trunc(lon * 1e7), true);
  view.setInt16(10, Math.trunc(altDecimeters), true);
  view.setUint16(12, clamp(Math.trunc(speedCentimeters), 0, 65535), true);

  return buffer;
}

export function buildTuningPacket(paramId: number, value: number): ArrayBuffer {
  const buffer = new ArrayBuffer(6);
  const view = new DataView(buffer);

  view.setUint8(0, 0xDD);
  view.setUint8(1, clamp(Math.trunc(paramId), 0, 255));
  view.setFloat32(2, Number.isFinite(value) ? value : 0, true);

  return buffer;
}