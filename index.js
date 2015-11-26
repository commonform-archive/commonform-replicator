module.exports = Replicator

var EventEmitter = require('events').EventEmitter
var Split = require('stream-split')
var concat = require('concat-stream')
var inherits = require('util').inherits
var isSHA256 = require('is-sha-256-hex-digest')
var parse = require('lite-json-parse')
var url = require('url')
var validate = require('commonform-validate')

function Replicator() {
  EventEmitter.call(this) }

inherits(Replicator, EventEmitter)

var prototype = Replicator.prototype

prototype.replicate = function(formServerURL, endpoint) {
  var parsed = url.parse(formServerURL)
  this.formServer = {
    auth: parsed.auth,
    hostname: parsed.hostname,
    port: parsed.port }
  this.protocol = (
    this.formServer.protocol === 'https:' ?
      require('https') :
      require('http') )
  this.endpoint = endpoint
  this._registerHTTPCallback(function() {
    this._getFormsList() }) }

prototype._registerHTTPCallback = function(onSuccess) {
  var self = this
  this._formServerRequest({ method: 'POST', path: '/callbacks' })
    .once('response', function(response) {
      var statusCode = response.statusCode
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
      self.emit(error) })
    .end(self.endpoint) }

prototype._getFormsList = function() {
  var self = this
  this._formServerRequest({ method: 'GET', path: '/forms' })
    .once('response', function(response) {
      var splitter = new Split(new Buffer('\r\n'))
      splitter
        .on('data', function(buffer) {
          self.emit('digest', buffer.toString()) })
      response.pipe(splitter) })
    .once('error', function(error) {
      self.emit(error) })
    .end() }

prototype.handler = function(request, response) {
  var self = this
  request.pipe(concat(function(buffer) {
    var body = buffer.toString()
    if (isSHA256(body)) {
      response.statusCode = 200
      response.end()
      self.emit('digest', body) }
    else {
      response.statusCode = 400
      response.end()
      self.emit('invalid', body) } })) }

prototype.request = function(digest) {
  var self = this
  var path = ( '/forms/' + digest )
  self._formServerRequest({ method: 'GET', path: path })
    .once('response', function(response) {
      response.pipe(concat(function(buffer) {
        parse(buffer, function(error, json) {
          if (error) {
            self.emit('invalid', buffer) }
          else {
            if (validate.form(json)) {
              self.emit('form', digest, json) }
            else {
              self.emit('invalid', json) } } }) })) })
    .on('error', function(error) {
      error.action = 'request form'
      self.emit('error', error) }) }

prototype._formServerRequest = function(argument) {
  var options = Object.assign(argument, this.formServer)
  return this.protocol.request(options) }
