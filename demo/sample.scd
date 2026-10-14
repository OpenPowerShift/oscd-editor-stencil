<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" release="4">
  <IED name="PUB1" manufacturer="SIEMENS" type="7SS85" desc="Publisher">
    <Private type="OpenSCD-Stencil-Id">BZ-Publisher</Private><Private type="OpenSCD-Stencil-Version">1.0.0</Private><AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <DataSet name="DS_G"><FCDA ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind1" daName="stVal" fc="ST"/><FCDA ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind2" daName="stVal" fc="ST"/></DataSet>
      <DataSet name="DS_G2"><FCDA ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind3" daName="stVal" fc="ST"/></DataSet>
      <DataSet name="DS_S"><FCDA ldInst="LD0" lnClass="TCTR" lnInst="1" doName="AmpSv" daName="instMag.i" fc="MX"/></DataSet>
      <GSEControl name="GC1" datSet="DS_G" appID="GC1"/>
      <GSEControl name="GC2" datSet="DS_G2" appID="GC2"/>
      <SampledValueControl name="SV1" datSet="DS_S" smvID="SV1" smpRate="80" nofASDU="1"/>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="SUB1" manufacturer="SIEMENS" type="6MU85" desc="Subscriber">
    <Private type="OpenSCD-Stencil-Id">BZ-Subscriber</Private><Private type="OpenSCD-Stencil-Version">1.0.0</Private><AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <Inputs>
        <ExtRef intAddr="I1" iedName="PUB1" ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind1" daName="stVal" serviceType="GOOSE" srcCBName="GC1" srcLDInst="LD0" srcLNClass="LLN0"/>
        <ExtRef intAddr="I2" iedName="PUB1" ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind2" daName="stVal" serviceType="GOOSE" srcCBName="GC1" srcLDInst="LD0" srcLNClass="LLN0"/>
        <ExtRef intAddr="I3" iedName="PUB1" ldInst="LD0" lnClass="TCTR" lnInst="1" doName="AmpSv" daName="instMag.i" serviceType="SMV" srcCBName="SV1" srcLDInst="LD0" srcLNClass="LLN0"/>
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
        <ExtRef intAddr="S1" iedName="PUB1" ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind1" daName="stVal" serviceType="GOOSE" srcCBName="GC1" srcLDInst="LD0" srcLNClass="LLN0"/>
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
<IED name="PUB2" manufacturer="SIEMENS" type="7SS85" desc="Publisher (to configure)">
    <Private type="OpenSCD-Stencil-Id">BZ-Publisher</Private><Private type="OpenSCD-Stencil-Version">1.0.0</Private><AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <DataSet name="DS_G"><FCDA ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind1" daName="stVal" fc="ST"/><FCDA ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind2" daName="stVal" fc="ST"/></DataSet>
      <DataSet name="DS_G2"><FCDA ldInst="LD0" lnClass="GGIO" lnInst="1" doName="Ind3" daName="stVal" fc="ST"/></DataSet>
      <DataSet name="DS_S"><FCDA ldInst="LD0" lnClass="TCTR" lnInst="1" doName="AmpSv" daName="instMag.i" fc="MX"/></DataSet>
      <GSEControl name="GC1" datSet="DS_G" appID="GC1"/>
      <GSEControl name="GC2" datSet="DS_G2" appID="GC2"/>
      <SampledValueControl name="SV1" datSet="DS_S" smvID="SV1" smpRate="80" nofASDU="1"/>
    </LN0></LDevice></Server></AccessPoint>
  </IED><IED name="SUB2" manufacturer="SIEMENS" type="6MU85" desc="Subscriber (to configure)">
    <Private type="OpenSCD-Stencil-Id">BZ-Subscriber</Private><Private type="OpenSCD-Stencil-Version">1.0.0</Private><AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <Inputs>
        <ExtRef intAddr="I1"/>
        <ExtRef intAddr="I2"/>
        <ExtRef intAddr="I3"/>
        <ExtRef intAddr="I4"/>
      </Inputs>
    </LN0>
    <LN lnClass="LGOS" inst="1"><DOI name="GoCBRef"><DAI name="setSrcRef"><Val/></DAI></DOI></LN>
    <LN lnClass="LSVS" inst="1"><DOI name="SvCBRef"><DAI name="setSrcRef"><Val/></DAI></DOI></LN>
    </LDevice></Server></AccessPoint>
  </IED><IED name="SELR2" manufacturer="SEL" type="SEL-421" desc="SEL relay (to configure)">
    <AccessPoint name="AP1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0" inst="">
      <Inputs>
        <ExtRef intAddr="S1"/>
        <!-- SEL message quality: source set, no serviceType, not subscribed -->
        <ExtRef intAddr="Q_GC1"/>
        <ExtRef intAddr="Q_GC2"/>
      </Inputs>
    </LN0></LDevice></Server></AccessPoint>
  </IED></SCL>
