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
