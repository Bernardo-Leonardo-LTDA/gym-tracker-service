import { Body, Controller, Get, Post, Query, Res, Sse } from '@nestjs/common';
import type { Response } from 'express';
import { PlaybackManagerService } from './services/playback-manager.service';
import { filter, map, merge, Observable, of } from 'rxjs';
import { SpotifyAuthService } from './services/spotify-auth.service';

@Controller('spotify')
export class SpotifyController {
  private tempAccessToken = '';
  private readonly userId = 'meu-usuario-teste';
  private readonly frontendUrl =
    process.env.FRONTEND_URL ?? 'http://localhost:5173';

  constructor(
    private readonly spotifyAuthService: SpotifyAuthService,
    private readonly playbackManager: PlaybackManagerService
  ) {}

  private buildState(returnTo?: string): string {
    const payload = {
      returnTo: returnTo && returnTo.startsWith('/') ? returnTo : '/',
    };
    return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  }

  private readReturnTo(state?: string): string {
    if (!state) return '/';

    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf-8');
      const payload = JSON.parse(decoded) as { returnTo?: string };
      return payload.returnTo && payload.returnTo.startsWith('/')
        ? payload.returnTo
        : '/';
    } catch (error) {
      console.error(
        'Error decoding Spotify return state:',
        error instanceof Error ? error.message : error
      );
      return '/';
    }
  }

  private buildFrontendRedirect(returnTo: string, status: 'success' | 'error') {
    const url = new URL(returnTo, this.frontendUrl);
    url.searchParams.set('spotify', status);
    return url.toString();
  }

  @Get('login')
  login(@Query('returnTo') returnTo: string | undefined, @Res() res: Response) {
    const state = this.buildState(returnTo);
    const url = this.spotifyAuthService.getAuthorizationUrl(state);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string | undefined,
    @Res() res: Response
  ) {
    const returnTo = this.readReturnTo(state);

    try {
      const tokens = await this.spotifyAuthService.exchangeCodeForTokens(code);
      this.tempAccessToken = tokens.accessToken;
      return res.redirect(this.buildFrontendRedirect(returnTo, 'success'));
    } catch {
      return res.redirect(this.buildFrontendRedirect(returnTo, 'error'));
    }
  }

  @Get('sync-web')
  async syncWeb(): Promise<any> {
    return this.playbackManager.syncWebPlayback(
      this.userId,
      this.tempAccessToken
    );
  }

  @Post('track-changed')
  mobileUpdate(
    @Body() body: { trackName: string; artist: string; isPlaying: boolean }
  ): any {
    return this.playbackManager.updatePlaybackFromMobile(this.userId, body);
  }

  @Sse('status-stream')
  statusStream(@Query('userId') userId: string): Observable<{ data: any }> {
    const initial$ = of({ data: this.playbackManager.getLiveStatus(userId) });
    const updates$ = this.playbackManager.playbackUpdates$.pipe(
      filter((update) => update.userId === userId),
      map((update) => ({ data: update.data as Record<string, unknown> }))
    );
    return merge(initial$, updates$);
  }
}
