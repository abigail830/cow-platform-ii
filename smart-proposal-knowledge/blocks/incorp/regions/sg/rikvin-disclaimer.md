---
type: Section Block
title: Rikvin Immigration Disclaimer (SG)
description: Subsidiary disclaimer after immigration fee blocks — verbatim from anchor sample.
tags: [incorp, region:SG, rikvin, template:sg-incorp, immigration]
render: text
status: draft
selection:
  mode: conditional
  include_when: immigration or employment_pass SKUs present in solution_and_fees
  append_when_any: [employment_pass, immigration]
  order: 10
generated:
  by: process:office-extract/v1
  at: 2026-07-26T14:45:00Z
sources:
  - id: extraction-text
    resource: references/extractions/incorp-sg-employment-pass/text.txt
    title: Layer 1 text extraction (line 94)
  - id: anchor-example
    resource: examples/incorp-sg-rikvin-employment-pass.md
    title: Reference Proposal — Rikvin Employment Pass Application
---

Immigration-related services referenced in this proposal will be provided exclusively by RIKVIN PTE. LTD., a fully owned subsidiary of InCorp Group, acting as an independent service provider. RIKVIN PTE. LTD. is registered under UEN: 200708442E and holds an Employment Agency Licence No.: 11C3030, issued by the Ministry of Manpower, Singapore.
