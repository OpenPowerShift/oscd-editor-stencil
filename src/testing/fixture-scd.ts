/**
 * Synthetic SCD used by specs. PUB1 publishes GOOSE (GC1, GC2) and SV (SV1).
 * SUB1 is a later-binding subscriber with LGOS/LSVS supervisions, SELR carries
 * SEL message-quality ExtRefs (no serviceType, unsubscribed) and EDN1 an
 * Edition 1 style ExtRef (subscribed, no serviceType, no intAddr).
 */
// Synthetic SCD: PUB1 (GOOSE+SV publisher), SUB1 (siemens-style subscriber), SELR (SEL relay)
const ns = 'http://www.iec.ch/61850/2003/SCL';
const fcda = (ld: string, ln: string, doName: string, daName: string, fc: string): string =>
  `<FCDA ldInst="${ld}" lnClass="${ln}" lnInst="1" doName="${doName}" daName="${daName}" fc="${fc}"/>`;
const sub = (intAddr: string, cb: string, st: string, f: { ld: string; ln: string; doName: string; da: string }): string =>
  `<ExtRef intAddr="${intAddr}" iedName="PUB1" ldInst="${f.ld}" lnClass="${f.ln}" lnInst="1" doName="${f.doName}" daName="${f.da}" serviceType="${st}" srcCBName="${cb}" srcLDInst="LD0" srcLNClass="LLN0"/>`;
export const fixtureXml: string = `<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="${ns}" version="2007" revision="B" release="4">
  <IED name="PUB1" manufacturer="SIEMENS" type="7SS85" desc="Publisher">
    <AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <DataSet name="DS_G">${fcda('LD0','GGIO','Ind1','stVal','ST')}${fcda('LD0','GGIO','Ind2','stVal','ST')}</DataSet>
      <DataSet name="DS_G2">${fcda('LD0','GGIO','Ind3','stVal','ST')}</DataSet>
      <DataSet name="DS_S">${fcda('LD0','TCTR','AmpSv','instMag.i','MX')}</DataSet>
      <GSEControl name="GC1" datSet="DS_G" appID="GC1"/>
      <GSEControl name="GC2" datSet="DS_G2" appID="GC2"/>
      <SampledValueControl name="SV1" datSet="DS_S" smvID="SV1" smpRate="80" nofASDU="1"/>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="SUB1" manufacturer="SIEMENS" type="6MU85" desc="Subscriber">
    <AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <Inputs>
        ${sub('I1','GC1','GOOSE',{ld:'LD0',ln:'GGIO',doName:'Ind1',da:'stVal'})}
        ${sub('I2','GC1','GOOSE',{ld:'LD0',ln:'GGIO',doName:'Ind2',da:'stVal'})}
        ${sub('I3','SV1','SMV',{ld:'LD0',ln:'TCTR',doName:'AmpSv',da:'instMag.i'})}
        <ExtRef intAddr="I4"/>
      </Inputs>
    </LN0>
    <LN lnClass="LGOS" inst="1"><DOI name="GoCBRef"><DAI name="setSrcRef"><Val>PUB1LD0/LLN0.GC1</Val></DAI></DOI></LN>
    <LN lnClass="LSVS" inst="1"><DOI name="SvCBRef"><DAI name="setSrcRef"><Val>PUB1LD0/LLN0.SV1</Val></DAI></DOI></LN>
    </LDevice></Server></AccessPoint>
  </IED>
  <IED name="SELR" manufacturer="SEL" type="SEL-421" desc="SEL relay">
    <AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <Inputs>
        ${sub('S1','GC1','GOOSE',{ld:'LD0',ln:'GGIO',doName:'Ind1',da:'stVal'})}
        <!-- SEL message quality: source set, no serviceType, not subscribed -->
        <ExtRef intAddr="Q_GC1" iedName="PUB1" srcCBName="GC1" srcLDInst="LD0" srcLNClass="LLN0"/>
        <ExtRef intAddr="Q_GC2" iedName="PUB1" srcCBName="GC2" srcLDInst="LD0" srcLNClass="LLN0"/>
      </Inputs>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="EDN1" manufacturer="OTHER" type="X1" desc="Edition 1 style: subscribed, no serviceType, no intAddr">
    <AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <Inputs>
        <ExtRef iedName="PUB1" ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind3" daName="stVal"/>
      </Inputs>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
</SCL>`;
