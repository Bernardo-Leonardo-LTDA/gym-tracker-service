import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SpotifyAuthService {
  constructor(private readonly config: ConfigService) {}

  getSpotifyAuthUrl(): string {
    const clientId: string = '1f8530aa28bc4d4081ce9b4911cfe7d6';
    const redirectUri: string = 'http://127.0.0.1:3000/auth/spotify/callback';
    const scopes: string = [
      'user-read-private',
      'user-read-email',
      'user-read-currently-playing',
      'user-read-playback-state',
    ].join(' ');

    const params: URLSearchParams = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
    });

    return `https://accounts.spotify.com/authorize?${params}`;
  }

  async exchangeCodeWeb(code: string): Promise<string> {
    const clientId: string = '1f8530aa28bc4d4081ce9b4911cfe7d6';
    const clientSecret: string = '2cc93cdebd2741588a1ef7aac46b02bb';
    const redirectUri: string = 'http://127.0.0.1:3000/auth/spotify/callback';

    const params: URLSearchParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const { data } = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
    });

    return data.access_token;
  }

  async exchangeCodeMobile(code: string, codeVerifier: string) {
    const clientId: string = '1f8530aa28bc4d4081ce9b4911cfe7d6';
    const clientSecret: string = '2cc93cdebd2741588a1ef7aac46b02bb';
    const redirectUri: string = 'com.gymtracker.app://callback';

    const params: URLSearchParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const { data } = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
    });

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }
}
