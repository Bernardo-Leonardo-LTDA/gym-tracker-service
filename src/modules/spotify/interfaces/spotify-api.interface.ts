interface SpotifyArtist {
  name: string;
}

interface SpotifyAlbum {
  name: string;
}

interface SpotifyTrackItem {
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
}

export interface SpotifyPlaybackState {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyTrackItem | null;
}
