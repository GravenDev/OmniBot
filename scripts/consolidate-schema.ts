import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function findPrismaFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Exclure le dossier src/prisma qui contient les fichiers de schéma principaux
        const relativePath = path.relative(
          path.join(__dirname, "..", "src"),
          fullPath
        );
        if (relativePath === "prisma") {
          continue;
        }

        // Récursion dans les sous-dossiers
        const subFiles = await findPrismaFiles(fullPath);
        files.push(...subFiles);
      } else if (
        entry.name.endsWith(".prisma") &&
        entry.name !== "schema.prisma" &&
        entry.name !== "header.prisma"
      ) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore les dossiers qui n'existent pas
    console.error("Erreur lors de la lecture du répertoire:", dir, error);
  }

  return files;
}

export interface PrismaSource {
  path: string;
  content: string;
}

export interface DuplicateModel {
  model: string;
  first: string;
  second: string;
}

/**
 * Everything is merged into a single schema, so a model name must be unique
 * across ALL module files. Prisma itself only reports this late at
 * `generate` time with a cryptic error — fail here with both file paths.
 */
export function findDuplicatePrismaModel(
  files: PrismaSource[]
): DuplicateModel | null {
  const origins = new Map<string, string>();
  for (const file of files) {
    for (const line of file.content.split("\n")) {
      const match = line.match(/^\s*model\s+(\w+)/);
      if (!match?.[1]) continue;
      const first = origins.get(match[1]);
      if (first) {
        return { model: match[1], first, second: file.path };
      }
      origins.set(match[1], file.path);
    }
  }
  return null;
}

async function consolidateSchema() {
  const srcDir = path.join(__dirname, "..", "src");
  const schemaPath = path.join(srcDir, "prisma", "schema.prisma");

  // Chercher tous les fichiers .prisma dans src/ (exclure header.prisma et schema.prisma)
  const prismaFiles = (await findPrismaFiles(srcDir)).filter(
    (file) => !file.endsWith("header.prisma") && !file.endsWith("schema.prisma")
  );

  // Lire le contenu du header.prisma
  let consolidatedContent = "";
  const sources: PrismaSource[] = [];

  // Ajouter le contenu de tous les fichiers prisma trouvés
  for (const file of prismaFiles) {
    try {
      const content = await fs.readFile(file, "utf-8");
      const relativePath = path
        .relative(srcDir, file)
        .split(path.sep)
        .join("/");

      consolidatedContent += `\n// === Modèles de ${relativePath} ===\n`;

      // Nettoyer le contenu (enlever les commentaires de chemin)
      const cleanContent = content
        .split("\n")
        .filter((line) => !line.startsWith("// filepath:"))
        .join("\n")
        .trim();

      consolidatedContent += cleanContent + "\n";
      sources.push({ path: relativePath, content: cleanContent });
    } catch (error) {
      console.warn(`Erreur lors de la lecture de ${file}:`, error);
    }
  }

  const duplicate = findDuplicatePrismaModel(sources);
  if (duplicate) {
    throw new Error(
      `Duplicate Prisma model "${duplicate.model}" in "${duplicate.first}" and "${duplicate.second}": model names must be unique across all modules.`
    );
  }

  // Écrire le schéma consolidé
  await fs.writeFile(schemaPath, consolidatedContent);

  console.log(
    `✅ Schéma consolidé créé avec ${prismaFiles.length} fichiers de modèles:`
  );
  prismaFiles.forEach((file) => {
    const relativePath = path.relative(srcDir, file);
    console.log(`   - ${relativePath}`);
  });
}

// Exécuter la consolidation (seulement en run direct, pas à l'import en test)
if (process.argv[1]?.endsWith("consolidate-schema.ts")) {
  consolidateSchema().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
