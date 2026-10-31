import { addTranslations, createT, initI18n, type TFunction } from "./i18n.js";

/**
 * Named renderers of sample images, one per `*.preview.ts` file, drawn by
 * `pnpm render-preview` to show an image change before and after.
 */
export type Previews = Record<string, () => Promise<Buffer>>;

let i18nReady = false;

/**
 * A `t` for renderers that take one, from the module's own bundle
 * (`import fr from "#modules/<id>/i18n/fr.json" with { type: "json" }`).
 */
export async function previewT(
  namespace: string,
  bundle: Record<string, string>,
  locale = "fr"
): Promise<TFunction> {
  if (!i18nReady) {
    await initI18n();
    i18nReady = true;
  }
  addTranslations(locale, namespace, bundle);
  return createT(locale, namespace);
}
