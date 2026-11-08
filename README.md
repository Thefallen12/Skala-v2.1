# GIS map setup

The project map supports Google satellite imagery through the Google Maps
Platform Map Tiles API. Add the restricted browser key to the local `.env`:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-restricted-api-key
```

Enable the Map Tiles API and billing for its Google Cloud project, then restrict
the key to the application's HTTP referrers and the Map Tiles API. Restart the
Next.js development server after changing the environment.

The dashboard's current-location village lookup uses the Google Maps
Geocoding API. Configure a separate server-side key in `.env`:

```env
GOOGLE_MAPS_GEOCODING_API_KEY=your-server-side-geocoding-key
```

Enable the Geocoding API and billing in Google Cloud, and restrict this key to
the Geocoding API. Keep this key server-side; do not use the `NEXT_PUBLIC_`
browser key for geocoding requests.

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

Vendor invoice numbers are optional. After deploying a schema change that
makes `Invoice.invoiceNumber` optional, run the focused index migration once
against the target MongoDB database:

```powershell
npm run db:migrate:optional-invoice-number
```

It preserves uniqueness for provided invoice numbers while allowing multiple
invoice/bon records without a number.

## Hostinger Node.js deployment

The production database is MongoDB Atlas. Configure these variables in
Hostinger before both the build and runtime process:

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

## Browser push notifications

The app sends Web Push notifications to a Mover when a new ticket is created
with that Mover assigned. Each browser/device stores its own subscription in
the MongoDB `User` document's `pushSubscriptions` array. Users can enable or
disable notifications from **Profil > Notifikasi**. Push requires HTTPS and a
browser that supports the Push API.

Install the sender and type definitions, then generate a VAPID key pair:

```powershell
npm install web-push
npm install -D @types/web-push
npx web-push generate-vapid-keys
```

Keep the generated private key secret. Set these variables in the local `.env`
and in Hostinger's runtime environment:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=generated-public-key
VAPID_PRIVATE_KEY=generated-private-key
VAPID_SUBJECT=mailto:admin@your-domain.example
```

The browser fetches the public key from `/api/push/vapid-public-key` at runtime,
so changing it does not require baking it into the browser bundle. Configure all
three variables on the running Hostinger application and restart it. Keep the
same VAPID key pair for subscriptions already saved in MongoDB; if you rotate
the keys, users must enable notifications again on each device. Never commit
`.env` or paste private keys into source control.

On iPhone and iPad, Web Push is supported on iOS/iPadOS 16.4 and later for a
web app added to the Home Screen. In Safari, use **Share > Add to Home Screen**,
open the app from its new Home Screen icon, sign in, and enable notifications
under **Profil > Notifikasi**. Allow notifications when iOS prompts.
