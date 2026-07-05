# Project Context & Agent Instructions

## Overview
This is a **React + TypeScript + Vite** web application that acts as a wireless control dashboard for a brushless motor (A2212 1000KV) and Elevon servos. It uses a **Bluetooth Low Energy (BLE) + LoRa 433MHz** wireless architecture: the ESP32 creates a BLE Server (Nordic UART Service). Any PC or phone connects via Web Bluetooth in the browser. The ESP32 relays commands wirelessly via **LoRa** to a remote **Arduino Uno/Nano (ATmega328PB)** that drives the ESC and servos, and sends battery telemetry back.

## Tech Stack
- **Framework**: React 19 + TypeScript 5.8
- **Build Tool**: Vite 6 (dev on port 3000, `npm run dev`)
- **Styling**: TailwindCSS v4 (via `@tailwindcss/vite` plugin — **NOT v3**)
- **Icons**: lucide-react
- **Fonts/Aesthetic**: Dark slate/cyberpunk palette (Tailwind `slate`, `emerald`, `amber`, `rose`, `cyan`)

## Hardware Architecture

```
[Phone / PC (Chrome/Edge)]
     |  Web Bluetooth (BLE UART)
     |  Service: 6E400001-...
     v
[ESP32 DevKit V1]  <- BLE Server + LoRa Bridge
     |                 LoRa SX1278 Ra-02 433MHz
     |                 ~~~ 433MHz wireless ~~~
     v
[Arduino Nano (ATmega328PB)]  <->  [LoRa SX1278 Ra-02 433MHz]
     |
     +-- [ESC <- PWM Pin 6]
     +-- [Elevon Left <- PWM Pin 3]
     +-- [Elevon Right <- PWM Pin 5]
     +-- [Battery A0 (Voltage Divider 1:1)]
     +-- [Motor A2212 1000KV]
     +-- [2S 18650 Li-ion Pack]
```

## Key Components and Logic

### 1. Motor & Servo Control
- The UI slider sends a throttle percentage (0-100%). The 2D Joystick sends pitch and roll (-100 to 100).
- The Arduino code maps throttle to a PWM signal (1000us to 2000us) on **pin 6** (NOT pin 9 -- pin 9 is used by LoRa NRESET).
- **Dead Zone Compensation**: To account for low-quality ESCs that don't start spinning immediately, the throttle map for values > 0 starts at `1040us` instead of 1000us.
- **Elevon Clipping & Centers**: The left and right servos are physically mirrored. Their exact centers (`105` and `70`) and mechanical limits (`[46, 150]` and `[24, 116]`) are hardcoded in the Arduino to prevent physical stall against the fuselage. The UI sends raw (-100 to 100) and the Arduino applies the Delta Mix and constrains it.

### 2. Battery Telemetry & Anti-Sag Filter
- Voltage is read via analog pin A0 using a 1:1 voltage divider (R1=R2, e.g., 10k/10k or 8k/8k), dividing the 8.4V max by 2 to stay within Arduino's 5V limit.
- **Voltage Sag Issue**: When a large load is applied to the motor, the battery voltage physically drops (voltage sag).
- **Anti-Sag Filter**: A dynamic Exponential Moving Average (EMA) filter is implemented in the Arduino C++ code to prevent false low-battery alarms:
  - When `throttle == 0` (no load): `alpha = 0.05` (updates quickly to show true resting voltage).
  - When `throttle > 0` (under load): `alpha = 0.0002` (updates extremely slowly, effectively "holding" the voltage value).

### 3. BLE Protocol
- **Outbound (Browser -> ESP32 via BLE)**: Raw throttle, pitch, and roll followed by newline, e.g., `45,80,-20\n`. Special command: `CALIBRATE\n` or `TEST\n`.
- **Inbound (Arduino -> ESP32 via LoRa -> Browser via BLE)**: Prefixed key-value format. The Arduino sends base telemetry via LoRa, and the ESP32 appends radio metrics before broadcasting via BLE Notify.
  - **Full format**: `T:V=7.80,P=50,S=OK,AR=-52,R=-45,N=9.5`
  - Parsed in `src/hooks/useBluetooth.ts`. Keys are converted to lowercase.
- Telemetry is sent every 500ms from the Arduino via LoRa.
- The `useBluetooth` hook auto-reconnects and tracks `packetCount` and `lastPacketTime`.

### 4. Failsafe System (Dual-Layer)
The system has **two independent failsafe layers** to stop the motor if the wireless connection is lost:

1. **Arduino Hardware Failsafe** (in Arduino code):
   - Tracks `lastCommandTime`. If `throttle > 0` and no command received for **2 seconds** (`FAILSAFE_TIMEOUT = 2000`), the Arduino zeroes throttle and centers servos.
   - Reports `S=FAILSAFE` in telemetry.

2. **Dashboard Software Failsafe** (in `Dashboard.tsx`):
   - If the motor is armed and `timeSincePacket > 3000ms`, the Dashboard auto-disarms and zeroes throttle.

### 5. UI Guidelines
- **Dashboard** (`src/components/Dashboard.tsx`): Custom-styled throttle slider and a 2D Elevon Joystick.
- **Glassmorphism & Glow**: All cards use a glass-like `bg-slate-900/40 backdrop-blur-md` style. The throttle has dynamic shadows that shift from amber to red based on intensity.
- **Auto-disarm**: Dashboard auto-disarms and zeroes throttle if telemetry reports `S=ERROR_BATTERY`, `S=FAILSAFE`, or goes stale for 3+ seconds.
- **MCU Status States**: `OFFLINE` → `FAILSAFE` → `CORTE ATIVO` → `SEM SINAL` → `NORMAL` → `NO TELEMETRY`.

## Future Agents Rules
- **Do NOT** change the Arduino board type standard. The remote Arduino uses an **ATmega328PB** chip. When flashing bootloader or sketches, it MUST use the **MiniCore** package in Arduino IDE. Standard Nano boards will fail the signature check (`1E 95 16`).
- **Do NOT** boost the BLE power in the ESP32 (`BLEDevice::setPower(ESP_PWR_LVL_P9)`). The combined power spike of LoRa + BLE will cause a brownout bootloop on standard USB ports.
- **Do NOT** add software trims for Pitch and Roll in the UI (`Dashboard.tsx`). The physical centers and constraints are hardcoded in the Arduino to allow for Elevon Clipping. The UI must send pure `[-100, 100]` values.
- **Do NOT** change the `alpha` values (`0.05` / `0.0002`) or the anti-sag filter structure unless requested.
- **Do NOT** change the ESC PWM pin from **D6** back to D9 -- D9 is occupied by the LoRa NRESET line.
- **Do NOT** change the failsafe timeout values (`FAILSAFE_TIMEOUT = 2000ms` on Arduino, `3000ms` on Dashboard) unless requested.
- Always maintain the dark slate/cyberpunk aesthetic (Tailwind `slate`, `emerald`, `amber`, `rose`, `cyan`).
- This project uses **TailwindCSS v4**. Do NOT use v3 syntax (`tailwind.config.js`, `@apply`, `theme()` in config, etc.).
- The LoRa library used is **LoRa.h by Sandeep Mistry** (`#include <LoRa.h>`).
