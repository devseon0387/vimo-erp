'use client';

import { useParams } from 'next/navigation';
import EpisodeDetailPanel from '@/components/EpisodeDetailPanel';

export default function EpisodeDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const episodeId = params.episodeId as string;

  return <EpisodeDetailPanel projectId={projectId} episodeId={episodeId} />;
}
