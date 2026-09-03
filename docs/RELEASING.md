# Releasing

This project publishes a Chrome extension package. Store publishing is a manual account action; the repository prepares and verifies the artifact locally.

## Release checklist

1. Review the change list and update the version in `package.json`.
2. Install from the lockfile and run all checks:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check
   pnpm compile
   pnpm test
   pnpm exec playwright install chromium
   pnpm test:e2e
   ```

3. Build the unpacked production extension if manual inspection is needed:

   ```bash
   pnpm build
   ```

4. Create the Chrome Web Store archive:

   ```bash
   pnpm zip
   ```

   WXT writes the generated ZIP under `.output/`. Use the Chrome archive, not the Firefox archive, for the Chrome Web Store upload.

5. Inspect the generated manifest and verify the name, description, version, permissions, host matches, and extension icon before uploading.

## Chrome Web Store submission

Follow Google's [official publishing flow](https://developer.chrome.com/docs/webstore/publish):

1. Register and configure a Chrome Web Store developer account.
2. Open the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Choose **Add new item**, select the ZIP from `.output/`, and upload it.
4. Complete the Store Listing, Privacy, Distribution, and Test instructions sections as applicable.
5. Confirm the single purpose and local-only data handling match [PRIVACY.md](../PRIVACY.md).
6. Submit the item for review. Choose deferred publishing if the release should wait for a manual publish decision after review.

Do not commit store credentials, unpublished listing secrets, or generated `.output/` files.
