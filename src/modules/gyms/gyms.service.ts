import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../core/database/schema';
import { DRIZZLE_PROVIDER } from '../../core/database/database.provider';
import { MapsService } from '../../shared/services/maps/maps.service';
import { eq, and, count, inArray, lt, gt } from 'drizzle-orm';
import { Cron } from '@nestjs/schedule';
import { Subject } from 'rxjs';
import { PlaceSearchResult } from '../../shared/services/maps/maps.interface';
import { MusicSharingService } from '../spotify/services/music-sharing.service';
import type {
  MusicProviderId,
  MusicSharingStatus,
  MusicTrack,
} from '../spotify/interfaces/music-sharing.interface';
export type CheckedInUser = schema.User & {
  checkedInAt: Date;
  music: MusicTrack | null;
};

export type CheckInResult = schema.User & {
  checkedInAt: Date;
  sessionToken: string;
};
export const CHECK_IN_DURATION_MS = 12 * 60 * 60 * 1000;
export type ActiveCheckIn = {
  gymId: string;
  checkedInAt: Date;
};

@Injectable()
export class GymsService {
  readonly changes = new Subject<string>();

  async activeGymForUser(userId: string): Promise<string | undefined> {
    const checkin = await this.db.query.checkins.findFirst({
      where: and(
        eq(schema.checkins.userId, userId),
        eq(schema.checkins.isActive, true),
        gt(
          schema.checkins.createdAt,
          new Date(Date.now() - CHECK_IN_DURATION_MS)
        )
      ),
    });
    return checkin?.externalPlaceId;
  }
  constructor(
    @Inject(DRIZZLE_PROVIDER) private db: PostgresJsDatabase<typeof schema>,
    private mapsService: MapsService,
    private readonly musicSharing: MusicSharingService
  ) {}

  async searchGymsByAddress(
    address: string,
    radius = 5000
  ): Promise<PlaceSearchResult[]> {
    const { lat, lng } = await this.mapsService.geocodeAddress(address);
    if (!lat || !lng) {
      throw new NotFoundException('Failed to geocode address');
    }

    const gyms = await this.mapsService.nearbySearch(lat, lng, radius, 'gym');
    return gyms;
  }

  async searchGymsByCoordinates(
    latitude: number,
    longitude: number,
    radius = 5000
  ): Promise<PlaceSearchResult[]> {
    return this.mapsService.nearbySearch(latitude, longitude, radius, 'gym');
  }

  async checkIn(
    gymId: string,
    userInfo: { userId: string | null; name?: string }
  ): Promise<CheckInResult> {
    let user: schema.User;

    if (userInfo.userId) {
      const existingUser = await this.db.query.users.findFirst({
        where: eq(schema.users.id, userInfo.userId),
      });

      if (!existingUser) {
        throw new NotFoundException('User not found');
      }

      user = existingUser;
    } else {
      if (!userInfo.name) {
        throw new BadRequestException('Name is required to create a new user');
      }

      const [createdUser] = await this.db
        .insert(schema.users)
        .values({ name: userInfo.name })
        .returning();

      user = createdUser;
    }

    const activeCheckin = await this.db.query.checkins.findFirst({
      where: and(
        eq(schema.checkins.userId, user.id),
        eq(schema.checkins.isActive, true),
        gt(
          schema.checkins.createdAt,
          new Date(Date.now() - CHECK_IN_DURATION_MS)
        )
      ),
    });

    if (activeCheckin) {
      throw new BadRequestException('User is already checked in');
    }

    const [checkin] = await this.db
      .insert(schema.checkins)
      .values({ externalPlaceId: gymId, userId: user.id })
      .returning({
        id: schema.checkins.id,
        createdAt: schema.checkins.createdAt,
      });

    this.musicSharing.disconnect(user.id);
    this.changes.next(gymId);

    console.log(`User ${user.id} checked in to gym ${gymId}`);

    // The random check-in UUID is a private bearer credential. Never include it
    // in attendee responses or issue a replacement based on the public user ID.
    return {
      ...user,
      checkedInAt: checkin.createdAt,
      sessionToken: checkin.id,
    };
  }

  async fetchCheckedUsersInMyGym(
    gymId: string,
    userId: string,
    authorization?: string
  ): Promise<CheckedInUser[]> {
    const session = await this.requireSession(userId, authorization);
    if (session.externalPlaceId !== gymId)
      throw new ForbiddenException('Check-in session belongs to another gym');
    const checkedInUsers = await this.db
      .select({
        checkInId: schema.checkins.id,
        userId: schema.checkins.userId,
        checkedInAt: schema.checkins.createdAt,
      })
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.externalPlaceId, gymId),
          eq(schema.checkins.isActive, true),
          gt(
            schema.checkins.createdAt,
            new Date(Date.now() - CHECK_IN_DURATION_MS)
          )
        )
      );

    const userIds = checkedInUsers.map((checkin) => checkin.userId);
    const users = await this.db.query.users.findMany({
      where: (users, { inArray }) => inArray(users.id, userIds),
    });

    const checkinsByUser = new Map(
      checkedInUsers.map((checkin) => [checkin.userId, checkin])
    );
    return users.map((user) => ({
      ...user,
      checkedInAt: checkinsByUser.get(user.id)!.checkedInAt,
      music: this.musicSharing.getPresence(
        user.id,
        checkinsByUser.get(user.id)!.checkInId
      ),
    }));
  }

  async connectMusic(
    userId: string,
    provider: MusicProviderId,
    accessToken: string,
    authorization?: string
  ): Promise<MusicSharingStatus> {
    const session = await this.requireSession(userId, authorization);
    return this.musicSharing.connect(userId, provider, accessToken, {
      checkInId: session.id,
      expiresAt: session.createdAt.getTime() + CHECK_IN_DURATION_MS,
    });
  }

  async resumeMusic(
    userId: string,
    authorization?: string
  ): Promise<MusicSharingStatus> {
    const session = await this.requireSession(userId, authorization);
    return this.musicSharing.resume(userId, session.id);
  }

  async musicStatus(
    userId: string,
    authorization?: string
  ): Promise<MusicSharingStatus> {
    const session = await this.requireSession(userId, authorization);
    return this.musicSharing.getStatus(userId, session.id);
  }

  async disableMusic(
    userId: string,
    authorization?: string
  ): Promise<MusicSharingStatus> {
    const session = await this.requireSession(userId, authorization);
    return this.musicSharing.disable(userId, session.id);
  }

  async disconnectMusic(
    userId: string,
    authorization?: string
  ): Promise<MusicSharingStatus> {
    const session = await this.requireSession(userId, authorization);
    return this.musicSharing.disconnect(userId, session.id);
  }

  async getActiveCheckIn(
    userId: string,
    authorization?: string
  ): Promise<ActiveCheckIn> {
    const checkin = await this.requireSession(userId, authorization);

    return {
      gymId: checkin.externalPlaceId,
      checkedInAt: checkin.createdAt,
    };
  }

  async requireSession(
    userId: string,
    authorization?: string
  ): Promise<schema.CheckIn> {
    const token =
      /^Bearer ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
        authorization ?? ''
      )?.[1];
    if (!token)
      throw new UnauthorizedException(
        'A private check-in session token is required'
      );
    const checkin = await this.db.query.checkins.findFirst({
      where: eq(schema.checkins.id, token),
    });
    if (!checkin || checkin.id !== token || !checkin.isActive) {
      throw new UnauthorizedException('Check-in session is no longer active');
    }
    if (checkin.userId !== userId)
      throw new ForbiddenException('Check-in session belongs to another user');
    const expiresAt = checkin.createdAt.getTime() + CHECK_IN_DURATION_MS;
    if (expiresAt <= Date.now()) {
      this.musicSharing.expireCheckIn(userId, checkin.id, expiresAt);
      throw new UnauthorizedException('Check-in session expired');
    }
    return checkin;
  }

  async countCheckedInUsers(gymIds: string[]): Promise<Record<string, number>> {
    const uniqueGymIds = [...new Set(gymIds)];
    const counts = Object.fromEntries(uniqueGymIds.map((gymId) => [gymId, 0]));

    if (uniqueGymIds.length === 0) return counts;

    const activeCheckinsByGym = await this.db
      .select({
        gymId: schema.checkins.externalPlaceId,
        count: count(),
      })
      .from(schema.checkins)
      .where(
        and(
          inArray(schema.checkins.externalPlaceId, uniqueGymIds),
          eq(schema.checkins.isActive, true),
          gt(
            schema.checkins.createdAt,
            new Date(Date.now() - CHECK_IN_DURATION_MS)
          )
        )
      )
      .groupBy(schema.checkins.externalPlaceId);

    for (const checkinCount of activeCheckinsByGym) {
      counts[checkinCount.gymId] = checkinCount.count;
    }

    return counts;
  }

  async checkOut(userId: string, authorization?: string): Promise<void> {
    const activeCheckin = await this.requireSession(userId, authorization);

    await this.db
      .update(schema.checkins)
      .set({ isActive: false })
      .where(eq(schema.checkins.id, activeCheckin.id));

    this.musicSharing.expireCheckIn(
      userId,
      activeCheckin.id,
      activeCheckin.createdAt.getTime() + CHECK_IN_DURATION_MS
    );
    this.changes.next(activeCheckin.externalPlaceId);

    console.log(`User ${userId} checked out from gym`);
  }

  @Cron('0 */12 * * *') // Runs every 12 hours
  async cleanupInactiveCheckins(): Promise<void> {
    // get all checkins that are active and older than 12 hours
    console.log('[ROUTINE]: Cleaning up inactive check-ins...');
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    try {
      const expired = await this.db
        .update(schema.checkins)
        .set({ isActive: false })
        .where(
          and(
            eq(schema.checkins.isActive, true),
            lt(schema.checkins.createdAt, twelveHoursAgo)
          )
        )
        .returning({
          id: schema.checkins.id,
          userId: schema.checkins.userId,
          createdAt: schema.checkins.createdAt,
          gymId: schema.checkins.externalPlaceId,
        });
      for (const checkin of expired) {
        this.changes.next(checkin.gymId);
        this.musicSharing.expireCheckIn(
          checkin.userId,
          checkin.id,
          checkin.createdAt.getTime() + CHECK_IN_DURATION_MS
        );
      }
    } catch (error) {
      console.error('Error during cleanup of inactive check-ins:', error);
    }
  }
}
