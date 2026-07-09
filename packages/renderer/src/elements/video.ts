import { resolveContentAsPlainString } from '@broadset/model';

import { renderMediaPlaceholder } from './_util/media-placeholder';
import { createSimpleRenderer } from './_util/simple-renderer';

/**
 * Video renderer. Mounts a native `<video>` with controls suppressed so the
 * editor/preview owns playback UX. Empty content renders the shared media
 * placeholder instead of a blank video node. `typeConfig` drives loop /
 * mute / autoplay; defaults favor preview-friendly "muted autoplay loop".
 */
export const createVideoRenderer = createSimpleRenderer((host, element) => {
  const contentText = resolveContentAsPlainString(element.content);

  if (contentText.trim() === '') {
    renderMediaPlaceholder(host, element, 'video');

    return;
  }

  const video = document.createElement('video');
  const typeConfig = element.typeConfig;

  video.src = contentText;
  video.muted = typeConfig !== null && 'muted' in typeConfig ? Boolean(typeConfig.muted) : true;
  video.loop = typeConfig !== null && 'loop' in typeConfig ? Boolean(typeConfig.loop) : true;
  video.autoplay = typeConfig !== null && 'autoplay' in typeConfig ? Boolean(typeConfig.autoplay) : false;
  video.playsInline = true;
  video.controls = false;
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.display = 'block';
  video.style.objectFit = element.style.objectFit ?? 'cover';

  host.replaceChildren(video);
});
