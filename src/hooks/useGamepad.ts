import { useEffect, useRef, useState } from 'react';

import type { GamepadButtons, GamepadAxes, ParsedGamepadState } from '../lib/protocol';

const EMPTY_BUTTONS: GamepadButtons = {
  a: false,
  b: false,
  x: false,
  y: false,
  start: false,
  select: false,
  lb: false,
  rb: false,
  ls: false,
  rs: false,
  dpadUp: false,
  dpadDown: false,
  dpadLeft: false,
  dpadRight: false,
};

const EMPTY_AXES: GamepadAxes = {
  roll: 0,
  pitch: 0,
  throttle: 0,
  leftX: 0,
  leftY: 0,
  rightX: 0,
  rightY: 0,
};

function clampAxis(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-1, Math.min(1, value));
}

function readButton(gamepad: Gamepad, index: number): boolean {
  return Boolean(gamepad.buttons[index]?.pressed);
}

function buildState(gamepad: Gamepad): ParsedGamepadState {
  const leftX = clampAxis(gamepad.axes[0]);
  const leftY = clampAxis(gamepad.axes[1]);
  const rightX = clampAxis(gamepad.axes[2]);
  const rightY = clampAxis(gamepad.axes[3]);

  return {
    connected: true,
    id: gamepad.id,
    index: gamepad.index,
    axes: {
      roll: rightX,
      pitch: -rightY,
      throttle: Math.max(0, Math.min(1000, Math.trunc(((1 - leftY) / 2) * 1000))),
      leftX,
      leftY,
      rightX,
      rightY,
    },
    buttons: {
      a: readButton(gamepad, 0),
      b: readButton(gamepad, 1),
      x: readButton(gamepad, 2),
      y: readButton(gamepad, 3),
      lb: readButton(gamepad, 4),
      rb: readButton(gamepad, 5),
      select: readButton(gamepad, 8),
      start: readButton(gamepad, 9),
      ls: readButton(gamepad, 10),
      rs: readButton(gamepad, 11),
      dpadUp: readButton(gamepad, 12),
      dpadDown: readButton(gamepad, 13),
      dpadLeft: readButton(gamepad, 14),
      dpadRight: readButton(gamepad, 15),
    },
    timestamp: gamepad.timestamp,
  };
}

function statesEqual(left: ParsedGamepadState, right: ParsedGamepadState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function useGamepad() {
  const previousStateRef = useRef<ParsedGamepadState>({
    connected: false,
    id: null,
    index: null,
    axes: EMPTY_AXES,
    buttons: EMPTY_BUTTONS,
    timestamp: 0,
  });

  const [state, setState] = useState<ParsedGamepadState>(previousStateRef.current);

  useEffect(() => {
    let animationFrameId = 0;

    const loop = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const gamepad = pads.find((pad): pad is Gamepad => Boolean(pad && pad.connected));

      const nextState = gamepad
        ? buildState(gamepad)
        : {
            connected: false,
            id: null,
            index: null,
            axes: EMPTY_AXES,
            buttons: EMPTY_BUTTONS,
            timestamp: 0,
          };

      if (!statesEqual(previousStateRef.current, nextState)) {
        previousStateRef.current = nextState;
        setState(nextState);
      }

      animationFrameId = window.requestAnimationFrame(loop);
    };

    animationFrameId = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return state;
}