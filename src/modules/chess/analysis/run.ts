import engines, {
  AnalysisBusyError,
  AnalysisQueueFullError,
} from "../services/engines.service.js";
import store from "../services/session.service.js";
import type { ChessSession, GameAnalysis } from "../types.js";

/** Stockfish and the rating rules only know standard chess. */
export class VariantNotAnalysedError extends Error {
  constructor(readonly variant: string) {
    super(`A ${variant} game cannot be analysed`);
    this.name = "VariantNotAnalysedError";
  }
}

/** The message key explaining why an analysis did not complete. */
export function analysisErrorKey(error: unknown): string {
  if (error instanceof VariantNotAnalysedError) return "error.variant";
  if (error instanceof AnalysisBusyError) return "error.busy";
  if (error instanceof AnalysisQueueFullError) return "error.queueFull";
  return "error.analysis";
}

export async function runAnalysis(
  session: ChessSession
): Promise<GameAnalysis> {
  if (!session.parsed) throw new Error("No parsed game to analyse");
  if (session.analysis) return session.analysis;
  // A second press while the engine is running joins the same promise instead
  // of spawning another Stockfish process for the same game.
  if (session.pendingAnalysis) return session.pendingAnalysis.promise;
  const parsed = session.parsed;
  if (parsed.variant !== "chess")
    throw new VariantNotAnalysedError(parsed.variant);
  // Throws at once when the member or the queue is busy.
  const pending = engines.analyse(session.ownerId, parsed);
  // Keep a plain marker next to the promise: comparing two promises directly
  // is enough to tell them apart but confuses promise-aware static analysis.
  const inFlight = { promise: pending };
  session.pendingAnalysis = inFlight;
  try {
    const analysis = await pending;
    // Selecting another game clears `parsed` and `pendingAnalysis`: a result
    // from the previous game must not be stored on the new one.
    if (store.get(session.id)?.parsed !== parsed) return analysis;
    store.setAnalysis(session.id, analysis);
    return analysis;
  } finally {
    if (session.pendingAnalysis === inFlight) delete session.pendingAnalysis;
  }
}
