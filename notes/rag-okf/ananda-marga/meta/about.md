---
type: Guide
title: About this bundle & conventions
description: Purpose, draft taxonomy, frontmatter schema, and fidelity conventions for the Ananda Marga philosophy OKF bundle.
tags: [meta, conventions, ananda-marga, prout]
timestamp: 2026-06-19T00:00:00Z
---

# Purpose

A high-fidelity OKF ontology of P. R. Sarkar's philosophy — built source-first,
with every concept anchored to exact citations — so it is both directly
readable and a clean corpus for a later retrieval / GraphRAG layer. Quality
(doctrinal fidelity) is the top priority. See the [Parsing protocol](/meta/parsing-protocol.md).

# Proposed taxonomy (draft)

| Directory          | Holds                                                        | `type`                |
|--------------------|-------------------------------------------------------------|-----------------------|
| [cosmology/](/cosmology/)         | Brahmacakra, Puruśa/Prakŕti, saiṋcara/pratisaiṋcara, guṇas | `Cosmology`           |
| [biopsychology/](/biopsychology/) | Kośas, cakras, vṛttis, kuṇḍalinii, saṃskāra               | `Concept`             |
| [practice/](/practice/)           | Sādhanā, Tantra, kiirtana, yama-niyama, Sixteen Points    | `Practice`            |
| [philosophy/](/philosophy/)       | Neohumanism, microvita, dharma, ethics, Ánanda Sútram     | `Principle`, `Concept`|
| [prout/](/prout/)                 | PROUT, social cycle, sadvipra, economic democracy         | `SocialTheory`        |
| [glossary/](/glossary/)           | Saṃskṛta terms (controlled-vocabulary anchors)            | `Term`                |
| [works/](/works/)                 | Source texts + per-unit verbatim passages                 | `Work`, `SourcePassage` |
| [people/](/people/)               | Author and key figures                                    | `Person`              |

This is a starting point, not a constraint — categories are extensible.

# Frontmatter schema (OKF + extensions)

Standard OKF keys: `type` (required), `title`, `description`, `tags`, `timestamp`.

Bundle-specific extensions (OKF permits producer-defined keys):

- `aliases` — list of every transliteration variant / synonym for the term
  (controlled vocabulary; stabilises entity resolution across reindexes).
- `sanskrit` — the original term (IAST and/or Devanāgarī).
- `sources` — list of `works/` concept or passage ids backing the concept (provenance).
- `layer` — `concept` (paraphrased ontology) or `verbatim` (`SourcePassage` docs
  holding exact source text); the RAG-ingestion selector (see the
  [parsing protocol](/meta/parsing-protocol.md)).
- `canonical` — `true` on the authoritative file when a term has alias stubs.

# Controlled vocabulary

- **Canonical spelling = IAST with diacritics** (`kośa`, `saiṋcara`, `Prakŕti`);
  simplified ASCII and Sarkar's Roman Saṁskṛta variants are the `aliases`.
- **Filenames are ASCII kebab-slugs** (`prakrti.md`, `saincara.md`); the
  diacritic IAST form lives in `title` and `aliases`.
- **One canonical file per concept.** All spellings (`Prakŕti`/`Prakriti`,
  `saiṋcara`/`sanchara`, `kośa`/`kosha`) live under `aliases`, never as separate
  files. The [glossary/](/glossary/) holds short `Term` anchors for the lexicon.

# Provenance

- Every concept cites exact `works/` entries + section/sūtra/page. Source works
  are first-class concepts, so concepts cite works and works link concepts —
  forming an auditable provenance graph.

# Linking & fidelity

- Standard markdown links, bundle-relative `/dir/x.md`; typed relationships go
  in a `## Relationships` prose section.
- **Fidelity (quality #1):** keep Sarkar's exact framing; no syncretic drift
  toward generic Vedanta/yoga; flag interpretation vs direct teaching; preserve
  apparent contradictions with provenance rather than smoothing them.

# Conformance

```
python3 ~/.claude/skills/okf/scripts/okf_lint.py .     # run from this bundle dir
python3 ~/.claude/skills/okf/scripts/okf_viz.py .
```
