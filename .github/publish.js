import { Octokit } from '@octokit/rest';
import { context } from '@actions/github';
import * as exec from '@actions/exec';
import * as os from 'node:os';
import * as path from 'node:path';
import fs from 'node:fs/promises';

const version = process.argv[2];
const githubToken = process.env.GITHUB_TOKEN;
const abbrFileName = 'journal-abbreviations.txt';

const octokit = new Octokit({ auth: githubToken });

if (!version) throw new Error('No release version provided');

const run = async () => {
  const branchName = 'releases/' + version;

  await exec.exec(`git checkout -b ${branchName}`);
  await exec.exec(
    'git config --global user.email "github-actions[bot]@users.noreply.github.com"',
  );
  await exec.exec('git config --global user.name "github-actions[bot]"');
  await exec.exec(
    'git remote set-url origin https://x-access-token:' +
    githubToken +
    '@github.com/' +
    context.repo.owner +
    '/' +
    context.repo.repo +
    '.git',
  );

  const versionedFileName = abbrFileName.replace(/\.txt$/, `-${version}.txt`);
  const srcFile = path.join(process.cwd(), abbrFileName);
  const destFile = path.join(process.cwd(), versionedFileName);
  const tempFile = path.join(os.tmpdir(), abbrFileName);
  await fs.copyFile(srcFile, tempFile);

  const srcReadme = path.join(process.cwd(), 'README.md');
  const tempReadme = path.join(os.tmpdir(), 'README.md');
  await fs.copyFile(srcReadme, tempReadme);

  await exec.exec(`git rm -rf .`);
  await exec.exec(`git clean -fdx`);

  await fs.copyFile(tempFile, destFile);
  await fs.copyFile(tempReadme, srcReadme);

  await exec.exec(`git add ${versionedFileName}`);
  await exec.exec(`git add README.md`);
  await exec.exec(`git commit -a -m "Release ${version}"`);
  await exec.exec(`git push -f origin ${branchName}`);

  await exec.exec('git', ['push', 'origin', ':refs/tags/' + version]);
  await exec.exec('git', ['tag', '-fa', version, '-m', version]);
  await exec.exec('git push --tags origin');

  await octokit.repos.createRelease({
    owner: context.repo.owner,
    repo: context.repo.repo,
    tag_name: version,
    name: version,
  });
};

await run();