import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type {
  MusicProvider,
  MusicProviderId,
  MusicSharingStatus,
  MusicTrack,
} from '../interfaces/music-sharing.interface';
import { SpotifyMusicProvider } from './spotify-music.provider';
import { Subject } from 'rxjs';

const MAX_TRACK_AGE_MS = 90_000;
type MusicFailure = 'unavailable' | 'permission-denied' | 'reconnect-required';
export interface MusicCheckInSession {
  checkInId: string;
  expiresAt: number;
}

interface Connection extends MusicCheckInSession {
  provider: MusicProvider;
  accessToken: string;
  enabled: boolean;
  checkedAt: number;
  music: MusicTrack | null;
  failure: MusicFailure | null;
  revision: number;
}

@Injectable()
export class MusicSharingService implements OnModuleInit, OnModuleDestroy {
  readonly changes = new Subject<string>();
  private readonly connections = new Map<string, Connection>();
  private readonly refreshing = new Set<string>();
  private readonly connectAttempts = new Map<
    string,
    { attempt: symbol; session: MusicCheckInSession }
  >();
  private readonly revokedCheckIns = new Map<string, number>();
  private readonly providers: Map<MusicProviderId, MusicProvider>;
  private interval?: NodeJS.Timeout;

  constructor(spotify: SpotifyMusicProvider) {
    this.providers = new Map([[spotify.id, spotify]]);
  }

  onModuleInit(): void {
    this.interval = setInterval(() => {
      for (const userId of this.connections.keys()) void this.refresh(userId);
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.connections.clear();
    this.connectAttempts.clear();
    this.revokedCheckIns.clear();
    this.changes.complete();
  }

  async connect(
    userId: string,
    providerId: MusicProviderId,
    accessToken: string,
    session: MusicCheckInSession
  ): Promise<MusicSharingStatus> {
    const provider = this.providers.get(providerId);
    if (!provider || typeof accessToken !== 'string' || !accessToken.trim()) {
      throw new BadRequestException(
        'A supported music provider and access token are required'
      );
    }
    if (!this.sessionIsActive(session))
      throw new BadRequestException('Check-in session expired');
    // Validate the token before enabling sharing. A failed connection never publishes music.
    const attempt = Symbol();
    this.connectAttempts.set(userId, { attempt, session });
    let playback: { title: string; artist: string } | null;
    try {
      playback = await this.readForRequest(provider, accessToken);
    } catch (error) {
      if (this.connectAttempts.get(userId)?.attempt === attempt)
        this.connectAttempts.delete(userId);
      throw error;
    }
    if (
      this.connectAttempts.get(userId)?.attempt !== attempt ||
      !this.sessionIsActive(session)
    ) {
      if (this.connectAttempts.get(userId)?.attempt === attempt)
        this.connectAttempts.delete(userId);
      return this.getStatus(userId, session.checkInId);
    }
    this.connectAttempts.delete(userId);
    const now = Date.now();
    this.connections.set(userId, {
      provider,
      accessToken,
      enabled: true,
      ...session,
      checkedAt: now,
      music: playback ? this.asTrack(provider, playback, now) : null,
      failure: null,
      revision: 0,
    });
    this.changes.next(userId);
    return this.getStatus(userId, session.checkInId);
  }

  async resume(
    userId: string,
    checkInId?: string
  ): Promise<MusicSharingStatus> {
    const connection = this.getConnection(userId);
    if (!connection || (checkInId && connection.checkInId !== checkInId))
      throw new BadRequestException('Connect a music provider first');
    const revision = ++connection.revision;
    connection.enabled = false;
    connection.music = null;
    this.changes.next(userId);
    // Keep sharing off if the provider is unavailable or its token has expired.
    const playback = await this.readForRequest(
      connection.provider,
      connection.accessToken
    );
    if (
      this.connections.get(userId) !== connection ||
      connection.revision !== revision ||
      !this.sessionIsActive(connection)
    )
      return this.getStatus(userId, checkInId);
    const now = Date.now();
    connection.enabled = true;
    connection.checkedAt = now;
    connection.music = playback
      ? this.asTrack(connection.provider, playback, now)
      : null;
    connection.failure = null;
    this.changes.next(userId);
    return this.getStatus(userId);
  }

  disable(userId: string, checkInId?: string): MusicSharingStatus {
    if (
      !checkInId ||
      this.connectAttempts.get(userId)?.session.checkInId === checkInId
    )
      this.connectAttempts.delete(userId);
    const connection = this.getConnection(userId);
    if (connection && (!checkInId || connection.checkInId === checkInId)) {
      connection.revision++;
      connection.enabled = false;
      connection.music = null;
    }
    this.changes.next(userId);
    return this.getStatus(userId, checkInId);
  }

  disconnect(userId: string, checkInId?: string): MusicSharingStatus {
    if (
      !checkInId ||
      this.connectAttempts.get(userId)?.session.checkInId === checkInId
    )
      this.connectAttempts.delete(userId);
    if (!checkInId || this.connections.get(userId)?.checkInId === checkInId)
      this.connections.delete(userId);
    this.changes.next(userId);
    return this.getStatus(userId, checkInId);
  }

  expireCheckIn(userId: string, checkInId: string, expiresAt: number): void {
    // Remember early checkout until the session's deadline, including requests
    // whose database authorization started before checkout completed.
    if (expiresAt > Date.now()) this.revokedCheckIns.set(checkInId, expiresAt);
    this.disconnect(userId, checkInId);
  }

  getPresence(userId: string, checkInId?: string): MusicTrack | null {
    const connection = this.getConnection(userId);
    if (
      !connection?.enabled ||
      (checkInId && connection.checkInId !== checkInId) ||
      connection.failure ||
      Date.now() - connection.checkedAt > MAX_TRACK_AGE_MS
    ) {
      return null;
    }
    return connection.music;
  }

  getStatus(userId: string, checkInId?: string): MusicSharingStatus {
    const connection = this.getConnection(userId);
    if (!connection || (checkInId && connection.checkInId !== checkInId))
      return {
        connected: false,
        enabled: false,
        provider: null,
        state: 'disconnected',
        music: null,
      };
    if (!connection.enabled)
      return {
        connected: true,
        enabled: false,
        provider: connection.provider.id,
        state: 'paused',
        music: null,
      };
    const music = this.getPresence(userId, checkInId);
    const stale = Date.now() - connection.checkedAt > MAX_TRACK_AGE_MS;
    return {
      connected: true,
      enabled: true,
      provider: connection.provider.id,
      state:
        connection.failure ??
        (stale ? 'unavailable' : music ? 'playing' : 'idle'),
      music,
    };
  }

  private getConnection(userId: string): Connection | undefined {
    const connection = this.connections.get(userId);
    if (connection && !this.sessionIsActive(connection)) {
      this.connections.delete(userId);
      return undefined;
    }
    return connection;
  }

  private sessionIsActive(session: MusicCheckInSession): boolean {
    const now = Date.now();
    for (const [id, expiry] of this.revokedCheckIns) {
      if (expiry <= now) this.revokedCheckIns.delete(id);
    }
    return (
      session.expiresAt > now && !this.revokedCheckIns.has(session.checkInId)
    );
  }

  private async refresh(userId: string): Promise<void> {
    const connection = this.getConnection(userId);
    if (
      !connection?.enabled ||
      connection.failure === 'reconnect-required' ||
      this.refreshing.has(userId)
    )
      return;
    const revision = connection.revision;
    this.refreshing.add(userId);
    try {
      const playback = await connection.provider.read(connection.accessToken);
      if (
        this.connections.get(userId) !== connection ||
        !connection.enabled ||
        connection.revision !== revision ||
        !this.sessionIsActive(connection)
      )
        return;
      const now = Date.now();
      const changed =
        connection.failure !== null ||
        connection.music?.title !== playback?.title ||
        connection.music?.artist !== playback?.artist;
      connection.checkedAt = now;
      connection.failure = null;
      // An unchanged track needs no broadcast; viewers already have it.
      if (!changed) return;
      connection.music = playback
        ? this.asTrack(connection.provider, playback, now)
        : null;
      this.changes.next(userId);
    } catch (error) {
      if (
        this.connections.get(userId) === connection &&
        connection.enabled &&
        connection.revision === revision &&
        this.sessionIsActive(connection)
      ) {
        const failure = this.failureFor(error);
        const changed =
          connection.failure !== failure || connection.music !== null;
        connection.music = null;
        connection.failure = failure;
        if (changed) this.changes.next(userId);
      }
    } finally {
      this.refreshing.delete(userId);
    }
  }

  private failureFor(error: unknown): MusicFailure {
    if (!(error instanceof HttpException)) return 'unavailable';
    // Spotify answers 401 once the access token expires. Refresh tokens are not
    // kept, so polling cannot recover until the user connects again.
    if (error.getStatus() === 401) return 'reconnect-required';
    if (error.getStatus() === 403) return 'permission-denied';
    return 'unavailable';
  }

  // Provider auth failures must not reach clients as 401/403: on check-in
  // routes those statuses mean the check-in session itself was rejected.
  private async readForRequest(
    provider: MusicProvider,
    accessToken: string
  ): Promise<{ title: string; artist: string } | null> {
    try {
      return await provider.read(accessToken);
    } catch (error) {
      const failure = this.failureFor(error);
      if (failure === 'unavailable')
        throw new BadGatewayException('Music provider is unavailable');
      throw new BadRequestException({
        message: 'Music provider rejected the access token',
        reason: failure,
      });
    }
  }

  private asTrack(
    provider: MusicProvider,
    playback: { title: string; artist: string },
    now: number
  ): MusicTrack {
    return {
      ...playback,
      source: provider.label,
      isPlaying: true,
      updatedAt: new Date(now).toISOString(),
    };
  }
}
