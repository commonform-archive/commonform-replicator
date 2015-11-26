module.exports = Replicator

var EventEmitter = require('events').EventEmitter
var Split = require('stream-split')
var concat = require('concat-stream')
var inherits = require('util').inherits
var isSHA256 = require('is-sha-256-hex-digest')
var parse = require('lite-json-parse')
var url = require('url')
var validate = require('commonform-validate')

// Replicator is an EventEmitter.

function Replicator() {
  EventEmitter.call(this) }

inherits(Replicator, EventEmitter)

// Functions on its prototype that begin with "_" are not part of its public
// API, and may change without warning.
var prototype = Replicator.prototype

// Start replication from the Common Form server, directing it to make HTTP
// callbacks for new Common Forms to a given endpoint. Two arguments:
//
// 1. `formServerURL` is the URL of the Common Form server,
//    like `"https://api.commonform.org"`.
//
// 2. `callbackEndpoint` is the URL the Common Form server should POST with
//    callbacks for newly created Common Forms,
//    like `"definitions.commonform.org/forms"`.
prototype.start = function(formServerURL, callbackEndpoint) {
  var self = this
  // Parse the Common Form server URL and extract host, port, auth, and
  // protocol in formats compatible with `http.request`.
  var parsed = url.parse(formServerURL)
  self.formServer = {
    auth: parsed.auth,
    hostname: parsed.hostname,
    port: parsed.port }
  self.protocol = (
    self.formServer.protocol === 'https:' ?
      require('https') :
      require('http') )
  self._callbackEndpoint = callbackEndpoint
  // First, register an HTTP callback for new Common Forms.
  self._registerHTTPCallback(function() {
    // Then, request a list of the digests of all Common Forms currently stored
    // by the Common Form server.
    //
    // By registering the callback first, we avoid timelines like:
    //
    // 1. Server begins listing digests for existing forms A, B, C.
    // 2. New form D is posted.
    // 3. Server registers callback.
    // 4. New form E is posted.
    // 5. Receive HTTP callback for E, but not D.
    self._getFormsList() }) }

// Send a request to the Common Form server to call back to our endpoint with
// the digests of new Common Forms.
prototype._registerHTTPCallback = function(onSuccess) {
  var self = this
  var options = { method: 'POST', path: '/callbacks' }
  this._formServerRequest(options)
    .once('response', function(response) {
      var statusCode = response.statusCode
      // 2xx status code denotes success.
      var successful = ( statusCode >= 200 && statusCode < 300 )
      if (successful) {
        self.emit('info', 'Registered HTTP callback.')
        onSuccess() }
      else {
        var error = new Error('Could not register HTTP callback.')
        error.statusCode = statusCode
        error.action = 'register'
        self.emit('error', error) } })
    .once('error', function(error) {
      self.emit('error', error) })
    // The request body is the URL for the endpoint for sending callbacks.
    .end(self._callbackEndpoint) }

// Request a list of all the digests of Common Forms stored on the Common Form
// server. This is potentially a very long list and a long-running request.
prototype._getFormsList = function() {
  var self = this
  var options = { method: 'GET', path: '/forms' }
  var request = self._formServerRequest(options)
    .once('response', function(response) {
      var splitter = new Split(new Buffer('\n'))
      splitter.on('data', function(buffer) {
        self.emit('digest', buffer.toString()) })
      response.pipe(splitter) })
    .once('error', function(error) {
      self.emit('error', error) })
  self._formsRequest = request
  request.end() }

// Stop replicating Common Forms.
prototype.stop = function() {
  // Abort the potentially long-running digest list request.
  this._formsRequest.abort() }

// The HTTP handler for responding to HTTP callbacks with digests of new Common
// Forms on the Common Form server.
prototype.handler = function(request, response) {
  var self = this
  // The request body is plain text containing just the digest of the new
  // Common Form.
  request.pipe(concat(function(buffer) {
    var body = buffer.toString()
    if (isSHA256(body)) {
      response.statusCode = 200
      response.end()
      // Emit an event. If the Replicator user decides the form the form with
      // this digest should be fetched from the Common Form server, they will
      // call `replicator.request(digest)`.
      self.emit('digest', body) }
    else {
      response.statusCode = 400
      response.end()
      self.emit('invalid', body) } })) }

// Fetch a form from the Common Form server for replication.
prototype.request = function(digest) {
  var self = this
  var path = ( '/forms/' + digest )
  var options = { method: 'GET', path: path }
  self._formServerRequest(options)
    .once('response', function(response) {
      // The response body should be a JSON-compatible serialization of a valid
      // Common Form.
      response.pipe(concat(function(buffer) {
        parse(buffer, function(error, json) {
          if (error) {
            self.emit('invalid', buffer) }
          else {
            if (validate.form(json)) {
              self.emit('form', digest, json) }
            else {
              self.emit('invalid', json) } } }) })) })
    .once('error', function(error) {
      error.action = 'request form'
      self.emit('error', error) })
    .end() }

// Shorthand function for sending requests to the Common Form server. Takes a
// single argument, an object of `http.request()` options to merge with
// host, port, and other information for the Common Form server.
prototype._formServerRequest = function(argument) {
  var options = Object.assign(argument, this.formServer)
  return this.protocol.request(options) }
