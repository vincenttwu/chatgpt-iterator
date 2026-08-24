export const INPAGE_CONTROLLER_DOCKS = Object.freeze([
  'top_left',
  'middle_left',
  'bottom_left',
  'top_right',
  'middle_right',
  'bottom_right',
] as const);

export type InPageControllerDock = (typeof INPAGE_CONTROLLER_DOCKS)[number];
export const DEFAULT_INPAGE_CONTROLLER_DOCK: InPageControllerDock = 'top_right';

export interface InPageViewport {
  readonly width: number;
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
}

export interface InPageElementSize {
  readonly width: number;
  readonly height: number;
}

export interface InPageCollisionRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface InPageResolvedPosition {
  readonly dock: InPageControllerDock;
  readonly left: number;
  readonly top: number;
}

const EDGE_MARGIN = 16;
const TOP_SAFE_MARGIN = 72;
const COLLISION_GAP = 12;

export function isInPageControllerDock(value: unknown): value is InPageControllerDock {
  return typeof value === 'string' && (INPAGE_CONTROLLER_DOCKS as readonly string[]).includes(value);
}

function finiteNonNegative(value: number): number { return Number.isFinite(value) ? Math.max(0, value) : 0; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(Math.max(value, minimum), Math.max(minimum, maximum)); }

function normalizedViewport(viewport: InPageViewport): InPageViewport {
  return {
    width: Math.max(1, finiteNonNegative(viewport.width)),
    height: Math.max(1, finiteNonNegative(viewport.height)),
    offsetLeft: Number.isFinite(viewport.offsetLeft) ? viewport.offsetLeft : 0,
    offsetTop: Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0,
  };
}

function normalizedSize(size: InPageElementSize, viewport: InPageViewport): InPageElementSize {
  return {
    width: Math.min(Math.max(1, finiteNonNegative(size.width)), Math.max(1, viewport.width - EDGE_MARGIN * 2)),
    height: Math.min(Math.max(1, finiteNonNegative(size.height)), Math.max(1, viewport.height - EDGE_MARGIN * 2)),
  };
}

function intersects(left: number, top: number, size: InPageElementSize, obstacle: InPageCollisionRect): boolean {
  return left < obstacle.right && left + size.width > obstacle.left && top < obstacle.bottom && top + size.height > obstacle.top;
}

function normalizedObstacle(obstacle: InPageCollisionRect): InPageCollisionRect | null {
  if (![obstacle.left, obstacle.top, obstacle.right, obstacle.bottom].every(Number.isFinite)) return null;
  if (obstacle.right <= obstacle.left || obstacle.bottom <= obstacle.top) return null;
  return obstacle;
}

function verticalAnchor(dock: InPageControllerDock, viewport: InPageViewport, size: InPageElementSize): number {
  if (dock.startsWith('top_')) return viewport.offsetTop + Math.min(TOP_SAFE_MARGIN, Math.max(EDGE_MARGIN, viewport.height - size.height - EDGE_MARGIN));
  if (dock.startsWith('middle_')) return viewport.offsetTop + (viewport.height - size.height) / 2;
  return viewport.offsetTop + viewport.height - size.height - EDGE_MARGIN;
}

function horizontalAnchor(dock: InPageControllerDock, viewport: InPageViewport, size: InPageElementSize): number {
  return dock.endsWith('_left')
    ? viewport.offsetLeft + EDGE_MARGIN
    : viewport.offsetLeft + viewport.width - size.width - EDGE_MARGIN;
}

function avoidObstacle(
  left: number,
  top: number,
  size: InPageElementSize,
  viewport: InPageViewport,
  obstacle: InPageCollisionRect,
): number {
  if (!intersects(left, top, size, obstacle)) return top;
  const minimumTop = viewport.offsetTop + EDGE_MARGIN;
  const maximumTop = viewport.offsetTop + viewport.height - size.height - EDGE_MARGIN;
  const above = obstacle.top - COLLISION_GAP - size.height;
  const below = obstacle.bottom + COLLISION_GAP;
  const aboveFits = above >= minimumTop;
  const belowFits = below <= maximumTop;
  if (aboveFits && belowFits) return Math.abs(above - top) <= Math.abs(below - top) ? above : below;
  if (aboveFits) return above;
  if (belowFits) return below;
  return minimumTop;
}

export function resolveInPageControllerPosition(
  dock: InPageControllerDock,
  viewportInput: InPageViewport,
  sizeInput: InPageElementSize,
  obstacles: readonly InPageCollisionRect[] = [],
): InPageResolvedPosition {
  const viewport = normalizedViewport(viewportInput);
  const size = normalizedSize(sizeInput, viewport);
  const minimumLeft = viewport.offsetLeft + EDGE_MARGIN;
  const maximumLeft = viewport.offsetLeft + viewport.width - size.width - EDGE_MARGIN;
  const minimumTop = viewport.offsetTop + EDGE_MARGIN;
  const maximumTop = viewport.offsetTop + viewport.height - size.height - EDGE_MARGIN;
  const left = clamp(horizontalAnchor(dock, viewport, size), minimumLeft, maximumLeft);
  let top = clamp(verticalAnchor(dock, viewport, size), minimumTop, maximumTop);
  for (const candidate of obstacles) {
    const obstacle = normalizedObstacle(candidate);
    if (obstacle !== null) top = clamp(avoidObstacle(left, top, size, viewport, obstacle), minimumTop, maximumTop);
  }
  return Object.freeze({ dock, left:Math.round(left), top:Math.round(top) });
}

export function dockInPageControllerFromPointer(clientX: number, clientY: number, viewportInput: InPageViewport): InPageControllerDock {
  const viewport = normalizedViewport(viewportInput);
  const x = clamp(clientX - viewport.offsetLeft, 0, viewport.width);
  const y = clamp(clientY - viewport.offsetTop, 0, viewport.height);
  const side = x < viewport.width / 2 ? 'left' : 'right';
  const row = y < viewport.height / 3 ? 'top' : y < viewport.height * 2 / 3 ? 'middle' : 'bottom';
  return `${row}_${side}` as InPageControllerDock;
}

export function moveInPageControllerDock(dock: InPageControllerDock, direction: 'up'|'down'|'left'|'right'): InPageControllerDock {
  const [row, side] = dock.split('_') as ['top'|'middle'|'bottom', 'left'|'right'];
  if (direction === 'left') return `${row}_left`;
  if (direction === 'right') return `${row}_right`;
  const rows = ['top','middle','bottom'] as const;
  const index = rows.indexOf(row);
  const nextIndex = direction === 'up' ? Math.max(0, index - 1) : Math.min(rows.length - 1, index + 1);
  return `${rows[nextIndex]}_${side}` as InPageControllerDock;
}
