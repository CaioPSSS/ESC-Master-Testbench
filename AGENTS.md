# Project Context & Agent Instructions

## Overview
This is a **React + TypeScript + Vite** web application that acts as a wireless control dashboard for a brushless motor (A2212 1000KV). It uses a **WiFi + LoRa 433MHz** wireless architecture: the ESP32 creates a WiFi Access Point and serves the dashboard via SPIFFS. Any phone or PC connects to the ESP32's WiFi, opens the dashboard in a browser, and communicates via **WebSocket**. The ESP32 relays commands wirelessly via **LoRa** to a remote **Arduino Uno** that drives the ESC and sends battery telemetry back.

## Tech Stack
- **Framework**: React 19 + TypeScript 5.8
- **Build Tool**: Vite 6 (dev on port 3000, `npm run dev`)
- **Styling**: TailwindCSS v4 (via `@tailwindcss/vite` plugin — **NOT v3**)
- **Icons**: lucide-react
- **Fonts/Aesthetic**: Dark slate/cyberpunk palette (Tailwind `slate`, `emerald`, `amber`, `rose`, `cyan`)

## Hardware Architecture

```
[Phone / PC / Any Browser]
     |  WiFi (SSID: ESC-TestBench, Pass: motor2025)
     |  WebSocket ws://192.168.4.1/ws
     v
[ESP32 DevKit V1]  <- WiFi AP + Web Server (SPIFFS) + WebSocket Server
     |                 LoRa SX1278 Ra-02 433MHz
     |                 ~~~ 433MHz wireless ~~~
     v
[Arduino Uno]  <->  [LoRa SX1278 Ra-02 433MHz]
     |
     +-- [ESC <- PWM Pin 6]
     +-- [Battery A0 (Voltage Divider 1:1)]
     +-- [Motor A2212 1000KV]
     +-- [2S 18650 Li-ion Pack]
```

## Key Components and Logic

### 1. Motor Control & Dead Zone
- The UI slider sends a throttle percentage (0-100%).
- The Arduino code maps this percentage to a PWM signal (1000us to 2000us) on **pin 6** (NOT pin 9 -- pin 9 is used by LoRa NRESET).
- **Dead Zone Compensation**: To account for low-quality ESCs that don't start spinning immediately, the throttle map for values > 0 starts at `1040us` instead of 1000us. (i.e. `map(throttle, 1, 100, 1040, 2000)`). Do not arbitrarily change this value unless requested.
- **ESC Calibration**: The "Calibrar 2S" button sends `CALIBRATE\n` over serial. The Arduino then sends 2000us for 8 seconds (user plugs in battery during this window), then drops to 1000us to confirm calibration.

### 2. Battery Telemetry & Anti-Sag Filter
- Voltage is read via analog pin A0 using a 1:1 voltage divider (R1=R2, e.g., 10k/10k or 8k/8k), dividing the 8.4V max by 2 to stay within Arduino's 5V limit.
- **Voltage Sag Issue**: When a large load is applied to the motor, the battery voltage physically drops (voltage sag).
- **Anti-Sag Filter**: A dynamic Exponential Moving Average (EMA) filter is implemented in the Arduino C++ code (in `CodeViewer.tsx`) to prevent false low-battery alarms:
  - When `throttle == 0` (no load): `alpha = 0.05` (updates quickly to show true resting voltage).
  - When `throttle > 0` (under load): `alpha = 0.0002` (updates extremely slowly, effectively "holding" the voltage value from dropping too fast, but still capturing a real, continuous drain over time).
  - *Note*: We previously tried to artificially "add" voltage based on throttle, but this caused the battery percentage to increase when accelerating. The current `alpha` switching approach is the approved method.
- **Battery specs**: 2S Li-ion 18650 -- 7.4V nominal, 8.4V max, 6.0V software cutoff (~3.0V/cell).
- Battery percentage mapped via: `map(batteryVoltage * 100, 600, 840, 0, 100)`.

### 3. WebSocket Protocol
- **Outbound (Browser -> ESP32 via WebSocket)**: Raw throttle number followed by newline, e.g., `45\n`. Special command: `CALIBRATE\n`.
- **Inbound (Arduino -> ESP32 via LoRa -> Browser via WebSocket)**: Prefixed key-value format. The Arduino sends base telemetry via LoRa, and the ESP32 appends radio metrics before broadcasting to all WebSocket clients.
  - **Full format**: `T:V=7.80,P=50,S=OK,AR=-52,R=-45,N=9.5`
  - **Arduino fields**: `V` (voltage), `P` (battery %), `S` (status: `OK`, `ERROR_BATTERY`, `FAILSAFE`, `CALIBRATING`, `CAL_DONE`), `AR` (RSSI of last command received from ESP32, in dBm)
  - **ESP32-appended fields**: `R` (RSSI of received LoRa packet, in dBm), `N` (SNR of received packet, in dB)
  - Parsed in `src/hooks/useWebSocket.ts`. Keys are converted to lowercase (`v`, `p`, `s`, `r`, `n`, `ar`).
- Telemetry is sent every 500ms from the Arduino via LoRa.
- The `useWebSocket` hook auto-connects on mount, auto-reconnects on disconnect (3s interval), and tracks `packetCount` (incremental counter) and `lastPacketTime` (timestamp of last received telemetry).
- **WiFi AP Config**: SSID `ESC-TestBench`, password `motor2025`, IP `192.168.4.1`.
- **ESP32 Libraries**: WiFi.h, SPIFFS.h, ESPAsyncWebServer (me-no-dev), AsyncTCP, LoRa.h (Sandeep Mistry).

### 4. Failsafe System (Dual-Layer)
The system has **two independent failsafe layers** to stop the motor if the LoRa connection is lost:

1. **Arduino Hardware Failsafe** (in `CodeViewer.tsx` Arduino code):
   - Tracks `lastCommandTime` — updated every time a LoRa command packet arrives.
   - If `throttle > 0` and no command received for **2 seconds** (`FAILSAFE_TIMEOUT = 2000`), the Arduino zeroes throttle and sends `1000us` to the ESC.
   - Reports `S=FAILSAFE` in telemetry so the Dashboard knows.
   - Resets automatically when a new command arrives.

2. **Dashboard Software Failsafe** (in `Dashboard.tsx`):
   - If the motor is armed and `timeSincePacket > 3000ms` (3 seconds without any telemetry), the Dashboard auto-disarms, zeroes throttle, and sends `0\n`.
   - Also auto-disarms on `S=ERROR_BATTERY` or `S=FAILSAFE` from telemetry.
   - The `isStale` flag (>2s without telemetry) changes the MCU status card to "SEM SINAL" (amber).

### 5. LoRa Radio Parameters (both modules must match)
- Frequency: 433MHz
- Spreading Factor: SF7
- Bandwidth: 250kHz
- Coding Rate: 4/5
- TX Power (ESP32): 17 dBm

### 6. ESP32 Bridge -- LoRa SPI Pinout (VSPI)
| LoRa Pin | ESP32 GPIO |
|----------|-----------|
| NSS (CS) | GPIO 5    |
| NRESET   | GPIO 14   |
| DIO0     | GPIO 2    |
| SCK      | GPIO 18   |
| MISO     | GPIO 19   |
| MOSI     | GPIO 23   |
| VCC      | 3.3V      |

### 7. Arduino Uno -- LoRa SPI Pinout
| LoRa Pin | Arduino Pin |
|----------|------------|
| NSS (CS) | D10        |
| NRESET   | D9         |
| DIO0     | D2         |
| SCK      | D13        |
| MISO     | D12        |
| MOSI     | D11        |
| VCC      | 3.3V       |

### 8. UI Guidelines
- **Layout Architecture (`src/App.tsx`)**: The main area is a flex layout (`flex flex-row relative overflow-hidden h-full w-full`). The right side hosts a **microcontroller code drawer** that slides in and out smoothly (`transition-all duration-300`). When closed, it collapses completely (`w-0 opacity-0`), prompting the left panel (Dashboard + WiringGuide) to expand and occupy **100% of the screen width**.
- **Sidebar Toggle**: Toggleable via the "Mostrar/Esconder Código" button in the top header, which imports the `Code` icon from `lucide-react`.
- **Dashboard** (`src/components/Dashboard.tsx`): Custom-styled throttle slider. The track has a thick `h-12` container and the slider thumb uses a prominent `w-10 h-10` circle with absolute positioning `calc(0.5rem + (100% - 1rem) * ${throttle / 100})`. Card items and grids use expanded paddings (`p-6` on slider card, `p-4` on telemetry cards, `p-3.5` on diagnostics) and gaps (`gap-4`) with spacing (`space-y-6`) to achieve a premium, breathing layout.
- **Glassmorphism & Glow**: All cards use a glass-like `bg-slate-900/40 backdrop-blur-md border border-slate-800/80` style. The throttle text percentage and progress bar have dynamic shadows (`box-shadow`, `text-shadow`) that grow in intensity and shift from amber to red based on the current `throttle` value.
- **Animations (`src/index.css`)**:
  - `animate-ping-slow`: A custom sonar-like slow pulse animation on the "LIVE" status indicator when connection is active.
  - `animate-alert-rose` and `animate-alert-amber`: Soft, breathing neon borders that pulse around the slider card in red (low battery) or orange (failsafe connection loss) states.
- **Auto-disarm**: Dashboard auto-disarms and zeroes throttle if telemetry reports `S=ERROR_BATTERY`, `S=FAILSAFE`, or if telemetry goes stale for 3+ seconds.
- **ARM/DISARM flow**: Motor must be armed via button before slider activates. Emergency Stop button disarms immediately.
- **LoRa Link Diagnostics** (in Dashboard): A consolidated 4-column compact grid showing bidirectional RSSI (Bridge & Remote), SNR, Link Quality (%), and Packet count/frequency. Signal strength bars (5 levels) are displayed directly in the section header.
- **MCU Status States**: `OFFLINE` (slate) → `FAILSAFE` (amber) → `CORTE ATIVO` (rose) → `SEM SINAL` (amber) → `NORMAL` (emerald) → `NO TELEMETRY` (blue).
- **CodeViewer** (`src/components/CodeViewer.tsx`): Shows two tabs -- "Bridge WiFi (ESP32)" and "Receptor (Arduino Remoto)" -- and a wiring block diagram. Code is always visible and copyable when the sidebar is open.
- **WiringGuide** (`src/components/WiringGuide.tsx`): A glassmorphic card styled similarly to the Dashboard, stacked directly underneath it in the left panel. It does not have `mt-auto`, aligning naturally below the telemetry panels with a standard gap.

## File Structure
```
src/
+-- App.tsx                    # Root layout: header, sidebar toggle state, flex container, footer
+-- main.tsx                   # React entry point
+-- index.css                  # Global styles & keyframe animations (Tailwind base)
+-- hooks/
|   +-- useWebSocket.ts        # WebSocket hook: auto-connect/reconnect/send/telemetry (replaces useSerial)
+-- components/
    +-- Dashboard.tsx           # Throttle slider + telemetry + LoRa diagnostics grid + glow & border animations
    +-- CodeViewer.tsx          # Arduino & ESP32 code display (always expanded inside sidebar)
    +-- WiringGuide.tsx         # Hardware specs + WiFi + LoRa pinout tables + wiring instructions (styled as card)

esp32_lora_bridge/
+-- esp32_lora_bridge.ino      # ESP32 firmware: WiFi AP + SPIFFS Web Server + WebSocket + LoRa bridge
+-- data/                      # SPIFFS upload directory (built dashboard files go here via npm run build:esp32)
```

## Future Agents Rules
- **Do NOT** change the `alpha` values (`0.05` / `0.0002`) or the anti-sag filter structure in `CodeViewer.tsx` unless explicitly requested, as this was iteratively tuned to solve specific physical hardware behaviors.
- **Do NOT** remove the WebSocket auto-reconnect logic in `useWebSocket.ts` — it ensures the dashboard recovers from transient WiFi disconnects.
- **Do NOT** change the ESC PWM pin from **D6** back to D9 -- D9 is occupied by the LoRa NRESET line.
- **Do NOT** change the dead zone compensation value `1040us` unless explicitly requested.
- **Do NOT** change the failsafe timeout values (`FAILSAFE_TIMEOUT = 2000ms` on Arduino, `3000ms` on Dashboard) unless explicitly requested. These are safety-critical and were designed as a dual-layer protection system.
- **Do NOT** remove or weaken the failsafe auto-disarm logic in `Dashboard.tsx` or the watchdog in the Arduino code (`CodeViewer.tsx`). The motor MUST stop if LoRa connection is lost.
- **Do NOT** re-introduce `mt-auto` or top borders on the `WiringGuide.tsx` which could detach it from the Dashboard block or disrupt the spacing layout.
- Always maintain the dark slate/cyberpunk aesthetic (Tailwind `slate`, `emerald`, `amber`, `rose`, `cyan`).
- Keep hardware instructions strictly to 2S Li-ion (7.4V nominal, 8.4V max, 6.0V cutoff).
- This project uses **TailwindCSS v4** via the Vite plugin. Do NOT use v3 syntax (`tailwind.config.js`, `@apply`, `theme()` in config, etc.).
- The LoRa library used is **LoRa.h by Sandeep Mistry** (`#include <LoRa.h>`).
