import type { Guild } from "discord.js";
import { client, modules } from "#index.js";
import prisma from "#lib/database.js";
import type { Module } from "#lib/module.js";
import { declareService, type Service } from "#lib/service.js";

class ModuleService implements Service {
  getAllModules() {
    return modules;
  }

  async getAllModulesStateIn(guildId: string) {
    const moduleActivations = await prisma.moduleActivation.findMany({
      where: { guildId },
    });

    return modules.map((module) => {
      const activation = moduleActivations.find(
        (activation) => activation.moduleId === module.id
      );

      return {
        module: {
          id: module.id,
          name: module.name,
          description: module.description,
        },
        enabled: activation?.activated ?? false,
        enabledVersion: activation?.activatedVersion,
      };
    });
  }

  async getModuleStateIn(moduleId: string, guild: Guild) {
    return this.getModuleStateFromGuildIdIn(moduleId, guild.id);
  }

  async getModuleStateFromGuildIdIn(moduleId: string, guildId: string) {
    const module = modules.find((m) => m.id === moduleId);
    if (!module) {
      throw new Error(`Module with ID ${moduleId} not found`);
    }

    const state = await prisma.moduleActivation.findFirst({
      where: {
        moduleId,
        guildId,
      },
    });

    return state ?? { moduleId, guildId, activated: false };
  }

  async getGuildsWhereVersionDoesNotMatch(module: Module, version: string) {
    const activations = await prisma.moduleActivation.findMany({
      select: {
        guildId: true,
        activatedVersion: true,
      },
      where: {
        moduleId: module.id,
        activated: true,
        activatedVersion: {
          not: version,
        },
      },
    });

    return activations.map((activation) => ({
      guildId: activation.guildId,
      currentVersion: activation.activatedVersion,
      expectedVersion: version,
    }));
  }

  async enableModule(moduleId: string, guild: Guild) {
    const module = modules.find((m) => m.id === moduleId);
    if (!module) {
      throw new Error(`Module with ID ${moduleId} not found`);
    }

    // Create a new activation record
    const activation = await prisma.moduleActivation.upsert({
      where: {
        moduleId_guildId: {
          moduleId,
          guildId: guild.id,
        },
      },
      create: {
        moduleId,
        guildId: guild.id,
        activated: true,
        activatedVersion: module.version,
      },
      update: {
        activated: true,
        activatedVersion: module.version,
      },
    });

    module.onInstall?.(client, guild, module.registry);

    return activation;
  }

  async disableModule(moduleId: string, guild: Guild) {
    const module = modules.find((m) => m.id === moduleId);
    if (!module) {
      throw new Error(`Module with ID ${moduleId} not found`);
    }

    const activation = await prisma.moduleActivation.upsert({
      where: {
        moduleId_guildId: {
          moduleId,
          guildId: guild.id,
        },
      },
      create: {
        moduleId,
        guildId: guild.id,
        activated: false,
        activatedVersion: "",
      },
      update: {
        activated: false,
        activatedVersion: "",
      },
    });

    module.onUninstall?.(client, guild, module.registry);

    return activation;
  }

  /**
   * Aligns the stored `activatedVersion` of every guild on which `module` is
   * enabled with the module's live `version`, without touching commands.
   *
   * Dev-only on purpose — it does NOT supersede the production version bump.
   * In production, `checkCommandsForVersionChange` bumps `activatedVersion`
   * per guild, in its loop, only *after* re-registering that guild's commands
   * succeeds: the version advances only once the command set is confirmed
   * registered, so a failed registration leaves the guild "behind" and retries
   * next boot. Dev re-syncs every command unconditionally on each boot (guild
   * commands, instant), so there is no "registration succeeded" moment to anchor
   * the bump to and `activatedVersion` is purely cosmetic (the `/modules`
   * display). Hence this unconditional reconciliation, kept separate rather than
   * unified, to preserve production's retry-on-failure semantics.
   */
  async reconcileActivatedVersions(module: Module) {
    const guildInfos = await this.getGuildsWhereVersionDoesNotMatch(
      module,
      module.version
    );

    for (const { guildId } of guildInfos) {
      await this.updateModuleActivation(module.id, guildId, module.version);
    }
  }

  async updateModuleActivation(
    moduleId: string,
    guildId: string,
    version: string
  ) {
    await prisma.moduleActivation.update({
      where: {
        moduleId_guildId: {
          moduleId,
          guildId,
        },
      },
      data: {
        activatedVersion: version,
      },
    });
  }
}

export default declareService(new ModuleService());
