import { stripHiddenText } from "#lib/hidden-text.js";

export const MAX_LINKS = 3;

const LINK_PATTERN =
  /https?:\/\/(?:www\.)?codingame\.com\/clashofcode\/clash\/(?:report\/)?([0-9a-f]{30,40})(?![0-9a-z])/gi;

export function parseClashLinks(content: string): string[] {
  const handles: string[] = [];
  for (const [, handle] of stripHiddenText(content).matchAll(LINK_PATTERN)) {
    const normalized = handle!.toLowerCase();
    if (!handles.includes(normalized)) {
      handles.push(normalized);
    }
    if (handles.length === MAX_LINKS) {
      break;
    }
  }
  return handles;
}
