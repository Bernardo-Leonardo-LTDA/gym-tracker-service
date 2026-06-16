export interface UserPlaybackState {
  trackName: string;
  artist: string;
  isPlaying: boolean;
  endsAt: number;
  accessToken: string;
  progressMs?: number;
  durationMs?: number;
}
