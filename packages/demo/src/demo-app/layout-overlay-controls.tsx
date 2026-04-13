import { LayoutMainToolbar } from './layout-main-toolbar';
import { LayoutSideRails } from './layout-side-rails';
import type { DemoAppLayoutProps } from './layout-types';

export function LayoutOverlayControls(props: DemoAppLayoutProps): React.JSX.Element {
  return (
    <>
      <LayoutMainToolbar {...props} />
      <LayoutSideRails {...props} />
    </>
  );
}
