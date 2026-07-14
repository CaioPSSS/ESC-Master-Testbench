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

export const RC_PACKET_HEADER = 0xBB;
export const RC_PACKET_LENGTH = 10;
export const RC_PACKET_OFFSETS = {
  header: 0,
  systemId: 1,
  roll: 2,
  pitch: 4,
  throttle: 6,
  mode: 8,
  armed: 9,
} as const;

export const TELEMETRY_PACKET_HEADER = 0xAA;
export const TELEMETRY_PACKET_LENGTH = 27;
export const TELEMETRY_OFFSETS = {
  header: 0,
  systemId: 1,
  roll: 2,
  pitch: 4,
  yaw: 6,
  altitude: 8,
  battery: 10,
  lat: 12,
  lon: 16,
  sats: 20,
  mode: 21,
  armed: 22,
  failsafe: 23,
  rssi: 24,
  groundSpeed: 25,
} as const;

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

export function applyDeadzone(value: number, threshold = 0.05): number {
  return Math.abs(value) < threshold ? 0 : value;
}

export function parseTelemetry(buffer: ArrayBuffer): TelemetryData | null {
  const view = new DataView(buffer);

  if (view.byteLength < TELEMETRY_PACKET_LENGTH || view.getUint8(TELEMETRY_OFFSETS.header) !== TELEMETRY_PACKET_HEADER) {
    return null;
  }

  if (view.getUint8(TELEMETRY_OFFSETS.systemId) !== 0x42) {
    return null;
  }

  return {
    roll: view.getInt16(TELEMETRY_OFFSETS.roll, true) / 100,
    pitch: view.getInt16(TELEMETRY_OFFSETS.pitch, true) / 100,
    yaw: view.getInt16(TELEMETRY_OFFSETS.yaw, true) / 100,
    altitude: view.getInt16(TELEMETRY_OFFSETS.altitude, true) / 10,
    vbat: view.getUint16(TELEMETRY_OFFSETS.battery, true) / 100,
    lat: view.getInt32(TELEMETRY_OFFSETS.lat, true) / 1e7,
    lon: view.getInt32(TELEMETRY_OFFSETS.lon, true) / 1e7,
    sats: view.getUint8(TELEMETRY_OFFSETS.sats),
    mode: view.getUint8(TELEMETRY_OFFSETS.mode) as FlightMode,
    armed: view.getUint8(TELEMETRY_OFFSETS.armed) === 1,
    failsafe: view.getUint8(TELEMETRY_OFFSETS.failsafe),
    rssi: view.getInt8(TELEMETRY_OFFSETS.rssi),
    groundSpeed: view.getUint16(TELEMETRY_OFFSETS.groundSpeed, true) / 100,
  };
}

export function buildRcPacket(axes: Pick<GamepadAxes, 'roll' | 'pitch' | 'throttle'>, mode: number, armed: boolean): ArrayBuffer {
  const buffer = new ArrayBuffer(RC_PACKET_LENGTH);
  const view = new DataView(buffer);

  view.setUint8(RC_PACKET_OFFSETS.header, RC_PACKET_HEADER);
  view.setUint8(RC_PACKET_OFFSETS.systemId, 0x42);
  view.setInt16(RC_PACKET_OFFSETS.roll, Math.trunc(clamp(axes.roll, -1, 1) * 1000), true);
  view.setInt16(RC_PACKET_OFFSETS.pitch, Math.trunc(clamp(axes.pitch, -1, 1) * 1000), true);
  view.setUint16(RC_PACKET_OFFSETS.throttle, clamp(Math.trunc(axes.throttle), 0, 1000), true);
  view.setUint8(RC_PACKET_OFFSETS.mode, clamp(Math.trunc(mode), 0, 255));
  view.setUint8(RC_PACKET_OFFSETS.armed, armed ? 1 : 0);

  return buffer;
}

export function buildMissionPacket(
  index: number,
  lat: number,
  lon: number,
  altDecimeters: number,
  speedCentimeters: number,
  cmd: number,
  cmdVal: number
): ArrayBuffer {
  const buffer = new ArrayBuffer(18);
  const view = new DataView(buffer);

  view.setUint8(0, 0xCC);
  view.setUint8(1, 0x42);
  view.setUint8(2, clamp(Math.trunc(index), 0, 255));
  view.setInt32(3, Math.trunc(lat * 1e7), true);
  view.setInt32(7, Math.trunc(lon * 1e7), true);
  view.setInt16(11, Math.trunc(altDecimeters), true);
  view.setUint16(13, clamp(Math.trunc(speedCentimeters), 0, 65535), true);
  view.setUint8(15, clamp(Math.trunc(cmd), 0, 255));
  view.setUint16(16, clamp(Math.trunc(cmdVal), 0, 65535), true);

  return buffer;
}

export function buildTuningPacket(paramId: number, value: number): ArrayBuffer {
  const buffer = new ArrayBuffer(7);
  const view = new DataView(buffer);

  view.setUint8(0, 0xDD);
  view.setUint8(1, 0x42);
  view.setUint8(2, clamp(Math.trunc(paramId), 0, 255));
  view.setFloat32(3, Number.isFinite(value) ? value : 0, true);

  return buffer;
}

export interface MissionControlData {
  cmd: number;
  data1: number;
  checksum: number;
}

export function buildMissionControlPacket(cmd: number, data1: number, checksum: number): ArrayBuffer {
  const buffer = new ArrayBuffer(9);
  const view = new DataView(buffer);

  view.setUint8(0, 0xCE);
  view.setUint8(1, 0x42);
  view.setUint8(2, clamp(Math.trunc(cmd), 0, 255));
  view.setUint8(3, clamp(Math.trunc(data1), 0, 255));
  view.setUint32(4, checksum, true);
  view.setUint8(8, 0); // Padding/unused to ensure 9-byte layout

  return buffer;
}

export function parseMissionControl(buffer: ArrayBuffer): MissionControlData | null {
  const view = new DataView(buffer);

  if (view.byteLength < 9 || view.getUint8(0) !== 0xCE) {
    return null;
  }

  if (view.getUint8(1) !== 0x42) {
    return null;
  }

  return {
    cmd: view.getUint8(2),
    data1: view.getUint8(3),
    checksum: view.getUint32(4, true),
  };
}