export interface PlacementPoint {
  readonly x: number;
  readonly y: number;
}

export type PlacementState =
  | { readonly type: 'placement-anchor'; readonly elementType: string }
  | { readonly type: 'placement-extent'; readonly elementType: string; readonly anchor: PlacementPoint }
  | { readonly type: 'placement-ellipse-radius'; readonly anchor: PlacementPoint }
  | {
      readonly type: 'placement-ellipse-rotation';
      readonly anchor: PlacementPoint;
      readonly radius: { readonly rx: number; readonly ry: number };
    };

export type EditingMode =
  | { readonly type: 'none' }
  | PlacementState
  | { readonly type: 'path-editing'; readonly elementId: string }
  | { readonly type: 'path-drawing'; readonly elementId: string }
  | { readonly type: 'inline-text'; readonly elementId: string }
  | { readonly type: 'clip-path-editing'; readonly elementId: string }
  | { readonly type: 'motion-path-editing'; readonly elementId: string };
