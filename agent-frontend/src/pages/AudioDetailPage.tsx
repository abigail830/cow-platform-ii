import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AudioSegmentDetailContent } from '../components/AudioSegmentDetailContent.tsx';
import { iconProps } from '../components/icons/icon-props.ts';
import { useAudioOutletContext } from './AudioOutletContext.tsx';

export function AudioDetailPage() {
  const { audioId } = useParams<{ audioId: string }>();
  const { setSelectedChannelId } = useAudioOutletContext();

  if (!audioId) {
    return <p className="admin-error">Audio not found</p>;
  }

  return (
    <div className="document-detail-page audio-detail-page">
      <div className="document-detail-toolbar">
        <Link to="/knowledge/audio" className="document-detail-back">
          <ArrowLeft {...iconProps({ size: 16 })} aria-hidden />
          Back to list
        </Link>
      </div>

      <AudioSegmentDetailContent
        audioId={audioId}
        onAudioLoaded={(audio) => setSelectedChannelId(audio.channel_id)}
      />
    </div>
  );
}
