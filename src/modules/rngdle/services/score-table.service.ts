import { readFileSync } from "node:fs";
import prisma from "#lib/database.js";
import { loggerMaker } from "#lib/logger.js";
import { declareService, type Service } from "#lib/service.js";
import { fetchScoreTableFromSite } from "./rngdle-api.js";
import { ScoreTable, type CompressedTable } from "./score-table.js";

const logger = loggerMaker("rngdle");

const SNAPSHOT = new URL("../assets/score-table.json", import.meta.url);

function loadSnapshot(): CompressedTable {
  return JSON.parse(readFileSync(SNAPSHOT, "utf8")) as CompressedTable;
}

class ScoreTableService implements Service {
  private current: Promise<ScoreTable> | null = null;

  get(): Promise<ScoreTable> {
    if (!this.current) {
      this.current = this.load();
      this.current.catch(() => {
        this.current = null;
      });
    }
    return this.current;
  }

  private async load(): Promise<ScoreTable> {
    const stored = await prisma.rngdleScoreTable.findUnique({
      where: { id: 1 },
    });
    return new ScoreTable(
      stored ? (stored.data as CompressedTable) : loadSnapshot()
    );
  }

  async refresh(): Promise<boolean> {
    const fetched = await fetchScoreTableFromSite();
    if (!fetched) {
      logger.warn(
        "Score table not found on rngdle.com, keeping the current one"
      );
      return false;
    }

    const current = await this.get();
    if (current.equals(fetched)) {
      return false;
    }

    await prisma.rngdleScoreTable.upsert({
      where: { id: 1 },
      create: { id: 1, data: fetched },
      update: { data: fetched },
    });
    this.current = Promise.resolve(new ScoreTable(fetched));
    logger.info(
      `Score table updated | entries = ${Object.keys(fetched).length}`
    );
    return true;
  }
}

export default declareService(new ScoreTableService());
