import * as fs from "fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "path";
import { DeclarationType, type Declared } from "#lib/declared.js";
import { isDevMode } from "#lib/env.js";
import { addTranslations } from "#lib/i18n.js";
import { loggerMaker } from "#lib/logger.js";
import type { Module } from "#lib/module.js";

const logger = loggerMaker("modules");

const __dirname = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  ".."
);

/**
 * Scan a module directory for an `i18n/` sub-folder and register every JSON
 * file found there as a translation bundle under the module's namespace.
 */
export async function loadModuleI18n(
  moduleId: string,
  modulePath: string
): Promise<void> {
  const i18nDir = path.resolve(modulePath, "i18n");

  let files: string[];
  try {
    files = await fs.readdir(i18nDir);
  } catch {
    // No i18n directory – nothing to load.
    return;
  }

  for (const file of files) {
    const match = file.match(/^(.+)\.json$/);
    if (!match) continue;

    const lng = match[1];
    if (!lng) continue;

    const filePath = path.resolve(i18nDir, file);
    const content = await import(pathToFileURL(filePath).href, {
      with: { type: "json" },
    });

    addTranslations(lng, moduleId, content.default ?? content);
    logger.debug(`Loaded i18n | lng = ${lng} | ns = ${moduleId}`);
  }
}

export async function loadModules(basePath: string): Promise<Module[]> {
  logger.info(`Finding modules | path = ${basePath}`);

  const modules: Module[] = [];
  const moduleFolder = path.resolve(__dirname, basePath);

  const moduleFolderFiles = await fs.readdir(moduleFolder, {
    withFileTypes: true,
  });

  const moduleNames = moduleFolderFiles
    .filter(
      (dirent) =>
        dirent.isDirectory() ||
        logger.warn(`Skipping non-directory module | path = ${dirent.name}`)
    )
    .map((dirent) => dirent.name);

  for (const folder of moduleNames) {
    const modulePath = path.resolve(moduleFolder, folder);
    const module = await loadModule(modulePath);

    if (!module) {
      logger.warn(`Module not found or invalid | path = ${modulePath}`);
      continue;
    }

    if (module.devOnly && !isDevMode()) {
      logger.info(`Skipping dev-only module | id = ${module.id}`);
      continue;
    }

    modules.push(module);
  }

  logger.info("Finished finding modules");

  return modules;
}

export async function loadModule(modulePath: string): Promise<Module | null> {
  logger.info(`\tResolving module | path = ${modulePath}`);

  const moduleEntryPoint = (await fs.readdir(modulePath)).find(
    (file) => file.match(/\.module\.ts$/) || file.match(/\.module\.js$/)
  );

  if (!moduleEntryPoint) {
    logger.warn(`\tModule entry point not found | path = ${modulePath}`);
    return null;
  }

  const moduleFilePath = path.resolve(modulePath, moduleEntryPoint);

  const imported: { default: Declared<Module> } = await import(
    pathToFileURL(moduleFilePath).href
  );

  if (!imported) {
    logger.warn(`\tFailed to import module | path = ${moduleFilePath}`);
    return null;
  }

  const module = imported.default;
  if (module.type !== DeclarationType.Module) {
    logger.warn(`\tInvalid module | path = ${moduleFilePath}`);
    return null;
  }

  // Load translation bundles for this module
  await loadModuleI18n(module.id, modulePath);

  logger.info(`\tModule resolved successfully | id = ${module.id}`);

  return module;
}
