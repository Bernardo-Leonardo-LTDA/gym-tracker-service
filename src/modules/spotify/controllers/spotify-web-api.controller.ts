import { Body, Controller, Post, Query, Sse } from '@nestjs/common';
import type { UserPlaybackState } from '../interfaces/spotify-playback.interface';
import { SpotifyPlaybackService } from '../services/spotify-playback.service';
import { filter, map, merge, Observable, of } from 'rxjs';

@Controller('spotify/web')
export class SpotifyWebApiController {
  constructor(private readonly spotifyPlayback: SpotifyPlaybackService) {}

  @Post('sync')
  async syncWeb(
    @Body() body: { accessToken: string; userId: string }
  ): Promise<UserPlaybackState> {
    return this.spotifyPlayback.syncWebPlayback(body.userId, body.accessToken);
  }

  @Sse('status-stream')
  statusStream(@Query('userId') userId: string): Observable<{ data: any }> {
    const initial$ = of({ data: this.spotifyPlayback.getLiveStatus(userId) });
    const updates$ = this.spotifyPlayback.playbackUpdates$.pipe(
      filter((update) => update.userId === userId),
      map((update) => ({ data: update.data as Record<string, unknown> }))
    );
    return merge(initial$, updates$);
  }
}
