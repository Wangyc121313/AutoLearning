export interface Transcriber {
  transcribe(audioPath: string): Promise<string>;
}

export { WhisperTranscriber } from './whisper';
export { AlibabaTranscriber } from './alibaba';
export { LocalWhisperTranscriber } from './local-whisper';
