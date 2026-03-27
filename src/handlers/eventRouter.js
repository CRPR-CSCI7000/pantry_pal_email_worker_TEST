'use strict';

const logger = require('../config/logger');
const {
  sendItemAddedEmail,
  sendItemRemovedEmail,
  sendExpiringSoonEmail,
} = require('../services/emailService');

/**
 * Route a validated event envelope to the correct email handler.
 *
 * @param {object} envelope - validated event (passes validateEvent())
 * @returns {Promise<{ handled: boolean, result?: any }>}
 */
async function routeEvent(envelope) {
  const { event_type, payload } = envelope;

  logger.info('Routing event', { event_type });

  switch (event_type) {
    case 'pantry.item.added':
      return { handled: true, result: await sendItemAddedEmail(payload) };

    case 'pantry.item.removed':
      return { handled: true, result: await sendItemRemovedEmail(payload) };

    case 'pantry.item.expiring_soon':
      return { handled: true, result: await sendExpiringSoonEmail(payload) };

    default:
      // validateEvent() should prevent reaching here, but handle gracefully
      logger.warn('No handler for event_type', { event_type });
      return { handled: false };
  }
}

module.exports = { routeEvent };
