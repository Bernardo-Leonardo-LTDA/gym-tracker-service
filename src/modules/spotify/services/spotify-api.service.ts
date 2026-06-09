import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { SpotifyPlaybackState } from '../interfaces/spotify-api.interface';

@Injectable()
export class SpotifyApiService {
  async getCurrentlyPlaying(
    accessToken: string
  ): Promise<SpotifyPlaybackState> {
    try {
      const response = await axios.get<SpotifyPlaybackState>(
        'https://api.spotify.com/v1/me/player/currently-playing',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 204 || !response.data) {
        return {
          is_playing: false,
          item: null,
          progress_ms: 0,
        };
      }

      const data: SpotifyPlaybackState = response.data;

      return {
        is_playing: data.is_playing,
        item: data.item,
        progress_ms: data.progress_ms,
      };
    } catch (error) {
      const status =
        axios.isAxiosError(error) && error.response?.status
          ? error.response.status
          : HttpStatus.INTERNAL_SERVER_ERROR;

      throw new HttpException('Erro ao buscar status do player', status);
    }
  }
}
