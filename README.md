# pkgmigr8or

# Version 1 coming 27/04/2019

pkgmigr8or (Package migrater) is a Migration CLI tool to export packages from NPM to a private registry e.g. [Verdaccio](https://verdaccio.org/).

## Installation

```sh
npm install -g pkgmigr8or
```

## Pre-Requisites

### Authentication

To migrate any of your packages from NPM you will need to have your account logged in using `npm adduser`.

If your private registry also has auth permissions required to publish you will need to have logged in to that as well, also using `npm adduser` passing in the `--registry-url` flag.

You can `cat ~/.npmrc` and should be able to see tokens for both registries.

## Usage

Create a directory somewhere and point your CLI in to it.

The script takes 2 arguments:

1. A file which contains a list of all the packages you want to export.
2. The URL of your private registry you are migrating to.

```sh
pkgmigr8or packages.txt http://localhost:4873
```

### Defining your packages.

Create a plain text file in your directory e.g. `packages.txt`.

Each line represents a new package

```text
myPackage
@myScope/myPackage
```

#### Restricting vesrions.

You may not want to get every version ever published of your package for migration. The script will recognise a # in your package name as a version delimiter and for each package of that name will only download packages that satisfy the version constraints based on [semver.satisfies](https://github.com/npm/node-semver). If you don't specify a #, all versions ever published will be migrated.

```text
myPackage#<=1.0.2
@myScope/myPackage#>1.0.2 <2.0.0
```

---
