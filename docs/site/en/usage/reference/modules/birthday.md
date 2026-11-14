# Birthdays

|                   |                                                    |
| ----------------- | -------------------------------------------------- |
| Identifier        | `birthday`                                         |
| Configuration     | `/config birthday`                                 |
| Privileged intent | Server Members                                     |
| Used by           | members (their birthday), administrators (removal) |

Each member can save the day and month of their birthday, never the year. Every day, the bot wishes in the announcement channel the birthdays of the members who chose to be announced. The module also puts the birthday paradox to the test with the server's registrations.

## Commands

### `/birthday set`

Access: everyone. Reply: visible to you only.

| Option     | Required | Values                        | Description                                                           |
| ---------- | -------- | ----------------------------- | --------------------------------------------------------------------- |
| `day`      | yes      | 1 to 31                       | Day of the month.                                                     |
| `month`    | yes      | **January** to **December**   | Month.                                                                |
| `announce` | no       | **True** (default), **False** | Announce it on the server. **False**: only counted in the statistics. |

Saves or changes your birthday. A date that does not exist (30 February) is refused; 29 February is accepted. The reply is your birthday sheet: the date, the channel where it is announced, the announced members who share your date, and a **Stop announcing my birthday** (or **Announce my birthday**) button to change that choice.

### `/birthday show`

Access: everyone. Reply: visible to you only.

No options.

Shows your birthday sheet, as `/birthday set` does, with the same button. Without a saved birthday, the reply says so.

### `/birthday remove`

Access: everyone. Reply: visible to you only.

No options.

Deletes your birthday. You lose the birthday role right away.

### `/birthday upcoming`

Access: everyone. Reply: public.

No options.

Lists the birthdays of the next 30 days, today included, of the members who chose to be announced only. Nobody is pinged.

### `/birthday stats`

Access: everyone. Reply: public.

| Option    | Required | Values                 | Description                                  |
| --------- | -------- | ---------------------- | -------------------------------------------- |
| `role`    | no       | role                   | Only among the members of this role.         |
| `channel` | no       | voice or stage channel | Only among the people in this voice channel. |

Image of the birthday paradox on the server: number of saved birthdays, theoretical probability of a shared date, dates actually shared, registration at which the first shared date appeared, registrations missing to pass one chance in two, probability curve and breakdown by month. A text summary comes with the image. With `role` or `channel`, the figures cover that group only; both options together are refused. Every birthday counts, announced or not, but a shared date is named only if all its members chose to be announced.

### `/birthday-admin remove`

Access: administrators. Reply: visible to you only.

| Option   | Required | Values | Description                      |
| -------- | -------- | ------ | -------------------------------- |
| `member` | yes      | member | Member whose birthday to delete. |

Deletes a member's birthday; they lose the birthday role right away. No command can save someone else's birthday.

## Settings

| Setting                     | Key                 | Type         | Default        | Description                                                                                                                                       |
| --------------------------- | ------------------- | ------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Announcement channel        | `channel`           | Channel      | none           | Channel where birthdays are announced. Nothing is announced until it is set.                                                                      |
| Birthday role               | `role`              | Role         | none           | Role given for the day to the announced members. It is removed from everyone else at the next announcement.                                       |
| Time zone                   | `timeZone`          | Choice       | `Europe/Paris` | Time zone the server's days follow.                                                                                                               |
| Announcement hour           | `hour`              | Number       | `9`            | Hour of the day (0 to 23) when the announcements are posted.                                                                                      |
| Birthday messages           | `messages`          | List of Text | none           | Messages drawn at random and quoted on the card when a single member celebrates; `{user}` is replaced by the member. Empty: the card quotes none. |
| Birthday paradox milestones | `paradoxMilestones` | Boolean      | on             | Announce the paradox milestones: 23 registrations, first shared date, 57 registrations.                                                           |
| Monthly calendar            | `monthlyCalendar`   | Boolean      | on             | On the 1st of each month, post a calendar of the month's birthdays.                                                                               |
| Loop the card               | `loopCard`          | Boolean      | on             | Replay the animated card forever. Off: it plays once.                                                                                             |

## Behaviour

- Every day, at the configured hour and time zone, the bot posts an animated card of the day's birthdays, then mentions the members celebrated. Members who turned their mentions off with [`/pings`](../core#pings) are not pinged.
- Only the members who chose to be announced are celebrated, named or shown. The others only count in the statistics.
- 29 February is celebrated on the 28th in common years.
- If a birthday role is set, it is given to the members celebrated and removed from everyone else. A member who deletes their birthday or stops being announced loses it right away.
- A day's announcement is posted once. If the bot is down at the set hour, it is posted when the bot restarts the same day; a day missed entirely is not caught up.
- If the card cannot be posted (missing permission to attach files, for example), the bot posts a text message instead.
- On the 1st of each month, the bot posts the month's calendar as an image, without mentioning anyone. A month without any birthday to show posts nothing.
- When a registration passes a paradox milestone (23 registrations, first shared date, 57 registrations), the bot announces it once, naming neither member nor date.
- A member who leaves the server loses their saved birthday.

## Data kept

| Data                                                                                       | Retention                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Birthday: day, month, choice to be announced                                               | Until `/birthday remove`, `/birthday-admin remove`, [`/privacy delete`](../core#privacy-delete), the member leaving or the module being disabled. Kept if the bot leaves the server, until it comes back. |
| Server state: last day announced, milestones passed, registration of the first shared date | Until the module is disabled.                                                                                                                                                                             |
