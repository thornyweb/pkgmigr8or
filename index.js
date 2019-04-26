#!/usr/bin/env node

const exec = require("child_process").exec;
const fs = require("fs");
const _cliProgress = require("cli-progress");
const semver = require("semver");

const NEW_REGISTRY_URL = process.argv[3];
const PACKAGE_FILE_PATH = process.argv[2];
const PACKAGE_FILE_DATA = fs
  .readFileSync(PACKAGE_FILE_PATH)
  .toString()
  .split("\n");

if (!NEW_REGISTRY_URL) {
  throw "You must provide a URL for your new registry.";
  process.exit();
}

function resolveAllConcurrent(proms, progress_cb, concurrency = 10) {
  let d = 0;
  let jobs = proms.map(prom => async () => {
    const r = await prom();
    progress_cb(++d);
    return r;
  });
  const threads = Array(concurrency)
    .fill(null)
    .map(() =>
      (async () => {
        let results = [];
        while (jobs.length) {
          results.push(await jobs.shift()());
        }
        return results;
      })()
    );
  return Promise.all(threads).then(results =>
    results.reduce((acc, cur) => acc.concat(cur), [])
  );
}

const getVersionsForPackage = package =>
  new Promise((resolve, reject) => {
    const limitPackageVersions = package.indexOf("#") > 0;
    let packageName = package;
    let packageVersionLimit;
    if (limitPackageVersions) {
      const splitPackage = package.split("#");
      packageName = splitPackage[0];
      packageVersionLimit = splitPackage[1];
    }
    exec("npm view " + packageName + " versions", (e, out) => {
      if (e) {
        return reject(e);
      }
      resolve(
        JSON.parse(out.replace(/'/g, '"'))
          .filter(
            version =>
              !limitPackageVersions ||
              (limitPackageVersions &&
                semver.satisfies(version, packageVersionLimit))
          )
          .map(version => packageName + "@" + version)
      );
    });
  });

const bar1 = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);
const bar2 = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);
const bar3 = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);

console.log(
  "Fetching information for " + PACKAGE_FILE_DATA.length + " packages..."
);
bar1.start(PACKAGE_FILE_DATA.length, 0);

(async function() {
  let tarballFiles = [];
  const packageVersionsFlat = await resolveAllConcurrent(
    PACKAGE_FILE_DATA.map(package => () => getVersionsForPackage(package)),
    p => bar1.update(p)
  )
    .then(packageVersions =>
      packageVersions.reduce((acc, cur) => acc.concat(cur), [])
    )
    .then(packageVersionsFlat => {
      bar1.stop();
      return packageVersionsFlat;
    });

  console.log("Downloading " + packageVersionsFlat.length + " tarballs...");

  bar2.start(packageVersionsFlat.length, 0);

  await resolveAllConcurrent(
    packageVersionsFlat.map(packageVersion => {
      return () =>
        new Promise((resolve, reject) => {
          exec(`npm pack ${packageVersion}`, (e, out) => {
            if (e) return reject(e);
            resolve(tarballFiles.push(out.replace("\n", "")));
          });
        });
    }),
    p => bar2.update(p)
  );

  bar2.stop();

  console.log("Publishing " + tarballFiles.length + " tarballs...");

  bar3.start(tarballFiles.length, 0);

  await resolveAllConcurrent(
    tarballFiles.map(tarball => {
      return () =>
        new Promise((resolve, reject) => {
          exec(
            `npm publish "${process.cwd()}/${tarball}" --registry=${NEW_REGISTRY_URL}`,
            (e, out) => {
              if (e) return reject(e);
              resolve();
            }
          );
        });
    }),
    p => bar3.update(p)
  );

  bar3.stop();

  console.log("Done! 🍻");
})();
