import './load-env.js'
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3'

const origins = (process.env.APP_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (origins.length === 0) throw new Error('APP_ORIGINS must contain at least one browser origin')

const s3 = new S3Client({ forcePathStyle: true })
await s3.send(
  new PutBucketCorsCommand({
    Bucket: 'attachments',
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ['GET', 'PUT', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
)

console.log(`Configured Object Storage CORS for ${origins.length} origin(s).`)
