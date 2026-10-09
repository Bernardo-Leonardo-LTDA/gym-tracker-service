import { Test } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { get, type ClientRequest } from 'node:http';
import { EventEmitter } from 'node:events';
import type { AddressInfo, Server } from 'node:net';
import { Subject } from 'rxjs';
import { GymsEventsService } from './gyms-events.service';
import { GymsEventsController } from './gyms-events.controller';
import { CHECK_IN_DURATION_MS, GymsService } from './gyms.service';
import { MusicSharingService } from '../spotify/services/music-sharing.service';

const ALICE = '0a11ce00-0000-4000-8000-000000000001';
const BOB = '0b0b0000-0000-4000-8000-000000000002';
const CAROL = '0ca10100-0000-4000-8000-000000000003';

interface TestClient extends EventEmitter {
  connect: () => void;
  disconnect: () => void;
  status?: number;
}

interface Snapshot {
  users: { id: string; music: unknown }[];
  status: { music: unknown };
  serverTime: string;
}

describe('Live gym updates (SSE)', () => {
  let app: INestApplication<Server>;
  let url: string;
  let clients: TestClient[];
  let sessions: Map<
    string,
    { userId: string; externalPlaceId: string; createdAt: Date }
  >;
  let changes: Subject<string>;
  let musicChanges: Subject<string>;
  let track: unknown;

  function next<T>(socket: TestClient, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out: ${event}`)),
        2500
      );
      socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  function client(userId: string, sessionToken: string): TestClient {
    const events = new EventEmitter() as TestClient;
    let request: ClientRequest | undefined;
    events.connect = () => {
      let buffer = '';
      request = get(
        url + '/events?userId=' + userId,
        { headers: { Authorization: 'Bearer ' + sessionToken } },
        (response) => {
          events.status = response.statusCode;
          if (response.statusCode === 401 || response.statusCode === 403) {
            response.resume();
            events.emit('session-ended');
            return;
          }
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            buffer += chunk;
            let boundary: number;
            while ((boundary = buffer.indexOf('\n\n')) !== -1) {
              const block = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const event = block
                .split('\n')
                .find((line) => line.startsWith('event: '))
                ?.slice(7);
              const data = block
                .split('\n')
                .find((line) => line.startsWith('data: '))
                ?.slice(6);
              if (event && data)
                events.emit(event, JSON.parse(data) as unknown);
            }
          });
        }
      );
      request.on('error', () => undefined);
    };
    events.disconnect = () => {
      request?.destroy();
    };
    clients.push(events);
    return events;
  }

  beforeEach(async () => {
    clients = [];
    track = null;
    changes = new Subject();
    musicChanges = new Subject();
    sessions = new Map([
      [
        'a',
        { userId: ALICE, externalPlaceId: 'gym-1', createdAt: new Date() },
      ],
      ['b', { userId: BOB, externalPlaceId: 'gym-1', createdAt: new Date() }],
      [
        'c',
        { userId: CAROL, externalPlaceId: 'gym-2', createdAt: new Date() },
      ],
    ]);
    const authorize = (userId: string, authorization: string) => {
      const session = sessions.get(authorization.replace('Bearer ', ''));
      if (!session || session.userId !== userId)
        throw new UnauthorizedException();
      return session;
    };
    const module = await Test.createTestingModule({
      controllers: [GymsEventsController],
      providers: [
        GymsEventsService,
        {
          provide: GymsService,
          useValue: {
            changes,
            requireSession: (userId: string, authorization: string) =>
              Promise.resolve(authorize(userId, authorization)),
            activeGymForUser: (userId: string) =>
              Promise.resolve(
                [...sessions.values()].find((s) => s.userId === userId)
                  ?.externalPlaceId
              ),
            snapshot: (
              gymId: string,
              userId: string,
              authorization: string
            ) => {
              authorize(userId, authorization);
              return Promise.resolve({
                users: [...sessions.values()]
                  .filter(
                    (s) =>
                      s.externalPlaceId === gymId &&
                      s.createdAt.getTime() + CHECK_IN_DURATION_MS > Date.now()
                  )
                  .map((s) => ({
                    id: s.userId,
                    music: s.userId === ALICE ? track : null,
                    checkedInAt: s.createdAt,
                  })),
                status: { music: userId === ALICE ? track : null },
              });
            },
          },
        },
        { provide: MusicSharingService, useValue: { changes: musicChanges } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/gyms`;
  });

  afterEach(async () => {
    clients.forEach((socket) => socket.disconnect());
    await app.close();
  });

  it('rejects credentials belonging to another user without delivering a snapshot', async () => {
    const socket = client(ALICE, 'b');
    const snapshot = jest.fn();
    socket.on('snapshot', snapshot);
    const ended = next(socket, 'session-ended');
    socket.connect();
    await ended;
    expect(snapshot).not.toHaveBeenCalled();
    expect(socket.status).toBe(401);
  });

  it('pushes check-ins and music only to viewers of the same gym', async () => {
    const bob = client(BOB, 'b');
    const carol = client(CAROL, 'c');
    const firstBob = next<Snapshot>(bob, 'snapshot');
    const firstCarol = next<Snapshot>(carol, 'snapshot');
    bob.connect();
    carol.connect();
    expect((await firstBob).users.map((u) => u.id)).toEqual([ALICE, BOB]);
    expect((await firstCarol).users.map((u) => u.id)).toEqual([CAROL]);
    const otherGym = jest.fn();
    carol.on('snapshot', otherGym);
    const arrival = next<Snapshot>(bob, 'snapshot');
    sessions.set('d', {
      userId: 'dan',
      externalPlaceId: 'gym-1',
      createdAt: new Date(),
    });
    changes.next('gym-1');
    expect((await arrival).users.map((u) => u.id)).toContain('dan');
    const playback = next<Snapshot>(bob, 'snapshot');
    track = { title: 'Outro', artist: 'M83', isPlaying: true };
    musicChanges.next(ALICE);
    const snapshot = await playback;
    expect(snapshot.users.find((u) => u.id === ALICE)?.music).toEqual(track);
    expect(snapshot.status.music).toBeNull();
    expect(otherGym).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).not.toContain('sessionToken');
  });

  it('revokes a checked-out viewer and sends departures to remaining viewers', async () => {
    const alice = client(ALICE, 'a');
    const bob = client(BOB, 'b');
    const initial = [next(alice, 'snapshot'), next(bob, 'snapshot')];
    alice.connect();
    bob.connect();
    await Promise.all(initial);
    const ended = next(alice, 'session-ended');
    const departure = next<Snapshot>(bob, 'snapshot');
    sessions.delete('a');
    changes.next('gym-1');
    await ended;
    expect((await departure).users.map((u) => u.id)).toEqual([BOB]);
  });

  it('pushes expiry of an attendee even when that attendee has no connected browser', async () => {
    sessions.get('a')!.createdAt = new Date(
      Date.now() - CHECK_IN_DURATION_MS + 300
    );
    const bob = client(BOB, 'b');
    const initial = next<Snapshot>(bob, 'snapshot');
    bob.connect();
    expect((await initial).users.map((user) => user.id)).toContain(ALICE);
    const expired = await next<Snapshot>(bob, 'snapshot');
    expect(expired.users.map((user) => user.id)).toEqual([BOB]);
  });

  it('resends the current snapshot on reconnect and expires the connection at the session deadline', async () => {
    const bob = client(BOB, 'b');
    const initial = next(bob, 'snapshot');
    bob.connect();
    await initial;
    bob.disconnect();
    sessions.get('b')!.createdAt = new Date(
      Date.now() - CHECK_IN_DURATION_MS + 300
    );
    const resumed = next<Snapshot>(bob, 'snapshot');
    const ended = next(bob, 'session-ended');
    bob.connect();
    expect((await resumed).users.map((u) => u.id)).toContain(ALICE);
    await ended;
  });
});
