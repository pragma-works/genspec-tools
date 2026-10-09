# Publishing to the npm registry (not done; for the maintainer)

Today the way in is `npx github:pragma-works/genspec-tools <command>`, which needs no registry. Publishing adds a shorter command (`npx @pragma-works/genspec-tools <command>`) and version pinning. It needs the maintainer's npm account and a second factor, so nobody else can do it for you, and nothing here has been run.

Checked on 2026-10-09 against the registry: the names `@pragma-works/genspec-tools`, `genspec-tools` and `genspec` all answered 404, which means they are unclaimed. Names can be taken at any time, so check again just before.

## Once: the account and the organization scope

1. Sign in at https://www.npmjs.com (create the account if there is none) and turn on two-factor authentication for **authorization and publishing**.
2. Create the organization named `pragma-works`: avatar menu, "Add Organization", the free plan (public packages only). That reserves the scope `@pragma-works`. If the name is taken, pick another and use it below.
3. On your machine: `npm login`, then `npm whoami` must print your user name, and `npm org ls pragma-works` must list you as owner.

## Each release: prepare the package

Do this on a branch or commit it as its own change; the repository stays installable from GitHub the whole time.

1. Edit `package.json`:
   - `"name": "@pragma-works/genspec-tools"` (the `bin` stays `gs`);
   - delete the line `"private": true` (it is there to stop an accidental publish);
   - add the list of files that belong in the package, so the tests and the other fixtures stay out. The `good` fixture must stay, because `gs demo --sample` reads it:

     ```json
     "files": ["bin/gs.mjs", "tools/*/*.mjs", "tools/*/README.md", "tools/gs-check/test/fixtures/good", "LICENSE", "README.md"],
     "publishConfig": { "access": "public" }
     ```
   - raise `"version"` (the first release can stay `0.1.0`; later ones follow semver).
2. `npm pack --dry-run` and read the list. On 2026-10-09 it listed 38 files, 153 kB packed. It must contain `bin/gs.mjs`, the four tool folders, `tools/gs-demo/gs-demo.mjs` and the 18 files of `tools/gs-check/test/fixtures/good`, and must not contain `.gs-init-backup/`, `docs/` or any `test/` folder other than that fixture.
3. Run the tests: `npm run test:quick` (and `npm run test:all` for a release).
4. Prove the package works from a tarball before it goes public:

   ```
   npm pack                      # writes pragma-works-genspec-tools-0.1.0.tgz
   mkdir /tmp/try && cd /tmp/try
   cp <the repository>/pragma-works-genspec-tools-0.1.0.tgz .
   npx --yes --package=./pragma-works-genspec-tools-0.1.0.tgz gs demo --sample
   ```

## Publish

```
npm publish --access public
```

npm asks for a one-time code from the second factor. When it finishes:

```
cd (an empty folder)
npx @pragma-works/genspec-tools@latest help
npx @pragma-works/genspec-tools@latest demo --sample
```

Then tag the release in git (`git tag v0.1.0 && git push origin v0.1.0`) so the GitHub address can also be pinned with `#v0.1.0`, and change the README quick start to show the registry command first and the GitHub address as the fallback.

## Undo and caveats

- A published version cannot be replaced. Within 72 hours `npm unpublish @pragma-works/genspec-tools@0.1.0` can remove it; after that use `npm deprecate` and publish a new version.
- Publishing from a CI job with provenance (`npm publish --provenance`, a granular access token stored as a repository secret, `id-token: write` permission) is the safer long-term setup, but it is not needed for the first release. Never put a token in the repository.
- The package has no dependencies, so there is nothing else to audit or keep current. `gs update` fetches from the GitHub repository, not from the registry; if you want it to follow the registry instead, that is a change to `cmdUpdate` in `bin/gs.mjs`.
