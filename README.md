# Gym Tracker Service

## 🛠️ Tech Stack

- **Backend Framework**: [NestJS](https://nestjs.com/) (TypeScript)

---

## 📐ENV

- You should create an .env file to add these env vars:

```shell
GOOGLE_MAPS_API_KEY=YOUR-KEY-HERE

SPOTIFY_CLIENT_ID=YOUR-CLIENT-ID-HERE
SPOTIFY_CLIENT_SECRET=YOUR-CLIENT-SECRET-HERE
SPOTIFY_REDIRECT_URI=YOUR-REDIRECT-URI-HERE
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
