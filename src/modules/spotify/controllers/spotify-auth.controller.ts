import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SpotifyAuthService } from '../services/spotify-auth.service';

@Controller('auth/spotify')
export class SpotifyAuthController {
  constructor(private readonly authService: SpotifyAuthService) {}

  @Get('mobile-config')
  mobileConfig() {
    return this.authService.getMobileConfig();
  }

  @Get('login')
  spotifyLogin(
    @Query('state') state: string | undefined,
    @Res() res: Response
  ) {
    res.redirect(this.authService.getSpotifyAuthUrl(state));
  }

  @Get('callback')
  async spotifyCallbackWeb(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response
  ) {
    const frontend = new URL('/active', this.authService.getFrontendUrl());
    if (error || !code) {
      frontend.hash = new URLSearchParams({
        spotify_error: error ?? 'missing_code',
        state: state ?? '',
      }).toString();
    } else {
      try {
        const accessToken = await this.authService.exchangeCodeWeb(code);
        frontend.hash = new URLSearchParams({
          spotify_access_token: accessToken,
          state: state ?? '',
        }).toString();
      } catch {
        // Axios errors may contain the client secret or authorization code.
        // Return a recoverable error to the app without logging those credentials.
        frontend.hash = new URLSearchParams({
          spotify_error: 'token_exchange_failed',
          state: state ?? '',
        }).toString();
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(frontend.toString());
  }
}
