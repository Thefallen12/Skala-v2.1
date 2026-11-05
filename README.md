# GIS map setup

The project map supports Google satellite imagery through the Google Maps
Platform Map Tiles API. Add the restricted browser key to the local `.env`:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-restricted-api-key
```

Enable the Map Tiles API and billing for its Google Cloud project, then restrict
the key to the application's HTTP referrers and the Map Tiles API. Restart the
Next.js development server after changing the environment.

Google Earth Engine is a separate service for displaying computed imagery and
requires an Earth Engine-enabled Cloud project and OAuth/IAM authorization. It
is not a public basemap endpoint; Google Earth Pro imagery must not be loaded
from undocumented tile URLs.

## PostgreSQL to MongoDB data migration

The migration command defaults to a read-only dry run. Set `POSTGRES_SOURCE_URL`
to a direct PostgreSQL connection URL when available; for Prisma's pooled
`DATABASE_URL`, the script uses the corresponding direct endpoint. Keep all
connection strings in `.env`, never in source control.

```powershell
npm run db:migrate:postgres-to-mongo
```

Review the source row counts and ensure MongoDB's schema has been applied with
`npm run prisma:push`. The apply command imports only into an empty target and
verifies each model's row count inside a MongoDB transaction:

```powershell
npm run db:migrate:postgres-to-mongo:apply
```

The migration preserves IDs, converts former PostgreSQL decimals to integers
scaled by 1000, and prints row counts only. MongoDB Atlas must support
transactions (a replica set). Optional unique values use partial unique indexes
so multiple absent values remain valid in MongoDB. Back up both databases
before applying.

## Hostinger Node.js deployment

The production database is MongoDB Atlas. Configure these variables in
Hostinger before both the build and runtime process:

```env
MONGODB_URI=mongodb+srv://...
AUTH_SECRET=<long-random-secret>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://your-domain.example
NEXT_PUBLIC_APP_URL=https://your-domain.example
```

`MONGODB_URI`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `NEXTAUTH_URL`, and
`NEXT_PUBLIC_APP_URL` are required for production. Configure
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` if
users upload profile photos, receipts, or documents. `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, and `ADMIN_NAME` are only needed when running the initial
seed; do not leave the seed password in a long-lived production environment.

Do not add `CLIENT_ID`, `CLIENT_SECRET`, `MYSQL_URL`, or `DATABASE_URL` unless a
separate integration explicitly uses them. They are not required by the
current NextAuth credentials login or MongoDB Prisma runtime. Migration-only
`POSTGRES_SOURCE_URL` should be configured temporarily on a trusted machine,
not as a normal Hostinger runtime variable.

Use the repository root as the application directory, `npm ci` for dependency
installation, `npm run build` for the build command, and `npm run start` for
the startup command. Use Node.js 22 or newer and the port supplied by
Hostinger. The Docker configuration is not the Hostinger deployment path.

Before switching traffic, back up both databases, allow the Hostinger outbound
IP in MongoDB Atlas, run the migration dry run, apply it only to an empty target,
and verify `/api/auth/session`, credentials login, and an authenticated page.

Rotate every credential that has previously been placed in a local `.env`
(MongoDB Atlas, Cloudinary, Google Cloud, and provider/domain settings). Never
commit `.env`, disclose secret values in logs, or put real values in
`.env.example`.

Hostinger local disk is not a durable shared file store. Keep uploads in
Cloudinary or attach persistent storage before relying on `.private-data` across
restarts.
