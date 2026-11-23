export function mountHorizontalSwipe(surface, { move, finish }) {
  let gesture;

  surface.addEventListener("pointerdown", (event) => {
    if (gesture || !event.isPrimary || event.button !== 0 || event.target.closest("a, button, input")) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, horizontal: false };
  });

  surface.addEventListener("pointermove", (event) => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        gesture = undefined;
        return;
      }
      gesture.horizontal = true;
      surface.setPointerCapture(event.pointerId);
      surface.setAttribute("data-dragging", "");
    }
    move(dx);
  });

  function end(event) {
    if (gesture?.id !== event.pointerId) return;
    const { horizontal, x, time } = gesture;
    gesture = undefined;
    if (!horizontal) return;
    const distance = event.clientX - x;
    const threshold = Math.min(74, surface.clientWidth * .24);
    const velocity = Math.abs(distance) / Math.max(1, event.timeStamp - time);
    const commit = event.type === "pointerup"
      && (Math.abs(distance) >= threshold || (Math.abs(distance) >= 30 && velocity > .48));
    surface.removeAttribute("data-dragging");
    finish(commit ? -Math.sign(distance) : 0);
  }

  for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) {
    surface.addEventListener(type, (event) => {
      if (type === "lostpointercapture" && event.target !== surface) return;
      if (type !== "pointerleave" || !gesture?.horizontal) end(event);
    });
  }
}
