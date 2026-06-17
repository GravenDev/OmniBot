import i18next from "i18next";

export async function initI18n(): Promise<void> {
  await i18next.init({
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    resources: {},
  });
}

export function addTranslations(
  lng: string,
  namespace: string,
  resources: Record<string, string>
): void {
  i18next.addResourceBundle(lng, namespace, resources, true, true);
}

export type TFunction = (
  key: string,
  options?: Record<string, unknown>
) => string;

export function createT(locale: string, namespace: string): TFunction {
  return (key, options) =>
    i18next.t(key, {
      ns: [namespace, "core"],
      lng: locale,
      ...options,
    }) as string;
}
