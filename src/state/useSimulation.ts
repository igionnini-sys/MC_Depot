/** Runs the Monte Carlo engine in a Web Worker so the UI stays responsive. */
import { useCallback, useRef, useState } from 'react';
import type { SimulationRequest, SimulationResults } from '../engine/types';
import type { WorkerMessage } from '../engine/worker';

export type SimStatus =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'error'; message: string };

export function useSimulation(onDone: (r: SimulationResults, req: SimulationRequest) => void) {
  const [status, setStatus] = useState<SimStatus>({ kind: 'idle' });
  const worker = useRef<Worker | null>(null);

  const cancel = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setStatus({ kind: 'idle' });
  }, []);

  const run = useCallback((req: SimulationRequest) => {
    worker.current?.terminate();
    const w = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setStatus({ kind: 'running', done: 0, total: req.params.nSimulations });
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.type === 'progress') setStatus({ kind: 'running', done: m.done, total: m.total });
      else {
        w.terminate();
        worker.current = null;
        if (m.type === 'done') {
          setStatus({ kind: 'idle' });
          onDone(m.results, req);
        } else setStatus({ kind: 'error', message: m.message });
      }
    };
    w.onerror = (e) => {
      w.terminate();
      worker.current = null;
      setStatus({ kind: 'error', message: e.message || 'Worker error' });
    };
    w.postMessage(req);
  }, [onDone]);

  return { status, run, cancel };
}
