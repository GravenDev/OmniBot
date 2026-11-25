import store from "../services/session.service.js";
import type { ChessSession, GameAnalysis } from "../types.js";
import { analyseGame } from "./analyse.js";

export async function runAnalysis(
  session: ChessSession
): Promise<GameAnalysis> {
  if (!session.parsed) throw new Error("No parsed game to analyse");
  if (session.analysis) return session.analysis;
  // A second press while the engine is running joins the same promise instead
  // of spawning another Stockfish process for the same game.
  if (session.pendingAnalysis) return session.pendingAnalysis.promise;

  const parsed = session.parsed;
  const pending = analyseGame(parsed);
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
