import { buildRcPacket, type FlightMode, type ParsedGamepadState } from '../lib/protocol';

const RC_TICK_MS = 100;

type RcWorkerConfig = {
  active: boolean;
  armed: boolean;
  mode: FlightMode;
};

type MainToWorkerMessage =
  | { type: 'configure'; config: RcWorkerConfig }
  | { type: 'gamepad-snapshot'; gamepad: ParsedGamepadState };

type WorkerToMainMessage =
  | { type: 'request-gamepad' }
  | { type: 'send-binary'; buffer: ArrayBuffer }
  | { type: 'throttle-update'; value: number };

type WorkerScope = {
  postMessage(message: WorkerToMainMessage, transfer?: Transferable[]): void;
};

let config: RcWorkerConfig = {
  active: false,
  armed: false,
  mode: 0,
};

let currentThrottle = 0;

let timerId: ReturnType<typeof setTimeout> | null = null;
let awaitingSnapshot = false;
let nextTickAt = performance.now() + RC_TICK_MS;

function clearTimer() {
  if (timerId !== null) {
     globalThis.clearTimeout(timerId);
    timerId = null;
  }
}

function scheduleNextTick() {
  clearTimer();

  if (!config.active) {
    return;
  }

  const delay = Math.max(0, nextTickAt - performance.now());
    timerId = globalThis.setTimeout(tick, delay);
}

function tick() {
  timerId = null;

  if (!config.active) {
    awaitingSnapshot = false;
    return;
  }

  if (!awaitingSnapshot) {
    awaitingSnapshot = true;
    const message: WorkerToMainMessage = { type: 'request-gamepad' };
    self.postMessage(message);
  }

  nextTickAt += RC_TICK_MS;
  const now = performance.now();
  if (nextTickAt < now - RC_TICK_MS) {
    nextTickAt = now + RC_TICK_MS;
  }

  scheduleNextTick();
}

self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;

  if (message.type === 'configure') {
    const wasArmed = config.armed;
    config = message.config;
    awaitingSnapshot = false;
    nextTickAt = performance.now() + RC_TICK_MS;

    // Reset throttle on disarm or deactivation (safety)
    if (!config.active || (!config.armed && wasArmed)) {
      currentThrottle = 0;
      (globalThis as unknown as WorkerScope).postMessage({ type: 'throttle-update', value: currentThrottle });
    }

    if (config.active) {
      scheduleNextTick();
    } else {
      clearTimer();
    }

    return;
  }

  if (message.type === 'gamepad-snapshot') {
    awaitingSnapshot = false;

    if (!config.active) {
      return;
    }

    const THROTTLE_RATE_PER_TICK = 150;
    const rawRate = -(message.gamepad.axes.leftY); // leftY is negative when UP
    currentThrottle += rawRate * THROTTLE_RATE_PER_TICK;
    if (currentThrottle < 0) currentThrottle = 0;
    if (currentThrottle > 1000) currentThrottle = 1000;

    const axesWithThrottle = {
      ...message.gamepad.axes,
      throttle: Math.trunc(currentThrottle)
    };

    const buffer = buildRcPacket(axesWithThrottle, config.mode, config.armed);
    const outbound: WorkerToMainMessage = { type: 'send-binary', buffer };
    (globalThis as unknown as WorkerScope).postMessage(outbound, [buffer]);
    (globalThis as unknown as WorkerScope).postMessage({ type: 'throttle-update', value: currentThrottle });
  }
};
