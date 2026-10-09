interface SpotifyArtist {
  name: string;
}

interface SpotifyTrackItem {
  name: string;
  artists: SpotifyArtist[];
}

export interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  item: SpotifyTrackItem | null;
}
export interface SpotifyTrack {
  artist?: string;
  isPlaying: boolean;
  trackName?: string;
}
