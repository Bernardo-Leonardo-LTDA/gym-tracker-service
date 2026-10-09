import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import type {
  SpotifyCurrentlyPlaying,
  SpotifyTrack,
} from '../interfaces/spotify-api.interface';

@Injectable()
export class SpotifyApiService {
  async getCurrentlyPlaying(accessToken: string): Promise<SpotifyTrack> {
    try {
      const response = await axios.get<SpotifyCurrentlyPlaying>(
        'https://api.spotify.com/v1/me/player/currently-playing',
        {
          timeout: 10_000,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 204 || !response.data) {
        return {
          isPlaying: false,
        };
      }

      const data: SpotifyCurrentlyPlaying = response.data;

      return {
        isPlaying: data.is_playing,
        trackName: data.item?.name,
        artist: data.item?.artists?.map((artist) => artist.name).join(', '),
      };
    } catch (error) {
      const status =
        axios.isAxiosError(error) && error.response?.status
          ? error.response.status
          : HttpStatus.INTERNAL_SERVER_ERROR;

      throw new HttpException('Failed to fetch player status', status);
    }
  }
}
