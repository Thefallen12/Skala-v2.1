## Docker deployment

1. Copy `.env.example` to `.env` and set `MONGODB_URL`, a private
   `AUTH_SECRET`, and the Cloudinary credentials. Profile photo originals are
   kept in private local storage and uploaded to Cloudinary for display.
2. Build and start the production container:

   ```powershell
   docker compose up --build -d
   ```

3. Open <http://localhost:3000>. If port 3000 is already in use, set
   `APP_PORT=3001` in `.env` before starting and use
   <http://localhost:3001>.

The image uses Next.js standalone output and runs the app as the non-root `node`
user. Uploaded private photos and receipts, including profile photo originals,
are stored in the persistent Compose volume `uploads`; the entrypoint
initializes its directory permissions before starting the app. Profile photo
Cloudinary URLs are used for display, so those copies are publicly addressable.
The app connects to the configured MongoDB replica set; Compose does not create
a database or apply Prisma schema changes. Review and apply schema changes
separately before deploying.

The container includes Chromium for PDF generation. For production, provide a
persistent volume or object storage shared by all app instances, and configure
the reverse proxy upload limit to allow requests up to 27 MB.

To stop the container, run `docker compose down`. The `uploads` volume remains
available across restarts.
