import { PlaceData } from '@googlemaps/google-maps-services-js';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../core/database/schema';
import { DRIZZLE_PROVIDER } from '../../core/database/database.provider';
import { MapsService } from '../../shared/services/maps/maps.service';
import { eq, and, lt } from 'drizzle-orm';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class GymsService {
  constructor(
    @Inject(DRIZZLE_PROVIDER) private db: PostgresJsDatabase<typeof schema>,
    private mapsService: MapsService
  ) {}

  async searchGymsNearby(
    address: string,
    radius = 1500
  ): Promise<Partial<PlaceData>[]> {
    const { lat, lng } = await this.mapsService.geocodeAddress(address);
    if (!lat || !lng) {
      throw new NotFoundException('Failed to geocode address');
    }

    const gyms = await this.mapsService.nearbySearch(lat, lng, radius, 'gym');
    return gyms;
  }

  async checkIn(
    gymId: string,
    userInfo: { userId: string | null; name?: string }
  ): Promise<schema.User> {
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
        eq(schema.checkins.isActive, true)
      ),
    });

    if (activeCheckin) {
      throw new BadRequestException('User is already checked in');
    }

    await this.db
      .insert(schema.checkins)
      .values({ externalPlaceId: gymId, userId: user.id });

    console.log(`User ${user.id} checked in to gym ${gymId}`);

    return user;
  }

  async fetchCheckedUsersInMyGym(
    gymId: string,
    userId: string
  ): Promise<schema.User[]> {
    // check if user is checked in to the gym before fetching the list of checked-in users
    const userCheckedIn = await this.db.query.checkins.findFirst({
      where: and(
        eq(schema.checkins.externalPlaceId, gymId),
        eq(schema.checkins.userId, userId),
        eq(schema.checkins.isActive, true)
      ),
    });

    if (!userCheckedIn) {
      throw new BadRequestException(
        'User is not checked in to this gym. Cannot fetch checked-in users.'
      );
    }

    const checkedInUsers = await this.db
      .select({ userId: schema.checkins.userId })
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.externalPlaceId, gymId),
          eq(schema.checkins.isActive, true)
        )
      );

    const userIds = checkedInUsers.map((checkin) => checkin.userId);
    const users = await this.db.query.users.findMany({
      where: (users, { inArray }) => inArray(users.id, userIds),
    });

    return users;
  }

  async countCheckedInUsers(gymId: string): Promise<number> {
    const checkedInUsers = await this.db
      .select({ userId: schema.checkins.userId })
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.externalPlaceId, gymId),
          eq(schema.checkins.isActive, true)
        )
      );

    return checkedInUsers.length;
  }

  async checkOut(userId: string): Promise<void> {
    const activeCheckin = await this.db.query.checkins.findFirst({
      where: and(
        eq(schema.checkins.userId, userId),
        eq(schema.checkins.isActive, true)
      ),
    });

    if (!activeCheckin) {
      throw new BadRequestException('No active check-in to check out from');
    }

    await this.db
      .update(schema.checkins)
      .set({ isActive: false })
      .where(eq(schema.checkins.id, activeCheckin.id));

    console.log(`User ${userId} checked out from gym`);
  }

  @Cron('0 */12 * * *') // Runs every 12 hours
  async cleanupInactiveCheckins(): Promise<void> {
    // get all checkins that are active and older than 12 hours
    console.log('[ROUTINE]: Cleaning up inactive check-ins...');
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    try {
      await this.db
        .update(schema.checkins)
        .set({ isActive: false })
        .where(lt(schema.checkins.createdAt, twelveHoursAgo));
    } catch (error) {
      console.error('Error during cleanup of inactive check-ins:', error);
    }
  }
}
