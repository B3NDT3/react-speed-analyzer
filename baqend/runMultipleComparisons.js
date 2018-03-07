const { runComparison } = require('./runComparison');
const { DEFAULT_LOCATION, DEFAULT_ACTIVITY_TIMEOUT } = require('./queueTest');
const { updateBulkTest } = require('./updateBulkComparison');

function createBulkTest(db, createdBy, {
  url,
  whitelist,
  speedKitConfig,
  activityTimeout = DEFAULT_ACTIVITY_TIMEOUT,
  runs = 1,
  caching = false,
  location = DEFAULT_LOCATION,
  mobile = false,
  priority = 9,
}) {
  const bulkTest = new db.BulkTest();
  bulkTest.url = url;
  bulkTest.createdBy = createdBy;
  bulkTest.hasFinished = false;
  bulkTest.location = location;
  bulkTest.mobile = mobile;
  bulkTest.runs = runs;
  bulkTest.priority = priority;
  bulkTest.completedRuns = 0;

  const options = {
    location,
    caching,
    url,
    activityTimeout,
    speedKitConfig,
    isSpeedKitComparison: bulkTest.urlAnalysis ? bulkTest.urlAnalysis.enabled : false,
    speedKitVersion: '', // FIXME save in urlAnalysis!
    mobile,
    priority,
  };

  // async
  return bulkTest.save()
    .then(() => {
      const callback = firstOverview => {
        updateBTest(db, bulkTest);
        // other tests
        const newOptions = Object.assign({}, options, { speedKitConfig: firstOverview.speedKitConfig, skipPrewarm: true });
        db.log.info(`Starting other (${runs - 1}) test(s)`, { newOptions });
        const promises = new Array(runs - 1)
          .fill(null)
          .map(() => startComparison(db, bulkTest, newOptions));
        return Promise.all(promises)
          .then(() => {
            db.log.info(`Bulktest successful`, {bulkTest: bulkTest.id});
          })
          .catch(error => {
            db.log.error(`Bulktest not entirely successful`, {bulkTest: bulkTest.id, error: error.stack});
          });
      };

      // first test
      db.log.info(`Starting first of ${runs} tests`);
      bulkTest.testOverviews = [];
      return startComparison(db, bulkTest, options, callback);
    })
    .catch((e) => {
      db.log.error('While running the bulk test an error occurred', { e });
    });
}

function startComparison(db, bulkTest, testInfo, callback = null) {
  if (callback) {
    return runComparison(db, testInfo, callback).then(comparison => {
      bulkTest.testOverviews.push(comparison);
      return bulkTest.ready().then(() => bulkTest.save());
    });
  }

  return new Promise((resolve) => {
    runComparison(db, testInfo, resolve).then(comparison => {
      bulkTest.testOverviews.push(comparison);
    })
    .catch(error => {
      db.log.error(`Error starting a comparison`, {error: error.stack, bulkTest: bulkTest.id, testInfo})
    });
  })
  .then(testOverview => {
    updateBTest(db, bulkTest);
    return testOverview;
  });
}

function updateBTest(db, bulkTest) {
  return bulkTest.ready().then(() => bulkTest.save())
    .then(() => updateBulkTest(db, bulkTest))
    .catch((error) => {
      db.log.error(`Could not update bulktest`, { error: error.stack, bulkTest: bulkTest.id });
    });
}

function runComparisons(db, req, res) {
  const { body } = req;
  const { createdBy = null } = body;
  let { tests } = body;
  if (body instanceof Array) {
    tests = body;
  }

  return Promise.all(tests.map(entry => createBulkTest(db, createdBy, entry)))
    .catch(error => `Error: ${error.stack}`)
    .then(results => res.send(results));
}

exports.post = runComparisons;
exports.createBulkTest = createBulkTest;
exports.runComparisons = runComparisons;
