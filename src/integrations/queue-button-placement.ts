const BUTTON_WIDTH = 108;
const BUTTON_HEIGHT = 36;
const GAP = 12;

/** Keep extension controls outside the provider's React-owned send controls. */
export function placeQueueButton(anchor: Element, shadowHost: Element): void {
  const host = shadowHost as HTMLElement;
  const composer = anchor.closest("form") ?? anchor;
  const bounds = composer.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
  const viewportRight = viewportLeft + viewportWidth;
  const beside =
    viewportWidth >= 768 &&
    bounds.right + GAP + BUTTON_WIDTH <= viewportRight - GAP;

  host.dataset.placement = beside ? "beside" : "above";
  const styles: Record<string, string> = {
    display: bounds.width > 0 && bounds.height > 0 ? "flex" : "none",
    "box-sizing": "border-box",
    "justify-content": "flex-end",
    flex: "none",
    position: beside ? "fixed" : "relative",
    width: beside ? `${BUTTON_WIDTH}px` : "100%",
    "max-width": beside ? `${BUTTON_WIDTH}px` : "100%",
    height: beside ? `${BUTTON_HEIGHT}px` : "auto",
    "padding-bottom": beside ? "0" : "8px",
    left: beside ? `${bounds.right + GAP}px` : "auto",
    top: beside
      ? `${bounds.top + (bounds.height - BUTTON_HEIGHT) / 2}px`
      : "auto",
    "z-index": beside ? "51" : "auto",
  };
  for (const [property, value] of Object.entries(styles)) {
    if (host.style.getPropertyValue(property) !== value) {
      host.style.setProperty(property, value, "important");
    }
  }

  if (beside) {
    // Containment on the composer can offset fixed viewport coordinates.
    if (host.parentElement !== document.body) document.body.append(host);
  } else if (composer.matches("form")) {
    // Reserve a real row so the button cannot cover text or native controls.
    if (host.nextElementSibling !== composer) composer.before(host);
  } else if (
    host.parentElement !== composer ||
    composer.firstElementChild !== host
  ) {
    composer.prepend(host);
  }
}
