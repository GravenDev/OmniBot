import { loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { tableHeight } from "#lib/table.js";
import {
  rankingHeight,
  renderReportCard,
  type ReportCardData,
} from "./report-card.js";

const labels = {
  locale: "fr",
  title: "Statistiques du serveur",
  subtitle: "mardi 13 octobre 2026",
  memberCount: "Membres",
  joins: "Nouveaux membres",
  leaves: "Départs",
  messages: "Messages postés",
  activeMembers: "Membres actifs",
  reactions: "Réactions ajoutées",
  topChannels: (count: number) => `Salons les plus actifs · ${count} actifs`,
  hours: "Messages par heure",
  peak: (hour: number) => `pic à ${hour} h`,
  hour: (hour: number) => `${hour} h`,
  topReactions: "Réactions",
  topMembers: "Membres les plus actifs",
  rank: "Rang",
  member: "Membre",
  messagesHeader: "Messages",
};

const data: ReportCardData = {
  icon: null,
  memberCount: 13254,
  joins: 6,
  leaves: 10,
  messages: 1179,
  activeMembers: 42,
  activeChannels: 14,
  reactions: 157,
  topChannels: [
    { name: "le-jeu-des-4h", count: 888 },
    { name: "général", count: 214 },
  ],
  topReactions: [{ text: "🔥", image: null, count: 21 }],
  topMembers: [
    { rank: 1, name: "Lolo", avatar: null, count: 239 },
    { rank: 2, name: "Toasty Cat", avatar: null, count: 134 },
  ],
  hours: Array.from({ length: 24 }, (_, hour) => (hour > 6 ? hour * 5 : 0)),
  notes: {
    joins: { subtext: "dont 4 ont parlé", record: false },
    messages: {
      trend: { text: "+18 % vs 7 j", direction: "up" },
      record: false,
    },
    activeMembers: {
      trend: { text: "-12 % vs 7 j", direction: "down" },
      record: false,
    },
    reactions: {
      trend: { text: "+45 % vs 7 j", direction: "up" },
      subtext: "record sur 90 jours",
      record: true,
    },
  },
};

const HOURS = 20 + 210;

const WITHOUT_FOOTER = 160 + 2 * 110 + 20 + 30;

describe("renderReportCard", () => {
  it("draws the rankings, the hours then the members, 1000px wide", async () => {
    const image = await loadImage(await renderReportCard(data, labels));
    expect(image.width).toBe(1000);
    expect(image.height).toBe(
      WITHOUT_FOOTER +
        20 +
        rankingHeight(2) +
        HOURS +
        20 +
        tableHeight(2, false, true)
    );
  });

  it("leaves the hours out when no message was counted by hour", async () => {
    const image = await loadImage(
      await renderReportCard(
        {
          ...data,
          hours: Array.from({ length: 24 }, () => 0),
          topMembers: null,
        },
        labels
      )
    );
    expect(image.height).toBe(WITHOUT_FOOTER + 20 + rankingHeight(2));
  });

  it("leaves the members table out when they are hidden", async () => {
    const image = await loadImage(
      await renderReportCard({ ...data, topMembers: null }, labels)
    );
    expect(image.height).toBe(WITHOUT_FOOTER + 20 + rankingHeight(2) + HOURS);
  });

  it("keeps room for a dash when nothing was counted", async () => {
    const image = await loadImage(
      await renderReportCard(
        {
          ...data,
          topChannels: [],
          topReactions: [],
          topMembers: null,
          hours: Array.from({ length: 24 }, () => 0),
        },
        labels
      )
    );
    expect(image.height).toBe(WITHOUT_FOOTER + 20 + rankingHeight(1));
  });
});
