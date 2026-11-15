import { RESTJSONErrorCodes } from "discord.js";

export interface CreationFailure {
  reason: string;
  level: "debug" | "throttled";
}

/**
 * Why Discord refused to start a thread under a message, from the code of its
 * error, when that is an expected outcome rather than a bug; null otherwise.
 */
export function creationFailure(
  code: number | undefined
): CreationFailure | null {
  switch (code) {
    // Deleted while waiting in the queue, by its author or a moderator.
    case RESTJSONErrorCodes.UnknownMessage:
      return { reason: "message deleted", level: "debug" };
    // The channel was deleted while its messages waited in the queue.
    case RESTJSONErrorCodes.UnknownChannel:
      return { reason: "channel deleted", level: "debug" };
    // Someone, or another bot, opened a thread first: nothing is lost.
    case RESTJSONErrorCodes.ThreadAlreadyCreatedForMessage:
      return { reason: "thread already exists", level: "debug" };
    case RESTJSONErrorCodes.MaximumActiveThreads:
      return { reason: "thread limit reached", level: "throttled" };
    case RESTJSONErrorCodes.MissingAccess:
    case RESTJSONErrorCodes.MissingPermissions:
      return { reason: "missing permissions", level: "throttled" };
    default:
      return null;
  }
}
