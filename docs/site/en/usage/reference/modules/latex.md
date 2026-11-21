# LaTeX

|                   |                 |
| ----------------- | --------------- |
| Identifier        | `latex`         |
| Configuration     | `/config latex` |
| Privileged intent | Message Content |
| Used by           | members         |

The bot renders LaTeX formulas as images, with the `/latex` command and in reply to messages that contain LaTeX. Rendering uses MathJax: `amsmath`, `amssymb`, `mathtools`, `mhchem` (`\ce{…}`), `\newcommand` and `\def` are available, along with common macros (`\RR`, `\NN`, `\abs`, `\norm`, `\set`…). Full documents, `\usepackage` and TikZ are not.

## Commands

### `/latex`

Access: everyone. Reply: public.

| Option    | Required | Values                 | Description                                               |
| --------- | -------- | ---------------------- | --------------------------------------------------------- |
| `formula` | yes      | up to 1,000 characters | The formula, without `$` delimiters (e.g. `\frac{a}{b}`). |

Image of the formula, centred as between `$$ … $$`. The formula serves as the image's alt text. An invalid formula gets a reply visible to you only, with MathJax's error message.

## Settings

| Setting             | Key          | Type    | Default | Description                                                                                              |
| ------------------- | ------------ | ------- | ------- | -------------------------------------------------------------------------------------------------------- |
| Automatic detection | `autoDetect` | Boolean | on      | Renders the messages containing LaTeX (`$…$`, `$$…$$`, `\[…\]`, `\(…\)`, `\begin{…}`) as images.         |
| Theme               | `theme`      | Choice  | `light` | Colors of the images: `light` (black on white) or `dark` (white on dark gray). Also applies to `/latex`. |

## Behaviour

- With automatic detection, a message that contains a formula is rendered as an image in full, text included. Prices (`5$ or 10$`), shell variables (`$HOME`), LaTeX in code and messages that contain a spoiler trigger nothing.
- The message text is at most 4,000 characters. Formulas between `$ … $` stay in the text; those between `$$ … $$`, `\[ … \]` or in an `equation`, `align`, `gather`… environment are centred on their own line. `itemize` and `enumerate` lists are laid out.
- The bot replies to the message without pinging its author, and only in channels where it can view the channel, send messages, attach files and read the history.
- If the text cannot be rendered, the reply gives MathJax's error message and asks the author to edit their message.
- When the message is edited, the image is updated; if the LaTeX is removed, the image is deleted. Deleting the message also deletes the image.
- After the bot restarts, an edit still updates the image, but deleting the message or removing its LaTeX no longer deletes the image.
- Messages from bots are ignored.
- Turning detection off leaves only `/latex`; an image already posted is removed the next time its message is edited.
- A rendering that is too heavy (too many macros, more than 5 seconds of computing) is refused with an error.

## Data kept

| Data                                                        | Retention                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Link between a message and the bot's image (IDs), in memory | The last 1,000, until the bot restarts. Nothing is stored in the database. |
| Posted images                                               | On Discord, until the source message is deleted, or by a moderator.        |
