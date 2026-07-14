import { Injectable, OnModuleInit } from '@nestjs/common';
import { SpotifyApiService } from './spotify-api.service';
import { Subject } from 'rxjs';
import {
  SpotifyTrack,
  UserPlaybackState,
} from '../interfaces/spotify-playback.interface';

@Injectable()
export class SpotifyPlaybackService implements OnModuleInit {
  private activePlaybacks = new Map<string, UserPlaybackState>();
  private timeouts = new Map<string, NodeJS.Timeout>();
  private intervalRef: NodeJS.Timeout | undefined;

  public playbackUpdates$ = new Subject<{ userId: string; data: any }>();

  constructor(private readonly spotifyService: SpotifyApiService) {}

  onModuleInit() {
    this.intervalRef = this.startBackgroundFallbackCheck();
  }

  onModuleDestroy() {
    clearInterval(this.intervalRef);
    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.timeouts.clear();
  }

  private startBackgroundFallbackCheck(): NodeJS.Timeout {
    return setInterval(() => {
      void (async () => {
        if (this.activePlaybacks.size === 0) return;

        for (const [userId, state] of this.activePlaybacks.entries()) {
          if (state.endsAt === 0 || !state.accessToken) continue;

          try {
            const spotifyData: SpotifyTrack =
              await this.spotifyService.getCurrentlyPlaying(state.accessToken);

            if (!spotifyData || !spotifyData.isPlaying) {
              this.activePlaybacks.delete(userId);
              this.clearUserTimeout(userId);

              this.playbackUpdates$.next({
                userId,
                data: { isPlaying: false },
              });
            } else if (spotifyData.trackName !== state.trackName) {
              void this.syncWebPlayback(userId, state.accessToken);
            }
          } catch {
            console.error(`Error in fallback check for user ${userId}`);
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

      if (!spotifyData || !spotifyData.isPlaying) {
        this.activePlaybacks.delete(userId);
        const offlineState: UserPlaybackState = {
          isPlaying: false,
        };
        this.playbackUpdates$.next({ userId, data: offlineState });
        return offlineState;
      }

      const timeLeftMs =
        (spotifyData.durationMs ?? 0) - (spotifyData.progressMs ?? 0);
      const endsAt = Date.now() + timeLeftMs;

      const state: UserPlaybackState = {
        trackName: spotifyData.trackName ?? 'Desconhecido',
        artist: spotifyData.artist ?? 'Desconhecido',
        isPlaying: spotifyData.isPlaying,
        endsAt,
        accessToken,
        progressMs: spotifyData.progressMs,
        durationMs: spotifyData.durationMs ?? 0,
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
        'Error syncing with Spotify:',
        error instanceof Error ? error.message : error
      );

      const offlineState: UserPlaybackState = {
        isPlaying: false,
      };

      return offlineState;
    }
  }

  updatePlaybackFromMobile(
    userId: string,
    mobileData: SpotifyTrack
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

  getLiveStatus(userId: string): SpotifyTrack {
    const data = this.activePlaybacks.get(userId);

    if (!data) return { isPlaying: false };

    return {
      trackName: data.trackName,
      artist: data.artist,
      isPlaying: data.isPlaying,
      progressMs: data.progressMs,
      durationMs: data.durationMs,
    };
  }

  private clearUserTimeout(userId: string) {
    if (this.timeouts.has(userId)) {
      clearTimeout(this.timeouts.get(userId));
      this.timeouts.delete(userId);
    }
  }
}
