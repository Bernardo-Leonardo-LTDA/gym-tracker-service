import { MusicSharingService } from './music-sharing.service';
import { SpotifyMusicProvider } from './spotify-music.provider';
import { HttpException } from '@nestjs/common';

describe('MusicSharingService', () => {
  const provider = {
    id: 'spotify' as const,
    label: 'Spotify',
    read: jest.fn(),
  };
  let service: MusicSharingService;
  const session = (expiresAt = Date.now() + 12 * 60 * 60 * 1000) => ({
    checkInId: 'checkin-1',
    expiresAt,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    provider.read.mockReset();
    service = new MusicSharingService(
      provider as unknown as SpotifyMusicProvider
    );
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('rejects malformed credentials before contacting the provider', async () => {
    await expect(
      service.connect('user-1', 'spotify', 123 as unknown as string, session())
    ).rejects.toMatchObject({ status: 400 });
    expect(provider.read).not.toHaveBeenCalled();
    expect(service.getPresence('user-1')).toBeNull();
  });

  it('publishes only a current track after explicit connection and clears it on opt-out', async () => {
    provider.read.mockResolvedValue({ title: 'Song', artist: 'Artist' });
    expect(service.getPresence('user-1')).toBeNull();

    const connected = await service.connect(
      'user-1',
      'spotify',
      'secret-token',
      session()
    );
    expect(connected.state).toBe('playing');
    expect(service.getPresence('user-1')).toEqual({
      title: 'Song',
      artist: 'Artist',
      source: 'Spotify',
      isPlaying: true,
      updatedAt: '2026-10-05T12:00:00.000Z',
    });
    expect(JSON.stringify(connected)).not.toContain('secret-token');

    expect(service.disable('user-1')).toMatchObject({
      connected: true,
      enabled: false,
      music: null,
    });
    expect(service.getPresence('user-1')).toBeNull();
    await service.resume('user-1');
    expect(service.getPresence('user-1')?.title).toBe('Song');
    service.disconnect('user-1');
    expect(service.getPresence('user-1')).toBeNull();
  });

  it('shows no track when playback stops or provider errors', async () => {
    provider.read
      .mockResolvedValueOnce({ title: 'Song', artist: 'Artist' })
      .mockResolvedValueOnce(null);
    await service.connect('user-1', 'spotify', 'secret-token', session());
    await jest.advanceTimersByTimeAsync(30_000);
    expect(service.getStatus('user-1')).toMatchObject({
      state: 'idle',
      music: null,
    });

    provider.read.mockRejectedValueOnce(new Error('permission denied'));
    await jest.advanceTimersByTimeAsync(30_000);
    expect(service.getStatus('user-1')).toMatchObject({
      state: 'unavailable',
      music: null,
    });
  });

  it('does not publish a track when Spotify later denies access', async () => {
    provider.read
      .mockResolvedValueOnce({ title: 'Song', artist: 'Artist' })
      .mockRejectedValueOnce(new HttpException('Forbidden', 403));
    await service.connect('user-1', 'spotify', 'secret-token', session());
    await jest.advanceTimersByTimeAsync(30_000);
    expect(service.getStatus('user-1')).toMatchObject({
      state: 'permission-denied',
      music: null,
    });
  });

  it('asks for reconnection and stops polling once the Spotify token expires', async () => {
    provider.read
      .mockResolvedValueOnce({ title: 'Song', artist: 'Artist' })
      .mockRejectedValueOnce(new HttpException('Unauthorized', 401));
    await service.connect('user-1', 'spotify', 'secret-token', session());
    await jest.advanceTimersByTimeAsync(30_000);
    expect(service.getStatus('user-1')).toMatchObject({
      state: 'reconnect-required',
      music: null,
    });
    await jest.advanceTimersByTimeAsync(90_000);
    expect(provider.read).toHaveBeenCalledTimes(2);
  });

  it('does not report a rejected Spotify token as a 401 on gym routes', async () => {
    provider.read.mockRejectedValueOnce(new HttpException('Unauthorized', 401));
    await expect(
      service.connect('user-1', 'spotify', 'secret-token', session())
    ).rejects.toMatchObject({ status: 400 });
  });

  it('publishes refreshes only on track changes or before a track goes stale', async () => {
    provider.read.mockResolvedValue({ title: 'Song', artist: 'Artist' });
    await service.connect('user-1', 'spotify', 'secret-token', session());
    const changes = jest.fn();
    service.changes.subscribe(changes);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(changes).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(service.getPresence('user-1')?.updatedAt).toBe(
      new Date().toISOString()
    );
    provider.read.mockResolvedValue({ title: 'Next', artist: 'Artist' });
    await jest.advanceTimersByTimeAsync(30_000);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('does not republish idle playback', async () => {
    provider.read.mockResolvedValue(null);
    await service.connect('user-1', 'spotify', 'secret-token', session());
    const changes = jest.fn();
    service.changes.subscribe(changes);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(changes).not.toHaveBeenCalled();
  });

  it('does not revive a disconnected track after an in-flight refresh', async () => {
    let finish!: (value: { title: string; artist: string }) => void;
    provider.read
      .mockResolvedValueOnce({ title: 'First', artist: 'Artist' })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
    await service.connect('user-1', 'spotify', 'secret-token', session());
    jest.advanceTimersByTime(30_000);
    service.disconnect('user-1');
    finish({ title: 'Second', artist: 'Artist' });
    await Promise.resolve();
    expect(service.getStatus('user-1').state).toBe('disconnected');
  });

  it('does not enable sharing after opt-out interrupts a pending connection', async () => {
    let finish!: (value: { title: string; artist: string }) => void;
    provider.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const connecting = service.connect(
      'user-1',
      'spotify',
      'secret-token',
      session()
    );
    service.disable('user-1');
    finish({ title: 'Song', artist: 'Artist' });
    await connecting;
    expect(service.getStatus('user-1').state).toBe('disconnected');
  });

  it('expires inactive connections and never returns stale tracks', async () => {
    provider.read.mockResolvedValue({ title: 'Song', artist: 'Artist' });
    await service.connect('user-1', 'spotify', 'secret-token', session());
    jest.setSystemTime(new Date('2026-10-05T12:01:31Z'));
    expect(service.getPresence('user-1')).toBeNull();
    expect(service.getStatus('user-1').state).toBe('unavailable');
    jest.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    expect(service.getStatus('user-1').state).toBe('disconnected');
  });

  it.each(['success', 'failure'])(
    'ignores a pre-opt-out refresh after resuming (%s)',
    async (outcome) => {
      let resolveOld!: (value: { title: string; artist: string }) => void;
      let rejectOld!: (error: Error) => void;
      provider.read
        .mockResolvedValueOnce({ title: 'Initial', artist: 'Artist' })
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolveOld = resolve;
              rejectOld = reject;
            })
        )
        .mockResolvedValueOnce({
          title: 'Current after resume',
          artist: 'Artist',
        });
      await service.connect('user-1', 'spotify', 'secret-token', session());
      jest.advanceTimersByTime(30_000);
      service.disable('user-1');
      await service.resume('user-1');
      if (outcome === 'success')
        resolveOld({ title: 'Old before opt-out', artist: 'Artist' });
      else rejectOld(new Error('old failure'));
      await Promise.resolve();
      expect(service.getStatus('user-1')).toMatchObject({
        state: 'playing',
        music: { title: 'Current after resume' },
      });
    }
  );

  it('uses the check-in deadline even when Spotify was connected much later', async () => {
    provider.read.mockResolvedValue({ title: 'Song', artist: 'Artist' });
    await service.connect(
      'user-1',
      'spotify',
      'secret-token',
      session(Date.now() + 60_000)
    );
    service.disable('user-1');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(service.getStatus('user-1')).toMatchObject({
      connected: false,
      enabled: false,
      music: null,
    });
    expect(provider.read).toHaveBeenCalledTimes(1);
  });

  it('rejects a delayed connection authorized before checkout and scopes old credentials to the old check-in', async () => {
    provider.read.mockResolvedValue({ title: 'Song', artist: 'Artist' });
    const old = session();
    service.expireCheckIn('user-1', old.checkInId, old.expiresAt);
    await expect(
      service.connect('user-1', 'spotify', 'secret-token', old)
    ).rejects.toThrow('Check-in session expired');
    const next = { ...old, checkInId: 'checkin-2' };
    await service.connect('user-1', 'spotify', 'secret-token', next);
    service.disable('user-1', old.checkInId);
    expect(service.getStatus('user-1', next.checkInId).enabled).toBe(true);
    expect(service.getPresence('user-1', old.checkInId)).toBeNull();
  });
});
