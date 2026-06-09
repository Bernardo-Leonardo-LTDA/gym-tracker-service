import { Injectable, OnModuleInit } from '@nestjs/common';
import { SpotifyApiService } from './spotify-api.service';
import { Subject } from 'rxjs';
import { UserPlaybackState } from '../interfaces/playback-manager.interface';

@Injectable()
export class PlaybackManagerService implements OnModuleInit {
  private activePlaybacks = new Map<string, UserPlaybackState>();
  private timeouts = new Map<string, NodeJS.Timeout>();

  public playbackUpdates$ = new Subject<{ userId: string; data: any }>();

  constructor(private readonly spotifyService: SpotifyApiService) {}

  onModuleInit() {
    this.startBackgroundFallbackCheck();
  }

  private startBackgroundFallbackCheck(): void {
    setInterval(() => {
      void (async () => {
        if (this.activePlaybacks.size === 0) return;

        for (const [userId, state] of this.activePlaybacks.entries()) {
          if (state.endsAt === 0) continue;

          try {
            const spotifyData = await this.spotifyService.getCurrentlyPlaying(
              state.accessToken
            );

            if (!spotifyData || !spotifyData.is_playing) {
              this.activePlaybacks.delete(userId);
              this.clearUserTimeout(userId);

              this.playbackUpdates$.next({
                userId,
                data: { isPlaying: false },
              });
            } else if (spotifyData.item?.name !== state.trackName) {
              void this.syncWebPlayback(userId, state.accessToken);
            }
          } catch {
            console.error(`Erro no fallback check do usuário ${userId}`);
          }
        }
      })();
    }, 30000);
  }

  async syncWebPlayback(
    userId: string,
    accessToken: string
  ): Promise<UserPlaybackState> {
    try {
      const spotifyData =
        await this.spotifyService.getCurrentlyPlaying(accessToken);

      if (!spotifyData || !spotifyData.is_playing) {
        this.activePlaybacks.delete(userId);
        const offlineState: UserPlaybackState = {
          isPlaying: false,
        } as UserPlaybackState;
        this.playbackUpdates$.next({ userId, data: offlineState });
        return offlineState;
      }

      const timeLeftMs =
        (spotifyData.item?.duration_ms ?? 0) - (spotifyData.progress_ms ?? 0);
      const endsAt = Date.now() + timeLeftMs;

      const state: UserPlaybackState = {
        trackName: spotifyData.item?.name ?? 'Desconhecido',
        artist:
          spotifyData.item?.artists?.map((artist) => artist.name).join(', ') ??
          'Desconhecido',
        isPlaying: spotifyData.is_playing,
        endsAt,
        accessToken,
        progressMs: spotifyData.progress_ms,
        durationMs: spotifyData.item?.duration_ms ?? 0,
      };

      this.activePlaybacks.set(userId, state);
      this.clearUserTimeout(userId);

      this.playbackUpdates$.next({
        userId,
        data: {
          trackName: state.trackName,
          artist: state.artist,
          isPlaying: state.isPlaying,
          progressMs: state.progressMs,
          durationMs: state.durationMs,
        },
      });

      const timeout = setTimeout(() => {
        void this.syncWebPlayback(userId, accessToken);
      }, timeLeftMs + 1000);

      this.timeouts.set(userId, timeout);

      return state;
    } catch (error) {
      console.log(
        'Erro ao sincronizar com Spotify:',
        error instanceof Error ? error.message : error
      );

      const offlineState: UserPlaybackState = {
        isPlaying: false,
      } as UserPlaybackState;

      return offlineState;
    }
  }

  updatePlaybackFromMobile(
    userId: string,
    mobileData: {
      trackName: string;
      artist: string;
      isPlaying: boolean;
      progressMs?: number;
      durationMs?: number;
    }
  ): UserPlaybackState {
    this.clearUserTimeout(userId);

    const state: UserPlaybackState = {
      trackName: mobileData.trackName,
      artist: mobileData.artist,
      isPlaying: mobileData.isPlaying,
      endsAt: 0,
      accessToken: '',
      progressMs: mobileData.progressMs,
      durationMs: mobileData.durationMs,
    };

    this.activePlaybacks.set(userId, state);

    this.playbackUpdates$.next({
      userId,
      data: {
        trackName: state.trackName,
        artist: state.artist,
        isPlaying: state.isPlaying,
        progressMs: state.progressMs,
        durationMs: state.durationMs,
      },
    });

    return state;
  }

  getLiveStatus(userId: string): UserPlaybackState {
    const data = this.activePlaybacks.get(userId);

    if (!data) return { isPlaying: false } as UserPlaybackState;

    return {
      trackName: data.trackName,
      artist: data.artist,
      isPlaying: data.isPlaying,
      progressMs: data.progressMs,
      durationMs: data.durationMs,
    } as UserPlaybackState;
  }

  private clearUserTimeout(userId: string) {
    if (this.timeouts.has(userId)) {
      clearTimeout(this.timeouts.get(userId));
      this.timeouts.delete(userId);
    }
  }
}
