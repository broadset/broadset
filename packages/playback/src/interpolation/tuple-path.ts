import { clampUnitInterval, interpolateNumber } from './number';

const PATH_ARGUMENTS_PER_COMMAND: Readonly<Record<string, number>> = {
  A: 7,
  C: 6,
  H: 1,
  L: 2,
  M: 2,
  Q: 4,
  S: 4,
  T: 2,
  V: 1,
  Z: 0,
};

export interface InterpolatePathOptions {
  readonly commands: string | readonly string[];
  readonly from: readonly number[];
  readonly to: readonly number[];
  readonly progress: number;
}

function splitPathCommands(commands: string | readonly string[]): readonly string[] {
  if (typeof commands === 'string') {
    return commands
      .trim()
      .split(/\s+/u)
      .filter((command: string) => command.length > 0);
  }

  return [...commands];
}

function roundPathCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function interpolatePath(options: InterpolatePathOptions): string {
  const commands = splitPathCommands(options.commands);

  if (options.from.length !== options.to.length) {
    throw new Error('Path coordinate arrays must have the same length');
  }

  const easedProgress = clampUnitInterval(options.progress);
  const interpolatedCoordinates = options.from.map((coordinate, index) => {
    const target = options.to[index];

    return roundPathCoordinate(interpolateNumber(coordinate, target ?? coordinate, easedProgress));
  });
  const parts: string[] = [];
  let coordinateIndex = 0;

  for (const command of commands) {
    const normalizedCommand = command.toUpperCase();
    const argumentCount = PATH_ARGUMENTS_PER_COMMAND[normalizedCommand] ?? 0;

    parts.push(command);

    for (let index = 0; index < argumentCount; index += 1) {
      const coordinate = interpolatedCoordinates[coordinateIndex];

      if (coordinate !== undefined) {
        parts.push(coordinate);
      }

      coordinateIndex += 1;
    }
  }

  return parts.join(' ');
}
