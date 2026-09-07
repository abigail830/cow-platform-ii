export type ChannelNode = {
  id: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  pipeline_id: string | null;
  transcription_pipeline_id: string | null;
  post_process_pipeline_id: string | null;
  auto_start_pipeline: boolean;
  created_at: string;
  updated_at: string;
  children: ChannelNode[];
};
