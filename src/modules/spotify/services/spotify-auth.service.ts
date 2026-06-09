import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import {
  SpotifyAuthResponse,
  SpotifyTokenApiResponse,
} from '../interfaces/spotify-auth.interface';

@Injectable()
export class SpotifyAuthService {
  constructor() {
    if (
      !process.env.SPOTIFY_CLIENT_ID ||
      !process.env.SPOTIFY_CLIENT_SECRET ||
      !process.env.SPOTIFY_REDIRECT_URI
    ) {
      throw new Error(
        'Variáveis de ambiente do Spotify não foram configuradas no .env!'
      );
    }
  }

  private clientId = process.env.SPOTIFY_CLIENT_ID;
  private clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  private redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  getAuthorizationUrl(state?: string): string {
    const scopes = ['user-read-currently-playing', 'user-read-playback-state'];

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId!,
      scope: scopes.join(' '),
      redirect_uri: this.redirectUri!,
    });

    if (state) {
      params.set('state', state);
    }

    return `https://accounts.spotify.com/authorize?` + params.toString();
  }

  async exchangeCodeForTokens(code: string): Promise<SpotifyAuthResponse> {
    const authHeader = Buffer.from(
      `${this.clientId!}:${this.clientSecret!}`
    ).toString('base64');

    try {
      const response = await axios.post<SpotifyTokenApiResponse>(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri!,
        }),
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const data = response.data;

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? '',
        expiresIn: data.expires_in,
        tokenType: data.token_type,
        scope: data.scope,
      };
    } catch (error) {
      const status =
        axios.isAxiosError(error) && error.response?.status
          ? error.response.status
          : HttpStatus.BAD_REQUEST;

      throw new HttpException('Falha ao obter tokens do Spotify', status);
    }
  }
}
