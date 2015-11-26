var Replicator = require('./')
var bole = require('bole')
var http = require('http')
var levelup = require('levelup')
var memdown = require('memdown')
var serve = require('commonform-serve')
var tape = require('tape')

tape('replicate existing and new forms', function(test) {
  var replicatedServer, replicatedServerPort
  var replicatingServer, replicator

  var forms = [
    { content: [ 'First' ] },
    { content: [ 'Second' ] } ]
  var replicatedForms = [ ]

  // Array of test steps, in chronological order. Steps are run with a fixed
  // time delay between them, using a helper function below.
  var steps = [

    // Start a forms server.
    function(done) {
      var log = bole('test')
      var level = levelup('', { db: memdown })
      replicatedServer = http.createServer(serve(log, level))
      // Listen on a random high port.
      replicatedServer.listen(0, function() {
        // Save that port number for making HTTP requests.
        replicatedServerPort = this.address().port
        done() }) },

    // POST the first form.
    postForm.bind(null, forms[0]),

    // Start a replicating server that proxies HTTP callback requests to a
    // Replicator instance.
    function(done) {
      replicator = new Replicator()
        .on('digest', function(digest) {
          test.equal(
            typeof digest, 'string',
            'digest event sent digest string')
          // Request replication of all digests.
          replicator.request(digest) })
        .on('form', function(digest, replicatedForm) {
          test.equal(
            typeof digest, 'string',
            'form event sent digest string')
          test.equal(
            typeof replicatedForm, 'object',
            'form event sent form object')
          // Add each replicated form object to the array, so it can be checked
          // after all test steps are done.
          replicatedForms.push(replicatedForm) })
        .on('error', done)
      replicatingServer = http.createServer()
        // Proxy all requests to the Replicator instance's HTTP request
        // handler function.
        .on('request', function(request, response) {
          replicator.handler(request, response) })
        // Stop replicating when the server closes.
        .once('close', function() {
          replicator.stop() })
      replicatingServer.listen(0, function() {
        var port = this.address().port
        var localhost = 'http://localhost:'
        // The URL for the forms server.
        var formServer = ( localhost + replicatedServerPort )
        // The URL the forms server should call back to with new forms.
        var callbackEndpoint = ( localhost + port + '/forms' )
        //Start replication.
        replicator.start(formServer, callbackEndpoint)
        done() }) },

    // POST the second form after starting replication.
    postForm.bind(null, forms[1]),

    // Check that all forms have been replicated.
    function(done) {
      test.deepEqual(forms, replicatedForms, 'replicated all forms')
      done() } ]

  // Run after all steps are completed, to clean up after the test.
  function afterSteps(error) {
    test.ifError(error, 'no error')
    // Close HTTP servers.
    replicatedServer.close()
    replicatingServer.close()
    // End the test.
    test.end() }

  // Start running steps.
  runSteps()

  // Helper functions.

  // POST a form to the forms server.
  function postForm(form, callback) {
    http
      .request({
        port: replicatedServerPort,
        path: '/forms',
        method: 'POST' })
      .once('response', function(response) {
        if (response.statusCode === 201) {
          callback() }
        else {
          callback('fail') } })
      .once('error', callback)
      .end(JSON.stringify(form)) }

  // Run steps in order, with a fixed time delay between them. Like
  // async.series, but with setTimeout for > 0ms, rather than setImmediate.
  function runSteps(index) {
    index = ( index || 0 )
    steps[index](function(error) {
      if (error) {
        afterSteps(error) }
      else {
        if (index < ( steps.length - 1 )) {
          setTimeout(runSteps.bind(this, ( index + 1 )), 500) }
        else {
          afterSteps() } } }) } })
