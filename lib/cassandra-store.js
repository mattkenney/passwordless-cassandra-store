'use strict';

const bcrypt = require('bcryptjs');
const cassandra = require('cassandra-driver');

const rounds = 10; // bcrypt salt generation rounds

function CassandraStore(options) {
  this._client = new cassandra.Client(options);
  this._ready = this._client.execute(`
      CREATE TABLE IF NOT EXISTS login_token (
        uid varchar PRIMARY KEY,
        token_hash varchar,
        ttl bigint,
        origin varchar
      );
    `);
}

/**
 * Checks if the provided token / user id combination exists and is
 * valid in terms of time-to-live. If yes, the method provides the
 * the stored referrer URL if any.
 * @param  {String}   token to be authenticated
 * @param  {String}   uid Unique identifier of an user
 * @param  {Function} callback in the format (error, valid, referrer)
 * In case of error, error will provide details, valid will be false and
 * referrer will be null. If the token / uid combination was not found,
 * valid will be false and all else null. Otherwise, valid will
 * be true, referrer will (if provided when the token was stored) be the
 * original URL requested and error will be null.
 */
CassandraStore.prototype.authenticate = function (token, uid, callback) {
  if (!token || !uid || !callback) throw Error('missing required argument');
  const cql = 'SELECT * FROM login_token WHERE uid=?';
  this._client
    .execute(cql, [uid], { prepare: true })
    .then(result => result.first())
    .then(row => {
      if (!row || row.ttl < Date.now()) return callback(null, false, null);
      return bcrypt.compare(token, row.token_hash)
        .then(result => callback(null, result, result ? row.origin : null))
        ;
    })
    .catch(err => callback(err, false, null))
    ;
}

/**
 * Stores a new token / user ID combination or updates the token of an
 * existing user ID if that ID already exists. Hence, a user can only
 * have one valid token at a time
 * @param  {String}   token Token that allows authentication of _uid_
 * @param  {String}   uid Unique identifier of an user
 * @param  {Number}   ttl Validity of the token in ms
 * @param  {String}   origin Originally requested URL or null
 * @param  {Function} callback Called with callback(error) in case of an
 * error or as callback() if the token was successully stored / updated
 */
CassandraStore.prototype.storeOrUpdate = function (token, uid, ttl, origin, callback) {
  if (!token || !uid || !ttl || !callback) throw Error('missing required argument');
  const cql = 'UPDATE login_token SET token_hash=?, ttl=?, origin=? WHERE uid=?';
  ttl += Date.now();
  origin = origin || '';
  bcrypt.hash(token, rounds)
    .then(hash => this._client.execute(cql, [hash, ttl, origin, uid], { prepare: true }))
    .then(result => callback())
    .catch(err => callback(err))
    ;
}

/**
 * Invalidates and removes a user and the linked token
 * @param  {String}   uid User ID for which the record shall be removed
 * @param  {Function} callback called with callback(error) in case of an
 * error or as callback() if the uid was successully invalidated
 */
CassandraStore.prototype.invalidateUser = function (uid, callback) {
  if (!uid || !callback) throw Error('missing required argument');
  const cql = 'DELETE FROM login_token WHERE uid=?';
  this._client.execute(cql, [uid], { prepare: true })
    .then(() => callback())
    .catch(err => callback(err))
    ;
}

/**
 * Removes and invalidates all token
 * @param  {Function} callback Called with callback(error) in case of an
 * error or as callback() otherwise
 */
CassandraStore.prototype.clear = function (callback) {
  if (!callback) throw Error('missing required argument');
  const cql = 'TRUNCATE login_token';
  this._client.execute(cql, [], { prepare: true })
    .then(() => callback())
    .catch(err => callback(err))
    ;
}

/**
 * Number of tokens stored (no matter the validity)
 * @param  {Function} callback Called with callback(null, count) in case
 * of success or with callback(error) in case of an error
 */
CassandraStore.prototype.length = function (callback) {
  if (!callback) throw Error('missing required argument');
  const cql = 'SELECT COUNT(*) AS value FROM login_token';
  this._client.execute(cql, [], { prepare: true })
    .then(result => result.first())
    .then(row => callback(null, Number(row.value)))
    .catch(err => callback(err))
    ;
}

/**
 * Checks if the store is ready for use.
 * @param  {Function} callback Called with callback(error) in case of an
 * error or as callback() if the store is ready for use
 */
CassandraStore.prototype.ready = function (callback) {
    this._ready
        .then(() => callback())
        .catch(err => callback(err))
        ;
};

module.exports = CassandraStore;
