import { createSimpleRenderer } from './_util/simple-renderer';

/**
 * Rectangle and ellipse renderer. Shape geometry is expressed through the
 * element host's layout styling (width / height / border-radius); this
 * renderer contributes no inner DOM — it clears the host so the layout
 * layer's background and border styling are the only visible surface.
 */
export const createShapeRenderer = createSimpleRenderer((host, element) => {
  if (element.type === 'group') {
    host.textContent = '';

    return;
  }

  host.textContent = '';
});
