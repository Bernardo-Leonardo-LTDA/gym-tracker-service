import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SpotifyAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUriWeb: string;
  private readonly redirectUriMobile: string;
  private readonly scopes = 'user-read-currently-playing';

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.getOrThrow<string>('SPOTIFY_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('SPOTIFY_CLIENT_SECRET');
    this.redirectUriWeb = this.config.getOrThrow<string>(
      'SPOTIFY_REDIRECT_URI_WEB'
    );
    this.redirectUriMobile = this.config.getOrThrow<string>(
      'SPOTIFY_REDIRECT_URI_MOBILE'
    );
  }

  getSpotifyAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUriWeb,
      scope: this.scopes,
    });
    if (state) params.set('state', state);

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  getFrontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  getMobileConfig(): { clientId: string; redirectUrl: string; scope: string } {
    return {
      clientId: this.clientId,
      redirectUrl: this.redirectUriMobile,
      scope: this.scopes,
    };
  }

  async exchangeCodeWeb(code: string): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUriWeb,
    });

    const { data } = await axios.post<{ access_token: string }>(
      'https://accounts.spotify.com/api/token',
      params,
      {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        },
      }
    );

    return data.access_token;
  }
}
