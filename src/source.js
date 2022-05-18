'use strict'

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler')
const { Agent } = require('https')

const { CarIterator } = require('./iterator')
const { logger, serializeError } = require('./logging')
const telemetry = require('./telemetry')

const s3Clients = {}

async function openS3Stream(bucketRegion, url) {
  let s3Request
  try {
    if (!s3Clients[bucketRegion]) {
      s3Clients[bucketRegion] = new S3Client({
        region: bucketRegion,
        requestHandler: new NodeHttpHandler({ httpsAgent: new Agent({ keepAlive: true, keepAliveMsecs: 60000 }) })
      })
    }
    const s3Client = s3Clients[bucketRegion]
    telemetry.increaseCount('s3-fetchs')

    const Bucket = url.hostname
    const Key = url.pathname.slice(1)

    // this imports just the getObject operation from S3
    s3Request = await telemetry.trackDuration('s3-fetchs', s3Client.send(new GetObjectCommand({ Bucket, Key })))
  } catch (e) {
    logger.error({ error: serializeError(e) }, `Cannot open file ${url}`)
    throw e
  }

  // Start parsing as CAR file
  try {
    return await CarIterator.fromReader(s3Request.Body, s3Request.ContentLength)
  } catch (e) {
    logger.error({ error: serializeError(e) }, `Cannot parse file ${url} as CAR`)
    throw e
  }
}

module.exports = {
  openS3Stream
}
