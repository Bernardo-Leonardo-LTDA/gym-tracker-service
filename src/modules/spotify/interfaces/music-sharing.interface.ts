export type MusicProviderId = 'spotify';

export interface MusicTrack {
  title: string;
  artist: string;
  source: string;
  isPlaying: true;
  updatedAt: string;
}

export interface MusicSharingStatus {
  connected: boolean;
  enabled: boolean;
  provider: MusicProviderId | null;
  state:
    | 'disconnected'
    | 'paused'
    | 'playing'
    | 'idle'
    | 'unavailable'
    | 'permission-denied';
  music: MusicTrack | null;
}

export interface MusicProvider {
  readonly id: MusicProviderId;
  readonly label: string;
  read(accessToken: string): Promise<{ title: string; artist: string } | null>;
}
