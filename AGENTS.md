# Project Context & Agent Instructions

## Overview
This is a web application that acts as a control dashboard for a brushless motor (A2212) powered by a 2S Li-ion battery (7.4V) and controlled by an Arduino over a Web Serial connection.

## Key Components and Logic

### 1. Motor Control & Dead Zone
- The UI slider sends a throttle percentage (0-100%).
- The Arduino code (`src/components/CodeViewer.tsx`) maps this percentage to a PWM signal (1000µs to 2000µs) on pin 9.
- **Dead Zone Compensation**: To account for low-quality ESCs that don't start spinning immediately, the throttle map for values > 0 starts at `1040µs` instead of 1000µs. (i.e. `map(throttle, 1, 100, 1040, 2000)`). Do not arbitrarily change this value unless requested.

### 2. Battery Telemetry & Anti-Sag Filter
- Voltage is read via analog pin A0 using a 1:1 voltage divider (R1=R2, e.g., 10k/10k or 8k/8k), dividing the 8.4V max by 2 to stay within Arduino's 5V limit.
- **Voltage Sag Issue**: When a large load is applied to the motor, the battery voltage physically drops (voltage sag).
- **Anti-Sag Filter**: We implemented a dynamic Exponential Moving Average (EMA) filter in the Arduino C++ code to prevent false low-battery alarms:
  - When `throttle == 0` (no load): `alpha = 0.05` (updates quickly to show true resting voltage).
  - When `throttle > 0` (under load): `alpha = 0.0002` (updates extremely slowly, effectively "holding" the voltage value from dropping too fast, but still capturing a real, continuous drain over time).
  - *Note*: We previously tried to artificially "add" voltage based on throttle, but this caused the battery percentage to increase when accelerating. The current `alpha` switching approach is the approved method.

### 3. Web Serial Protocol
- **Outbound (Web -> Arduino)**: `T={throttle_value}\n` (e.g., `T=45\n`).
- **Inbound (Arduino -> Web)**: Key-value pairs separated by pipes, e.g., `VOLTAGE=7.80|...`. Parsed in `src/hooks/useSerial.ts`. Keys are converted to lowercase.

### 4. UI Guidelines
- **Dashboard**: Features a custom-styled throttle slider. Note that the slider thumb positioning logic uses `calc(0.5rem + (100% - 1rem) * ${throttle / 100})`.
- **CodeViewer / WiringGuide**: The instructional sections (Wiring Guide and Microcontroller Code) are enclosed in collapsible components (using `isExpanded` state and `ChevronDown/ChevronUp` icons) to keep the UI clean by default.

## Future Agents Rules
- **Do NOT** change the `alpha` values or the anti-sag filter structure in `CodeViewer.tsx` unless explicitly requested, as this was iteratively tuned to solve specific physical hardware behaviors.
- **Do NOT** remove the Web Serial error handling in `useSerial.ts` that catches `NetworkError` and "lost" devices.
- Always maintain the dark slate/cyberpunk aesthetic (Tailwind slate, emerald, amber, rose).
- Keep hardware instructions strictly to 2S Li-ion (7.4V nominal, 8.4V max, 6.0V cutoff).
