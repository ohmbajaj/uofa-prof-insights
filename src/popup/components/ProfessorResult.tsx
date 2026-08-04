import type { ProfessorData } from '@shared/types';

/** TODO(Phase 1): render a single search hit in the popup. */
export default function ProfessorResult({ data }: { data: ProfessorData }) {
  return <li>{data.name}</li>;
}
