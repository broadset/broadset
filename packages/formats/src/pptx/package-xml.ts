import { NS, RELATIONSHIP_TYPES } from './constants';

export function buildContentTypesXml(hasSvg: boolean, imageExts: readonly string[]): string {
  const parts = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="${NS.ct}">`,
    `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `  <Default Extension="xml" ContentType="application/xml"/>`,
  ];

  if (hasSvg) {
    parts.push(`  <Default Extension="svg" ContentType="image/svg+xml"/>`);
  }

  for (const ext of imageExts) {
    if (ext === 'png') {
      parts.push(`  <Default Extension="png" ContentType="image/png"/>`);
    } else if (ext === 'jpg') {
      parts.push(`  <Default Extension="jpg" ContentType="image/jpeg"/>`);
    }
  }

  parts.push(
    `  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
    `  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    `  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,
    `  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
    `  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`,
    `</Types>`,
  );

  return parts.join('\n');
}

export function buildRootRels(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.officeDoc}" Target="ppt/presentation.xml"/>`,
    `</Relationships>`,
  ].join('\n');
}

export function buildPresentationXml(cx: number, cy: number): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:presentation xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}">`,
    `  <p:sldMasterIdLst>`,
    `    <p:sldMasterId id="2147483648" r:id="rId2"/>`,
    `  </p:sldMasterIdLst>`,
    `  <p:sldIdLst>`,
    `    <p:sldId id="256" r:id="rId1"/>`,
    `  </p:sldIdLst>`,
    `  <p:sldSz cx="${String(cx)}" cy="${String(cy)}"/>`,
    `  <p:notesSz cx="${String(cx)}" cy="${String(cy)}"/>`,
    `</p:presentation>`,
  ].join('\n');
}

export function buildPresentationRels(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.slide}" Target="slides/slide1.xml"/>`,
    `  <Relationship Id="rId2" Type="${RELATIONSHIP_TYPES.slideMaster}" Target="slideMasters/slideMaster1.xml"/>`,
    `  <Relationship Id="rId3" Type="${RELATIONSHIP_TYPES.theme}" Target="theme/theme1.xml"/>`,
    `</Relationships>`,
  ].join('\n');
}

export function buildSlideXml(shapesXml: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:sld xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}">`,
    `  <p:cSld>`,
    `    <p:spTree>`,
    `      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`,
    `      <p:grpSpPr/>`,
    shapesXml,
    `    </p:spTree>`,
    `  </p:cSld>`,
    `</p:sld>`,
  ].join('\n');
}

export function buildSlideRels(
  relationships: ReadonlyArray<{ readonly id: string; readonly type: string; readonly target: string }>,
): string {
  const rels = relationships.map((r) => `  <Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`);

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId0" Type="${RELATIONSHIP_TYPES.slideLayout}" Target="../slideLayouts/slideLayout1.xml"/>`,
    ...rels,
    `</Relationships>`,
  ].join('\n');
}

export function buildSlideLayoutXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:sldLayout xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}" type="blank">`,
    `  <p:cSld><p:spTree>`,
    `    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`,
    `    <p:grpSpPr/>`,
    `  </p:spTree></p:cSld>`,
    `</p:sldLayout>`,
  ].join('\n');
}

export function buildSlideLayoutRels(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.slideMaster}" Target="../slideMasters/slideMaster1.xml"/>`,
    `</Relationships>`,
  ].join('\n');
}

export function buildSlideMasterXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:sldMaster xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}">`,
    `  <p:cSld><p:spTree>`,
    `    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`,
    `    <p:grpSpPr/>`,
    `  </p:spTree></p:cSld>`,
    `  <p:sldLayoutIdLst>`,
    `    <p:sldLayoutId id="2147483649" r:id="rId1"/>`,
    `  </p:sldLayoutIdLst>`,
    `</p:sldMaster>`,
  ].join('\n');
}

export function buildSlideMasterRels(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.slideLayout}" Target="../slideLayouts/slideLayout1.xml"/>`,
    `  <Relationship Id="rId2" Type="${RELATIONSHIP_TYPES.theme}" Target="../theme/theme1.xml"/>`,
    `</Relationships>`,
  ].join('\n');
}

export function buildThemeXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<a:theme xmlns:a="${NS.a}" name="Broadset">`,
    `  <a:themeElements>`,
    `    <a:clrScheme name="Broadset">`,
    `      <a:dk1><a:srgbClr val="000000"/></a:dk1>`,
    `      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>`,
    `      <a:dk2><a:srgbClr val="333333"/></a:dk2>`,
    `      <a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>`,
    `      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>`,
    `      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>`,
    `      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>`,
    `      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>`,
    `      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>`,
    `      <a:accent6><a:srgbClr val="F79646"/></a:accent6>`,
    `      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>`,
    `      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>`,
    `    </a:clrScheme>`,
    `    <a:fontScheme name="Broadset">`,
    `      <a:majorFont><a:latin typeface="Calibri"/></a:majorFont>`,
    `      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>`,
    `    </a:fontScheme>`,
    `    <a:fmtScheme name="Broadset">`,
    `      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>`,
    `      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>`,
    `      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>`,
    `      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>`,
    `    </a:fmtScheme>`,
    `  </a:themeElements>`,
    `</a:theme>`,
  ].join('\n');
}
