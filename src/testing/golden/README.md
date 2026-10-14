# Golden files

Recorded from the pre-upgrade code on `src/testing/fixture-scd.ts`:

- `scl-lib-0.13.3-identities.ts`: `identity()` and `controlBlockObjRef()` from
  `@openenergytools/scl-lib@0.13.3`.
- `legacy-getMappingInfo.ts`: output of the old `foundation/getMappingInfo.ts`.
  `PUB1->EDN1` documents defect 11 (every control block of the publisher is
  matched, giving `FCDA: "NONE"` entries). The fixed implementation is expected
  to differ there and nowhere else.
