# Gym Tracker Service

## 🛠️ Tech Stack

- **Backend Framework**: [NestJS](https://nestjs.com/) (TypeScript)
- **Database**: [Postgres](https://www.postgresql.org/) (Drizzle as ORM)

---

## 📐ENV

- You should create an .env file to add these env vars:

```shell
GOOGLE_MAPS_API_KEY=YOUR-KEY-HERE

SPOTIFY_CLIENT_ID=YOUR-CLIENT-ID-HERE
SPOTIFY_CLIENT_SECRET=YOUR-CLIENT-SECRET-HERE
SPOTIFY_REDIRECT_URI_WEB=YOUR-WEB-REDIRECT-URI-HERE
SPOTIFY_REDIRECT_URI_MOBILE=YOUR-MOBILE-REDIRECT-URI-HERE
FRONTEND_URL=YOUR-FRONTEND-URL-HERE

DATABASE_URL=YOUR-DATABASE-URL-HERE
```

---

## 📐 Architecture Overview

Spotify authorization requests only `user-read-currently-playing`, required by
`GET /v1/me/player/currently-playing`. The scope is defined in the auth service
for both web and mobile; `SPOTIFY_SCOPES` is no longer used.

The authenticated SSE route `GET /gyms/events?userId=...` sends updates only to
participants of the viewer's gym. Pass `Authorization: Bearer <sessionToken>`.
The `snapshot` event contains `{ users, status, serverTime }` on connection and
after check-in, checkout, session expiry or music updates. `status` belongs only
to the viewer. `session-ended` revokes access; `heartbeat` keeps the HTTP stream
alive. Every reconnection reloads current state. Check-in and sharing actions
remain ordinary HTTP requests. The backend checks Spotify every 30 seconds.

Realtime subscriptions and Spotify tokens currently live in one server process.
Multiple backend instances require shared music state and a distributed event bus
before deployment. Configure the reverse proxy to stream `/gyms/events` without
buffering, with an idle timeout longer than the 15-second heartbeat. HTTP/2 is
recommended when opening multiple tabs (HTTP/1.1 limits per-origin connections).
The client sends its credential in a header, never in the stream URL.

Spotify refresh tokens are not retained yet. When an access token expires, the
user must disconnect and connect Spotify again. Restarting the backend also clears
Spotify connections; the database check-in remains active, but music sharing must
be connected again.

Check-in returns a private `sessionToken` scoped to that check-in. Send it as
`Authorization: Bearer <sessionToken>` when reading the active session or attendees,
checking out, or using `/gyms/music/*`. The public user ID alone grants no access.
The credential expires with the check-in after 12 hours and is invalidated by checkout.
It is never returned in attendee lists. This uses the existing random check-in ID.

Live music is returned exclusively in `music`; the old `currentSong*` fields are
removed from the API and ORM schema. Migration
`drizzle/0003_remove_legacy_music_fields.sql` drops their four unused database
columns. Existing databases can run the new code before applying this migration;
the application no longer reads or writes these columns. Apply it through your
database migration workflow to finish the physical cleanup.

This project follows a **Feature-Driven Modular Architecture**. Each module encapsulates its own domain logic (controller, service, entity, and DTOs).

```text
src/
├── app.module.ts                  # Root module that orchestrates all other modules
├── main.ts                        # Application bootstrapping
│
├── core/                          # Global and mandatory resources (Singletons)
│   ├── config/                    # Environment variables configuration
│   ├── database/                  # Database connection and initialization
│
├── shared/                        # Reusable modules or utilities shared across multiple domains
│   ├── services/                  # General utility services
│   └── utils/                     # Pure functions and helpers
│
└── modules/                       # The core of the application (Contexts / Domains)
    └── feature/                   #
        ├── dto/                   # Data Transfer Objects
        ├── entities/              # Data model/database representation (if applicable)
        ├── interfaces/            # Local types and contracts
        ├── users.controller.ts    # Routes for the user domain
        ├── users.module.ts        # Domain encapsulation
        └── users.service.ts       # User business logic
```

## 🗄️ Database & Drizzle ORM

This project uses **PostgreSQL** as the database and **[Drizzle ORM](https://orm.drizzle.team/)** for data modeling, type safety (TypeScript), and query execution.
The setup was made following**[Drizzle Postgres official DOC](https://orm.drizzle.team/docs/get-started/postgresql-new)**

### 1. Running the Database (Docker)

To run the database locally in an isolated environment, we use Docker. Run the command below in your terminal to download the image and start the container:

```bash
docker pull postgres
docker run --name <db-name> -e POSTGRES_PASSWORD=<password> -d -p 5432:5432 postgres
```

Alternatively, run the database and the Nest app together (starts the DB container if it isn't running, then boots the app in watch mode):

```bash
npm run dev:db
```

To only start the local database container, run:

```bash
npm run local-db:up
```

### 2. Connecting to the Database

To manually connect to the DB and test it you should run:

```bash
docker exec -it <db-name> psql -U postgres
```

### 3. . Database Workflow (How to make changes)

Whenever you need to modify the database structure (e.g., adding a new column or creating a table):

1. Go to the corresponding module (e.g., _src/modules/users/entities/user.schema.ts_) and update the TypeScript code.
2. Run npm run db:generate to create a historical record (migration) of this change.
3. Run npm run db:push to force the creation of this column/table in your local database.

### 4. Making changes

After changing `src\core\database\schema.ts` you can run:

```bash
npm run db:generate // <- generate migration
```

```bash
npm run db:push
```
