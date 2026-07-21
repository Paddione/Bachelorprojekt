export interface MovieJobPayload {
  inputPath: string;
  movieId?: string;
  rootKey?: string;
  autoOrganize?: boolean;
  baseDir?: string;
}

export interface MovieMetadata {
  title: string;
  year?: number;
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  codec: string;
  fps: number;
  aspectRatio: string;
  fileSize: number;
}
