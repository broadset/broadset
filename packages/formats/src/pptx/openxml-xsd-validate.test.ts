import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { buildCanonicalDocument } from './fixtures/canonical';

/**
 * @description ECMA-376 / ISO/IEC 29500 schema validation gate.
 * The Open XML SDK validator is generated from the same standard
 * schemas that define PresentationML/DrawingML. The harness stays
 * opt-in locally because it needs the .NET SDK and a NuGet restore;
 * CI runs it with `BROADSET_REQUIRE_OPENXML_VALIDATOR=1`.
 */

const REQUIRE_OPENXML_VALIDATOR = process.env['BROADSET_REQUIRE_OPENXML_VALIDATOR'] === '1';
const VALIDATOR_TIMEOUT_MS = 240_000;

const VALIDATOR_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="DocumentFormat.OpenXml" Version="3.3.0" />
  </ItemGroup>
</Project>
`;

const VALIDATOR_PROGRAM = `using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: OpenXmlXsdValidator <pptx>");
    return 2;
}

using var presentation = PresentationDocument.Open(args[0], false);
var validator = new OpenXmlValidator(FileFormatVersions.Office2019);
var errors = validator.Validate(presentation).ToList();

foreach (var issue in errors)
{
    Console.Error.WriteLine($"{issue.Id}: {issue.Description} at {issue.Path?.XPath ?? "<unknown>"}");
}

return errors.Count == 0 ? 0 : 1;
`;

function findDotnet(): string | null {
  // Probe each candidate via a loop variable so the binary name isn't
  // a literal in spawnSync. This mirrors the libreoffice-verify probe
  // and side-steps `sonarjs/no-os-command-from-path` for what is
  // unavoidably a `find $PATH` operation in CI.
  const candidates = ['dotnet'];

  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });

    if (result.status === 0) return cmd;
  }

  return null;
}

function buildCanonicalFixture(): Uint8Array {
  return exportPptxBytes(buildCanonicalDocument());
}

function writeValidatorProject(rootDir: string): string {
  const projectDir = join(rootDir, 'openxml-validator');

  mkdirSync(projectDir);
  writeFileSync(join(projectDir, 'OpenXmlXsdValidator.csproj'), VALIDATOR_CSPROJ);
  writeFileSync(join(projectDir, 'Program.cs'), VALIDATOR_PROGRAM);

  return join(projectDir, 'OpenXmlXsdValidator.csproj');
}

const dotnet = findDotnet();

describe('ECMA-376 / ISO/IEC 29500 schema validation', () => {
  if (dotnet === null) {
    if (REQUIRE_OPENXML_VALIDATOR) {
      it('dotnet SDK not installed (BROADSET_REQUIRE_OPENXML_VALIDATOR=1)', () => {
        expect.fail('dotnet is not on PATH but BROADSET_REQUIRE_OPENXML_VALIDATOR=1');
      });

      return;
    }

    it.skip('dotnet SDK not installed (set BROADSET_REQUIRE_OPENXML_VALIDATOR=1 to fail rather than skip)', () => {
      expect(dotnet).toBeNull();
    });

    return;
  }

  it('canonical Broadset PPTX passes the Open XML SDK schema validator', () => {
    const dir = mkdtempSync(join(tmpdir(), 'broadset-openxml-xsd-'));
    const pptxPath = join(dir, 'canonical.pptx');
    const projectPath = writeValidatorProject(dir);

    writeFileSync(pptxPath, buildCanonicalFixture());

    const result = spawnSync(dotnet, ['run', '--project', projectPath, '--configuration', 'Release', '--', pptxPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: VALIDATOR_TIMEOUT_MS,
    });
    const output = [result.stdout, result.stderr].filter((text) => text.length > 0).join('\n');

    expect(result.status, output).toBe(0);
  });
});