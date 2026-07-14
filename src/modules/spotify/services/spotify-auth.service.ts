import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SpotifyAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUriWeb: string;
  private readonly redirectUriMobile: string;
  private readonly scopes: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.getOrThrow<string>('SPOTIFY_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('SPOTIFY_CLIENT_SECRET');
    this.redirectUriWeb = this.config.getOrThrow<string>(
      'SPOTIFY_REDIRECT_URI_WEB'
    );
    this.redirectUriMobile = this.config.getOrThrow<string>(
      'SPOTIFY_REDIRECT_URI_MOBILE'
    );
    this.scopes = this.config.getOrThrow<string>('SPOTIFY_SCOPES');
  }

  getSpotifyAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUriWeb,
      scope: this.scopes,
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
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
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
        },
      }
    );

    return data.access_token;
  }

  async exchangeCodeMobile(code: string, codeVerifier: string) {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUriMobile,
      code_verifier: codeVerifier,
    });

    const { data } = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }
}
