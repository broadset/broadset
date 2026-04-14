import type { BroadsetDocument } from '@broadset/model';
import PizZip from 'pizzip';

import {
  buildContentTypesXml,
  buildPresentationRels,
  buildPresentationXml,
  buildRootRels,
  buildSlideLayoutRels,
  buildSlideLayoutXml,
  buildSlideMasterRels,
  buildSlideMasterXml,
  buildSlideRels,
  buildSlideXml,
  buildThemeXml,
} from './package-xml';
import { buildGroupXml, buildShapeXml, type SlideContext } from './slide-shapes';
import { valueToEmu } from './units';

export function exportPptxBytes(doc: BroadsetDocument): Uint8Array {
  const { canvas } = doc;
  const cx = valueToEmu(canvas, canvas.width);
  const cy = valueToEmu(canvas, canvas.height);

  const ctx: SlideContext = {
    canvas,
    relationships: [],
    mediaFiles: [],
    nextRelId: 1,
    nextMediaId: 1,
  };

  const groupIds = new Set(doc.elements.filter((el) => el.type === 'group').map((el) => el.id));

  const shapeParts: string[] = [];

  for (const el of doc.elements) {
    if (el.groupId && groupIds.has(el.groupId)) {
      continue;
    }

    if (el.type === 'group') {
      const children = doc.elements.filter((child) => child.groupId === el.id);

      shapeParts.push(buildGroupXml(el, children, ctx));
    } else {
      shapeParts.push(buildShapeXml(el, ctx));
    }
  }

  const shapesXml = shapeParts.join('\n');

  const hasSvg = ctx.mediaFiles.some((f) => f.path.endsWith('.svg'));
  const imageExts = [
    ...new Set(
      ctx.mediaFiles
        .map((f) => {
          if (f.path.endsWith('.png')) return 'png';
          if (f.path.endsWith('.jpg')) return 'jpg';

          return '';
        })
        .filter(Boolean),
    ),
  ];

  const zip = new PizZip();

  zip.file('[Content_Types].xml', buildContentTypesXml(hasSvg, imageExts));
  zip.file('_rels/.rels', buildRootRels());
  zip.file('ppt/presentation.xml', buildPresentationXml(cx, cy));
  zip.file('ppt/_rels/presentation.xml.rels', buildPresentationRels());
  zip.file('ppt/slides/slide1.xml', buildSlideXml(shapesXml));
  zip.file('ppt/slides/_rels/slide1.xml.rels', buildSlideRels(ctx.relationships));
  zip.file('ppt/slideLayouts/slideLayout1.xml', buildSlideLayoutXml());
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', buildSlideLayoutRels());
  zip.file('ppt/slideMasters/slideMaster1.xml', buildSlideMasterXml());
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', buildSlideMasterRels());
  zip.file('ppt/theme/theme1.xml', buildThemeXml());

  for (const media of ctx.mediaFiles) {
    zip.file(media.path, media.content);
  }

  const output: unknown = zip.generate({ type: 'uint8array' });

  return output as Uint8Array;
}
