import assert from "node:assert/strict";
import { test } from "node:test";
import { mountHorizontalSwipe } from "../src/features/product-swipe.js";

function setupSwipe() {
  const handlers = new Map();
  const moves = [];
  const directions = [];
  const captures = [];
  const descendant = { closest: () => null };
  const surface = {
    clientWidth: 350,
    addEventListener: (type, handler) => handlers.set(type, handler),
    setPointerCapture: (id) => captures.push(id),
    setAttribute() {},
    removeAttribute() {},
  };
  mountHorizontalSwipe(surface, {
    move: (distance) => moves.push(distance),
    finish: (direction) => directions.push(direction),
  });
  function emit(type, clientX, clientY, { target = surface, timeStamp = 140 } = {}) {
    handlers.get(type)({
      type, target, clientX, clientY, timeStamp, pointerId: 1, isPrimary: true, button: 0,
    });
  }
  return { emit, moves, directions, captures, descendant };
}

test("touch capture can transfer from a child to the swipe surface", () => {
  const { emit, moves, directions, captures, descendant } = setupSwipe();
  emit("pointerdown", 240, 100, { target: descendant, timeStamp: 0 });
  emit("pointermove", 224, 100, { target: descendant });
  emit("lostpointercapture", 224, 100, { target: descendant });
  emit("pointermove", 143, 100);
  emit("pointerup", 143, 100);
  assert.deepEqual(captures, [1]);
  assert.deepEqual(moves, [-16, -97]);
  assert.deepEqual(directions, [1]);
});

test("vertical scrolling does not capture the gesture or change the card", () => {
  const { emit, moves, directions, captures, descendant } = setupSwipe();
  emit("pointerdown", 200, 100, { target: descendant });
  emit("pointermove", 197, 116);
  emit("pointermove", 114, 165);
  emit("pointerup", 114, 165);
  assert.deepEqual(captures, []);
  assert.deepEqual(moves, []);
  assert.deepEqual(directions, []);
});
