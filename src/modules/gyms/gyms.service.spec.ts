import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GymsService } from './gyms.service';
import { MapsService } from '../../shared/services/maps/maps.service';
import { DRIZZLE_PROVIDER } from '../../core/database/database.provider';
import * as schema from '../../core/database/schema';
import { lt } from 'drizzle-orm';

jest.mock('drizzle-orm', () => {
  const actual =
    jest.requireActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    eq: actual.eq,
    and: actual.and,
    lt: jest.fn(actual.lt),
    inArray: actual.inArray,
  };
});

type DbMock = ReturnType<typeof createDbMock>;
type MapsMock = ReturnType<typeof createMapsMock>;

const createDbMock = () => ({
  query: {
    users: { findFirst: jest.fn(), findMany: jest.fn() },
    checkins: { findFirst: jest.fn() },
  },
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

const createMapsMock = () => ({
  geocodeAddress: jest.fn(),
  nearbySearch: jest.fn(),
});

describe('GymsService', () => {
  let service: GymsService;
  let db: DbMock;
  let maps: MapsMock;

  const existingUser: schema.User = {
    id: 'user-1',
    name: 'John Doe',
    avatarUrl: null,
    currentSongTitle: null,
    currentSongArtist: null,
    currentSongExternalId: null,
    currentSongUpdatedAt: null,
    createdAt: new Date(),
  };

  const createdUser: schema.User = {
    ...existingUser,
    id: 'new-user-1',
    name: 'Jane Doe',
  };

  // Stubs the fluent db.select().from().where() chain to resolve the given rows
  const stubSelectWhere = (rows: unknown[]) => {
    const where = jest.fn().mockResolvedValue(rows);
    db.select.mockReturnValue({
      from: jest.fn().mockReturnValue({ where }),
    });
    return where;
  };

  // Stubs db.insert().values().returning() to resolve the given rows
  const stubInsertWithReturning = (rows: unknown[]) => {
    const values = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue(rows),
    });
    db.insert.mockReturnValue({ values });
    return values;
  };

  beforeEach(async () => {
    db = createDbMock();
    maps = createMapsMock();

    db.query.users.findFirst.mockResolvedValue(undefined);
    db.query.users.findMany.mockResolvedValue([]);
    db.query.checkins.findFirst.mockResolvedValue(undefined);
    db.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });
    db.insert.mockReturnValue({
      values: jest.fn().mockResolvedValue(undefined),
    });
    db.delete.mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });
    db.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GymsService,
        { provide: MapsService, useValue: maps },
        { provide: DRIZZLE_PROVIDER, useValue: db },
      ],
    }).compile();

    service = moduleRef.get<GymsService>(GymsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchGymsNearby', () => {
    it('should return the gyms found near the address', async () => {
      // arrange
      const gyms = [{ placeId: 'place-1' }];
      maps.geocodeAddress.mockResolvedValue({ lat: 1, lng: 2 });
      maps.nearbySearch.mockResolvedValue(gyms);

      // act
      const result = await service.searchGymsNearby('address', 1000);

      // assert
      expect(maps.geocodeAddress).toHaveBeenCalledWith('address');
      expect(maps.nearbySearch).toHaveBeenCalledWith(1, 2, 1000, 'gym');
      expect(result).toEqual(gyms);
    });

    it('should throw when the address cannot be geocoded', async () => {
      // arrange
      maps.geocodeAddress.mockResolvedValue({ lat: undefined, lng: undefined });

      // act & assert
      await expect(service.searchGymsNearby('address')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('checkIn', () => {
    it('should check in an existing user and return them', async () => {
      // arrange
      db.query.users.findFirst.mockResolvedValue(existingUser);
      const insertValues = jest.fn().mockResolvedValue(undefined);
      db.insert.mockReturnValue({ values: insertValues });

      // act
      const result = await service.checkIn('gym-1', {
        userId: existingUser.id,
      });

      // assert
      expect(result).toEqual(existingUser);
      expect(db.insert).toHaveBeenCalledWith(schema.checkins);
      expect(insertValues).toHaveBeenCalledWith({
        externalPlaceId: 'gym-1',
        userId: existingUser.id,
      });
    });

    it('should throw when the user does not exist', async () => {
      // arrange
      db.query.users.findFirst.mockResolvedValue(undefined);

      // act & assert
      await expect(
        service.checkIn('gym-1', { userId: 'unknown-user' })
      ).rejects.toThrow(NotFoundException);
    });

    it('should create a new user when userId is not provided', async () => {
      // arrange
      const insertValues = stubInsertWithReturning([createdUser]);

      // act
      const result = await service.checkIn('gym-1', {
        userId: null,
        name: 'Jane Doe',
      });

      // assert
      expect(result).toEqual(createdUser);
      expect(db.insert).toHaveBeenCalledWith(schema.users);
      expect(insertValues).toHaveBeenCalledWith({ name: 'Jane Doe' });
      expect(db.insert).toHaveBeenCalledWith(schema.checkins);
    });

    it('should throw when creating a user without a name', async () => {
      // act & assert
      await expect(service.checkIn('gym-1', { userId: null })).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw when the user is already checked in', async () => {
      // arrange
      db.query.users.findFirst.mockResolvedValue(existingUser);
      db.query.checkins.findFirst.mockResolvedValue({
        id: 'checkin-1',
        userId: existingUser.id,
      });

      // act & assert
      await expect(
        service.checkIn('gym-1', { userId: existingUser.id })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('fetchCheckedUsersInGym', () => {
    it('should return the users checked into the gym', async () => {
      // arrange
      stubSelectWhere([{ userId: 'user-1' }, { userId: 'user-2' }]);
      const users = [
        existingUser,
        { ...existingUser, id: 'user-2', name: 'Bob' },
      ];
      db.query.users.findMany.mockResolvedValue(users);

      // act
      const result = await service.fetchCheckedUsersInGym('gym-1');

      // assert
      expect(result).toEqual(users);
    });
  });

  describe('checkOut', () => {
    it('should set the active check-in to inactive', async () => {
      // arrange
      db.query.checkins.findFirst.mockResolvedValue({
        id: 'checkin-1',
        userId: existingUser.id,
      });
      const set = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });
      db.update.mockReturnValue({ set });

      // act
      await service.checkOut(existingUser.id);

      // assert
      expect(db.update).toHaveBeenCalledWith(schema.checkins);
      expect(set).toHaveBeenCalledWith({ isActive: false });
    });

    it('should throw when the user has no active check-in', async () => {
      // arrange
      db.query.checkins.findFirst.mockResolvedValue(undefined);

      // act & assert
      await expect(service.checkOut(existingUser.id)).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('cleanupInactiveCheckins', () => {
    let setMock: jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      setMock = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      });
      db.update.mockReturnValue({ set: setMock });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should deactivate check-ins older than 12 hours', async () => {
      // arrange
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T12:00:00Z'));

      // act
      await service.cleanupInactiveCheckins();

      // assert
      expect(db.update).toHaveBeenCalledWith(schema.checkins);
      expect(setMock).toHaveBeenCalledWith({ isActive: false });
      const [column, cutoff] = (lt as jest.Mock).mock.calls[0] as [
        unknown,
        Date,
      ];
      expect(column).toBe(schema.checkins.createdAt);
      expect(cutoff).toEqual(new Date('2025-01-01T00:00:00Z'));
    });

    it('should not throw and should log the error when the update fails', async () => {
      // arrange
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T12:00:00Z'));
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      setMock.mockReturnValue({
        where: jest.fn().mockRejectedValue(new Error('db unavailable')),
      });

      // act
      await expect(service.cleanupInactiveCheckins()).resolves.toBeUndefined();

      // assert
      expect(errorSpy).toHaveBeenCalledWith(
        'Error during cleanup of inactive check-ins:',
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });
  });
});
