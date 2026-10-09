import {
  HttpException,
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Observable, Subscriber, Subscription } from 'rxjs';
import { CHECK_IN_DURATION_MS, GymsService } from './gyms.service';
import { MusicSharingService } from '../spotify/services/music-sharing.service';

interface Viewer {
  userId: string;
  authorization: string;
  gymId: string;
  subscriber: Subscriber<MessageEvent>;
  updating: boolean;
  dirty: boolean;
}

@Injectable()
export class GymsEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly viewers = new Set<Viewer>();
  private readonly gymExpiry = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly subscriptions = new Subscription();
  private readonly logger = new Logger(GymsEventsService.name);

  constructor(
    private readonly gyms: GymsService,
    private readonly music: MusicSharingService
  ) {}

  onModuleInit(): void {
    this.subscriptions.add(
      this.gyms.changes.subscribe((gymId) => this.broadcast(gymId))
    );
    this.subscriptions.add(
      this.music.changes.subscribe((userId) => {
        void this.gyms
          .activeGymForUser(userId)
          .then((gymId) => {
            if (gymId) this.broadcast(gymId);
          })
          .catch(() => this.logger.warn('Unable to publish music update'));
      })
    );
  }

  async open(
    userId: string,
    authorization?: string
  ): Promise<Observable<MessageEvent>> {
    const session = await this.gyms.requireSession(userId, authorization);
    // Allocate timers only on subscription, after Nest has checked for disconnects.
    return new Observable((subscriber) => {
      const viewer: Viewer = {
        userId,
        authorization: authorization!,
        gymId: session.externalPlaceId,
        subscriber,
        updating: false,
        dirty: false,
      };
      this.viewers.add(viewer);
      const expiry = setTimeout(
        () => {
          subscriber.next({ type: 'session-ended', data: {} });
          subscriber.complete();
          this.broadcast(viewer.gymId);
        },
        Math.max(
          0,
          session.createdAt.getTime() + CHECK_IN_DURATION_MS - Date.now()
        )
      );
      const heartbeat = setInterval(
        () => subscriber.next({ type: 'heartbeat', data: {} }),
        15_000
      );
      void this.sendSnapshot(viewer);
      return () => {
        clearTimeout(expiry);
        clearInterval(heartbeat);
        this.viewers.delete(viewer);
        if (![...this.viewers].some((item) => item.gymId === viewer.gymId)) {
          clearTimeout(this.gymExpiry.get(viewer.gymId));
          this.gymExpiry.delete(viewer.gymId);
        }
      };
    });
  }

  private broadcast(gymId: string): void {
    for (const viewer of this.viewers) {
      if (viewer.gymId === gymId) void this.sendSnapshot(viewer);
    }
  }

  private async sendSnapshot(viewer: Viewer): Promise<void> {
    if (viewer.subscriber.closed) return;
    viewer.dirty = true;
    if (viewer.updating) return;
    viewer.updating = true;
    try {
      do {
        viewer.dirty = false;
        const users = await this.gyms.fetchCheckedUsersInMyGym(
          viewer.gymId,
          viewer.userId,
          viewer.authorization
        );
        const status = await this.gyms.musicStatus(
          viewer.userId,
          viewer.authorization
        );
        if (viewer.subscriber.closed) return;
        // Discard a read superseded by checkout, opt-out or another update.
        if (!viewer.dirty) {
          clearTimeout(this.gymExpiry.get(viewer.gymId));
          this.gymExpiry.delete(viewer.gymId);
          const deadlines = users
            .map(
              (user) =>
                new Date(user.checkedInAt).getTime() + CHECK_IN_DURATION_MS
            )
            .filter(
              (deadline) => Number.isFinite(deadline) && deadline > Date.now()
            );
          if (deadlines.length)
            this.gymExpiry.set(
              viewer.gymId,
              setTimeout(
                () => {
                  this.gymExpiry.delete(viewer.gymId);
                  this.broadcast(viewer.gymId);
                },
                Math.max(1, Math.min(...deadlines) - Date.now())
              )
            );
          viewer.subscriber.next({
            type: 'snapshot',
            data: { users, status, serverTime: new Date().toISOString() },
          });
        }
      } while (viewer.dirty && !viewer.subscriber.closed);
    } catch (error) {
      viewer.subscriber.next({
        type:
          error instanceof HttpException &&
          [401, 403].includes(error.getStatus())
            ? 'session-ended'
            : 'unavailable',
        data: {},
      });
      viewer.subscriber.complete();
    } finally {
      viewer.updating = false;
    }
  }

  onModuleDestroy(): void {
    this.subscriptions.unsubscribe();
    for (const viewer of this.viewers) viewer.subscriber.complete();
  }
}
