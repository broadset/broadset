export interface PathSegment {
  readonly command: string;
  readonly coords: readonly number[];
}

export interface PathHandle {
  readonly type: 'anchor' | 'control';
  readonly x: number;
  readonly y: number;
  readonly segmentIndex: number;
  readonly xIndex: number;
  readonly yIndex: number;
}

export interface RefitPathBoundsInput {
  readonly pathData: string;
  readonly strokeWidth: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly currentWidth: number;
  readonly currentHeight: number;
}

export interface RefitPathBoundsResult {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pathData: string;
}

export interface RefitPathBoundsFromSvgInput {
  readonly pathData: string;
  readonly svgBBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly strokeWidth: number;
}
