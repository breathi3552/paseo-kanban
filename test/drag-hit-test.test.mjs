import test from "node:test";
import assert from "node:assert/strict";
import { findHoveredLaneId } from "../client/kanban-drag.ts";

const mockContainer = {
  x: 20,
  y: 80,
  width: 800,
  height: 600,
};

const mockLanes = [
  { id: "to-plan", rect: { x: 10, y: 10, width: 280, height: 550 } },
  { id: "in-progress", rect: { x: 304, y: 10, width: 280, height: 550 } },
  { id: "done", rect: { x: 598, y: 10, width: 280, height: 550 } },
];

test("findHoveredLaneId: correctly hits lane when pointer is within lane bounds", () => {
  // Pointer inside to-plan lane:
  // pointerX = 20 (container.x) + 50 = 70; contentX = 70 - 20 + 0 = 50 (within [10, 290])
  // pointerY = 80 (container.y) + 50 = 130; contentY = 130 - 80 = 50 (within [10, 560])
  const hit = findHoveredLaneId({
    pointerX: 70,
    pointerY: 130,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(hit, "to-plan");
});

test("findHoveredLaneId: returns null when pointer is in the horizontal gap between lanes", () => {
  // Gap between to-plan ([10, 290]) and in-progress ([304, 584]) is [291, 303].
  // contentX = 298 -> pointerX = 20 + 298 = 318
  const hit = findHoveredLaneId({
    pointerX: 318,
    pointerY: 130,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(hit, null, "Gap between lanes must return null to clear hover");
});

test("findHoveredLaneId: returns null when pointer is vertically above or below lane", () => {
  // Vertically above: contentY = 5 < lane.y (10) -> pointerY = 80 + 5 = 85
  const hitAbove = findHoveredLaneId({
    pointerX: 70,
    pointerY: 85,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(hitAbove, null, "Above lane must return null");

  // Vertically below: contentY = 580 > lane.y + height (560) -> pointerY = 80 + 580 = 660
  const hitBelow = findHoveredLaneId({
    pointerX: 70,
    pointerY: 660,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(hitBelow, null, "Below lane must return null");
});

test("findHoveredLaneId: returns null when pointer is outside container viewport bounds", () => {
  // Pointer in header above container (pointerY = 50 < container.y = 80)
  const hitHeader = findHoveredLaneId({
    pointerX: 70,
    pointerY: 50,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(
    hitHeader,
    null,
    "Outside container viewport (above) must return null",
  );

  // Pointer below container (pointerY = 700 > 80 + 600 = 680)
  const hitOutsideBottom = findHoveredLaneId({
    pointerX: 70,
    pointerY: 700,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(
    hitOutsideBottom,
    null,
    "Outside container viewport (below) must return null",
  );

  // Pointer to the left of container (pointerX = 10 < 20)
  const hitLeft = findHoveredLaneId({
    pointerX: 10,
    pointerY: 130,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(
    hitLeft,
    null,
    "Outside container viewport (left) must return null",
  );
});

test("findHoveredLaneId: accounts for horizontal scroll offset correctly", () => {
  // When scrolled horizontally by 294px:
  // Pointer at pointerX = 70 (relX = 50) + scrollX (294) = contentX 344 (within in-progress [304, 584])
  const hitScrolled = findHoveredLaneId({
    pointerX: 70,
    pointerY: 130,
    containerBounds: mockContainer,
    scrollX: 294,
    lanes: mockLanes,
  });
  assert.equal(
    hitScrolled,
    "in-progress",
    "Must correctly hit lane 2 after horizontal scroll",
  );
});

test("findHoveredLaneId: moving over target lane then releasing in toolbar returns null", () => {
  // Step 1: Pointer moved into in-progress lane
  const hitInProgress = findHoveredLaneId({
    pointerX: 340,
    pointerY: 130,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(hitInProgress, "in-progress");

  // Step 2: Pointer continues moving into top toolbar (pointerY = 30 < container.y = 80)
  // On release, synchronous recalculation with final coordinates must return null
  const finalReleaseHit = findHoveredLaneId({
    pointerX: 340,
    pointerY: 30,
    containerBounds: mockContainer,
    scrollX: 0,
    lanes: mockLanes,
  });
  assert.equal(
    finalReleaseHit,
    null,
    "Release in toolbar area must evaluate to null and prevent move",
  );
});
