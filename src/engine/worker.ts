/// <reference lib="webworker" />
import { runSimulation } from './simulation';
import type { SimulationRequest, SimulationResults } from './types';

export type WorkerMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; results: SimulationResults }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<SimulationRequest>) => {
  try {
    const results = runSimulation(e.data, (done, total) => ctx.postMessage({ type: 'progress', done, total } satisfies WorkerMessage));
    ctx.postMessage({ type: 'done', results } satisfies WorkerMessage, [
      results.accumulation.buffer,
      results.accumulationNominal.buffer,
      results.final.buffer,
      results.realWithdrawal.buffer,
    ]);
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies WorkerMessage);
  }
};
