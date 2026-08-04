import { CARD_TAG, UPICard, defineCard } from './components/PopupCard';
import type { ProfessorData } from '@shared/types';

/**
 * Owns the single detail card. Only one is ever open, so clicking a second
 * badge moves the card rather than stacking a new one.
 */
let openCard: UPICard | null = null;
let openAnchor: HTMLElement | null = null;
let detach: (() => void) | null = null;

const CARD_WIDTH = 268;
const GAP = 6;
const MARGIN = 8;

/**
 * Places the card just below its badge, in document coordinates.
 *
 * `position: absolute` plus page offsets keeps it pinned to the badge while
 * UAccess scrolls; `position: fixed` would leave it floating in place. The
 * horizontal clamp stops a badge near the right edge from pushing the card
 * off-screen.
 */
export function computePosition(
  anchor: DOMRect,
  viewportWidth: number,
  scrollX: number,
  scrollY: number,
): { left: number; top: number } {
  const preferred = anchor.left + scrollX;
  const maxLeft = scrollX + viewportWidth - CARD_WIDTH - MARGIN;
  const minLeft = scrollX + MARGIN;

  return {
    left: Math.round(Math.max(minLeft, Math.min(preferred, maxLeft))),
    top: Math.round(anchor.bottom + scrollY + GAP),
  };
}

export function closeCard(): void {
  detach?.();
  detach = null;
  openCard?.remove();
  openCard = null;
  openAnchor = null;
}

/**
 * Closes the card if its badge has left the page — otherwise a new search
 * would leave a card floating with no anchor.
 */
export function closeCardIfOrphaned(): void {
  if (openAnchor && !openAnchor.isConnected) closeCard();
}

export function getOpenCard(): UPICard | null {
  return openCard;
}

/**
 * Opens (or moves) the detail card for `data`, anchored to `anchor`.
 * Clicking the same badge again closes it.
 */
export function openCardFor(anchor: HTMLElement, data: ProfessorData): UPICard | null {
  const doc = anchor.ownerDocument;
  const win = doc.defaultView;
  if (!win) return null;

  // Toggle off when the same badge is clicked twice.
  if (openCard && openCard.dataset.upiAnchorId === anchorId(anchor)) {
    closeCard();
    return null;
  }

  closeCard();
  defineCard(win as Window & typeof globalThis);

  const card = doc.createElement(CARD_TAG) as UPICard;
  card.dataset.upiAnchorId = anchorId(anchor);
  card.data = data;

  const { left, top } = computePosition(
    anchor.getBoundingClientRect(),
    win.innerWidth,
    win.scrollX,
    win.scrollY,
  );
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;

  doc.body.appendChild(card);
  openCard = card;
  openAnchor = anchor;

  const onPointerDown = (event: Event) => {
    const target = event.target as Node | null;
    // composedPath is needed because the click originates inside a shadow root.
    const path = (event as PointerEvent).composedPath?.() ?? [];
    if (path.includes(card) || path.includes(anchor)) return;
    if (target && (card.contains(target) || anchor.contains(target))) return;
    closeCard();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeCard();
  };

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('keydown', onKeyDown, true);

  detach = () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown, true);
  };

  return card;
}

let nextAnchorId = 0;

/** Stable per-element id, assigned lazily, used only to detect a re-click. */
function anchorId(anchor: HTMLElement): string {
  if (!anchor.dataset.upiAnchorId) {
    nextAnchorId += 1;
    anchor.dataset.upiAnchorId = String(nextAnchorId);
  }
  return anchor.dataset.upiAnchorId;
}

/** Test seam. */
export function resetCardState(): void {
  closeCard();
  nextAnchorId = 0;
}
