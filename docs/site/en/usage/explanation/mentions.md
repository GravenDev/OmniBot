# Announcements and pings

Several modules post announcements that name members: a birthday, a member anniversary, RNGdle's daily leaderboard or reminder. The question is whether the announcement should also notify them.

## Why a per-member preference

Being pinged pleases some and bothers others, especially when announcements come every day. Rather than let each module decide, the bot keeps a single list per server: the members who no longer want to be pinged. A member joins it with `/pings`, and the modules whose announcements ping all check it.

The member's name is still shown in the announcement. Only the notification goes away. So refusing pings does not take anyone out of a leaderboard or a celebration.

## One list per server

A member may like being notified on a small server of friends and not on a large public one. The preference therefore belongs to each server, like module activation.

## Announcements that ping nobody

Some announcements never notify: 4h Game points are announced without a ping, and a sticky message is posted silently, since it comes back after every message. A Clash of Code result is a reply to the member who posted the link: it mentions them without notifying them, whatever their `/pings` preference. The text of a sticky message does not become a mass ping either: `@everyone` or a role mention stays plain text.
