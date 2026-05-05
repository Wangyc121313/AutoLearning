export interface StructuredContent {
  title: string;
  content: string;
  sourceUrl: string;
  metadata: {
    type: 'text' | 'video';
    wordCount: number;
    fetchedAt: Date;
  };
}

export interface FetchResult {
  rawText: string;
  title: string;
}

export interface NoteOutput {
  markdown: string;
  filePath: string;
}
