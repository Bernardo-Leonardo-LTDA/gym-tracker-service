export interface SpotifyTrack {
  artist?: string;
  durationMs?: number;
  isPlaying: boolean;
  progressMs?: number;
  trackName?: string;
}

export interface UserPlaybackState extends SpotifyTrack {
  endsAt?: number;
  accessToken?: string;
}

export interface PlaybackSseEvent {
  data: SpotifyTrack;
}
