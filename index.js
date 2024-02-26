#!/usr/bin/env node

const util = require('util');
const exec = util.promisify(require("child_process").exec);
const fs = require("fs");
const _cliProgress = require("cli-progress");
const semver = require("semver");

const NEW_REGISTRY_URL = process.argv[3];
const PACKAGE_FILE_PATH = process.argv[2];
const PACKAGE_FILE_DATA = fs
  .readFileSync(PACKAGE_FILE_PATH)
  .toString()
  .split("\n")
  .filter(x => x !== '');

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

const getVersionsForPackage = async package => {
  const limitPackageVersions = package.indexOf("#") > 0;
  let packageName = package;
  let packageVersionLimit;
  if (limitPackageVersions) {
    const splitPackage = package.split("#");
    packageName = splitPackage[0];
    packageVersionLimit = splitPackage[1];
  }
  const { stdout } = await exec("npm view " + packageName + " versions");

  // packages with only one version return string with version number
  if (stdout[0] != '[') {
    return [packageName + "@" + stdout.replace(/\n/g, '')];
  }
  return JSON.parse(stdout.replace(/'/g, '"'))
    .filter(
      version =>
        !limitPackageVersions ||
        (limitPackageVersions &&
          semver.satisfies(version, packageVersionLimit))
    )
    .map(version => packageName + "@" + version);
};

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
    packageVersionsFlat.map(packageVersion => async () => {
      const { stdout } = await exec(`npm pack ${packageVersion}`);
      tarballFiles.push([packageVersion, stdout.replace("\n", "")]);
    }),
    p => bar2.update(p)
  );

  bar2.stop();

  // Sort according to packageVersionsFlat order
  tarballFiles = tarballFiles.sort((a, b) => packageVersionsFlat.indexOf(a[0]) - packageVersionsFlat.indexOf(b[0])).map(x => x[1]);

  console.log("Publishing " + tarballFiles.length + " tarballs...");

  bar3.start(tarballFiles.length, 0);

  await resolveAllConcurrent(
    tarballFiles.map(tarball => () =>
      exec(`npm publish "${process.cwd()}/${tarball}" --registry=${NEW_REGISTRY_URL}`)
    ),
    p => bar3.update(p),
    1
  );

  bar3.stop();

  console.log("Done! 🍻");
})();
