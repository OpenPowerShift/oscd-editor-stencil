/* Generated from legacy-getMappingInfo.json; see README.md. */
export const legacyMappingInfo = {
  "PUB1->SUB1": [
    {
      "id": ">>LD0>GC1",
      "name": "GC1",
      "from": "PUB1",
      "to": "SUB1",
      "type": "GSEControl",
      "mappings": [
        {
          "FCDA": ">>LD0>DS_G>LD0/ GGIO 1.Ind1 stVal (ST)",
          "ExtRef": ">>LD0>I1[0]"
        },
        {
          "FCDA": ">>LD0>DS_G>LD0/ GGIO 1.Ind2 stVal (ST)",
          "ExtRef": ">>LD0>I2[0]"
        }
      ],
      "supervision": ">>LD0> LGOS 1"
    },
    {
      "id": ">>LD0>SV1",
      "name": "SV1",
      "from": "PUB1",
      "to": "SUB1",
      "type": "SampledValueControl",
      "mappings": [
        {
          "FCDA": ">>LD0>DS_S>LD0/ TCTR 1.AmpSv instMag.i (MX)",
          "ExtRef": ">>LD0>I3[0]"
        }
      ],
      "supervision": ">>LD0> LSVS 1"
    }
  ],
  "PUB1->SELR": [
    {
      "id": ">>LD0>GC1",
      "name": "GC1",
      "from": "PUB1",
      "to": "SELR",
      "type": "GSEControl",
      "mappings": [
        {
          "FCDA": ">>LD0>DS_G>LD0/ GGIO 1.Ind1 stVal (ST)",
          "ExtRef": ">>LD0>S1[0]"
        }
      ],
      "supervision": "None",
      "selSupervision": {
        "name": "Q_GC1",
        "ExtRef": ">>LD0>Q_GC1[0]"
      }
    }
  ],
  "PUB1->EDN1": [
    {
      "id": ">>LD0>GC1",
      "name": "GC1",
      "from": "PUB1",
      "to": "EDN1",
      "type": "GSEControl",
      "mappings": [
        {
          "FCDA": "NONE",
          "ExtRef": ">>LD0>PUB1 LD0/ GGIO 1 Ind3 stVal"
        }
      ],
      "supervision": "None"
    },
    {
      "id": ">>LD0>GC2",
      "name": "GC2",
      "from": "PUB1",
      "to": "EDN1",
      "type": "GSEControl",
      "mappings": [
        {
          "FCDA": ">>LD0>DS_G2>LD0/ GGIO 1.Ind3 stVal (ST)",
          "ExtRef": ">>LD0>PUB1 LD0/ GGIO 1 Ind3 stVal"
        }
      ],
      "supervision": "None"
    },
    {
      "id": ">>LD0>SV1",
      "name": "SV1",
      "from": "PUB1",
      "to": "EDN1",
      "type": "SampledValueControl",
      "mappings": [
        {
          "FCDA": "NONE",
          "ExtRef": ">>LD0>PUB1 LD0/ GGIO 1 Ind3 stVal"
        }
      ],
      "supervision": "None"
    }
  ]
};
