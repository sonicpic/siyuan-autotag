# AutoTag

<p align="center">
  <a href="./README.md">English</a> | <a href="./README_zh_CN.md">简体中文</a>
</p>

Reviewable AI classification suggestions for SiYuan notes.

![AutoTag preview](preview.png)

AutoTag is built for SiYuan users who already have a tag taxonomy and want help applying it consistently. It does not invent a new system of tags. Instead, it only classifies within the tag range you define and keeps a human review step before anything is written back.

It works especially well in workflows where you capture freely first, then organize later. For example, you might use daily notes as an inbox, then add stable classification tags only when a note is worth keeping in the knowledge base. Notes that should stay outside the taxonomy can also be excluded from analysis and scans.

## Best Fit

- You already have a relatively stable classification tag system
- Your notebook is large enough that manual classification is expensive
- You use daily notes or inbox-style capture, then organize later
- You want AI assistance without letting the model rewrite your taxonomy
- You want to batch-find notes that still have not entered the classification system

## Quick Start

1. Open the plugin settings and choose a provider preset.
2. Fill in `API Key`.
3. Override `Base URL` and `Model` only if needed.
4. Select the classification tags that AutoTag is allowed to use.
5. Optional: add tag descriptions to clarify scope and boundaries.
6. Run `Analyze Current Note`, or right-click the top-bar icon to scan a notebook for unclassified notes.
7. Review the suggestions before applying tags.

## How It Works

AutoTag reads the current note and asks your configured model for classification suggestions. The model is restricted to your existing allowed tags, so it cannot freely invent new labels. For tags that are easy to confuse, short descriptions often improve consistency.

It can analyze the current note or scan a notebook for unclassified notes. All suggestions go through a review dialog before write-back. The plugin writes only to the document-level `tags` attribute, only replaces tags inside the managed classification range, and preserves all other existing tags.

This makes it a good fit for daily-note-heavy workflows: capture first, classify later. Notes that should not enter the taxonomy can simply be excluded.

## Practical Advice

### 1. Keep the managed tag range clear

AutoTag works best when the allowed tags have clear boundaries. If several tags overlap heavily in meaning, suggestions will naturally become less stable.

### 2. Add descriptions for important tags

For ambiguous labels, a short description often improves results noticeably, especially when sibling tags are semantically close.

### 3. Do not force every daily note into classification

Daily notes often contain mixed or process-oriented content. In many cases, excluding them is better than forcing a classification too early.

### 4. Treat AutoTag as review assistance

Its value is in narrowing down manual work, not replacing your taxonomy decisions. The clearer your system is, the more useful the plugin becomes.
