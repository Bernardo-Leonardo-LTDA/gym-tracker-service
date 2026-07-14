import { Body, Controller, Post, Query, Sse } from '@nestjs/common';
import { SpotifyPlaybackService } from '../services/spotify-playback.service';
import type { PlaybackSseEvent } from '../interfaces/spotify-playback.interface';
import { filter, map, merge, Observable, of } from 'rxjs';

@Controller('spotify/web')
export class SpotifyWebApiController {
  constructor(private readonly spotifyPlayback: SpotifyPlaybackService) {}

  @Post('sync')
  syncWeb(@Body() body: { accessToken: string; userId: string }): void {
    void this.spotifyPlayback.syncWebPlayback(body.userId, body.accessToken);
  }

  @Sse('status-stream')
  statusStream(@Query('userId') userId: string): Observable<PlaybackSseEvent> {
    const initial$ = of({ data: this.spotifyPlayback.getLiveStatus(userId) });
    const updates$ = this.spotifyPlayback.playbackUpdates$.pipe(
      filter((update) => update.userId === userId),
      map((update) => ({ data: update.data as PlaybackSseEvent['data'] }))
    );
    return merge(initial$, updates$);
  }
}
