import { type Message, type MessageReaction, ReactionType } from "discord.js";
import { declareService, type Service } from "#lib/service.js";
import { countedReactions, type Reactors } from "#modules/starboard/tally.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

async function reactorsOf(
  reaction: MessageReaction
): Promise<Reactors["users"]> {
  const users = new Map<string, Reactors["users"][number]>();
  const types = [ReactionType.Normal];
  if (reaction.countDetails?.burst) {
    types.push(ReactionType.Burst);
  }
  for (const type of types) {
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await reaction.users.fetch(
        after ? { type, limit: PAGE_SIZE, after } : { type, limit: PAGE_SIZE }
      );
      for (const user of batch.values()) {
        users.set(user.id, { id: user.id, bot: user.bot });
      }
      if (batch.size < PAGE_SIZE) {
        break;
      }
      after = batch.lastKey();
    }
  }
  return [...users.values()];
}

class ReactionsService implements Service {
  async reactors(message: Message, emojis: string[]): Promise<Reactors[]> {
    const fetched: Reactors[] = [];
    for (const reaction of countedReactions(message, emojis)) {
      // One emoji after the other: Discord rate limits the reactions route of a message.
      fetched.push({
        emoji: reaction.emoji.toString(),
        users: await reactorsOf(reaction),
      });
    }
    return fetched;
  }
}

export default declareService(new ReactionsService());
