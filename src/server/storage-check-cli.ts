import { checkStorage } from "./storage";

// Run with: npm run storage:check   (uses the same variables as the live site)
checkStorage().then((r) => {
  console.log(r.summary);
  console.log("");
  for (const s of r.steps) console.log(`${s.ok ? "OK    " : "FAILED"}  ${s.step}: ${s.message}`);
  console.log("");
  console.log(`Endpoint: ${r.settings.endpoint} | Bucket: ${r.settings.bucket} | Addressing: ${r.settings.addressing} | Region: ${r.settings.region}`);
  console.log(`Keys code: ${r.settings.keysFingerprint} (changes whenever the access key, bucket or endpoint changes)`);
  process.exit(r.ok ? 0 : 1);
});
