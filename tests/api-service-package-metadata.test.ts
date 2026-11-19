import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createNewCommand } from '../src/commands/new.js';
import { createNpmInvocation } from '../src/process/npm.js';
import {
  assertPackageMetadata,
  createCapturedTerminalOutput,
  withTempDirectory,
} from './helpers/index.js';

// Frozen template contract for API Service package.json (SW-043).
// Update this object only when the template itself is intentionally changed.
const FROZEN_SCRIPTS = {
  start: 'node src/start.js',
  check:
    'node --check src/config.js && node --check src/stellar-client.js && node --check src/server.js && node --check src/start.js',
  test: 'node --test test/*.test.js',
} as const;

const FROZEN_NODE_ENGINE = '>=22.13.0';

function runNpmScript(projectRoot: string, script: string) {
  const npm = createNpmInvocation(['run', script]);

  return spawnSync(npm.command, [...npm.args], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
  });
}

describe('API Service package metadata conformance (SW-043)', () => {
  it('conforms to all frozen package.json metadata constraints', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

      assertPackageMetadata(join(root, 'demo-api', 'package.json'), {
        name: 'demo-api',
        scripts: FROZEN_SCRIPTS,
        nodeEngine: FROZEN_NODE_ENGINE,
      });
    }));

  it('sets the package name to the generated project name', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

      assertPackageMetadata(join(root, 'demo-api', 'package.json'), {
        name: 'demo-api',
        scripts: FROZEN_SCRIPTS,
        nodeEngine: FROZEN_NODE_ENGINE,
      });
    }));

  it('retains all frozen script entries without modification', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

      assertPackageMetadata(join(root, 'demo-api', 'package.json'), {
        name: 'demo-api',
        scripts: FROZEN_SCRIPTS,
        nodeEngine: FROZEN_NODE_ENGINE,
      });
    }));

  it('retains only the frozen script keys and no extras', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

      assertPackageMetadata(join(root, 'demo-api', 'package.json'), {
        name: 'demo-api',
        scripts: FROZEN_SCRIPTS,
        nodeEngine: FROZEN_NODE_ENGINE,
      });
    }));

  it('sets the engines.node constraint to the frozen minimum version', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

      assertPackageMetadata(join(root, 'demo-api', 'package.json'), {
        name: 'demo-api',
        scripts: FROZEN_SCRIPTS,
        nodeEngine: FROZEN_NODE_ENGINE,
      });
    }));

  it('generates no dependencies field', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

      assertPackageMetadata(join(root, 'demo-api', 'package.json'), {
        name: 'demo-api',
        scripts: FROZEN_SCRIPTS,
        nodeEngine: FROZEN_NODE_ENGINE,
      });
    }));

  it('generates no devDependencies field', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

      assertPackageMetadata(join(root, 'demo-api', 'package.json'), {
        name: 'demo-api',
        scripts: FROZEN_SCRIPTS,
        nodeEngine: FROZEN_NODE_ENGINE,
      });
    }));

  it('does not embed secret, seed, or private-key values in the generated package.json', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

      assertPackageMetadata(join(root, 'demo-api', 'package.json'), {
        name: 'demo-api',
        scripts: FROZEN_SCRIPTS,
        nodeEngine: FROZEN_NODE_ENGINE,
      });
    }));

  it(
    'passes the repository check script after generation',
    () =>
      withTempDirectory((root) => {
        const command = createNewCommand({
          cwd: () => root,
          output: createCapturedTerminalOutput().output,
        });

        command.parse(['node', 'new', 'demo-api', '--template', 'api-service']);

        const projectRoot = join(root, 'demo-api');

        assertPackageMetadata(join(projectRoot, 'package.json'), {
          name: 'demo-api',
          scripts: FROZEN_SCRIPTS,
          nodeEngine: FROZEN_NODE_ENGINE,
        });

        const result = runNpmScript(projectRoot, 'check');

        expect(result.status, result.stderr).toBe(0);
      }),
    15_000,
  );
});

// SW-184: verify generated API Service npm scripts and package metadata as an installed package.
describe('API Service installed package script and metadata verification (SW-184)', () => {
  it('validates generated package metadata structure and declared fields', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse([
        'node',
        'new',
        'verified-api',
        '--template',
        'api-service',
      ]);

      const projectRoot = join(root, 'verified-api');
      const manifest = JSON.parse(
        readFileSync(join(projectRoot, 'package.json'), 'utf8'),
      ) as {
        name: string;
        version: string;
        type: string;
        engines?: { node?: string };
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(manifest.name).toBe('verified-api');
      expect(manifest.version).toBe('0.1.0');
      expect(manifest.type).toBe('module');
      expect(manifest.engines?.node).toBe(FROZEN_NODE_ENGINE);
      expect(manifest.scripts).toEqual(FROZEN_SCRIPTS);
      expect(manifest.dependencies).toBeUndefined();
      expect(manifest.devDependencies).toBeUndefined();
    }));

  it('proves no script relies on repository-relative paths outside the generated project', () =>
    withTempDirectory((root) => {
      const command = createNewCommand({
        cwd: () => root,
        output: createCapturedTerminalOutput().output,
      });

      command.parse([
        'node',
        'new',
        'verified-api',
        '--template',
        'api-service',
      ]);

      const projectRoot = join(root, 'verified-api');
      const manifest = JSON.parse(
        readFileSync(join(projectRoot, 'package.json'), 'utf8'),
      ) as { scripts: Record<string, string> };

      for (const [scriptName, scriptCommand] of Object.entries(
        manifest.scripts,
      )) {
        expect(scriptName).toBeDefined();
        expect(scriptCommand).not.toContain('..');
        expect(scriptCommand).not.toMatch(/^[/\\]/);
        expect(scriptCommand).not.toContain(root);
      }
    }));

  it(
    'installs cleanly and executes every documented script without external dependencies',
    async () =>
      withTempDirectory(async (root) => {
        const command = createNewCommand({
          cwd: () => root,
          output: createCapturedTerminalOutput().output,
        });

        command.parse([
          'node',
          'new',
          'installed-api',
          '--template',
          'api-service',
        ]);

        const projectRoot = join(root, 'installed-api');

        // Clean install should succeed offline without global project packages
        const installNpm = createNpmInvocation([
          'install',
          '--prefer-offline',
          '--no-audit',
          '--no-fund',
        ]);
        const installResult = spawnSync(
          installNpm.command,
          [...installNpm.args],
          {
            cwd: projectRoot,
            encoding: 'utf8',
            shell: false,
          },
        );
        expect(installResult.status, installResult.stderr).toBe(0);

        // Documented script: check
        const checkResult = runNpmScript(projectRoot, 'check');
        expect(checkResult.status, checkResult.stderr).toBe(0);

        // Documented script: test
        const testResult = runNpmScript(projectRoot, 'test');
        expect(testResult.status, testResult.stderr).toBe(0);

        // Missing script fails as expected
        const missingResult = runNpmScript(projectRoot, 'non-existent-script');
        expect(missingResult.status).not.toBe(0);

        // Documented script: start
        const startNpm = createNpmInvocation(['start']);
        const startChild = spawn(startNpm.command, [...startNpm.args], {
          cwd: projectRoot,
          env: { ...process.env, API_PORT: '43123', API_HOST: '127.0.0.1' },
          shell: false,
        });

        let output = '';
        const ready = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            startChild.kill();
            reject(
              new Error(
                `npm start timed out waiting for startup log. Output: ${output}`,
              ),
            );
          }, 10_000);

          startChild.stdout?.on('data', (chunk: Buffer) => {
            output += chunk.toString();
            if (output.includes('listening on http://127.0.0.1:')) {
              clearTimeout(timeout);
              resolve();
            }
          });

          startChild.stderr?.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });

          startChild.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
          });

          startChild.on('exit', (code) => {
            if (
              code !== null &&
              code !== 0 &&
              !output.includes('listening on http://127.0.0.1:')
            ) {
              clearTimeout(timeout);
              reject(
                new Error(
                  `npm start exited prematurely with code ${code}. Output: ${output}`,
                ),
              );
            }
          });
        });

        try {
          await ready;
          expect(output).toContain('listening on http://127.0.0.1:');
        } finally {
          if (startChild.pid) {
            if (process.platform === 'win32') {
              spawnSync(
                'taskkill',
                ['/pid', String(startChild.pid), '/f', '/t'],
                {
                  stdio: 'ignore',
                },
              );
            } else {
              startChild.kill('SIGTERM');
            }
          }
        }
      }),
    30_000,
  );

  it('guarantees temporary directory cleanup runs on test failure', async () => {
    let capturedDir = '';
    await expect(
      withTempDirectory(async (tempPath) => {
        capturedDir = tempPath;
        expect(existsSync(tempPath)).toBe(true);
        throw new Error(
          'deliberate assertion to prove cleanup runs on failure',
        );
      }),
    ).rejects.toThrow('deliberate assertion to prove cleanup runs on failure');

    expect(existsSync(capturedDir)).toBe(false);
  });
});
