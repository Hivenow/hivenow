import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const bucket = process.env.R2_BUCKET_NAME || "hive-media";

async function configureCors() {
  try {
    console.log(`Configuring CORS for bucket: ${bucket}...`);
    const command = new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
            AllowedOrigins: [
              "https://hivenow.in",
              "https://www.hivenow.in",
              "https://admin.hivenow.in",
              "https://beelynadmin.hivenow.in",
              "https://boutique.hivenow.in",
              "https://seller.hivenow.in",
              "http://localhost:3000",
              "http://localhost:3001",
              "http://localhost:3002",
            ],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    });

    await s3Client.send(command);
    console.log("CORS configuration successful!");
  } catch (error) {
    console.error("Failed to configure CORS:", error);
  }
}

configureCors();
