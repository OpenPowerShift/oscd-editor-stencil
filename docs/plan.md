# oscd-editor-stencil upgrade plan

Status: **draft v2 for review**. Branch: `upgrade`.

## 0. Decisions so far

| # | Topic | Decision |
|---|---|---|
| 1 | Package and tag | npm package `@openpowershift/oscd-editor-stencil`, custom element `oscd-editor-stencil` |
| 2 | Stencil file format | Keep loading existing files. Add `schemaVersion`. **Option B**: keep identity strings, own the format (see §4) |
| 3 | Known defects | Fix in this branch, as separate commits after a migration that keeps behaviour unchanged |
| 5 | README | AsciiDoc (`README.adoc`) |
| 6 | CI and release | Same as other OpenPowerShift plugins (`oscd-editor-map-communication`). See §7 |
| 7 | Languages | English (source), German, Portuguese, via `@lit/localize` |
| – | Redesign | A bolder redesign is welcome. **Using stencils is the main job. Creating and managing them is secondary.** See §5 |
| 9 | `matchSrcAttributes` fix (defect 11) | Approved as proposed in §2 |
| 10 | ExtRefs without `intAddr` | Included, identified by their **LN identity plus position within that LN** (not blocked or excluded). Flagged with a warning in the review step. *My reading of "by the LN identity"; please correct if you meant something else* |
| 11 | Several stencils | Keep an import **library** of stencils, with the most recently used shown first |
| 12 | Distribution-provided `stencilUrl` | Not in the MVP |
| 13 | Redesign | Apply-first stepper, Manage behind a mode switch: go ahead |
| – | JSON editing | Use Ace (as `oscd-editor-source` does) for the raw view, plus structured editing for common changes. See §5.4 |

## 1. Goal

Bring the plugin up to the current OpenPowerShift and OpenSCD standard:

- Build: `@omicronenergy/oscd-tooling`.
- Libraries: `@openscd/oscd-api` (EditV2, `docVersion`), `@openscd/scl-lib` 2.x, `@omicronenergy/oscd-ui` (scoped).
- Theming as described in [the oscd-api theming guide](https://raw.githubusercontent.com/openscd/oscd-api/153e3d5428e44c03305aa40d2894c8440346bde7/docs/theming.md).
- An `oscd-shell` demo.
- Fast tests with high coverage, plus screenshot (visual regression) tests.
- A UI centred on using stencils, with a separate area for managing them.

## 2. Current state (survey summary)

| Area | Today |
|---|---|
| Layout | Root-level `oscd-stencil.ts` (≈2300 lines), `combinations.ts`, `getIedDescription.ts`, `foundation/getMappingInfo.ts`. No `src/` |
| Tooling | Local eslint 8, prettier, rollup, wtr, wds, husky 8, es-dev-server, typedoc, cem. Test libraries are listed as runtime deps |
| Edit API | `newEditEvent` (EditV1 shapes) from `@openscd/open-scd-core` 0.0.2, plus `editCount` |
| SCL helpers | `@openenergytools/scl-lib` 0.13 |
| UI | `mwc-tab-bar`, `mwc-snackbar`, `@material/web` 1.x `md-*` (registered globally), `@openenergytools/filterable-lists`. Hard-coded colours and `--mdc-*` variables |
| Demo | `open-scd-core` `<open-scd>` with a monkey-patched `customElements.define` |
| Tests | None |
| Tracked junk | `templates.zip` (4.9 MB), `default_stencil_play.json`, `stencil.json`, `custom-elements.json`, `.husky/`. `templates/` (152 MB) is already git-ignored |

### What it does today

- **Use**: pick an application from the loaded stencil, map each function to an IED of matching manufacturer and type (and matching stencil Id/Version Privates), then Apply. Apply recreates the GOOSE and SV ExtRef subscriptions, the LGOS/LSVS supervisions and the SEL message-quality ExtRefs.
- **Create**: select IEDs. The plugin collects every GOOSE/SV mapping between each pair of them. You trim the From × To matrix, name each IED as a function, and save the result as a new application version. A separate action tags IEDs with `OpenSCD-Stencil-Id` and `OpenSCD-Stencil-Version` Privates.
- **View**: an editable raw-JSON textarea.

The stencil is stored in `localStorage['oscd-stencil']`.

### Defects to fix (each gets a failing-first spec)

1. Adding a new version to an existing application creates a second application with the same category and name. Replacing a version duplicates the application too.
2. **Delete Application** reads text fields that only exist on the Create tab, so it throws whenever other versions exist. It also keeps the original application.
3. **Show Deprecated** is inverted: when it's on, only applications that have a deprecated version are listed. Deprecated versions can never be selected, and there is no way to pick any version other than the first non-deprecated one.
4. Reactive state is mutated in place (`push`, `Map.set`, `stencilData.name = …`), so the UI often doesn't re-render.
5. Invalid JSON, either loaded from a file or typed into the View tab, throws. `loadStencil` also throws when no application is selected.
6. One Apply dispatches dozens of separate edit events, which means dozens of undo steps. One error message prints `null` instead of the element id.
7. The stencil-metadata dialog adds duplicate Privates to IEDs that are already tagged.
8. The download is labelled `application/xml`, and only the first space in the filename is replaced.
9. `getMappingInfo` has unclosed selectors (`IED[name="…"`), doesn't escape names, and assumes the DataSet exists.
10. The IED picker uses `querySelectorAll('IED')` instead of `:root > IED`.
11. `matchSrcAttributes` is too broad. Detail below.

### Defect 11 in detail: `matchSrcAttributes` serviceType fallback

`foundation/getMappingInfo.ts` has a local copy of scl-lib's `matchSrcAttributes`. Since a44c043 (SEL message quality, #19) it reads:

```ts
return (
  (srcCBName === cbName && srcLDInst ok && srcPrefix ok && srcLNInst ok && srcLNClass ok &&
   serviceType === 'GOOSE' | 'SMV')
  || !extRef.getAttribute('serviceType')      // ← fallback
);
```

**Why the fallback exists.** In a configured SCD, an SEL message-quality ExtRef has `iedName` and `srcCBName`/`srcLDInst`/`srcLNClass`/… but **no `serviceType`** (that is how `applyStencil` writes it too). scl-lib's own version requires `serviceType` to equal `GOOSE`/`SMV`, so it would never match these ExtRefs.

**Why the fallback is wrong.** The `||` throws away *all* the src checks, not just the serviceType check. Any ExtRef with no `serviceType` whose `iedName` is the publisher matches **every** control block of that publisher. That covers SEL quality ExtRefs, Edition 1 style ExtRefs, and vendors that omit `serviceType`. The effects:

| Case | Effect |
|---|---|
| A subscribed data ExtRef without `serviceType`, publisher has N control blocks | Recorded once per control block. For the control blocks whose DataSet doesn't contain the data, `getFCDA` returns nothing and the mapping is stored as `FCDA: "NONE"`. On Apply this gives the error "Could not find FCDA: …NONE" (very likely what #23 hit), or the ExtRef is subscribed to whichever control block came last |
| SEL with message-quality ExtRefs for two control blocks from the same publisher | `findSELMessageQuality` returns the **first** matching ExtRef for both control blocks, so both are mapped to the same quality ExtRef and the second one is never configured |
| Non-SEL subscriber | Same as row 1 for any ExtRef missing `serviceType` |

**Proposed fix:**

- Treat a missing `serviceType` as "unknown" for the serviceType comparison only. All the `src*` checks still apply.
- If an ExtRef has **no `srcCBName` at all** (Edition 1 style), fall back to: is there a matching FCDA in this control block's DataSet (`matchDataAttributes`)?
- `findSELMessageQuality` then becomes a strict match on `srcCBName` and the other src attributes.

The fixture will include all three cases above, as regression tests. → **Please confirm** (Q1).

## 3. Reference repos

- Tooling, structure, demo and workflows: `OpenPowerShift/oscd-editor-map-communication`.
  - Thin `tsconfig.json`/`eslint.config.js`, plus local `rollup.config.js` and `web-test-runner.config.js` that extend the shared ones.
  - `src/theme.ts`, `THEMING.md`, `src/testing/`.
  - Coverage threshold set to 90.
- Plugin shape and test style: `OMICRONEnergyOSS/oscd-editor-subscriber-databinding`.
- Ace integration: `OMICRONEnergyOSS/oscd-editor-source` (`ace-builds`, `ace-custom-element`, `ace-theme-oscd.ts`).

## 4. Stencil schema versioning and SCL identities

**Decision: option B.** Keep the identity strings, add `schemaVersion`, and own the string format in our own module.

### What a stencil stores

A stencil stores elements as scl-lib `identity()` strings with the IED name removed:

| Stored as | For |
|---|---|
| control block `id` | `GSEControl` / `SampledValueControl` |
| `mappings[].FCDA` | FCDA |
| `mappings[].ExtRef` | ExtRef |
| `supervision` | LGOS / LSVS LN |
| `selSupervision.ExtRef` | SEL message-quality ExtRef |

Apply puts the new IED name in front and resolves the element.

### Findings

- **The identity format is stable across scl-lib versions.** I diffed `tBaseElement/identity.ts` in `openscd/scl-lib` from 0.13.2 to 2.0.1. The only change is to `LNode` with `iedName="None"`, which stencils never store. A golden test will confirm this on a fixture.
- **ExtRefs with `intAddr`** (all later-binding ExtRefs, and SEL message-quality ExtRefs) have the identity `<LN identity>>intAddr[n]`. This is the ExtRef's identity within its LN and is independent of what it is subscribed to, so it is adequate.
- **ExtRefs without `intAddr`** (Edition 1 / early-binding style) get an identity built from their current subscription, including the original publisher's name, and scl-lib's `find()` does not resolve them. These cannot be matched on a fresh IED.

### Design

- A small module `foundation/stencil-ref.ts` builds, parses and resolves the reference strings for the four element types (control block, FCDA, ExtRef, LN). It does not depend on scl-lib's `find()`.
- A spec cross-checks it against scl-lib's `identity()` for every element type on the fixture, so any drift in scl-lib shows up in CI rather than in users' files.
- ExtRefs **without `intAddr`** are written as `<LN identity>>#n`, where `n` is the position among that LN's ExtRefs that have no `intAddr`. They are resolved by `stencil-ref.ts` only. The review step warns that they are matched by position, so this only works when the target IED has the same ExtRefs in the same order (typically IEDs from the same ICD template).
- Files carry `"schemaVersion": 2`. A file without `schemaVersion` is v1 (today's format). v2 differs only by the new field and the `#n` form, so a v1 file loads unchanged. Saving always writes v2.
- A file with a `schemaVersion` newer than the plugin knows is rejected with a clear message.
- If structured fields are ever needed, that is a later bump to v3 with a converter.

`stencil-io.ts` handles: parse, validate (hand-written type guards, errors given as a path plus a message), migrate (v1 to v2, which only adds the field), and serialize.

## 5. Proposed product design

### 5.1 Principles

- **Applying a stencil is the default screen and needs no stencil knowledge.**
  - Most users open the plugin, pick what to apply, assign IEDs and apply.
  - Users never see JSON, the mapping matrix or the creation tools unless they ask.
- **Library management is one click away**, behind a "Manage stencils" switch. It is not a top-level tab with equal weight.
- **Every change to the SCL is one undo step**, and is previewed before it happens.

### 5.2 Layout

```
┌ Stencil: Transpower Master Stencil v1.2.0  [Open…][▾ recent]        [Apply | Manage] ┐
│                                                                                     │
│  APPLY MODE (default)                                                               │
│  ① Choose application   ② Assign IEDs   ③ Review & apply        (stepper)          │
│  ┌───────────────────────┐ ┌────────────────────────────────────────────────────┐   │
│  │ 🔎 search             │ │ Bus Protection › BZ + MUs        v1.0.0 ▾          │   │
│  │ ▸ Bus Protection      │ │ "Protection 2 bus zone with merging units"         │   │
│  │    BZ + MUs   1.0.0   │ │ Needs: 1× SIEMENS 7SS85, 13× SIEMENS 6MU85         │   │
│  │ ▸ Transformer         │ │ 26 GOOSE · 13 SV · 13 supervisions                 │   │
│  │ ...                   │ │                                     [Next →]       │   │
│  └───────────────────────┘ └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Apply mode** is a three-step stepper.

1. **Choose application**
   - A searchable list grouped by category.
   - The latest non-deprecated version is picked by default. A version dropdown shows deprecated versions, marked as such.
   - A summary card shows the IED requirements and the number of subscriptions.
2. **Assign IEDs**
   - One row per function: function name, requirement (manufacturer, type, tag), and an `oscd-outlined-select` listing only valid IEDs that aren't already assigned.
   - **Auto-assign** fills every function that has exactly one candidate.
   - When the IED names follow a pattern (`MU Bay <n>`), suggestions are ordered by name similarity.
   - Functions with no candidate show why ("no SIEMENS 6MU85 tagged BZ-6MU85 1.0.0"), with a link that opens the tagging dialog.
   - You can apply to a **subset** of functions, as today.
3. **Review & apply**
   - A **dry run** shows N subscriptions, M supervisions and K SEL quality links per IED pair.
   - Anything that can't be resolved is listed before any edit is made.
   - Subscriptions that already exist are shown as "already present" and skipped.
   - **Apply** dispatches a single `newEditEventV2(edits, { title })`. Afterwards, a results panel offers **Undo** guidance and "Apply another".

**Manage mode** is a library tree with a detail pane.

- **Tree**: Stencil › Category › Application › Version.
- **Detail pane, per node type**:
  - *Stencil*: name, version, description, Import/Export/New.
  - *Application*: rename, change category, description, delete.
  - *Version*:
    - Description, deprecated toggle, duplicate as a new version, delete.
    - Rename functions.
    - Edit function requirements (manufacturer, type, stencil tags).
    - Read-only **mapping matrix** (From × To, with GOOSE/SV markers and supervision badges), where individual control-block links can be removed.
- **"Capture from document…"** is a wizard for creating a new application or version:
  1. Details
  2. Select IEDs
  3. Select control blocks: the matrix with row, column and cell tri-state checkboxes, driven by state
  4. Name functions: suggestions are made from the IED names, with a uniqueness check
  5. Review: includes any `intAddr` warnings and a "version exists → replace?" confirmation
- **"Tag IEDs…"** adds or updates the `OpenSCD-Stencil-Id`/`Version` Privates as one undoable edit.
- **"Advanced: edit JSON"** opens the Ace editor (§5.4).

### 5.3 Where stencils come from

Today there is a single stencil in localStorage. I propose:

- **A stencil library** in localStorage (IndexedDB if sizes require it): every stencil you import is kept, with the **most recently used shown first**. The picker in the header lists them and offers Import, Export and Remove.
- The existing `oscd-stencil` localStorage key is still read once and imported into the library, so existing users keep their stencil.
- A distribution-provided `stencilUrl` is **not** in the MVP.

### 5.4 JSON editing (Ace)

- Use `ace-builds` + `ace-custom-element` and reuse `oscd-editor-source`'s `ace-theme-oscd` approach, so the editor follows `--oscd-theme-*`. JSON mode gives syntax highlighting, folding, bracket matching and live syntax errors.
- **Lazy-loaded** with a dynamic `import()` only when you open "Advanced: edit JSON", so the bundle for users who only apply stencils stays small.
- On **Apply changes**, the text goes through `stencil-io` validation and migration. Schema errors are shown as Ace annotations at the offending path. Invalid content is never committed. **Revert** discards unsaved edits.
- Common small edits (rename, deprecate, description, delete a version, rename a function) are done in the structured Manage forms, so Ace is only for power users.
- Risk: `ace-custom-element` registers itself globally. I'll check it works under `ScopedElementsMixin`, as the source editor does, before relying on it.

### 5.5 Cross-cutting

- **Theming**: a `src/theme.ts` copied from map-communication's approach. Internal `--oscd-*` variables come from `--oscd-theme-*` with Solarized defaults, and `oscdMd3Mappings` feeds the `md` variables. Plugin hooks `--oscd-editor-stencil-goose-color` and `--oscd-editor-stencil-sv-color` are documented in `THEMING.adoc`. There are no hard-coded colours. GOOSE and SV are shown with icon plus colour, not colour alone.
- A themed demo page `demo/index-themed.html`.
- **Localisation**: all strings use `msg()`. Locale files for `de` and `pt` are generated with `lit-localize` and switched from the shell's `locale`.
- **Accessibility**: a keyboard-operable stepper, `<th scope>`, labelled checkboxes, and focus is moved after each step.
- **Toasts**: oscd-ui has no snackbar, so there is a small local `stencil-toast`.

## 6. Code architecture

```
src/
  oscd-editor-stencil.ts (+ .spec.ts, .test.ts)   root: state, mode switch, the only dispatcher of oscd-edit-v2
  theme.ts
  apply/   apply-view.ts  application-picker.ts  function-assignment.ts  apply-review.ts
  manage/  manage-view.ts  library-tree.ts  version-detail.ts  capture-wizard.ts
           tag-ieds-dialog.ts  json-editor.ts (lazy Ace)
  shared/  mapping-matrix.ts  stencil-toast.ts
  foundation/
    types.ts            v1 and v2 types
    stencil-io.ts       parse / validate / migrate / serialize / filename
    stencil-ref.ts      structured reference ⇄ element (resolve, describe) + v1 string parser
    stencil-model.ts    pure reducers: upsertVersion, deleteVersion, renameFunction, setDeprecated…
    capture.ts          getMappingInfo successor: doc + IEDs → ControlBlockLink[]
    match.ts            matchSrcAttributes (fixed), SEL quality detection
    plan-apply.ts       (doc, version, assignment) → { edits: EditV2[], report }   (dry run = same function)
    candidates.ts       candidate IEDs per function, auto-assign, suggestions
    ied-tags.ts         edits for Stencil-Id/Version Privates (insert or update)
    ied-description.ts  combinations.ts  storage.ts
  testing/  scl.ts (synthetic SCD builders)  stencils.ts (v1/v2 fixtures)
locales/   de.xlf  pt.xlf   (lit-localize; generated src/locales/*.ts)
demo/      index.html  index-themed.html  plugins.js  sample.scd  sample-stencil.json
```

- Each `*.ts` has a sibling `*.spec.ts`.
- All logic is pure functions in `foundation/`. Components pass properties down and raise typed events up.
- `plan-apply` is a single function used for both preview and apply, so what you preview is exactly what gets applied.
- **One-transaction risk.** Today supervisions are computed *after* the subscription edits have been applied. I need to check whether `instantiateSubscriptionSupervision` (with its checks disabled) reads document state that the subscription edits create. If it does, `plan-apply` will build the supervision edits directly, or use two dispatches joined with `squash: true`.

## 7. Tooling and CI (matches `oscd-editor-map-communication`)

- **`package.json`**
  - `"type": "module"`, `exports`, `files` (without specs and `testing/`), `publishConfig.access: public`.
  - `oscd <cmd>` scripts, including `test:visual` and `test:update`.
  - **deps**: `lit`, `@lit/localize`, `@open-wc/scoped-elements`, `@omicronenergy/oscd-ui` ^0.1.1, `@openscd/oscd-api` ^0.1.6, `@openscd/scl-lib` ^2.0.1, `@webcomponents/scoped-custom-element-registry`, `ace-builds`, `ace-custom-element`, `tslib`.
  - **devDeps**: `@omicronenergy/oscd-tooling` ^0.0.8, `@omicronenergy/oscd-shell`, `oscd-menu-open`, `oscd-menu-save`, `@open-wc/testing`, `@web/test-runner-commands`, `sinon`, `@lit/localize-tools`.
- Thin `tsconfig.json` and `eslint.config.js`.
- `web-test-runner.config.js` extends the shared config with `concurrency: 4`, excludes `dist/testing/**` from coverage, and sets a coverage threshold of **90** on all four metrics.
- `rollup.config.js` extends the shared config so both demo pages are bundled.
- `.githooks/` via `npm run prepare`, with conventional commits.
- **Workflows**, copied from map-communication:
  - `test.yml`: on push and PR. Installs Playwright via `npx oscd install-playwright`, then build, lint and test, uploads coverage, and bundles. A visual-test job is added.
  - `continuous-deployment.yml`: bundle, then deploy to GitHub Pages, with the root redirecting to `demo/`.
  - `release-please.yml`: release PR, then npm publish with provenance (via `NPM_TOKEN` until trusted publishing is set up), then attach the bundle to the release.
- `release-please-config.json` and `.release-please-manifest.json` (`0.0.0`).
- Deleted: `rollup.config.js` (old), `web-*.config.mjs`, `.husky/`, `custom-elements.json`, `dist/`, `coverage/`, `templates.zip`, `default_stencil_play.json`, `stencil.json`, `default_stencil.json`. `stencil_ideas.excalidraw` moves to `docs/`.
- The `.gitattributes` LFS rule for PNGs is moved to wherever oscd-tooling puts screenshot baselines.

## 8. Phases

Each phase ends with `npm i → tsc --noEmit → build → lint → test` passing, and is committed with conventional commits.

0. **Record current behaviour.** Build a synthetic fixture SCD containing:
   - a SIEMENS-like publisher with GSE and SMV control blocks,
   - subscribers with `intAddr` ExtRefs and LGOS/LSVS,
   - an SEL subscriber with two quality ExtRefs,
   - one ExtRef without `serviceType`,
   - one ExtRef without `intAddr`.

   Record the outputs of `getMappingInfo`, `identity` and Apply from the current code as golden files.
1. **Scaffold.** Tooling, layout, CI and cleanup (§7). Sources move into `src/`. The behaviour is not changed.
2. **Port.** `lit` imports, `.js` suffixes, `docVersion`, `ScopedElementsMixin`, and the shell demo with Open, Save, Stencil and Source Editor.
3. **EditV2 + scl-lib v2.**
   - `newEditEventV2`.
   - Extract `plan-apply`, `capture`, `ied-tags` and `match` into `foundation/`, with specs.
   - Identity golden test.
   - Single-transaction Apply.
4. **oscd-ui + theming + i18n scaffolding.** Replace every `mwc-*`, `md-*` and `@openenergytools/*` component. Add `theme.ts`, `msg()` and the locale setup. Behaviour is unchanged.
5. **Bug fixes.** Defects 1–11, each with a regression spec.
6. **Schema v2.**
   - `stencil-ref`, `stencil-io` with v1 → v2 migration (adds `schemaVersion`).
   - Golden test: every v1 fixture resolves to the same elements as scl-lib's `find()`, and `stencil-ref` identities match scl-lib's `identity()`.
7. **Redesign.**
   - Apply stepper (choose, assign with auto-assign, review with dry run).
   - Manage mode (library tree, version detail, capture wizard, tag IEDs).
   - Ace JSON editor, stencil library with recents.
8. **Tests to target, translations, docs.**
   - Coverage ≥ 90 % overall and ≥ 95 % in `foundation/`. Unit suite under about 15 s.
   - Screenshot tests (Chromium, fixed viewport, animations off), in the default theme plus a themed variant, covering:
     - every Apply step, including no-candidate and partial-failure states;
     - Manage tree and version detail;
     - each capture wizard step;
     - the tag dialog;
     - JSON editor, valid and invalid;
     - the empty states.
   - `de` and `pt` translations.
   - `README.adoc` with screenshots from the screenshot-test baselines, a user guide for applying and managing stencils, an accurate tooling section, and `THEMING.adoc`. `CHANGELOG.md` is left to release-please.

### Test strategy

- **Foundation specs** use small inline XML built with `src/testing/scl.ts` helpers. They make no network or file fetches and don't render anything.
- **Component specs** mount one component with `fixture()`, `await el.updateComplete` (no sleeps), and check the rendered state and the `oscd-edit-v2` event details.
- **End-to-end round trip** in a spec: capture an application from IEDs A+B, apply it to clean IEDs C+D of the same type, then check that C+D's ExtRefs, supervisions and SEL quality match A+B's. Run it for both v1 and v2 files.
- The large vendor ICDs in `templates/` stay git-ignored and are not used in CI.

## 9. Open questions

None outstanding. Implementation starts with Phase 0 and Phase 1.
