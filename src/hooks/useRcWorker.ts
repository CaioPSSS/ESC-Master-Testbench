import { useEffect, useRef } from 'react';

import type { FlightMode, ParsedGamepadState } from '../lib/protocol';

type RcWorkerToMainMessage =
  | { type: 'request-gamepad' }
  | { type: 'send-binary'; buffer: ArrayBuffer };

interface UseRcWorkerParams {
  armed: boolean;
  canSend: boolean;
  gamepad: ParsedGamepadState;
  mode: FlightMode;
  sendBinary: (buffer: ArrayBuffer) => boolean;
}

export function useRcWorker({ armed, canSend, gamepad, mode, sendBinary }: UseRcWorkerParams) {
  const workerRef = useRef<Worker | null>(null);
  const gamepadRef = useRef(gamepad);

  useEffect(() => {
    gamepadRef.current = gamepad;
  }, [gamepad]);

  useEffect(() => {
    const worker = new Worker(new URL('./rcWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<RcWorkerToMainMessage>) => {
      const message = event.data;

      if (message.type === 'request-gamepad') {
        worker.postMessage({ type: 'gamepad-snapshot', gamepad: gamepadRef.current });
        return;
      }

      if (message.type === 'send-binary') {
        sendBinary(message.buffer);
      }
    };

    worker.onerror = (error) => {
      console.error('[RC Worker]', error.message);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [sendBinary]);

  useEffect(() => {
    workerRef.current?.postMessage({
      type: 'configure',
      config: {
        active: canSend,
        armed,
        mode,
      },
    });
  }, [armed, canSend, mode]);
}