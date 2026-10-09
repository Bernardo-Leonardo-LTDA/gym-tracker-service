import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import type { MusicSharingStatus } from '../spotify/interfaces/music-sharing.interface';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import * as schema from '../../core/database/schema';
import { MapsService } from '../../shared/services/maps/maps.service';
import { GymsController } from './gyms.controller';
import { CHECK_IN_DURATION_MS, GymsService } from './gyms.service';
import { MusicSharingService } from '../spotify/services/music-sharing.service';
import { SpotifyMusicProvider } from '../spotify/services/spotify-music.provider';

describe('Private check-in sessions (HTTP)', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const token = '22222222-2222-4222-8222-222222222222';
  const attackerId = '33333333-3333-4333-8333-333333333333';
  const attackerToken = '44444444-4444-4444-8444-444444444444';
  const authorization = `Bearer ${token}`;
  let app: INestApplication<Server>;
  let gyms: GymsService;
  let music: MusicSharingService;
  let sessions: Map<string, schema.CheckIn>;
  let provider: { id: 'spotify'; label: string; read: jest.Mock };

  beforeEach(async () => {
    sessions = new Map([
      [
        token,
        {
          id: token,
          userId,
          externalPlaceId: 'gym',
          isActive: true,
          createdAt: new Date(),
        },
      ],
      [
        attackerToken,
        {
          id: attackerToken,
          userId: attackerId,
          externalPlaceId: 'gym',
          isActive: true,
          createdAt: new Date(),
        },
      ],
    ]);
    provider = {
      id: 'spotify',
      label: 'Spotify',
      read: jest.fn().mockResolvedValue({ title: 'Song', artist: 'Artist' }),
    };
    music = new MusicSharingService(
      provider as unknown as SpotifyMusicProvider
    );
    const dialect = new PgDialect();
    const db = {
      query: {
        checkins: {
          findFirst: jest.fn(({ where }: { where: SQL }) =>
            Promise.resolve(
              sessions.get(String(dialect.sqlToQuery(where).params[0]))
            )
          ),
        },
        users: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: userId, name: 'Owner' }]),
        },
      },
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                checkInId: token,
                userId,
                checkedInAt: sessions.get(token)!.createdAt,
              },
            ]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: (where: SQL) => {
            const parameters = dialect.sqlToQuery(where).params;
            const parameter = parameters[parameters.length - 1];
            const expired = [...sessions.values()].filter((session) =>
              sessions.has(String(parameter))
                ? session.id === parameter
                : session.createdAt < new Date(String(parameter))
            );
            for (const session of expired) session.isActive = false;
            return { returning: () => Promise.resolve(expired) };
          },
        }),
      }),
    };
    gyms = new GymsService(
      db as unknown as PostgresJsDatabase<typeof schema>,
      {} as MapsService,
      music
    );
    await gyms.connectMusic(
      userId,
      'spotify',
      'synthetic-spotify-token',
      authorization
    );
    const module = await Test.createTestingModule({
      controllers: [GymsController],
      providers: [{ provide: GymsService, useValue: gyms }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    music.onModuleDestroy();
  });

  it('rejects public IDs without a private credential on every protected route', async () => {
    for (const action of ['connect', 'resume', 'disable', 'disconnect']) {
      await request(app.getHttpServer())
        .post(`/gyms/music/${action}`)
        .send({ userId, provider: 'spotify', accessToken: 'synthetic-token' })
        .expect(401);
    }
    for (const path of ['music/status', 'active', 'checked-users']) {
      await request(app.getHttpServer())
        .get(`/gyms/${path}`)
        .query({ userId, gymId: 'gym' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/gyms/check-out')
      .send({ userId })
      .expect(401);
    expect(music.getStatus(userId).enabled).toBe(true);
  });

  it('rejects another owner credential and guessed credentials', async () => {
    for (const action of ['connect', 'resume', 'disable', 'disconnect']) {
      await request(app.getHttpServer())
        .post(`/gyms/music/${action}`)
        .set('Authorization', `Bearer ${attackerToken}`)
        .send({ userId, provider: 'spotify', accessToken: 'synthetic-token' })
        .expect(403);
    }
    await request(app.getHttpServer())
      .get('/gyms/music/status')
      .set('Authorization', `Bearer ${attackerToken}`)
      .query({ userId })
      .expect(403);
    await request(app.getHttpServer())
      .get('/gyms/music/status')
      .set('Authorization', `Bearer ${userId}`)
      .query({ userId })
      .expect(401);
    expect(music.getStatus(userId).enabled).toBe(true);
  });

  it('allows the owner to control sharing without exposing the credential to attendees', async () => {
    const attendees = await request(app.getHttpServer())
      .get('/gyms/checked-users')
      .set('Authorization', authorization)
      .query({ userId, gymId: 'gym' })
      .expect(200);
    expect(JSON.stringify(attendees.body)).not.toContain(token);
    expect(
      (attendees.body as { music: { title: string } | null }[])[0].music?.title
    ).toBe('Song');
    const paused = await request(app.getHttpServer())
      .post('/gyms/music/disable')
      .set('Authorization', authorization)
      .send({ userId })
      .expect(201);
    expect((paused.body as MusicSharingStatus).music).toBeNull();
    await request(app.getHttpServer())
      .post('/gyms/music/resume')
      .set('Authorization', authorization)
      .send({ userId })
      .expect(201);
    expect(music.getPresence(userId)?.title).toBe('Song');
  });

  it('shows shared music to another checked-in attendee and removes it on opt-out', async () => {
    const readFloor = () =>
      request(app.getHttpServer())
        .get('/gyms/checked-users')
        .set('Authorization', `Bearer ${attackerToken}`)
        .query({ userId: attackerId, gymId: 'gym' })
        .expect(200);

    const playing = await readFloor();
    expect(playing.body).toEqual([
      expect.objectContaining({
        id: userId,
        music: expect.objectContaining({
          title: 'Song',
          artist: 'Artist',
          isPlaying: true,
        }) as unknown,
      }),
    ]);
    await gyms.disableMusic(userId, authorization);
    const paused = await readFloor();
    expect(paused.body).toEqual([
      expect.objectContaining({ id: userId, music: null }),
    ]);
  });

  it('invalidates both sharing and the credential at checkout', async () => {
    await request(app.getHttpServer())
      .post('/gyms/check-out')
      .set('Authorization', authorization)
      .send({ userId })
      .expect(204);
    expect(music.getStatus(userId).connected).toBe(false);
    await request(app.getHttpServer())
      .post('/gyms/music/resume')
      .set('Authorization', authorization)
      .send({ userId })
      .expect(401);
  });

  it('rejects an expired check-in even before the cleanup cron runs', async () => {
    sessions.get(token)!.createdAt = new Date(
      Date.now() - CHECK_IN_DURATION_MS - 1
    );
    await request(app.getHttpServer())
      .get('/gyms/music/status')
      .set('Authorization', authorization)
      .query({ userId })
      .expect(401);
    expect(music.getStatus(userId).connected).toBe(false);
  });

  it('ends sharing when the cleanup cron deactivates its check-in', async () => {
    sessions.get(token)!.createdAt = new Date(
      Date.now() - CHECK_IN_DURATION_MS - 1
    );
    await gyms.cleanupInactiveCheckins();
    expect(sessions.get(token)!.isActive).toBe(false);
    expect(music.getStatus(userId).connected).toBe(false);
  });
});
