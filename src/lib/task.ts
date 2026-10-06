import type { Client } from "discord.js";
import { DeclarationType, type Declared } from "./declared.js";

export interface ScheduledTask {
  id: string;
  schedule: string;
  runOnStart?: boolean;
  run: (client: Client<true>) => Promise<void>;
}

export function declareTask(task: ScheduledTask): Declared<ScheduledTask> {
  return {
    type: DeclarationType.Task,
    ...task,
  };
}
