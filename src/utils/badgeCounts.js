/**
 * Admin badge counts
 *
 * Single source of truth for the two notification badges in the navbar:
 *   - pendingTheses    : Thesis documents with status = "Pending"
 *   - pendingRequests  : AccountRequest + AccountRetrieval documents with status = "Pending"
 *
 * Whenever a controller changes one of these (upload/approve/reject/etc),
 * it should call `emitBadgeCounts(req.io)` after its DB write so the
 * Socket.IO `badge-counts-update` event re-syncs every admin's navbar.
 */

const Thesis = require('../models/Thesis');
const AccountRequest = require('../models/AccountRequest');
const AccountRetrieval = require('../models/AccountRetrieval');

async function getBadgeCounts() {
  const [pendingTheses, pendingAccountRequests, pendingRetrievals] = await Promise.all([
    Thesis.countDocuments({ status: 'Pending' }),
    AccountRequest.countDocuments({ status: 'Pending' }),
    AccountRetrieval.countDocuments({ status: 'Pending' })
  ]);

  return { pendingTheses, pendingRequests: pendingAccountRequests + pendingRetrievals };
}

/**
 * Compute fresh counts from the DB and broadcast them to every connected
 * admin client (room: "admins"). Errors are swallowed; this should never
 * block the originating HTTP request.
 *
 * @param {import('socket.io').Server | null | undefined} io
 * @returns {Promise<{pendingTheses:number, pendingRequests:number} | null>}  (pendingRequests = AccountRequests + AccountRetrievals)
 */
async function emitBadgeCounts(io) {
  try {
    const counts = await getBadgeCounts();
    if (io) {
      io.to('admins').emit('badge-counts-update', counts);
    }
    return counts;
  } catch (err) {
    console.error('⚠️ Failed to emit badge counts:', err.message);
    return null;
  }
}

module.exports = { getBadgeCounts, emitBadgeCounts };
