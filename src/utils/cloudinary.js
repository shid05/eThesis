const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload a file buffer to Cloudinary using buffer directly.
 * This ensures resource_type parameter is respected correctly.
 * @param {Buffer} fileBuffer - The file data from multer memoryStorage
 * @param {Object} options - Cloudinary upload options (folder, resource_type, etc.)
 * @returns {Promise<Object>} Cloudinary upload result with secure_url, public_id, etc.
 */
async function uploadToCloudinary(fileBuffer, options = {}) {
  console.log(`☁️ Uploading to Cloudinary (${(fileBuffer.length / 1024).toFixed(1)} KB, type: ${options.resource_type || 'auto'})...`);

  // Use stream upload for raw files to ensure proper handling
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        ...options,
        resource_type: options.resource_type || 'auto'
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log(`✅ Cloudinary upload complete: ${result.secure_url}`);
          resolve(result);
        }
      }
    );

    // Write buffer to stream
    uploadStream.end(fileBuffer);
  });
}

/**
 * Get resource details from Cloudinary to verify upload
 * @param {string} publicId - The Cloudinary public_id of the file
 * @param {Object} options - Optional (e.g., { resource_type: 'raw' } for PDFs)
 * @returns {Promise<Object>} Cloudinary resource details
 */
function getResourceDetails(publicId, options = {}) {
  return cloudinary.api.resource(publicId, options);
}

/**
 * Delete a file from Cloudinary by its public ID.
 * @param {string} publicId - The Cloudinary public_id of the file
 * @param {Object} options - Optional (e.g., { resource_type: 'raw' } for PDFs)
 * @returns {Promise<Object>} Cloudinary deletion result
 */
function deleteFromCloudinary(publicId, options = {}) {
  return cloudinary.uploader.destroy(publicId, options);
}

/**
 * Extract the Cloudinary public_id from a delivery URL.
 * Handles both image-style URLs (with format extension) and raw URLs
 * (where the extension is part of the public_id, e.g. PDFs).
 *
 *   https://res.cloudinary.com/<cloud>/raw/upload/v123/ethesis/theses/thesis-x-1.pdf
 *     -> "ethesis/theses/thesis-x-1.pdf"
 *   https://res.cloudinary.com/<cloud>/image/upload/v123/cld-sample.jpg
 *     -> "cld-sample"
 *
 * @param {string} url - Cloudinary secure_url
 * @param {Object} [opts]
 * @param {boolean} [opts.stripExtension=false] - strip trailing extension (image-style)
 * @returns {string|null} the public_id, or null if it can't be parsed
 */
function extractPublicIdFromUrl(url, { stripExtension = false } = {}) {
  if (!url || typeof url !== 'string') return null;
  // grab everything after `/upload/` and an optional version segment `v123/`
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\?.*)?$/);
  if (!match) return null;
  let publicId = match[1];
  if (stripExtension) {
    publicId = publicId.replace(/\.[a-zA-Z0-9]+$/, '');
  }
  return publicId;
}

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary,
  getResourceDetails,
  extractPublicIdFromUrl
};
