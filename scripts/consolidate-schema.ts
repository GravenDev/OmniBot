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

async function consolidateSchema() {
  const srcDir = path.join(__dirname, "..", "src");
  const schemaPath = path.join(srcDir, "prisma", "schema.prisma");

  // Chercher tous les fichiers .prisma dans src/ (exclure header.prisma et schema.prisma)
  const prismaFiles = (await findPrismaFiles(srcDir)).filter(
    (file) => !file.endsWith("header.prisma") && !file.endsWith("schema.prisma")
  );

  // Lire le contenu du header.prisma
  let consolidatedContent = "";

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
    } catch (error) {
      console.warn(`Erreur lors de la lecture de ${file}:`, error);
    }
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

// Exécuter la consolidation
consolidateSchema().catch(console.error);
