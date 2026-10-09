import { Injectable } from '@nestjs/common';
import type { MusicProvider } from '../interfaces/music-sharing.interface';
import { SpotifyApiService } from './spotify-api.service';

@Injectable()
export class SpotifyMusicProvider implements MusicProvider {
  readonly id = 'spotify' as const;
  readonly label = 'Spotify';

  constructor(private readonly spotifyApi: SpotifyApiService) {}

  async read(
    accessToken: string
  ): Promise<{ title: string; artist: string } | null> {
    const playback = await this.spotifyApi.getCurrentlyPlaying(accessToken);
    if (!playback.isPlaying || !playback.trackName || !playback.artist)
      return null;
    return { title: playback.trackName, artist: playback.artist };
  }
}
