/**
 * Notification Helper
 * -------------------
 * Single function that:
 *   1. Persists a notification to the DB (Notification model)
 *   2. Pushes it in real-time via Socket.IO to the target user
 *
 * Every controller that previously did:
 *   req.io.to(`user-${userId}`).emit('notification', { ... });
 * should now call:
 *   await createNotification(req.io, userId, { ... });
 *
 * This guarantees the notification is stored even when the user is
 * offline and will appear in their feed on next login.
 */

const Notification = require('../models/Notification');

/**
 * Create a persistent notification and push it in real-time.
 *
 * @param {import('socket.io').Server|null} io   — Socket.IO server instance (null = skip push)
 * @param {string|ObjectId} userId               — Target user's _id
 * @param {object} data
 * @param {string}  data.message                 — Notification body text (required)
 * @param {string} [data.title]                  — Bold heading
 * @param {string} [data.type='info']            — info | success | warning | error
 * @param {string} [data.link]                   — Optional URL the notification points to
 * @returns {Promise<object|null>}               — The saved Notification document (or null on error)
 */
async function createNotification(io, userId, data) {
  if (!userId || !data || !data.message) return null;

  try {
    const doc = await Notification.create({
      userId,
      title:   data.title   || '',
      message: data.message,
      type:    data.type     || 'info',
      link:    data.link     || null
    });

    // Push real-time to the user's socket room
    if (io) {
      io.to(`user-${userId}`).emit('notification', {
        _id:       doc._id,
        title:     doc.title,
        message:   doc.message,
        type:      doc.type,
        link:      doc.link,
        read:      doc.read,
        createdAt: doc.createdAt.toISOString(),
        timestamp: doc.createdAt.toISOString()
      });
    }

    return doc;
  } catch (err) {
    console.error('⚠️ createNotification failed:', err.message);
    return null;
  }
}

/**
 * Convenience: send the same notification to multiple users.
 */
async function createNotificationForMany(io, userIds, data) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  return Promise.all(userIds.map(uid => createNotification(io, uid, data)));
}

module.exports = { createNotification, createNotificationForMany };
