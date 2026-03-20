/**
 * Puppeteer browser pool using puppeteer-cluster.
 * Reuses Chrome instances across PDF requests instead of launching a new one each time.
 */
const { Cluster } = require('puppeteer-cluster')

const LAUNCH_OPTIONS = {
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
}

let cluster = null
let initPromise = null

async function getCluster() {
  if (cluster) return cluster

  if (initPromise) return initPromise

  initPromise = Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: parseInt(process.env.PUPPETEER_MAX_CONCURRENCY || '3', 10),
    puppeteerOptions: LAUNCH_OPTIONS,
    timeout: 60_000,
    retryLimit: 1,
  }).then((c) => {
    cluster = c
    initPromise = null

    cluster.on('taskerror', (err, data) => {
      console.error('[BrowserPool] Task error for', data, err)
    })

    process.on('exit', () => cluster?.close())
    process.on('SIGINT', () => cluster?.close())
    process.on('SIGTERM', () => cluster?.close())

    return cluster
  })

  return initPromise
}

/**
 * Run a task in the browser pool.
 * @param {(page: import('puppeteer').Page) => Promise<T>} taskFn
 * @returns {Promise<T>}
 */
async function runInBrowser(taskFn) {
  const c = await getCluster()
  return c.execute(null, async ({ page }) => taskFn(page))
}

module.exports = { runInBrowser, getCluster }
