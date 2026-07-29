/**
 * Regression checks for SeiFluxoDetector.sanitizeProcessType (issue #1).
 * Run: node scripts/test-sanitize-process-type.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const detectorPath = path.join(__dirname, "..", "content", "detector.js");
const code = fs.readFileSync(detectorPath, "utf8");
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const { sanitizeProcessType } = sandbox.globalThis.SeiFluxoDetector;
if (typeof sanitizeProcessType !== "function") {
  console.error("FAIL: sanitizeProcessType not exported");
  process.exit(1);
}

const cases = [
  {
    name: "full type with Acompanhamento (issue #1)",
    input: "Gestão de Contrato: Acompanhamento da Execução",
    expected: "Gestão de Contrato: Acompanhamento da Execução"
  },
  {
    name: "label prefix stripped",
    input: "Tipo do Processo: Gestão de Contrato: Acompanhamento da Execução",
    expected: "Gestão de Contrato: Acompanhamento da Execução"
  },
  {
    name: "stop at next SEI field label (Interessados)",
    input:
      "Gestão de Contrato: Acompanhamento da Execução Interessados Fulano de Tal",
    expected: "Gestão de Contrato: Acompanhamento da Execução"
  },
  {
    name: "stop at Acompanhamento Especial field (not mid-type)",
    input: "Contratação Acompanhamento Especial sim",
    expected: "Contratação"
  },
  {
    name: "NUP prefix stripped",
    input: "00000.000001/2026-01 - Gestão de Contrato: Acompanhamento da Execução",
    expected: "Gestão de Contrato: Acompanhamento da Execução"
  },
  {
    name: "simple type without colon",
    input: "Férias",
    expected: "Férias"
  },
  {
    name: "Geral: category style",
    input: "Geral: Revisão do PDI do IFMG",
    expected: "Geral: Revisão do PDI do IFMG"
  }
];

let failed = 0;
for (const c of cases) {
  const got = sanitizeProcessType(c.input);
  if (got !== c.expected) {
    failed += 1;
    console.error(`FAIL: ${c.name}`);
    console.error(`  input:    ${JSON.stringify(c.input)}`);
    console.error(`  expected: ${JSON.stringify(c.expected)}`);
    console.error(`  got:      ${JSON.stringify(got)}`);
  } else {
    console.log(`OK: ${c.name}`);
  }
}

if (failed) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} cases passed`);
