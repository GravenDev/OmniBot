// What a message laid out with components (Components V2) reads and shows:
// it has no content of its own, and the files it uploads only show through
// its components, so the modules that render someone else's message (quotes,
// the starboard) would show it empty. Its text displays, in order, and the
// media of its galleries stand for them.

const TEXT_DISPLAY = 10;
const THUMBNAIL = 11;
const MEDIA_GALLERY = 12;
const FILE = 13;

interface Media {
  url?: string;
  attachment_id?: string;
  content_type?: string;
}

interface Node {
  type?: number;
  content?: string;
  custom_id?: string;
  spoiler?: boolean;
  components?: Node[];
  accessory?: Node;
  media?: Media;
  file?: Media;
  items?: { media?: Media; spoiler?: boolean }[];
}

export interface ComponentMedia {
  url: string;
  spoiler: boolean;
  /** Its MIME type, when Discord knows it (not for every external link). */
  contentType?: string;
  /** The uploaded file it shows, also listed in the message's attachments. */
  attachmentId?: string;
}

// A message, or any list of components: discord.js's objects or their JSON.
type WithComponents = { components?: readonly unknown[] };

/** The components as Discord sends them, from discord.js's objects. */
function nodes(message: WithComponents): Node[] {
  return (message.components ?? []).map((component) => {
    const json = (component as { toJSON?: unknown }).toJSON;
    return (
      typeof json === "function" ? json.call(component) : component
    ) as Node;
  });
}

/** Visits every component, telling whether a spoiler container hides it. */
function walk(
  list: readonly Node[],
  visit: (node: Node, hidden: boolean) => void,
  hidden = false
): void {
  for (const node of list) {
    const inside = hidden || node.spoiler === true;
    visit(node, inside);
    walk(node.components ?? [], visit, inside);
    if (node.accessory) {
      walk([node.accessory], visit, inside);
    }
  }
}

/** Visits each component of a message, nested ones included. */
export function forEachComponent(
  message: WithComponents,
  visit: (node: Readonly<Node>) => void
): void {
  walk(nodes(message), visit);
}

/** The text displays of a message, one per line; empty without any. */
export function componentsText(message: WithComponents): string {
  const texts: string[] = [];
  walk(nodes(message), (node, hidden) => {
    if (node.type === TEXT_DISPLAY && node.content) {
      // Spoilers do not nest: the inner ones would reveal what they wrap,
      // and an odd trailing backslash would escape the closing one.
      const inner = node.content
        .replaceAll("||", "")
        .replace(/\\+$/, (run) => (run.length % 2 ? run.slice(1) : run));
      texts.push(hidden ? `||${inner}||` : node.content);
    }
  });
  return texts.join("\n");
}

/** The media of a message's galleries, in order. */
export function componentsMedia(message: WithComponents): ComponentMedia[] {
  const media: ComponentMedia[] = [];
  walk(nodes(message), (node, hidden) => {
    if (node.type !== MEDIA_GALLERY) {
      return;
    }
    for (const item of node.items ?? []) {
      const url = item.media?.url;
      if (!url) {
        continue;
      }
      const { attachment_id: attachmentId, content_type: contentType } =
        item.media ?? {};
      media.push({
        url,
        spoiler: hidden || item.spoiler === true,
        ...(contentType ? { contentType } : {}),
        ...(attachmentId ? { attachmentId } : {}),
      });
    }
  });
  return media;
}

/**
 * The uploads a component shows behind a spoiler: a gallery item, a thumbnail
 * or a file. The spoiler is set on the component, so the attachment itself,
 * also listed in the message's attachments, does not carry it.
 */
export function hiddenAttachments(message: WithComponents): Set<string> {
  const ids = new Set<string>();
  const add = (media: Media | undefined, spoiler: boolean): void => {
    if (spoiler && media?.attachment_id) {
      ids.add(media.attachment_id);
    }
  };
  // `hidden` already counts the component's own spoiler.
  walk(nodes(message), (node, hidden) => {
    if (node.type === THUMBNAIL) {
      add(node.media, hidden);
    } else if (node.type === FILE) {
      add(node.file, hidden);
    } else if (node.type === MEDIA_GALLERY) {
      for (const item of node.items ?? []) {
        add(item.media, hidden || item.spoiler === true);
      }
    }
  });
  return ids;
}
