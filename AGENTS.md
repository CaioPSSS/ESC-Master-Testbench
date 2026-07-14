# Project Context & Agent Instructions

## Overview
This repository is a **React 19 + TypeScript + Vite** ground station for a UAV. The current control path is no longer BLE/text. The browser reads a physical controller with the **HTML5 Gamepad API**, uses a dedicated **Web Worker** to pace RC uplink packets, sends **binary WebSocket** packets to an ESP32 access point, and receives **binary telemetry** back.

The ESP32 bridge acts as a **transparent FreeRTOS pass-through** between WebSocket and LoRa. It does not parse payload contents. The LoRa RX path is interrupt-driven on DIO0; TX bursts are queued with bounded wait and explicit drop accounting. The remote flight controller remains an **Arduino ATmega328PB** board that handles motor, servos, sensors, and NMEA parsing.

## Current Architecture

```text
[GameSir Nova Lite / other gamepad]
                    |
                    | Bluetooth nativo no Android / tablet
                    v
[Browser React GCS]
                    |
                    | Gamepad API + Web Worker de RC + WebSocket binário
                    | ws://192.168.4.1/ws
                    v
[ESP32 DevKit V1 - AP VANT_GCS]
                    |
                    | FreeRTOS bridge, AsyncWebServer + AsyncTCP
                    | DIO0 interrupt, semáforo ISR, fila com drop accounting
                    | LoRa SX1278 Ra-02 433 MHz
                    v
[Arduino ATmega328PB remoto]
                    |
                    +-- ESC PWM D6
                    +-- Elevon esquerdo D3
                    +-- Elevon direito D5
                    +-- A0 leitura de bateria com divisor 1:1
                    +-- MPU6050 + BMP280 no I2C
                    +-- NEO6MV2 via SoftwareSerial
```

## Tech Stack
- **Framework**: React 19
- **Language**: TypeScript 5.8
- **Build**: Vite 6
- **Styling**: TailwindCSS v4 via `@tailwindcss/vite`
- **Icons**: `lucide-react`
- **Map**: `leaflet` + `react-leaflet`
- **Aesthetic**: dark slate HUD, neon cyan/emerald accents, glassmorphism, mono fonts for critical values

## Important Source Files
- `src/App.tsx` orchestrates the tabbed shell and connection state.
- `src/components/Dashboard.tsx` is read-only telemetry, attitude, and link health.
- `src/components/RCGamepadTab.tsx` handles controller state, virtual arm/mode controls, and RC packet sending.
- `src/components/TuningParamsTab.tsx` edits and sends 0xDD tuning packets.
- `src/components/MapWidget.tsx` renders the live map.
- `src/hooks/useWebSocket.ts` manages the binary socket connection, reconnection, telemetry parsing, and sendBinary.
- `src/hooks/useGamepad.ts` polls `navigator.getGamepads()` in a requestAnimationFrame loop.
- `src/hooks/useRcWorker.ts` wires the gamepad snapshot stream into the RC worker.
- `src/hooks/rcWorker.ts` paces RC uplink at 10 Hz on a dedicated worker thread.
- `src/lib/protocol.ts` owns packet builders, parsers, and shared binary offsets for the protocol.
- `esp32_lora_bridge/esp32_lora_bridge.ino` is the ESP32 FreeRTOS bridge with DIO0 IRQ handling.
- `arduino_lora_remote/arduino_lora_remote.ino` is the remote flight controller.

## Binary Protocol
The protocol is strict little-endian binary. Use `DataView` for all packing and unpacking. Do not reintroduce text parsing for control or telemetry.
Keep packet offsets centralized in `src/lib/protocol.ts`; do not hardcode byte offsets in components or hooks.

### Uplink
- `0xBB` RC packet, 10 bytes total
     - `[u8 header] [u8 systemId] [i16 roll] [i16 pitch] [u16 throttle] [u8 mode] [u8 arm]`
     - Gamepad axes are normalized from `-1.0` to `1.0` and multiplied by `1000` with `Math.trunc()` before packing.
- `0xCC` mission upload, 15 bytes total
     - `[u8 header] [u8 systemId] [u8 index] [i32 lat*1e7] [i32 lon*1e7] [i16 alt_dm] [u16 speed_cms]`
- `0xDD` tuning packet, 7 bytes total
     - `[u8 header] [u8 systemId] [u8 paramId] [f32 value]`

### Downlink
- `0xAA` telemetry packet, 27 bytes total
     - `[u8 header] [u8 systemId] [i16 roll*100] [i16 pitch*100] [i16 yaw*100] [i16 alt_dm] [u16 vbat*100] [i32 lat*1e7] [i32 lon*1e7] [u8 sats] [u8 mode] [u8 arm] [u8 failsafe] [i8 rssi] [u16 groundSpeed]`

## Frontend Rules
- Keep the UI tabbed. The current tabs are `Dashboard`, `Map Widget`, `RC & Gamepad`, and `Tuning & Params`.
- Do not re-add the removed legacy tabs `Code Viewer` or `Wiring Guide`.
- Do not reintroduce `useBluetooth.ts`, BLE UART UUIDs, or text command strings.
- Do not add software trims for pitch or roll in the UI. The Arduino owns elevon centering and limits.
- Keep the dashboard as a read-only telemetry surface. Control actions belong in the RC/Gamepad tab.
- Keep the dark HUD look and the glass panels. Do not switch to a light UI.
- Use monospace presentation for packet values, IDs, voltages, coordinates, and telemetry fields.
- Ensure that the failsafe state is clearly warning or critical using prominent blinking banners at the top of the GCS dashboard.
- Protect operator settings using the 2.5-second UI override block on arm/mode switches to prevent stale telemetry packet overrides.

## ESP32 Bridge Rules
- The ESP32 must stay in **AP mode** with SSID `VANT_GCS` and password `vant#Sec24`.
- The WebSocket endpoint is `/ws`.
- The ESP32 bridge must remain transparent: no parsing of control or telemetry fields, only byte forwarding.
- Use `ESPAsyncWebServer` and `AsyncTCP` with FreeRTOS tasks/queues for the split between network and radio work.
- Prefer DIO0 hardware interrupts plus a semaphore over polling for LoRa RX.
- When enqueueing outbound radio packets, use a short bounded wait and track drops explicitly rather than silently discarding packets.
- Keep LoRa on `#include <LoRa.h>` from Sandeep Mistry.
- Set physical LoRa parameters: Spreading Factor to 7, Bandwidth to **250 kHz** (`250E3`), Coding Rate to 4/5, and enable hardware CRC check.
- Do not raise BLE power or reintroduce BLE on the ESP32 bridge.

## Arduino Flight Controller Rules
- The remote Arduino is **ATmega328PB**, not a standard Nano target.
- Use the **MiniCore** board package when flashing or building sketches for that board.
- Keep ESC PWM on **D6**. Do not move it back to D9.
- D9 remains reserved for LoRa NRESET.
- Keep the elevon servo pins at **D3** and **D5**.
- Do not add heavy libraries such as `TinyGPS++` or `Adafruit_BMP280`; use bare-metal parsing and lightweight I2C.
- Communication with GCS bridge/UAV is completely binary (never ASCII), using structures packed matching `SharedTypes.h` with `systemId = 0x42` verification.
- Scale joystick ranges correctly by constraint mapping from GCS scale ($0..1000$) to actuator scale ($0..100$) before setting outputs.
- Calibrate battery sensor with digital low-pass filtering and alpha constant optimized to **0.004** (response time ~5s) to avoid slow reading lag.
- Preserve the existing failsafe timing values unless explicitly requested.

## Safety and Behavior Rules
- Do not change the board type or pin assignments casually.
- Do not add compass logic based on MPU6050; it does not provide magnetometer data.
- Do not replace raw telemetry parsing with JSON or text protocols.
- Maintain the existing radio and power constraints of the hardware stack.

## Build and Validation
- Frontend dev server: `npm run dev`
- Frontend typecheck: `npm run lint`
- Frontend production build: `npm run build`
- Prefer small, local edits and validate the touched slice immediately.
- If a change touches the protocol, validate both the packet builders and the consumers.
- If a change touches RC uplink timing, validate the worker path in addition to the packet builder.

## Working Style
- Make minimal, focused edits.
- Prefer root-cause fixes over surface patches.
- Do not remove unrelated user changes.
- Keep comments short and only where behavior is not obvious.
