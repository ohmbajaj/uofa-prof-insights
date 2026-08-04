import type { ProfessorData } from '@shared/types';
import type { DetectedInstructor } from './detector';

// TODO(Phase 1): render Badge/Skeleton into each anchor, ideally inside a
// shadow root so UAccess's PeopleSoft stylesheets cannot bleed into our UI.

export function injectSkeleton(_target: DetectedInstructor): void {
  // TODO(Phase 1)
}

export function injectBadge(_target: DetectedInstructor, _data: ProfessorData | null): void {
  // TODO(Phase 1)
}

export function removeAllBadges(): void {
  // TODO(Phase 1)
}
