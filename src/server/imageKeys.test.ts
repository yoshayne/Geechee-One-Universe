import test from "node:test";
import assert from "node:assert/strict";
import { isStoredBucketUrl, recoverKey, redactUrl } from "./imageKeys";

const KEY = "uploads/1a5538e5-c774-4d28-bfae-539568c408c4.png";

test("path-style signed URL", () => {
  const url = `https://storage.example.com/my-bucket/${KEY}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc`;
  assert.equal(recoverKey(url, "my-bucket"), KEY);
});

test("virtual-host-style signed URL", () => {
  const url = `https://my-bucket.storage.example.com/${KEY}?X-Amz-Signature=abc`;
  assert.equal(recoverKey(url, "my-bucket"), KEY);
});

test("URL-encoded path", () => {
  assert.equal(recoverKey(`https://storage.example.com/my-bucket/uploads%2F1a5538e5-c774-4d28-bfae-539568c408c4.png?X-Amz-Signature=a`, "my-bucket"), KEY);
  assert.equal(recoverKey(`https://my-bucket.storage.example.com/uploads%2F1a5538e5-c774-4d28-bfae-539568c408c4.png`, "my-bucket"), KEY);
});

test("old bucket with a different name is still recovered", () => {
  assert.equal(recoverKey(`https://storage.example.com/old-bucket-name/${KEY}?X-Amz-Signature=a`, "new-bucket"), KEY);
});

test("works without knowing the bucket name", () => {
  assert.equal(recoverKey(`https://my-bucket.storage.example.com/${KEY}`), KEY);
});

test("invalid or unusable links return null", () => {
  for (const bad of ["", "not a url", "ftp://storage.example.com/my-bucket/" + KEY, "/media/" + KEY, "https://storage.example.com/", "https://storage.example.com/my-bucket/", "https://storage.example.com/my-bucket/other/file.png?X-Amz-Signature=a", "https://storage.example.com/my-bucket/uploads/%E0%A4%A.png", "https://storage.example.com/my-bucket/uploads/../../etc/passwd.png", "https://storage.example.com/my-bucket/uploads/ABC.png"]) {
    assert.equal(recoverKey(bad, "my-bucket"), null, `should be null: ${bad}`);
  }
});

test("which stored values count as broken", () => {
  assert.equal(isStoredBucketUrl(`https://storage.example.com/b/${KEY}?X-Amz-Signature=a`, "storage.example.com"), true);
  assert.equal(isStoredBucketUrl(`https://elsewhere.example.org/x.png?X-Amz-Signature=a`), true);
  assert.equal(isStoredBucketUrl(`https://my-bucket.storage.example.com/${KEY}`, "storage.example.com"), true);
  assert.equal(isStoredBucketUrl(`https://storage.example.com/b/${KEY}`, "storage.example.com"), true);
  assert.equal(isStoredBucketUrl(`https://image.tmdb.org/t/p/w780/abc.jpg`, "storage.example.com"), false);
  assert.equal(isStoredBucketUrl(`https://canvas-lb.tubitv.com/opts/abc==/def/ghi==`, "storage.example.com"), false);
  assert.equal(isStoredBucketUrl(`/media/${KEY}`, "storage.example.com"), false);
  assert.equal(isStoredBucketUrl("", "storage.example.com"), false);
});

test("redaction hides the signature and access key", () => {
  const shown = redactUrl(`https://storage.example.com/b/${KEY}?X-Amz-Credential=SECRETKEYID%2F2026&X-Amz-Signature=SIGNATURE`);
  assert.equal(shown, `https://storage.example.com/b/${KEY}?…`);
  assert.ok(!/SECRETKEYID|SIGNATURE/.test(shown));
});
