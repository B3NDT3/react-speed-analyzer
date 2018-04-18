import { baqend } from 'baqend'
import { bootstrap } from './_compositionRoot'

const ONE_MINUTE = 1000 * 60
const ONE_DAY = ONE_MINUTE * 60 * 24

/**
 * Executed by the Cronjob.
 */
export async function run(db: baqend) {
  const { testWorker } = bootstrap(db)

  db.log.info('Running cronTestWorker job')

  const now = Date.now()
  const tests = await db.TestResult.find()
    .equal('hasFinished', false)
    .lessThanOrEqualTo('updatedAt', new Date(now - ONE_MINUTE))
    .greaterThanOrEqualTo('updatedAt', new Date(now - ONE_DAY))
    .isNotNull('webPagetests')
    .resultList()

  for (const test of tests) {
    db.log.info(`Running cronTestWorker job for test ${test.key}`)
    test.retries = test.retries === null ? 0 : test.retries + 1

    await test.save()
    await testWorker.next(test)
  }
}