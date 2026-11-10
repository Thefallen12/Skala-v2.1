if (
  process.env.CLOUDINARY_URL &&
  (process.env.CLOUDINARY_URL.includes("<") ||
    !process.env.CLOUDINARY_URL.startsWith("cloudinary://"))
) {
  delete process.env.CLOUDINARY_URL;
}

export {};
