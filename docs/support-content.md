# Help centre content

The help centre is at **polarlights.io/support**. Its articles are Markdown files in the repository, and every one is built into a page when the site deploys.

```
app/content/support/{lang}/{section}/{slug}.md
```

## Folders

- **`lang`** is one of `en es fr de nl nb da sv fi ru`. English is the reference: an article that exists only in English is shown in English in every language, with a note saying so.
- **`section`** is one of these:

| Folder | Shown as |
| --- | --- |
| `start` | Getting started |
| `faq` | Questions & answers |
| `troubleshooting` | Troubleshooting |
| `science` | The science |

  A section only appears once it has at least one English article.
- **`slug`** becomes the address, for example `faq/cancel-chaser.md` is at `/support/faq/cancel-chaser`. Use the same file name in every language.

## An article

```markdown
---
title: How do I cancel Chaser?
summary: One sentence, shown in lists and search results and to search engines.
order: 50
---
The article, in Markdown.
```

- **Order:** articles are listed by `order`, lowest first. Leave gaps of 10 so new ones can go in between.
- **Headings:** use `##` for sections and `###` below them. A contents list appears when an article has three or more `##` headings.
- **Links:** link to app pages and other articles by path, such as `/privacy` or `/support/faq/cancel-chaser`. Links to other websites open in a new tab.
- **Notes:** a quote block (`> ...`) shows as a highlighted note.
- **FAQ answers** appear in full on the FAQ page and are given to search engines as questions and answers, so keep them short. Link to a longer article if you need more space.
- **App labels:** use the exact wording the app shows, taken from `app/src/i18n/messages/{lang}.ts`.

## Screenshots

Write `![What the picture shows](screen:now-tonight)`. That uses `app/public/support/shots/{lang}/now-tonight.webp` if it exists, and otherwise the English picture. The text in brackets is read aloud by screen readers.

The pictures are made by `app/scripts/support-shots.mjs`, in every language. It runs against a local build that uses sample data and a sample Chaser account, so it never touches a real account. It draws a green ring around the part an article talks about. It fixes the clock at midday in Tromsø so every language shows the same thing. To add a picture, add an entry to `SHOTS` in the script. To make them all again after a design change:

```sh
cd app
# build and start the site with the sample feeds and the mock Supabase project, as for the store screenshots
PW_ROOT=$(npm root -g) node scripts/support-shots.mjs              # every language and picture
PW_ROOT=$(npm root -g) node scripts/support-shots.mjs en,de badges  # just some
```

Current pictures: `tonight-card`, `tonight-saw-it`, `badges`, `you-billing` and `you-delete`.

## Interface text

The help centre's own labels, such as the section names, search and "Still need help?", are `support.*` keys in the message files.
