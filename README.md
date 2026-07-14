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

### 1. Running the Database (Docker)

To run the database locally in an isolated environment, we use Docker. Run the command below in your terminal to download the image and start the container:

```bash
docker pull postgres
docker run --name <db-name> -e POSTGRES_PASSWORD=<password> -d -p 5432:5432 postgres
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
