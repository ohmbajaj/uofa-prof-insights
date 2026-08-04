/**
 * Shimmer placeholder shared by the shadow-DOM components.
 *
 * The Badge draws its own inline skeleton (it has to stay the size of a rating
 * pill); this is the block variant used by the sidebar while a batch of lookups
 * is still in flight.
 */

export const SKELETON_STYLES = `
  .upi-skeleton {
    display: block;
    border-radius: 3px;
    background: linear-gradient(90deg, #e8e8e8 25%, #f4f4f4 37%, #e8e8e8 63%);
    background-size: 400% 100%;
    animation: upi-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes upi-shimmer {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .upi-skeleton { animation: none; }
  }
`;

export interface SkeletonOptions {
  width?: string;
  height?: string;
}

/** Builds one shimmer bar. `doc` matters so the node belongs to the right frame. */
export function createSkeleton(doc: Document, options: SkeletonOptions = {}): HTMLElement {
  const bar = doc.createElement('div');
  bar.className = 'upi-skeleton';
  bar.setAttribute('aria-hidden', 'true');
  bar.style.width = options.width ?? '100%';
  bar.style.height = options.height ?? '1em';
  return bar;
}

/** Builds `count` stacked shimmer bars inside a wrapper. */
export function createSkeletonList(doc: Document, count: number): HTMLElement {
  const wrapper = doc.createElement('div');
  wrapper.setAttribute('role', 'status');
  wrapper.setAttribute('aria-label', 'Loading professor ratings');

  for (let i = 0; i < count; i++) {
    const bar = createSkeleton(doc, { height: '2.4em' });
    bar.style.marginBottom = '8px';
    wrapper.appendChild(bar);
  }

  return wrapper;
}
