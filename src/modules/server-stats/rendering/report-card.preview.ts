import type { Previews } from "#lib/preview.js";
import {
  renderReportCard,
  type ReportCardData,
  type ReportCardLabels,
} from "./report-card.js";

const labels: ReportCardLabels = {
  locale: "fr",
  title: "Statistiques du serveur",
  subtitle: "vendredi 30 octobre 2026",
  memberCount: "Membres",
  joins: "Nouveaux membres",
  leaves: "Départs",
  messages: "Messages postés",
  activeMembers: "Membres actifs",
  reactions: "Réactions ajoutées",
  topChannels: (count) => `Salons les plus actifs · ${count} actifs`,
  hours: "Messages par heure",
  peak: (hour) => `pic à ${hour} h`,
  hour: (hour) => `${hour} h`,
  topReactions: "Réactions",
  topMembers: "Membres les plus actifs",
  rank: "Rang",
  member: "Membre",
  messagesHeader: "Messages",
};

const data: ReportCardData = {
  icon: null,
  memberCount: 13248,
  joins: 8,
  leaves: 9,
  messages: 553,
  activeMembers: 42,
  activeChannels: 17,
  reactions: 97,
  topChannels: [
    { icon: "#", name: "🎪︱le-jeu-des-4h", count: 287 },
    { icon: "🔊", name: "_VibeCode_Or_Die_", count: 67 },
    { icon: "#", name: "🗯︱général", count: 63 },
    { icon: "#", name: "🐙︱contributeurs-github", count: 24 },
    { icon: "#", name: "❔︱c︱cpp︱rust", count: 22 },
  ],
  topReactions: [
    { text: "🤣", image: null, count: 14 },
    { text: "👍", image: null, count: 9 },
  ],
  topMembers: [
    { rank: 1, name: "Nyitmo", avatar: null, count: 57 },
    { rank: 2, name: "⚡Godefroy DE BOUILLON⚡", avatar: null, count: 48 },
    { rank: 3, name: "jérome", avatar: null, count: 42 },
  ],
  hours: [
    6, 2, 1, 1, 1, 1, 2, 3, 8, 14, 3, 2, 3, 22, 10, 4, 34, 7, 8, 9, 40, 8, 4,
    45,
  ],
  notes: {
    joins: { subtext: "dont 1 a parlé", record: false },
    messages: {
      trend: { text: "+18 % vs 7 j", direction: "up" },
      record: false,
    },
    activeMembers: {
      trend: { text: "-12 % vs 7 j", direction: "down" },
      record: false,
    },
    reactions: { subtext: "record sur 30 jours", record: true },
  },
};

export default {
  report: () => renderReportCard(data, labels),
  "without-members": () =>
    renderReportCard({ ...data, topMembers: null }, labels),
} satisfies Previews;
