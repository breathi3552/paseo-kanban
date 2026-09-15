export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaneLayoutItem {
  id: string;
  rect: Rect;
}

export interface DragHitTestOptions {
  pointerX: number;
  pointerY: number;
  containerBounds: Rect | null;
  scrollX: number;
  lanes: LaneLayoutItem[];
}

/**
 * Pure hit testing function for cross-lane drag and drop.
 *
 * Checks both X and Y dimensions:
 * 1. Validates that the pointer is within the visible container viewport.
 * 2. Maps pointer coordinates into scrollable content space taking scrollX into account.
 * 3. Checks if the pointer is within any lane's rectangle.
 * 4. Returns the matching lane ID, or null if outside, in a gap, or above/below.
 */
export function findHoveredLaneId(options: DragHitTestOptions): string | null {
  const { pointerX, pointerY, containerBounds, scrollX, lanes } = options;

  // 1. If container bounds are available, pointer must be within the visible container viewport
  if (containerBounds) {
    if (
      pointerX < containerBounds.x ||
      pointerX > containerBounds.x + containerBounds.width ||
      pointerY < containerBounds.y ||
      pointerY > containerBounds.y + containerBounds.height
    ) {
      return null;
    }
  }

  // 2. Map pointer coordinates to the scrollable content space
  const containerOriginX = containerBounds ? containerBounds.x : 0;
  const containerOriginY = containerBounds ? containerBounds.y : 0;
  const contentX = pointerX - containerOriginX + scrollX;
  const contentY = pointerY - containerOriginY;

  // 3. Find matching lane
  for (const lane of lanes) {
    const { x, y, width, height } = lane.rect;
    if (
      contentX >= x &&
      contentX <= x + width &&
      contentY >= y &&
      contentY <= y + height
    ) {
      return lane.id;
    }
  }

  return null;
}
